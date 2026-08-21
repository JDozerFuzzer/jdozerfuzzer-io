import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventConsumer } from "../commons/pubsub/event-consumer.interface";
import { EventConsumerRegistry } from "../commons/pubsub/event-consumer-registry.service";
import { RedisAdapter } from "../commons/storage/redis-adapter.service";
import { RedisPubSub } from "../commons/pubsub/redis-pub-sub";
import { UUID } from "crypto";

@Injectable()
export class ResponseSummarySubscriber implements EventConsumer, OnModuleInit {


    constructor(
        private readonly registry: EventConsumerRegistry
    ) { }

    onModuleInit() {
        this.registry.register(this);
        this.logger.log(`${this.constructor.name} registered`);
    }

    channels: string[] = ["jdozer:fuzzer:engine"];
    entityType: string = "fuzzer-engine";
    eventType: string = "stopped";

    async handleEvent(data: any, channel: string): Promise<void> {
        this.logger.warn("Method not implemented.");
    }

    private readonly logger: Logger = new Logger(ResponseSummarySubscriber.name);
}

@Injectable()
export class ResponseSummary implements OnModuleInit {

    constructor(
        private readonly redisAdapter: RedisAdapter,
        private readonly redisPubSub: RedisPubSub,
        private readonly sub: ResponseSummarySubscriber
    ) { }

    onModuleInit() {
        this.sub.handleEvent = async (event: any, channel: string) => {
            if (event.headers.entityType === this.sub.entityType && event.headers.eventType === this.sub.eventType) {
                await this.responsesList(event.payload.fuzzerId);
            }
        }
    }

    private async responsesList(fuzzerId: UUID) {
        try {
            const resKeys: string[] = await this.redisAdapter.getResponsesKeys(fuzzerId);

            const promises: Promise<any>[] = [];
            resKeys.forEach((key: string) => {
                const baseKey: string = key.replace(":RES", "");
                promises.push(this.compose(baseKey));
            });

            await Promise.all(promises);

        } catch (e) {
            this.logger.error(`[ResponseSummary.responsesList] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

    private readonly collections: any = {
        "REQ": this.REQ,
        "RES": this.RES,
        "schemaRequestPayload": this.schemaRequestPayload,
        "schemaResponsePayload": this.schemaResponsePayload,
        "schemaResponseStatusCode": this.schemaResponseStatusCode,
        "fuzzingCase": this.fuzzingCase,
        "VEC": this.VEC
    };

    private async compose(baseKey: string): Promise<any> {
        try {

            const keys: string[] = Object.keys(this.collections).map((k: string) => baseKey.concat(`:${k}`));

            return this.redisAdapter.gets(keys).then((data: any[]) => {
                const mapped: Record<string, any> = this.keysMapper(keys, data);
                const record: any = {};
                for (let k of Object.keys(this.collections)) {
                    const data: any = mapped[baseKey.concat(`:${k}`)];
                    if (!data) {
                        this.logger.warn(`[ResponseSummary.compose] No data found for key: ${baseKey.concat(`:${k}`)}`);
                        continue;
                    }
                    record[k] = this.collections[k](data);
                    record[`id`] = baseKey.split(":")[4];
                    record[`fuzzerId`] = baseKey.split(":")[1];
                }

                return this.redisAdapter.save(baseKey.concat(`:SUMMARY`), record);

            }).catch(e => {
                this.logger.error(`[ResponseSummary.compose] An error has occurred: ${e.message}`, e);
                throw e;
            });

        } catch (e) {
            this.logger.error(`[ResponseSummary.compose] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

    private keysMapper(keys: string[], values: any[]): Record<string, any> {
        let data: Record<string, any> = {};
        for (let i = 0; i < keys.length; i++) {
            data[keys[i]] = values[i];
        }
        return data;
    }

    private schemaRequestPayload(record: any): any {
        return {
            isValid: record.finding.isValid,
            category: record.finding.statusCategory,
            severtiy: record.finding.severity,
            type: record.finding.findingType
        };
    }

    private schemaResponsePayload(record: any): any {
        return {
            isValid: record.isValid,
            severity: record.SEVERITY_LEVEL
        };
    }

    private schemaResponseStatusCode(record: any): any {
        return {
            matchType: record.matchType,
            severity: record.severity
        };
    }

    private VEC(record: any): any {
        return {
            id: record.vectorId,
            type: record.vectorApplied.type,
            owasp: record.vectorApplied.owasp_category,
            category: record.vectorApplied.subcategory,
            insertion: record.insertion
        };
    }

    private fuzzingCase(record: any): any {
        return {
            isValidRequest: record.isValidRequest
        };
    }

    private REQ(record: any): any {
        return {
            operationId: record.operationId,
            url: record.url,
            method: record.method,
            path: record.defaultName
        };
    }

    private RES(record: any): any {
        return {
            statusCode: record.statusCode,
            statusMessage: record.statusMessage,
            totalTime: record.timings.end - record.timings.start,
            time: record.time
        };
    }

    private readonly logger: Logger = new Logger(ResponseSummary.name);
}