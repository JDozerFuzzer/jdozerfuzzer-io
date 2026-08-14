import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventConsumer } from "../commons/pubsub/event-consumer.interface";
import { EventConsumerRegistry } from "../commons/pubsub/event-consumer-registry.service";
import { KeyManager } from "../commons/storage/key-manager";
import { RedisService } from "../commons/storage/redis.service";
import { RedisPubSub } from "../commons/pubsub/redis-pub-sub";
import { UUID } from "crypto";
import { Fuzzer } from "../seeder/jdozer-openapi-load.service";


@Injectable()
export class TotalCasesSub implements EventConsumer, OnModuleInit {

    private readonly logger = new Logger(TotalCasesSub.name);

    readonly channels: string[] = ['jdozer:fuzzer:engine'];
    readonly entityType: string = 'fuzzer-engine';
    readonly eventType: string = 'engine-started';

    constructor(
        private readonly registry: EventConsumerRegistry
    ) { }

    onModuleInit() {
        this.registry.register(this);
        this.logger.log("TotalCasesSub registered");
    }

    handleEvent(data: any, channel: string): void {
        this.logger.warn(`Method not implemented ${channel} | ${this.entityType} | ${this.eventType}`);
    }

}

@Injectable()
export class TotalCases implements OnModuleInit {

    private readonly logger = new Logger(TotalCases.name);
    private readonly keyManager = new KeyManager();

    constructor(
        private readonly redisService: RedisService,
        private readonly redisPubSub: RedisPubSub,
        private readonly sub: TotalCasesSub
    ) { }

    onModuleInit() {
        this.sub.handleEvent = async (event: any, channel: string) => {
            if (event.headers.entityType === this.sub.entityType && event.headers.eventType === this.sub.eventType) {
                this.counts(event.payload.fuzzerId);
            }
        }
    }

    public async counts(fuzzerId: UUID) {
        try {
            const counts: any = {};
            const fuzzer: Fuzzer = await this.redisService.get(this.keyManager.forFuzz(fuzzerId));
            let total: number = 0;

            for (const op of fuzzer.operationIds) {
                counts[`${op}`] = {};
                let keys: string[] = await this.redisService.getKeys(this.keyManager.dmmOperationPattern(fuzzerId, op));
                keys.forEach(key => {
                    let s = key.split(':');
                    if (counts[`${op}`][`${s[4]}`]) {
                        counts[`${op}`][`${s[4]}`]++;
                    } else {
                        counts[`${op}`][`${s[4]}`] = 1;
                    }
                    total++;
                });
            }
            counts.total = total;
            await this.redisService.set(this.keyManager.forFuzz(fuzzerId).concat(`:DMM:COUNTS`), counts);
            await this.redisPubSub.publish("jdozer:fuzzer:listeners", fuzzerId, "total-cases", "counts", counts);

        } catch (e) {
            this.logger.error(`[counts] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

}