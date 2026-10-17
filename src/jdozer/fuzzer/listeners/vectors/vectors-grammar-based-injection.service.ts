import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventConsumer } from "../../commons/pubsub/event-consumer.interface";
import { EventConsumerRegistry } from "../../commons/pubsub/event-consumer-registry.service";
import { KeyManager } from "../../commons/storage/key-manager";
import { UUID } from "crypto";
import { RedisService } from "../../commons/storage/redis.service";
import { RedisPubSub } from "../../commons/pubsub/redis-pub-sub";
import { VectorOracle } from "./vector-injection";



@Injectable()
export class VectorGrammarBasedInjectionSub implements EventConsumer, OnModuleInit {

    private readonly logger: Logger = new Logger(VectorGrammarBasedInjectionSub.name);

    readonly channels = ["jdozer:fuzzer:engine"];
    readonly entityType = "fuzzer-engine";
    readonly eventType = "after-response";

    constructor(
        private readonly registry: EventConsumerRegistry
    ) { }

    onModuleInit() {
        this.registry.register(this);
        this.logger.log("VectorInsertionSub registered");
    }

    async handleEvent(event: any, channel: string): Promise<void> {
        this.logger.warn(`Method not implemented: ${channel} | ${this.entityType} | ${this.eventType} `);
    }

}

@Injectable()
export class VectorGrammarBasedInjection implements OnModuleInit {

    private readonly logger: Logger = new Logger(VectorGrammarBasedInjection.name);
    private readonly keyManager: KeyManager = new KeyManager();
    private readonly vectorOracle: VectorOracle = new VectorOracle();

    constructor(
        private readonly redisService: RedisService,
        private readonly redisPubSub: RedisPubSub,
        private readonly sub: VectorGrammarBasedInjectionSub
    ) { }

    onModuleInit() {
        this.sub.handleEvent = async (event: any, channel: string) => {
            if (event.headers.entityType === `fuzzer-engine` && event.headers.eventType === `after-response`) {
                await this.validate(event.payload.fuzzerId, event.payload.operationId, event.payload.caseId);
            }
        }
    }

    public async validate(fuzzerId: UUID, operationId: string, caseId: UUID) {
        try {
            const req = await this.redisService.get(this.keyManager.forRequest(fuzzerId, operationId, caseId));
            if (req.params.payloadId) {
                const dmm = await this.redisService.get(this.keyManager.forDmm(fuzzerId, operationId, 'payload', req.params.payloadId));
                if (dmm.vectorId) {

                    const [vector, resp] = await this.redisService.mget<any>([
                        this.keyManager.forVector(dmm.vectorId),
                        this.keyManager.responseKey(fuzzerId, operationId, caseId)
                    ]);

                    const vOracle: any = {};
                    const resPayload: string = Buffer.from(resp.payload, 'base64').toString('utf-8');
                    const vectorRaw: string = Buffer.from(vector.script, 'base64').toString('utf-8');
                    vOracle.finding = this.vectorOracle.evaluateInjection(resPayload, vectorRaw, resp.statusCode);
                    vOracle.caseId = resp.caseId;
                    vOracle.statusCode = resp.statusCode;
                    vOracle.vectorId = vector.id;
                    vOracle.vectorApplied = vector;

                    await Promise.all([
                        this.redisService.set(this.keyManager.forGrammarVector(fuzzerId, req.operationId, resp.uuidReq), vOracle),
                        this.redisPubSub.publish("jdozer:fuzzer:vector-grammar", fuzzerId, "injection", "vector-grammar", vOracle)
                    ]);
                } else {
                    this.logger.verbose(`[validate] Vector not found for key pattern ${this.keyManager.dmmPattern(fuzzerId, req.params.payloadId)}`);
                }
            }
        } catch (e) {
            this.logger.error(`[validate] Error validating vector: ${e.message}`);
            throw new Error(e.message);
        }
    }

}

