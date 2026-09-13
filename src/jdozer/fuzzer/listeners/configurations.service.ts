import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventConsumer } from "../commons/pubsub/event-consumer.interface";
import { EventConsumerRegistry } from "../commons/pubsub/event-consumer-registry.service";
import { KeyManager } from "../commons/storage/key-manager";
import { RedisService } from "../commons/storage/redis.service";
import { RedisPubSub } from "../commons/pubsub/redis-pub-sub";
import { UUID } from "crypto";
import { Fuzzer } from "../seeder/jdozer-openapi-load.service";
import { FuzzerOperation } from "../commons/schemas/fuzzer-operation.dto";


@Injectable()
export class ConfugurationsSub implements EventConsumer, OnModuleInit {

    private readonly logger = new Logger(ConfugurationsSub.name);

    readonly channels: string[] = ['jdozer:fuzzer:engine'];
    readonly entityType: string = 'fuzzer-engine';
    readonly eventType: string = 'started';

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
export class Configurations implements OnModuleInit {

    private readonly logger = new Logger(Configurations.name);
    private readonly keyManager = new KeyManager();

    constructor(
        private readonly redisService: RedisService,
        private readonly redisPubSub: RedisPubSub,
        private readonly sub: ConfugurationsSub
    ) { }

    onModuleInit() {
        this.sub.handleEvent = async (event: any, channel: string) => {
            if (event.headers.entityType === this.sub.entityType && event.headers.eventType === this.sub.eventType) {
                this.configurations(event.payload.fuzzerId);
            }
        }
    }

    public async configurations(fuzzerId: UUID): Promise<any> {
        return await Promise.all([
            this.totalTestCase(fuzzerId),
            this.attackSurface(fuzzerId)
        ]).then((res) => {
            this.logger.log(`[configurations] Configurations for fuzzerId: ${fuzzerId} has been updated`);
            this.logger.debug(`[configurations] ${JSON.stringify(res)}`);
            return res;
        }).catch((e) => {
            this.logger.error(`[configurations] An error has occurred: ${e.message}`, e);
            throw e;
        });
    }

    public async totalTestCase(fuzzerId: UUID) {
        try {

            const counts: any = {};
            const perOperations: any = {};
            const fuzzer: Fuzzer = await this.redisService.get(this.keyManager.forFuzz(fuzzerId));
            let total: number = 0;

            for (const op of fuzzer.operationIds) {
                perOperations[`${op}`] = {};
                let keys: string[] = await this.redisService.getKeys(this.keyManager.dmmOperationPattern(fuzzerId, op));
                keys.forEach(key => {
                    let s = key.split(':');
                    if (perOperations[`${op}`][`${s[4]}`]) {
                        perOperations[`${op}`][`${s[4]}`]++;
                    } else {
                        perOperations[`${op}`][`${s[4]}`] = 1;
                    }
                    total++;
                });
            }
            counts.total = total;
            counts.perOperations = perOperations;
            await Promise.all([
                this.redisService.set(this.keyManager.forFuzz(fuzzerId).concat(`:DMM:COUNTS`), counts),
                this.redisPubSub.publish("jdozer:fuzzer:configurations", fuzzerId, "total-cases", "configuration", counts)
            ]);
        } catch (e) {
            this.logger.error(`[counts] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

    private async attackSurface(fuzzerId: UUID): Promise<void> {
        try {
            const fuzzer: Fuzzer = await this.redisService.get(this.keyManager.forFuzz(fuzzerId));
            const fuzzCasesKeys: string[] = await this.redisService.getKeys(this.keyManager.dmmAllPattern(fuzzerId))
            const agg: Promise<any>[] = [];
            const attack: Map<string, Set<string>> = new Map<string, Set<string>>();
            fuzzer.operationIds.forEach(op => {
                if (!attack.get(op)) attack.set(op, new Set<string>());
                fuzzCasesKeys.filter(k => k.split(':')[3] === op).forEach(k => {
                    attack.get(op)?.add(k.split(':')[4]);
                });
            });
            attack.forEach((surface, operationId) => {
                if (surface.size == 0) return;
                agg.push(
                    this.redisService.get(this.keyManager.forOperation(operationId, fuzzerId)).then((op: FuzzerOperation) => {
                        return {
                            operationId: op.name,
                            path: op.path,
                            method: op.method,
                            surface: Array.from(surface.values())
                        } as Surface;
                    })
                );
            });
            const surfaces = await Promise.all(agg);
            const attackSurface: AttackSurface = {
                fuzzerId,
                surfaces: surfaces
            };
            await Promise.all([this.redisService.set(this.keyManager.vectorAttackSurfaceKey(fuzzerId), attackSurface),
            this.redisPubSub.publish("jdozer:fuzzer:configurations", fuzzerId, "attack-surface", "configuration", attackSurface)]);
            return;

        } catch (e) {
            this.logger.error(`[attackSurface] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }
}

export interface AttackSurface {
    fuzzerId: UUID,
    surfaces: Surface[]
};

export interface Surface {
    operationId: string,
    path: string,
    method: string,
    surface: string[]
};