import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { RedisPubSub } from '../commons/pubsub/redis-pub-sub';
import { KeyManager } from '../commons/storage/key-manager';
import { VectorsSubscriber } from './jdozer-fuzzer-vectors.sub';
import { UUID } from 'crypto';
import { FuzzerOperation } from '../commons/schemas/fuzzer-operation.dto';
import { Fuzzer } from '../commons/schemas/fuzzer.dto';
import { RedisService } from '../commons/storage/redis.service';
import { VectorUtils } from './vector-utils';
import { JDozerFuzzerSeed } from './jdozer-fuzzer-seed.service';

export class VectorException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VectorException';
  }
}

@Injectable()
export class JDozerFuzzerVectors implements OnModuleInit {

  private readonly log = new Logger(JDozerFuzzerVectors.name);
  private readonly keyManager = new KeyManager();

  constructor(
    private readonly redisService: RedisService,
    private readonly redisPubSub: RedisPubSub,
    private readonly vectorsSubscriber: VectorsSubscriber,
    private readonly vectorUtils: VectorUtils,
    private readonly dummy: JDozerFuzzerSeed
  ) { }

  onModuleInit() {
    this.vectorsSubscriber.handleEvent = async (event: any, channel: string): Promise<void> => {
      if (event.headers.entityType === this.vectorsSubscriber.entityType && event.headers.eventType === this.vectorsSubscriber.eventType) {
        this.log.debug(`[onModuleInit] Event received: ${event.headers.entityType} ${event.headers.eventType}`);
        await this.createTestCases(event.payload.id);
      }
      return;
    };
  }

  async createTestCases(fuzzerId: UUID): Promise<void> {
    try {
      const fuzzer: Fuzzer = await this.redisService.get(this.keyManager.forFuzz(fuzzerId));
      const operationsKeys: string[] = fuzzer.operationIds.map((operationId) => {
        return this.keyManager.forOperation(operationId, fuzzerId);
      });
      const operations: FuzzerOperation[] = await this.redisService.mget(operationsKeys);

      const seeds: string[] = [];
      const vectors: string[] = [];

      let summary: any = {};
      for (const operation of operations) {
        seeds.push(...await this.dummy.generated(fuzzer.id, operation));
        summary = this.summary(seeds, 'seeds');
        vectors.push(...await this.createVectors(fuzzer, operation));
        summary = this.summary(vectors, 'mutations', summary);
      }

      await this.redisPubSub.publish(`jdozer:fuzzer:test-cases`, fuzzer.id, 'generated', `test-cases`, {
        id: fuzzer.id,
        summary
      });

      this.log.log(`[createTestCases] ${summary.total} test cases created for fuzzerId: ${fuzzerId}`);

    } catch (e) {
      this.log.error(`[createTestCases] Error in createTestCases: ${e}`, e);
      throw e;
    }
  }

  summary(keys: string[], tag: string, summary: any = { total: 0 }): any {

    for (const key of keys) {
      const path: string[] = key.split(':');

      if (!summary[`${path[3]}`]) {
        summary[`${path[3]}`] = { total: 0 };
      }
      if (!summary[`${path[3]}`][`${path[4]}`]) {
        summary[`${path[3]}`][`${path[4]}`] = {};
      }
      if (!summary[`${path[3]}`][`${path[4]}`][tag]) {
        summary[`${path[3]}`][`${path[4]}`][tag] = 0;
      }

      summary[`${path[3]}`][`${path[4]}`][tag]++;
      summary[`${path[3]}`].total++;
      summary.total++;
    }

    return summary;
  }

  async createVectors(fuzzer: Fuzzer, operation: FuzzerOperation): Promise<string[]> {
    try {

      const saves: Promise<void>[] = [];

      if (operation.req.payload) {

        const parameters: string[] = await this.vectorUtils.getPropertiesString(operation.req.payload);
        const vectorsKeys: string[] = await this.vectorUtils.getRandomVectorsKeys(parameters.length);
        const dmmSeeder: any = await this.vectorUtils.getDmmValid(fuzzer.id, operation.name, 'payload');
        const keys: string[] = [];
        let index: number = parameters.length - 1;

        for (const vk of vectorsKeys) {
          const vector: any = await this.redisService.get(vk);
          const newDmm = this.vectorUtils.vectorToDmm(dmmSeeder, parameters[index], vector);
          const key = this.keyManager.forDmm(fuzzer.id, operation.name, newDmm.in, newDmm.id);
          saves.push(this.redisService.set(key, newDmm));
          keys.push(key);
        }

        await Promise.all(saves).catch((e) => {
          this.log.error(`Error while saving vectors: ${(e as Error).message}`, (e as Error).stack);
        });

        return keys;

      }

      return [];
    } catch (error) {
      this.log.error(`Catastrophic failure in createVectors: ${(error as Error).message}`, (error as Error).stack);
      throw error;
    }
  }

}
