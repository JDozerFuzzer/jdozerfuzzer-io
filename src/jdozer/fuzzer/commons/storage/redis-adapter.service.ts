import { Injectable, Logger } from "@nestjs/common";
import { UUID } from "crypto";
import { Fuzzer } from "../schemas/fuzzer.dto";
import { KeyManager } from "./key-manager";
import { RedisService } from "./redis.service";


@Injectable()
export class RedisAdapter {

    private readonly logger: Logger = new Logger(RedisAdapter.name);
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
            if (keys === null || keys.length === 0) {
                return [];
            }
            const fuzzers: Fuzzer[] = await this.redisService.mget(keys);
            return fuzzers;

        } catch (e) {
            this.logger.error(`[getFuzzers] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

    public async getOperation(fuzzerId: UUID, operationId: string) {
        try {
            const pattern: string = this.keyManager.forOperation(operationId, fuzzerId);
            const keys: string[] = (await this.redisService.scan(pattern));
            const value: any = await this.redisService.get(keys[0]);
            return value;
        } catch (e) {
            this.logger.error(`[getOperation] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

    public async getResponsesKeys(fuzzerId: UUID) {
        try {
            const pattern: string = this.keyManager.responsesPattern(fuzzerId);
            return await this.redisService.scan(pattern);
        } catch (e) {
            this.logger.error(`[getResponsesKeys] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

    public async gets(keys: string[]): Promise<any[]> {
        try {
            return await this.redisService.mget(keys);
        } catch (e) {
            this.logger.error(`[get] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

    public async save(key: string, data: any): Promise<void> {
        try {
            return await this.redisService.set(key, data);
        } catch (e) {
            this.logger.error(`[save] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

    public async getResponsesSummaryList(fuzzerId: UUID, operationId: string): Promise<any[]> {
        try {
            const pattern: string = this.keyManager.requestSummaryListPattern(fuzzerId, operationId);
            const keys: string[] = await this.redisService.scan(pattern);
            const values: any[] = await this.redisService.mget(keys);
            return values;
        } catch (e) {
            this.logger.error(`[getResponsesList] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

    public async caseDetails(fuzzerId: UUID, caseId: UUID): Promise<Record<string, any> | undefined> {
        try {
            const pattern = this.keyManager.caseIdPattern(fuzzerId, caseId);
            const casesKeys: string[] = await this.redisService.scan(pattern);
            if (casesKeys && casesKeys.length > 0) {
                const caseDetails: any = await this.redisService.mget(casesKeys);
                const details: Record<string, any> = {};
                for (let i = 0; i < casesKeys.length; i++) {
                    details[casesKeys[i].split(':')[5]] = caseDetails[i];
                }
                return details;
            }
            return undefined;
        } catch (e) {
            this.logger.error(`[responseDetails] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

    public async getContract(fuzzerId: UUID): Promise<any> {
        try {
            const key: string = this.keyManager.forApi(fuzzerId);
            return await this.redisService.get(key);
        } catch (e) {
            this.logger.error(`[getContract] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }


}

