import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventConsumer } from "../commons/pubsub/event-consumer.interface";
import { EventConsumerRegistry } from "../commons/pubsub/event-consumer-registry.service";
import { KeyManager } from "../commons/storage/key-manager";
import { RedisService } from "../commons/storage/redis.service";
import { UUID } from "crypto";
import { SchemaUtils } from "../commons/schema-utils";
import { RedisPubSub } from "../commons/pubsub/redis-pub-sub";

@Injectable()
export class SchemaResponsePayloadSub implements EventConsumer, OnModuleInit {

    private readonly logger = new Logger(SchemaResponsePayloadSub.name);

    readonly channels = ["jdozer:fuzzer:listeners"];
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

            await this.redisService.set(this.keyManager.schemaProbeResponsePayloadKey(fuzzerId, res.operationId, res.uuidReq), validation);
            await this.redisPubSub.publish("jdozer:fuzzer:listeners", fuzzerId, "payload", "schema-response", validation);

        } catch (error) {
            this.logger.error(`[validate] Error: ${error}`);
            throw error;
        }
    }

    private validation(payload: any, schema: any): Validation {
        if (schema && payload) {
            const schemaUtils = new SchemaUtils(schema);
            const v = schemaUtils.validate(payload);
            return {
                isValid: v.valid,
                finding: v.valid ? VALIDATION_CASES.SCHEMA_VALIDATION_SUCCESS : VALIDATION_CASES.SCHEMA_VALIDATION_ERROR,
                errors: v.errors
            } as Validation;
        } else if (schema && !payload) {
            return {
                isValid: false,
                finding: VALIDATION_CASES.EMPTY_RESPONSE_VALID
            } as Validation;
        } else if (!schema && payload) {
            return {
                isValid: false,
                finding: VALIDATION_CASES.UNDOCUMENTED_DATA_LEAK
            } as Validation;
        } else if (!schema && !payload) {
            return {
                isValid: true,
                finding: VALIDATION_CASES.EMPTY_RESPONSE_VALID
            } as Validation;
        }

        return {
            isValid: true,
            finding: VALIDATION_CASES.UNREADABLE_RESPONSE_PAYLOAD
        } as Validation;
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
                throw new Error('Failed to decode response payload');
            }
            try {
                return JSON.parse(p);
            } catch (error) {
                throw new Error('Failed to parse response payload');
            }
        }
        return undefined;
    }

    private decode(payload: string): string {
        try {
            return Buffer.from(payload, 'base64').toString('utf-8');
        } catch (e) {
            const errorMsg = `getPayload: Response body is not a valid encode base64`;
            this.logger.error(errorMsg, e.message, payload);
            throw new Error(errorMsg);
        }
    }

}

export interface Validation {
    id: UUID,
    fuzzerId: UUID,
    operationId: string,
    isValid: boolean;
    finding: typeof VALIDATION_CASES[keyof typeof VALIDATION_CASES];
    errors: any;
}

export const VALIDATION_CASES = {
    MISSING_RESPONSE_BODY: {
        DESCRIPTION: 'The API response does not contain a body even though the contract defines a schema. This indicates incomplete implementation or unexpected behavior.',
        SEVERITY_LEVEL: 'MEDIUM',
        TAGS: ['response-body-validation', 'contract-violation', 'response-body-not-found'],
        RECOMMENDATION: [
            'Ensure the API returns a response body when the contract defines one',
            'Check if 204 No Content is being returned incorrectly',
            'Verify the server logic for conditional response generation'
        ]
    },
    UNDOCUMENTED_DATA_LEAK: {
        DESCRIPTION: 'The API returns unexpected data in the response body that is not defined in the contract. This indicates the API may be exposing internal data, debug information, or sensitive fields that should not be returned to clients.',
        SEVERITY_LEVEL: 'CRITICAL',
        TAGS: ['response-body-validation', 'contract-violation', 'response-body-leak', 'information-disclosure'],
        RECOMMENDATION: [
            'Review API code to identify why undocumented data is being returned',
            'Check for debug mode enabled in production',
            'Implement DTOs to control response serialization',
            'Remove internal fields, stack traces, and debug information'
        ]
    },
    EMPTY_RESPONSE_VALID: {
        DESCRIPTION: 'Both the contract and the API response are empty. This is consistent behavior with no data being returned.',
        SEVERITY_LEVEL: 'INFO',
        TAGS: ['response-body-validation', 'contract-validation', 'response-body-empty'],
        RECOMMENDATION: [
            'No action required - behavior matches contract',
            'Consider if 204 No Content status code would be more appropriate'
        ]
    },
    SCHEMA_VALIDATION_ERROR: {
        DESCRIPTION: 'The API response is not valid and does not conform to the contract schema.',
        SEVERITY_LEVEL: 'HIGH',
        TAGS: ['response-body-validation', 'contract-violation', 'response-body-not-valid', 'schema-not-match'],
        RECOMMENDATION: [
            'Fix the API response to match the contract schema',
            'Update the contract if the response intentionally changed',
            'Review the data serialization logic on the server'
        ]
    },
    SCHEMA_VALIDATION_SUCCESS: {
        DESCRIPTION: 'The API response is valid and conforms to the contract schema.',
        SEVERITY_LEVEL: 'INFO',
        TAGS: ['response-body-validation', 'contract-validation', 'response-body-valid', 'schema-match'],
        RECOMMENDATION: [
            'Continue monitoring for schema compliance',
            'Consider adding more strict validation rules if needed'
        ]
    },
    UNREADABLE_RESPONSE_PAYLOAD: {
        DESCRIPTION: 'The API response body cannot be parsed or interpreted. This may indicate binary data, encryption, compression, encoding issues, or a malformed response.',
        SEVERITY_LEVEL: 'LOW',
        TAGS: ['response-body-validation', 'response-body-unreadable', 'parsing-error'],
        RECOMMENDATION: [
            'Check if the API is returning the correct Content-Type header',
            'Verify the response encoding matches the declared charset',
            'Ensure the response body is not compressed when not expected',
            'Review if binary responses (images, PDFs) are intentional for this endpoint',
            'Check for server-side errors causing malformed responses',
            'Validate the response against expected format (JSON, XML, etc.)'
        ]
    }
} as const;