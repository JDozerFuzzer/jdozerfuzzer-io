import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventConsumer } from "../commons/pubsub/event-consumer.interface";
import { EventConsumerRegistry } from "../commons/pubsub/event-consumer-registry.service";
import { RedisAdapter } from "../commons/storage/redis-adapter.service";
import { RedisPubSub } from "../commons/pubsub/redis-pub-sub";
import { UUID } from "crypto";
import { KeyManager } from "../commons/storage/key-manager";
import { SeverityLevelCompute, SeverityMetric } from "./types/severity-levels.types";

@Injectable()
export class TestCaseSummarySub implements EventConsumer, OnModuleInit {


    constructor(
        private readonly registry: EventConsumerRegistry
    ) { }

    onModuleInit() {
        this.registry.register(this);
        this.logger.log(`${this.constructor.name} registered`);
    }

    channels: string[] = ["jdozer:fuzzer:engine"];
    entityType: string = "engine";
    eventType: string = "stopped";

    async handleEvent(data: any, channel: string): Promise<void> {
        this.logger.warn("Method not implemented.");
    }

    private readonly logger: Logger = new Logger(TestCaseSummarySub.name);
}

@Injectable()
export class TestCaseSummary implements OnModuleInit {

    private readonly keyManager: KeyManager = new KeyManager();
    private severityCompute: SeverityLevelCompute = new SeverityLevelCompute();

    constructor(
        private readonly redisAdapter: RedisAdapter,
        private readonly redisPubSub: RedisPubSub,
        private readonly sub: TestCaseSummarySub
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

    private readonly collections: Record<string, { key: string, fn: (record: any) => any }> = {
        [`attackSurface`]: { key: `${KeyManager.REQUEST}`, fn: this.REQ },
        [`result`]: { key: `${KeyManager.RESPONSE}`, fn: this.RES },
        [`mutationsPayload`]: { key: `${KeyManager.CONTRACT_DRIFT_REQUEST_PAYLOAD}`, fn: this.mutationsRequestPayload },
        [`responsePayloadCheck`]: { key: `${KeyManager.CONTRACT_DRIFT_RESPONSE_PAYLOAD}`, fn: this.schemaResponsePayload },
        [`statusCodeDrift`]: { key: `${KeyManager.CONTRACT_DRIFT_STATUS_CODE}`, fn: this.schemaResponseStatusCode },
        //[`fuzzingCase`]: { key: `${KeyManager.TEST_CASE_SUMMARY}`, fn: this.fuzzingCase },
        [`injectionVector`]: { key: `${KeyManager.GRAMMAR_VECTOR}`, fn: this.VEC }
    };

    private async compose(baseKey: string): Promise<any> {
        try {

            const keys: string[] = Object.keys(this.collections).map((k: string) => baseKey.concat(`:${this.collections[k].key}`));

            return this.redisAdapter.mget(keys).then(async (data: any[]) => {
                const mapped: Record<string, any> = this.keysMapper(keys, data);
                const summary: Record<string, any> = {};
                for (let k of Object.keys(this.collections)) {
                    const record: any = mapped[baseKey.concat(`:${this.collections[k].key}`)];
                    if (!record || Object.keys(record).length == 0) {
                        this.logger.warn(`[compose] No data found for key: ${k}`, baseKey.concat(`:${this.collections[k].key}`));
                        continue;
                    }
                    try {
                        summary[k] = this.collections[k].fn(record);
                    } catch (e) {
                        this.logger.error(`[compose] An error occurred while attempting to execute the mapping function for key ${k}: ${e.message}`, `key: ${baseKey.concat(`:${k}`)}`);
                    }
                }
                summary[`id`] = baseKey.split(":")[4];
                summary[`fuzzerId`] = baseKey.split(":")[1];
                summary[`operationId`] = baseKey.split(":")[3];
                summary[`severity`] = this.severitySummary(summary);

                return await this.redisAdapter.set(this.keyManager.testCaseSummaryKey(summary.fuzzerId, summary.operationId, summary.id), summary);

            }).catch(e => {
                this.logger.error(`[compose] An error has occurred: ${e.message}`, e);
                throw e;
            });

        } catch (e) {
            this.logger.error(`[compose] An error has occurred: ${e.message}`, e);
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

    private mutationsRequestPayload(record: any): any {
        return {
            isValid: record.isValid,
            mutationsCant: record.mutationsMetrics.count,
            severity: record.mutationsMetrics.averageLevel,
            totalPoints: record.mutationsMetrics.total
        };
    }

    private schemaResponsePayload(record: any): any {
        return {
            isValid: record.isValid,
            findingType: record.finding.type,
            severity: record.finding.severity
        };
    }

    private schemaResponseStatusCode(record: any): any {
        return {
            statusCode: record.statusCode,
            matchType: record.finding.matchType,
            severity: record.finding.severity
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

    private severitySummary(summary: any): SeverityMetric {
        return this.severityCompute.computeSeverityMetric([
            summary.mutationsPayload.severity?.name,
            summary.responsePayloadCheck.severity?.name,
            summary.statusCodeDrift.severity?.name
        ]);
    }

    private readonly logger: Logger = new Logger(TestCaseSummary.name);
}