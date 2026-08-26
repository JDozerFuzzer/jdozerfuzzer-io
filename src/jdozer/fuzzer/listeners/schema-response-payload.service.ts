import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventConsumer } from "../commons/pubsub/event-consumer.interface";
import { EventConsumerRegistry } from "../commons/pubsub/event-consumer-registry.service";
import { KeyManager } from "../commons/storage/key-manager";
import { RedisService } from "../commons/storage/redis.service";
import { UUID } from "crypto";
import { SchemaUtils } from "../commons/schema-utils";
import { RedisPubSub } from "../commons/pubsub/redis-pub-sub";
import { SchemaResponseValidationFindings, Validation } from "./schema-response-payload.types";

@Injectable()
export class SchemaResponsePayloadSub implements EventConsumer, OnModuleInit {

    private readonly logger = new Logger(SchemaResponsePayloadSub.name);

    readonly channels = ["jdozer:fuzzer:status-code"];
    readonly entityType = "schema-response";
    readonly eventType = "status-code";

    constructor(
        private readonly registry: EventConsumerRegistry
    ) { }

    onModuleInit() {
        this.registry.register(this);
        this.logger.log(`${SchemaResponsePayloadSub.name} registered`);
    }

    async handleEvent(event: any, channel: string): Promise<void> {
        this.logger.warn(`Method not implemented: ${channel} | ${this.entityType} | ${this.eventType} `);
    }
}


@Injectable()
export class SchemaResponsePayload implements OnModuleInit {

    private readonly logger = new Logger(SchemaResponsePayload.name);
    private readonly keyManager = new KeyManager();

    constructor(
        private readonly redisService: RedisService,
        private readonly redisPubSub: RedisPubSub,
        private readonly sub: SchemaResponsePayloadSub
    ) { }

    onModuleInit() {
        this.sub.handleEvent = async (event, channel) => {
            if (event.headers.entityType === this.sub.entityType && event.headers.eventType === this.sub.eventType) {
                await this.validate(event.headers.entityId as UUID, event.payload.operationId, event.payload.id as UUID);
            }
        }
    }

    async validate(fuzzerId: UUID, operationId: string, responseId: UUID) {
        try {

            let statusCodeSchema: any = await this.redisService.get(this.keyManager.schemaStatusCodeKey(fuzzerId, operationId, responseId));
            const res: any = await this.redisService.get(this.keyManager.responseKey(fuzzerId, operationId, responseId));
            let validation: any;

            if ([`exact`, `wildcard`, `default`].includes(statusCodeSchema.matchType)) {

                let op = await this.redisService.get(this.keyManager.forOperation(res.operationId, fuzzerId));
                let undecodedPayload = this.undecodePayload(res.payload);
                let schema = this.getSchema(op, statusCodeSchema.matched);
                validation = this.validation(undecodedPayload, schema);
            } else {
                validation = this.validation(res.payload, undefined);
            }

            validation.id = responseId;
            validation.fuzzerId = fuzzerId;
            validation.operationId = res.operationId;

            await Promise.all([
                this.redisService.set(this.keyManager.schemaProbeResponsePayloadKey(fuzzerId, res.operationId, res.uuidReq), validation).catch((err) => {
                    this.logger.error(`[validate] An error occurred while attempting to save the schema analysis.: ${err}`, err);
                }),
                this.redisPubSub.publish("jdozer:fuzzer:schema", fuzzerId, "payload", "schema-response", {
                    id: validation.id,
                    operationId: validation.operationId,
                    fuzzerId: validation.fuzzerId,
                    isValid: validation.isValid,
                    severityLevel: validation.finding.severityLevel,
                    severityName: validation.finding.severityName,
                    type: validation.finding.type
                }).catch((err) => {
                    this.logger.error(`[validate] An error occurred while attempting to publish the schema analysis.: ${err}`, err);
                })
            ]);

        } catch (error) {
            this.logger.error(`[validate] Error: ${error}`, error);
            throw error;
        }
    }

    private validation(payload: any, schema: any): Validation {
        if (schema && payload) {
            const schemaUtils = new SchemaUtils(schema);
            const v = schemaUtils.validate(payload);
            return {
                isValid: v.valid,
                finding: SchemaResponseValidationFindings[`${+!!schema}-${+!!payload}-${+v.valid}`],
                errors: v.errors
            } as Validation;
        } else {
            return {
                isValid: (!schema && !payload),
                finding: SchemaResponseValidationFindings[`${+!!schema}-${+!!payload}`]
            } as Validation;
        }
    }

    private getSchema(operation: any, statusCode: string) {
        let schemas = operation.res.filter((r: any) => r.statusCode === statusCode);
        if (schemas.length === 1) {
            return schemas[0].schema;
        }
    }

    private undecodePayload(responsePayload: string) {
        if (responsePayload && responsePayload.trim() !== '') {
            let p: string;
            try {
                p = this.decode(responsePayload);
            } catch (error) {
                throw new Error('[undecodePayload] Failed to decode response payload');
            }
            try {
                return JSON.parse(p);
            } catch (error) {
                throw new Error('[undecodePayload] Failed to parse response payload');
            }
        }
        return undefined;
    }

    private decode(payload: string): string {
        try {
            return Buffer.from(payload, 'base64').toString('utf-8');
        } catch (e) {
            const errorMsg = `[decode] Response body is not a valid encode base64`;
            this.logger.error(errorMsg, e.message, payload);
            throw new Error(errorMsg);
        }
    }

}
