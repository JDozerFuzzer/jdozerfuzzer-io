import { Injectable, OnModuleInit } from "@nestjs/common";
import { EventConsumer } from "../commons/pubsub/event-consumer.interface";
import { EventConsumerRegistry } from "../commons/pubsub/event-consumer-registry.service";
import { Logger } from "@nestjs/common";
import { RedisService } from "../commons/storage/redis.service";
import { RedisPubSub } from "../commons/pubsub/redis-pub-sub";
import { UUID } from "crypto";
import { KeyManager } from "../commons/storage/key-manager";
import { SchemaUtils } from "../commons/schema-utils";
import { SchemaValidationFinding, SchemaValidationFindings } from "./schema-request-payload.types";

@Injectable()
export class SchemaRequestPayloadSubscriber implements EventConsumer, OnModuleInit {

    private readonly logger = new Logger(SchemaRequestPayloadSubscriber.name);

    channels = ["jdozer:fuzzer:engine"];
    entityType = "fuzzer-engine";
    eventType = "after-response";

    constructor(
        private readonly registry: EventConsumerRegistry
    ) { }

    onModuleInit() {
        this.registry.register(this);
        this.logger.log(`${SchemaRequestPayloadSubscriber.name} registered`);
    }

    async handleEvent(event: any, channel: string): Promise<void> {
        this.logger.warn("Method not implemented.");
    }
}

@Injectable()
export class SchemaRequestPayload implements OnModuleInit {

    private readonly logger = new Logger(SchemaRequestPayload.name);
    private readonly keyManager = new KeyManager();
    private readonly schemaUtils = new SchemaUtils();

    constructor(
        private readonly redisService: RedisService,
        private readonly redisPubSub: RedisPubSub,
        private readonly sub: SchemaRequestPayloadSubscriber
    ) { }

    onModuleInit() {
        this.sub.handleEvent = async (event: any, channel: string) => {
            if (event.headers.entityType === this.sub.entityType && event.headers.eventType === this.sub.eventType) {
                await this.validate(event.payload.fuzzerId, event.payload.caseId);
            }
        }
    }

    public async validate(fuzzerId: UUID, responseId: UUID) {
        try {

            let keys = await this.redisService.getKeys(this.keyManager.requestIdPattern(fuzzerId, responseId));
            if (keys.length === 1) {

                let req = await this.redisService.get(keys[0]);
                if (!req.params.payloadId) {
                    this.logger.verbose(`[validate] Not payload found for request ${responseId} | ${fuzzerId}`);
                    return;
                }
                let op = await this.redisService.get(this.keyManager.responseToOperation(keys[0]));
                let dataPayload: { valid: boolean, errors?: any[] } = this.schemaUtils.validate(op.req.payload, Buffer.from(req.payload, "base64").toString("utf-8"));
                let res: any = await this.redisService.get(keys[0].replaceAll(':REQ', ':RES'));
                if (dataPayload) {
                    const finding: SchemaValidationFinding = this.getSchemaValidationFinding(dataPayload.valid, res.statusCode);
                    await this.redisService.set(keys[0].replaceAll(':REQ', ':schemaRequestPayload'), {
                        id: keys[0],
                        fuzzerId: fuzzerId,
                        operationId: op.name,
                        finding: finding
                    });
                    await this.redisPubSub.publish('jdozer:fuzzer:listeners', fuzzerId, `payload`, `schema-request`, {
                        id: keys[0],
                        fuzzerId: fuzzerId,
                        operationId: op.name,
                        isValid: finding.isValid,
                        statusCategory: finding.statusCategory,
                        severity: finding.severity,
                        type: finding.findingType
                    });

                } else {
                    this.logger.warn(`[validate] Response not found for key pattern ${this.keyManager.responseIdPattern(fuzzerId, responseId)}`);
                }
            }



        } catch (e) {
            this.logger.error(`[validate] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

    private getSchemaValidationFinding(isValid: boolean, statusCode: number): SchemaValidationFinding {
        const sc: string = this.getStatusCategory(statusCode);
        const key: string = `${isValid ? 'valid' : 'invalid'}-${sc}`;
        const finding = SchemaValidationFindings[key];
        return {
            statusCode: statusCode,
            ...finding
        };
    }

    private getStatusCategory(statusCode: number): '2xx' | '4xx' | '5xx' {
        if (statusCode >= 200 && statusCode < 300) return '2xx';
        if (statusCode >= 400 && statusCode < 500) return '4xx';
        if (statusCode >= 500 && statusCode < 600) return '5xx';
        throw new Error(`Unexpected status code: ${statusCode}`);
    }



}
