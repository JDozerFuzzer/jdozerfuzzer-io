import { Injectable, Logger } from "@nestjs/common";
import { KeyManager } from "../commons/storage/key-manager";
import { RedisService } from "../commons/storage/redis.service";
import { UUID } from "crypto";
import { Fuzzer } from "../commons/schemas/fuzzer.dto";
import { RedisAdapter } from "../commons/storage/redis-adapter.service";


@Injectable()
export class ControllerStorage {

    private readonly logger: Logger = new Logger(ControllerStorage.name);
    private readonly keyManager: KeyManager = new KeyManager();

    constructor(
        private readonly redisService: RedisService,
        private readonly storageAdapter: RedisAdapter
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

    public async getResponsesSummaryList(fuzzerId: UUID, operationId: string) {
        try {
            const responseSummaryList = await this.storageAdapter.getResponsesSummaryList(fuzzerId, operationId);
            return responseSummaryList;
        } catch (e) {
            this.logger.error(`[getResponsesSummaryList] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

    public async getCaseDetails(fuzzerId: UUID, caseId: UUID): Promise<Record<string, any> | undefined> {
        try {
            const caseDetails = await this.storageAdapter.caseDetails(fuzzerId, caseId);
            return caseDetails;
        } catch (e) {
            this.logger.error(`[getCaseDetails] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

    public async getOperation(fuzzerId: UUID, operationId: string) {
        try {
            const operation = await this.storageAdapter.getOperation(fuzzerId, operationId);
            return operation;
        } catch (e) {
            this.logger.error(`[getOperation] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

    public async getContract(fuzzerId: UUID) {
        try {
            const contract = await this.storageAdapter.getContract(fuzzerId);
            return contract;
        } catch (e) {
            this.logger.error(`[getContract] An error has occurred: ${e.message}`, e);
            throw e;
        }
    }

}

