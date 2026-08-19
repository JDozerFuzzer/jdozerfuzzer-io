

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventConsumer } from "../commons/pubsub/event-consumer.interface";
import { EventConsumerRegistry } from "../commons/pubsub/event-consumer-registry.service";
import { UUID } from "crypto";
import { RedisService } from "../commons/storage/redis.service";
import { KeyManager } from "../commons/storage/key-manager";
import { RedisPubSub } from "../commons/pubsub/redis-pub-sub";
import { ResponseMatchDescriptions, SchemaResponseStatusCodeResult } from "./schema-response-status-code.types";

@Injectable()
export class SchemaResponseStatusCodeSub implements EventConsumer, OnModuleInit {

    private readonly logger = new Logger(SchemaResponseStatusCodeSub.name);

    readonly channels = ["jdozer:fuzzer:engine"];
    readonly entityType = "fuzzer-engine";
    readonly eventType = "after-response";

    constructor(
        private readonly registry: EventConsumerRegistry
    ) { }

    onModuleInit() {
        this.registry.register(this);
        this.logger.log(`${SchemaResponseStatusCodeSub.name} registered`);
    }

    async handleEvent(event: any, channel: string): Promise<void> {
        this.logger.warn(`Method not implemented: ${channel} | ${this.entityType} | ${this.eventType} `);
    }
}

@Injectable()
export class SchemaResponseStatusCode implements OnModuleInit {

    private readonly logger = new Logger(SchemaResponseStatusCode.name);
    private readonly keyManager = new KeyManager();

    constructor(
        private readonly redisService: RedisService,
        private readonly redisPubSub: RedisPubSub,
        private readonly sub: SchemaResponseStatusCodeSub
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

            this.logger.verbose(`[validate] Status Code validation...`);
            let keys: string[] = await this.redisService.getKeys(this.keyManager.responseIdPattern(fuzzerId, responseId));
            if (keys.length === 1) {
                let res = await this.redisService.get(keys[0]);
                let op = await this.redisService.get(this.keyManager.responseToOperation(keys[0]));
                let validation = this.findMatch(res.statusCode, op, res.uuidReq);
                await this.redisService.set(keys[0].replaceAll("RES", "schemaResponseStatusCode"), validation);
                await this.redisPubSub.publish("jdozer:fuzzer:listeners", fuzzerId, "status-code", "schema-response", {
                    id: validation.id,
                    statusCode: validation.statusCode,
                    matchType: validation.matchType,
                    severity: validation.severity,
                    operationId: validation.operationId
                });
                this.logger.verbose(`[validate] ${keys[0]}`);
            } else {
                this.logger.warn(`[validate] Response not found for key pattern ${this.keyManager.responseIdPattern(fuzzerId, responseId)}`);
            }
        } catch (e) {
            this.logger.error(`[validate] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

    private findMatch(statusCode: number, op: any, respId: UUID): any {
        let resp = op.res.filter((r: any) => r.statusCode === statusCode.toString());
        if (resp.length === 1) {
            return this.buildLevel(respId, "exact", statusCode, op.name, resp[0].statusCode);
        }

        const wildcard = statusCode.toString().charAt(0).concat('XX');
        resp = op.res.filter((r: any) => r.statusCode === wildcard);
        if (resp.length === 1) {
            return this.buildLevel(respId, "wildcard", statusCode, op.name, resp[0].statusCode);
        }

        resp = op.res.filter((r: any) => r.statusCode === 'default');
        if (resp.length === 1 && !this.is5xx(statusCode)) {
            return this.buildLevel(respId, "default", statusCode, op.name, undefined);
        }

        if (this.is5xx(statusCode)) {
            return this.buildLevel(respId, `5xx`, statusCode, op.name, undefined);
        }

        return this.buildLevel(respId, `none`, statusCode, op.name, undefined);
    }

    private is5xx(statusCode: number): boolean {
        return statusCode.toString().startsWith('5');
    }

    private buildLevel(responseId: UUID, type: `exact` | `wildcard` | `default` | `5xx` | `none`, statusCode: number, operationId: string, matched?: string): any {
        const r: SchemaResponseStatusCodeResult = ResponseMatchDescriptions[type];
        return {
            id: responseId,
            statusCode: statusCode,
            matched: matched,
            operationId: operationId,
            ...r
        };
    }


}


