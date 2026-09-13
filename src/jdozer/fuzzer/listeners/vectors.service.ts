import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventConsumer } from "../commons/pubsub/event-consumer.interface";
import { EventConsumerRegistry } from "../commons/pubsub/event-consumer-registry.service";
import { KeyManager } from "../commons/storage/key-manager";
import { RedisService } from "../commons/storage/redis.service";
import { RedisPubSub } from "../commons/pubsub/redis-pub-sub";
import { UUID } from "crypto";


@Injectable()
export class VectorsSub implements EventConsumer, OnModuleInit {

    private readonly logger = new Logger(VectorsSub.name);

    readonly channels = ["jdozer:fuzzer:engine"];
    readonly entityType = "fuzzer-engine";
    readonly eventType = "after-response";

    constructor(
        private readonly registry: EventConsumerRegistry
    ) { }

    onModuleInit() {
        this.registry.register(this);
        this.logger.log("CaseValidatorSub registered");
    }

    async handleEvent(event: any, channel: string): Promise<void> {
        this.logger.warn(`Method not implemented: ${channel} | ${this.entityType} | ${this.eventType}`);
    }
}

@Injectable()
export class Vectors implements OnModuleInit {

    private readonly logger = new Logger(Vectors.name);
    private readonly keyManager = new KeyManager();

    constructor(
        private readonly redisService: RedisService,
        private readonly redisPubSub: RedisPubSub,
        private readonly sub: VectorsSub
    ) { }

    onModuleInit() {
        this.sub.handleEvent = async (event: any, channel: string) => {
            if (event.headers.entityType === this.sub.entityType && event.headers.eventType === this.sub.eventType) {
                await this.validate(event.payload.fuzzerId, event.payload.caseId);
            }
        };
    }

    public async validate(fuzzerId: UUID, requestId: UUID): Promise<void> {
        try {
            const reqKeys: string[] = await this.redisService.scan(this.keyManager.requestIdPattern(fuzzerId, requestId));
            if (reqKeys.length != 1) {
                this.logger.error(`[validate] Request key not found for fuzzerId: ${fuzzerId} and requestId: ${requestId}`);
                return;
            }

            const request: any = await this.redisService.get(reqKeys[0]);
            const dmmkeys: string[] = [];
            for (let k of Object.keys(request.params)) {
                let keys = await this.redisService.scan(this.keyManager.dmmIdPattern(fuzzerId, request.params[k]));
                if (keys.length !== 1) {
                    this.logger.error(`[validate] DMM key not found for fuzzerId: ${fuzzerId} and param: ${request.params[k]}`);
                    continue;
                }
                dmmkeys.push(keys[0]);
            }

            const dmms: any[] = await this.redisService.mget(dmmkeys);
            const onlySchemas: any[] = dmms.filter((dmm) => !dmm.vectorId);
            const probes: any = {
                id: request.uuidReq,
                fuzzerId: fuzzerId,
                operationId: request.operationId,
                isValid: onlySchemas.every((dmm) => dmm.valid),
                probes: onlySchemas
            };

            await this.redisService.set(this.keyManager.vectorKey(fuzzerId, request.operationId, request.uuidReq), probes);
            await this.redisPubSub.publish(`jdozer:fuzzer:test-case`, fuzzerId, `summary`, `vectors`, probes);

            return;

        } catch (e) {
            this.logger.error(`[validate] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

}