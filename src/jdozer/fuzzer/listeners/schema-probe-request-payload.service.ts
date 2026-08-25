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
import { request } from "http";

@Injectable()
export class SchemaProbeRequestPayloadSub implements EventConsumer, OnModuleInit {

    private readonly logger = new Logger(SchemaProbeRequestPayloadSub.name);

    channels = ["jdozer:fuzzer:engine"];
    entityType = "fuzzer-engine";
    eventType = "before-request";

    constructor(
        private readonly registry: EventConsumerRegistry
    ) { }

    onModuleInit() {
        this.registry.register(this);
        this.logger.log(`${SchemaProbeRequestPayloadSub.name} registered`);
    }

    async handleEvent(event: any, channel: string): Promise<void> {
        this.logger.warn("Method not implemented.");
    }
}

@Injectable()
export class SchemaProbeRequestPayload implements OnModuleInit {

    private readonly logger = new Logger(SchemaProbeRequestPayload.name);
    private readonly keyManager = new KeyManager();

    constructor(
        private readonly redisService: RedisService,
        private readonly redisPubSub: RedisPubSub,
        private readonly sub: SchemaProbeRequestPayloadSub
    ) { }

    onModuleInit() {
        this.sub.handleEvent = async (event: any, channel: string) => {
            if (event.headers.entityType === this.sub.entityType && event.headers.eventType === this.sub.eventType) {
                await this.validate(event.payload.fuzzerId, event.payload.operationId, event.payload.uuidReq);
            }
        }
    }

    public async validate(fuzzerId: UUID, operationId: string, caseId: UUID) {
        try {

            const key: string = this.keyManager.forRequest(fuzzerId, operationId, caseId);
            const req = await this.redisService.get(key);
            if (!req) {
                this.logger.warn(`[validate] The request for the key was not found: ${operationId} | ${caseId}`, `fullKey: ${key}`);
                return;
            }
            const op = await this.redisService.get(this.keyManager.forOperation(operationId, fuzzerId));
            const schemaUtils = new SchemaUtils(op.req.payload);
            let dataPayload: { valid: boolean, errors?: any[] } = schemaUtils.validate(JSON.parse(Buffer.from(req.payload, "base64").toString("utf-8")));
            const validation: any = {
                id: req.uuidReq,
                fuzzerId: fuzzerId,
                operationId: op.name,
                isValid: dataPayload.valid,
                errors: dataPayload
            };

            await Promise.all([
                this.redisService.set(this.keyManager.schemaProbeRequestPayloadKey(fuzzerId, op.name, caseId), validation),
                this.redisPubSub.publish(`jdozer:fuzzer:before-request`, fuzzerId, `payload`, `schema-probe`, {
                    id: req.uuidReq,
                    operationId: op.name,
                    fuzzerId: fuzzerId,
                    isValid: dataPayload.valid
                })
            ]);

            /**
                            let res: any = await this.redisService.get(keys[0].replaceAll(':REQ', ':RES'));
                            if (dataPayload) {
                                const finding: SchemaValidationFinding = this.getSchemaValidationFinding(dataPayload.valid, res.statusCode);
                                finding.details = dataPayload;
                                await this.redisService.set(keys[0].replaceAll(':REQ', ':schemaRequestPayload'), {
                                    id: responseId,
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
            */

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
