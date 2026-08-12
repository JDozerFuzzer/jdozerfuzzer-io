import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventConsumer } from "../../commons/pubsub/event-consumer.interface";
import { EventConsumerRegistry } from "../../commons/pubsub/event-consumer-registry.service";
import { RedisService } from "../../commons/storage/redis.service";
import { RedisPubSub } from "../../commons/pubsub/redis-pub-sub";
import { KeyManager } from "../../commons/storage/key-manager";
import { UUID } from "crypto";
import { EngineSummary, RequestTimeComparison, ResponseData } from "./vectors-types";
import { VectorsTimings } from "./vector-timings";
import { Fuzzer } from "../../commons/schemas/fuzzer.dto";
import { FuzzerOperation } from "../../commons/schemas/fuzzer-operation.dto";

@Injectable()
export class VectorAnalyzeSub implements EventConsumer, OnModuleInit {

    private readonly logger: Logger = new Logger(VectorAnalyzeSub.name);

    readonly channels: string[] = [`jdozer:fuzzer:engine`];
    readonly entityType: string = "fuzzer-engine";
    readonly eventType: string = "engine-stopped";

    constructor(
        private readonly registry: EventConsumerRegistry
    ) { }

    onModuleInit() {
        this.registry.register(this);
        this.logger.log(`${this.constructor.name} registered`);
    }

    handleEvent(data: any, channel: string): Promise<void> | void {
        throw new Error("Method not implemented.");
    }

}

@Injectable()
export class VectorAnalyze implements OnModuleInit {

    private readonly logger: Logger = new Logger(VectorAnalyze.name);
    private readonly keyManager: KeyManager = new KeyManager();

    constructor(
        private readonly redisService: RedisService,
        private readonly redisPubSub: RedisPubSub,
        private readonly sub: VectorAnalyzeSub
    ) { }

    onModuleInit() {
        this.sub.handleEvent = (event: any, channel: string): void => {
            if (event.headers.entityType === this.sub.entityType && event.headers.eventType === this.sub.eventType) {
                this.analyze(event.payload.fuzzerId);
            }
        };
    }

    public async analyze(fuzzerId: UUID) {
        try {
            this.logger.verbose(`[analyze] Engine summary vector analysis for fuzzer id: ${fuzzerId}`);
            const fuzzer: Fuzzer = await this.redisService.get(this.keyManager.forFuzz(fuzzerId));
            const engineSummary: EngineSummary = await this.redisService.get(this.keyManager.forEngine(fuzzerId).concat(`:SUM`));
            const vTimings: VectorsTimings = new VectorsTimings(engineSummary);

            fuzzer.operationIds.forEach(async (opId: string) => {
                const resOpKeys: string[] = await this.redisService.getKeys(this.keyManager.responsesForOperationPattern(fuzzer.id, opId));
                const op: FuzzerOperation = await this.redisService.get(this.keyManager.forOperation(opId, fuzzer.id));
                let resp: ResponseData;
                let k: string;
                let reqTiming: RequestTimeComparison;
                for (k of resOpKeys) {
                    resp = await this.redisService.get(k);
                    reqTiming = vTimings.compareRequestTime(resp, op.path);
                    await this.redisService.set(k.replaceAll(`:RES`, `:ANALYSED`), reqTiming);
                }
            });

            await this.redisPubSub.publish(`jdozer:fuzzer:listeners`, fuzzerId, `timings`, `vector-analyzed`, {
                fuzzerId: fuzzer.id
            });

        } catch (e) {
            this.logger.error(`[analyze] Error vector analysis for fuzzer id: ${fuzzerId}`, e);
            throw e;
        }
    }

}