

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventConsumer } from "../commons/pubsub/event-consumer.interface";
import { EventConsumerRegistry } from "../commons/pubsub/event-consumer-registry.service";
import { UUID } from "crypto";
import { RedisService } from "../commons/storage/redis.service";
import { KeyManager } from "../commons/storage/key-manager";
import { RedisPubSub } from "../commons/pubsub/redis-pub-sub";
import { ResponseMatchDescriptions, SchemaResponseStatusCodeResult } from "./schema-status-code.types";

@Injectable()
export class SchemaStatusCodeSub implements EventConsumer, OnModuleInit {

    private readonly logger = new Logger(SchemaStatusCodeSub.name);

    readonly channels = ["jdozer:fuzzer:engine"];
    readonly entityType = "fuzzer-engine";
    readonly eventType = "after-response";

    constructor(
        private readonly registry: EventConsumerRegistry
    ) { }

    onModuleInit() {
        this.registry.register(this);
        this.logger.log(`${SchemaStatusCodeSub.name} registered`);
    }

    async handleEvent(event: any, channel: string): Promise<void> {
        this.logger.warn(`Method not implemented: ${channel} | ${this.entityType} | ${this.eventType} `);
    }
}

@Injectable()
export class SchemaStatusCode implements OnModuleInit {

    private readonly logger = new Logger(SchemaStatusCode.name);
    private readonly keyManager = new KeyManager();

    constructor(
        private readonly redisService: RedisService,
        private readonly redisPubSub: RedisPubSub,
        private readonly sub: SchemaStatusCodeSub
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

            const res = await this.redisService.get(this.keyManager.responseKey(fuzzerId, operationId, caseId));
            const op = await this.redisService.get(this.keyManager.forOperation(operationId, fuzzerId));
            const validation = this.findMatch(res.statusCode, op, res.uuidReq);
            validation.id = res.uuidReq;
            validation.fuzzerId = fuzzerId;
            validation.operationId = operationId;

            await this.redisService.set(this.keyManager.schemaStatusCodeKey(fuzzerId, res.operationId, res.uuidReq), validation);
            await this.redisPubSub.publish("jdozer:fuzzer:status-code", fuzzerId, "status-code", "schema-response", {
                id: validation.id,
                fuzzerId: validation.fuzzerId,
                operationId: validation.operationId,
                statusCode: validation.statusCode,
                matched: validation.matched,
                matchType: validation.finding.matchType,
                severity: validation.finding.severity,
                severityName: validation.finding.severityName
            });

        } catch (e) {
            this.logger.error(`[validate] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

    private findMatch(statusCode: number, op: any, respId: UUID): any {
        let resp = op.res.filter((r: any) => r.statusCode === statusCode.toString());
        if (resp.length === 1) {
            return this.buildLevel("exact", statusCode, resp[0].statusCode);
        }

        const wildcard = statusCode.toString().charAt(0).concat('XX');
        resp = op.res.filter((r: any) => r.statusCode === wildcard);
        if (resp.length === 1) {
            return this.buildLevel("wildcard", statusCode, resp[0].statusCode);
        }

        resp = op.res.filter((r: any) => r.statusCode === 'default');
        if (resp.length === 1 && !this.is5xx(statusCode)) {
            return this.buildLevel("default", statusCode, undefined);
        }

        if (this.is5xx(statusCode)) {
            return this.buildLevel(`5xx`, statusCode, undefined);
        }

        return this.buildLevel(`none`, statusCode, undefined);
    }

    private is5xx(statusCode: number): boolean {
        return statusCode.toString().startsWith('5');
    }

    private buildLevel(type: `exact` | `wildcard` | `default` | `5xx` | `none`, statusCode: number, matched?: string): any {
        const r: SchemaResponseStatusCodeResult = ResponseMatchDescriptions[type];
        return {
            statusCode: statusCode,
            matched: matched,
            finding: r
        };
    }


}


