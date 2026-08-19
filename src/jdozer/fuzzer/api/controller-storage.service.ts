import { Injectable, Logger } from "@nestjs/common";
import { KeyManager } from "../commons/storage/key-manager";
import { RedisService } from "../commons/storage/redis.service";
import { UUID } from "crypto";
import { Fuzzer } from "../commons/schemas/fuzzer.dto";


@Injectable()
export class ControllerStorage {

    private readonly logger: Logger = new Logger(ControllerStorage.name);
    private readonly keyManager: KeyManager = new KeyManager();

    constructor(
        private readonly redisService: RedisService
    ) { }

    public async getFuzzerDetails(fuzzerId: UUID) {
        try {
            const key = this.keyManager.forFuzz(fuzzerId);
            const fuzzer: Fuzzer = await this.redisService.get(key);
            return fuzzer;
        } catch (e) {
            this.logger.error(`[getFuzzerDetails] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

    public async getTotalCases(fuzzerId: UUID) {
        try {
            const key = this.keyManager.forFuzz(fuzzerId).concat(`:DMM:COUNTS`);
            const counts: any = await this.redisService.get(key);
            return counts;
        } catch (e) {
            this.logger.error(`[getTotalCases] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

    public async getFuzzers(): Promise<any[]> {
        try {
            const keys = await this.redisService.scanWithPattern(this.keyManager.fuzzerIdsPattern(), `JDF:*`);
            const fuzzers: Fuzzer[] = await this.redisService.mget(keys);
            return fuzzers.map(f => {
                return {
                    id: f.id,
                    name: f.name,
                    version: f.version
                };
            });

        } catch (e) {
            this.logger.error(`[getFuzzers] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

}

