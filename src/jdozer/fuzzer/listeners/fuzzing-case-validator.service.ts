import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventConsumer } from "../commons/pubsub/event-consumer.interface";
import { EventConsumerRegistry } from "../commons/pubsub/event-consumer-registry.service";
import { KeyManager } from "../commons/storage/key-manager";
import { RedisService } from "../commons/storage/redis.service";
import { RedisPubSub } from "../commons/pubsub/redis-pub-sub";
import { UUID } from "crypto";


@Injectable()
export class FuzzingCaseValidatorSub implements EventConsumer, OnModuleInit {

    private readonly logger = new Logger(FuzzingCaseValidatorSub.name);

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
export class FuzzingCaseValidator implements OnModuleInit {

    private readonly logger = new Logger(FuzzingCaseValidator.name);
    private readonly keyManager = new KeyManager();

    constructor(
        private readonly redisService: RedisService,
        private readonly redisPubSub: RedisPubSub,
        private readonly sub: FuzzingCaseValidatorSub
    ) { }

    onModuleInit() {
        this.sub.handleEvent = async (event: any, channel: string) => {
            if (event.headers.entityType === this.sub.entityType && event.headers.eventType === this.sub.eventType) {
                await this.validate(event.payload.fuzzerId, event.payload.caseId);
            }
        };
    }

    public async validate(fuzzerId: UUID, responseId: UUID): Promise<void> {
        try {
            const resKeys: string[] = await this.redisService.scan(this.keyManager.responseIdPattern(fuzzerId, responseId));
            if (resKeys.length != 1) {
                this.logger.error(`[validate] Response key not found for fuzzerId: ${fuzzerId} and responseId: ${responseId}`);
                return;
            }
            const response: any = await this.redisService.get(resKeys[0]);
            const request: any = await this.redisService.get(this.keyManager.forRequest(fuzzerId, response.operationId, response.uuidReq));

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
            const validation: any = {};
            validation.isValidRequest = dmms.every((dmm) => dmm.valid);
            validation.statusCode = response.statusCode;
            validation.operationId = response.operationId;
            validation.method = request.method;
            validation.id = request.uuidReq;

            await this.redisService.set(this.keyManager.forFuzzingCase(fuzzerId, response.operationId, request.uuidReq), validation);
            await this.redisPubSub.publish(`jdozer:fuzzer:listeners`, fuzzerId, `validation`, `fuzzing-case`, validation);

            return;

        } catch (e) {
            this.logger.error(`[validate] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

}