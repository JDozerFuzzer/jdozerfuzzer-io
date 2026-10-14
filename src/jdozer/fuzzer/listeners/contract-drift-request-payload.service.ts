import { Injectable, OnModuleInit } from "@nestjs/common";
import { EventConsumer } from "../commons/pubsub/event-consumer.interface";
import { EventConsumerRegistry } from "../commons/pubsub/event-consumer-registry.service";
import { Logger } from "@nestjs/common";
import { RedisService } from "../commons/storage/redis.service";
import { RedisPubSub } from "../commons/pubsub/redis-pub-sub";
import { UUID } from "crypto";
import { KeyManager } from "../commons/storage/key-manager";
import { SchemaUtils } from "../commons/schema-utils";
import { AjvFindingClassifier, SeverityMetric } from "./types/schema-validation.types";

@Injectable()
export class ContractDriftRequestPayloadSub implements EventConsumer, OnModuleInit {

    private readonly logger = new Logger(ContractDriftRequestPayloadSub.name);

    channels = ["jdozer:fuzzer:engine"];
    entityType = "fuzzer-engine";
    eventType = "before-request";

    constructor(
        private readonly registry: EventConsumerRegistry
    ) { }

    onModuleInit() {
        this.registry.register(this);
        this.logger.log(`${ContractDriftRequestPayloadSub.name} registered`);
    }

    async handleEvent(event: any, channel: string): Promise<void> {
        this.logger.warn("Method not implemented.");
    }
}

@Injectable()
export class ContractDriftRequestPayload implements OnModuleInit {

    private readonly logger = new Logger(ContractDriftRequestPayload.name);
    private readonly keyManager = new KeyManager();
    private readonly findingClassifier = new AjvFindingClassifier();

    constructor(
        private readonly redisService: RedisService,
        private readonly redisPubSub: RedisPubSub,
        private readonly sub: ContractDriftRequestPayloadSub
    ) { }

    onModuleInit() {
        this.sub.handleEvent = async (event: any, channel: string) => {
            if (event.headers.entityType === this.sub.entityType && event.headers.eventType === this.sub.eventType) {
                await this.validate(event.payload.fuzzerId, event.payload.operationId, event.payload.caseId);
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
                mutations: this.getSchemaValidationFinding(dataPayload.errors)
            };

            validation.mutationsMetrics = this.getSeverityMetric(validation.mutations);

            await Promise.all([
                this.redisService.set(this.keyManager.schemaProbeRequestPayloadKey(fuzzerId, op.name, caseId), validation),
                this.redisPubSub.publish(`jdozer:fuzzer:contract-drift`, fuzzerId, `payload`, `request`, {
                    id: req.uuidReq,
                    operationId: op.name,
                    fuzzerId: fuzzerId,
                    isValid: dataPayload.valid
                })
            ]);

        } catch (e) {
            this.logger.error(`[validate] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

    private getSchemaValidationFinding(errors: any[] | undefined): any[] {
        if (!errors) {
            return [];
        }
        return errors.map((error) => {
            return { ...error, ...this.findingClassifier.classify(error) };
        });
    }

    private getSeverityMetric(findings: any[]): SeverityMetric {
        const severityNames: string[] = findings.map(f => f.severity);
        return this.findingClassifier.computeSeverityMetric(severityNames);
    }

}
