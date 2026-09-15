import { Injectable, Logger } from "@nestjs/common";
import { Fuzzer, JDozerOpenApiLoad } from "./jdozer-openapi-load.service";
import { RedisService } from "../commons/storage/redis.service";
import { KeyManager } from "../commons/storage/key-manager";
import { RedisPubSub } from "../commons/pubsub/redis-pub-sub";
import { FuzzerOperation } from "../commons/schemas/fuzzer-operation.dto";


@Injectable()
export class JDozerFuzzerSeeder {

    private readonly logger = new Logger(JDozerFuzzerSeeder.name);
    private readonly keyManager: KeyManager = new KeyManager();

    constructor(
        private readonly redisService: RedisService,
        private readonly redisPubSub: RedisPubSub,
        private readonly openApiLoad: JDozerOpenApiLoad
    ) { }

    async run(contract: any): Promise<Fuzzer> {
        try {
            await this.openApiLoad.build(contract);
            let fuzzer: Fuzzer = this.openApiLoad.getFuzzer();
            let operations: FuzzerOperation[] = this.openApiLoad.getOperations();
            let encodeContract: string = this.openApiLoad.getEncodeContract();
            const saves: Promise<any>[] = [];
            saves.push(this.redisService.set(this.keyManager.forApi(fuzzer.id), encodeContract));
            saves.push(this.redisService.set(this.keyManager.forFuzz(fuzzer.id), fuzzer));
            saves.push(this.redisPubSub.publish(`jdozer:fuzzer:fuzzer`, fuzzer.id, `created`, `fuzzer`, fuzzer));

            operations.forEach((op) => {
                saves.push(this.redisService.set(this.keyManager.forOperation(op.name, fuzzer.id), op));
            });
            saves.push(this.redisPubSub.publish(`jdozer:fuzzer:fuzzer`, fuzzer.id, `created`, `operations`, {
                id: fuzzer.id,
                operations: operations.map((op) => {
                    return {
                        id: op.id,
                        name: op.name,
                        path: op.path,
                        method: op.method
                    };
                })
            }));
            await Promise.all(saves);
            this.logger.log(`Successful contract reading: ${fuzzer.name}`, `for the fuzzer: ${fuzzer.id}`);
            return fuzzer;
        } catch (e) {
            this.logger.error(`[run] Error in run: ${e}`);
            throw e;
        }
    }


}