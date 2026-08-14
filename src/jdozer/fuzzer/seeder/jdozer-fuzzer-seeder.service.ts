import { Injectable, Logger } from "@nestjs/common";
import { Fuzzer, JDozerOpenApiLoad } from "./jdozer-openapi-load.service";
import { JDozerFuzzerDummy } from "./jdozer-fuzzer-dummy.service";
import { RedisService } from "../commons/storage/redis.service";
import { KeyManager } from "../commons/storage/key-manager";
import { randomUUID } from "crypto";
import { RedisPubSub } from "../commons/pubsub/redis-pub-sub";


@Injectable()
export class JDozerFuzzerSeeder {

    private readonly logger = new Logger(JDozerFuzzerSeeder.name);
    private readonly keyManager: KeyManager = new KeyManager();

    constructor(
        private readonly redisService: RedisService,
        private readonly redisPubSub: RedisPubSub,
        private readonly openApiLoad: JDozerOpenApiLoad,
        private readonly fuzzerDummy: JDozerFuzzerDummy
    ) { }

    async run(contract: any): Promise<Fuzzer> {
        try {
            await this.openApiLoad.build(contract);
            let fuzzer: Fuzzer = this.openApiLoad.getFuzzer();
            let operations = this.openApiLoad.getOperations();

            await this.redisService.set(this.keyManager.forFuzz(fuzzer.id), fuzzer);

            operations.forEach(async (op) => {
                await this.redisService.set(this.keyManager.forOperation(op.name, fuzzer.id), op);
            });

            this.logger.debug(`Fuzzer ${fuzzer.id} and operations saved successfully`);

            await this.fuzzerDummy.generatePayloads(fuzzer.id, operations);

            const f: Fuzzer = await this.redisService.get(this.keyManager.forFuzz(fuzzer.id));
            await this.redisPubSub.publish(`jdozer:fuzzer:seeder`, f.id, `builder-successful`, `fuzzer-seeder`, f);
            const dmmCount: string[] = await this.redisService.getKeys(this.keyManager.dmmAllPattern(fuzzer.id));
            const dmmAgg: any = {};
            dmmCount.forEach(async (key) => {
                let op = key.split(':')[3];
                if (!dmmAgg[op])
                    dmmAgg[op] = 1;
                else
                    dmmAgg[op] += 1;
            });
            await this.redisPubSub.publish(`jdozer:fuzzer:seeder`, f.id, `dummy-generated`, `fuzzer-seeder`, dmmAgg);
            return f;

        } catch (e) {
            this.logger.error(`Error in run: ${e}`);
            throw e;
        }
    }


}