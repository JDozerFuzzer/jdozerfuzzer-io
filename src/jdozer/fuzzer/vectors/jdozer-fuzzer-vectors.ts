import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { RedisPubSub } from '../commons/pubsub/redis-pub-sub';
import { KeyManager } from '../commons/storage/key-manager';
import { VectorsSubscriber } from './jdozer-fuzzer-vectors-sub';
import { UUID } from 'crypto';
import { FuzzerOperation } from '../commons/schemas/fuzzer-operation.dto';
import { Fuzzer } from '../commons/schemas/fuzzer.dto';
import { RedisService } from '../commons/storage/redis.service';
import { VectorUtils } from './vector-utils';
import { JDozerFuzzerDummy } from './jdozer-fuzzer-dummy.service';

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
    private readonly dummy: JDozerFuzzerDummy
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

      const dummyCases = await this.payloadDummy(fuzzer, operations);
      const vectorCases = await this.createVectors(fuzzer, operations);
      await this.redisPubSub.publish(`jdozer:fuzzer:test-cases`, fuzzer.id, 'generated', `test-cases`, { vectorCases, dummyCases, totalCases: vectorCases + dummyCases });

    } catch (e) {
      this.log.error(`[createTestCases] Error in createTestCases: ${e}`, e);
      throw e;
    }
  }

  async payloadDummy(fuzzer: Fuzzer, operations: FuzzerOperation[]): Promise<number> {
    try {
      return await this.dummy.generatePayloads(fuzzer.id, operations);
    } catch (e) {
      this.log.error(`[payloadDummy] Error in payloadDummy: ${e}`, e);
      throw e;
    }
  }

  async createVectors(fuzzer: Fuzzer, operations: FuzzerOperation[]): Promise<number> {
    try {

      const _count: any = {};
      const saves: Promise<void>[] = [];
      for (const operation of operations) {
        _count[operation.name] = 0;
        this.log.debug(`[createVectors] Processing operation: ${operation.name}`);

        if (operation.req.payload) {
          const parameters: string[] = await this.vectorUtils.getPropertiesString(operation.req.payload);
          const vectorsKeys: string[] = await this.vectorUtils.getRandomVectorsKeys(parameters.length);
          const dmmSeeder: any = await this.vectorUtils.getDmmValid(fuzzer.id, operation.name, 'payload');

          let index: number = parameters.length - 1;
          for (const vk of vectorsKeys) {
            const vector: any = await this.redisService.get(vk);
            const newDmm = this.vectorUtils.vectorToDmm(dmmSeeder, parameters[index], vector);
            saves.push(this.redisService.set(this.keyManager.forDmm(fuzzer.id, operation.name, newDmm.in, newDmm.id), newDmm));
          }
        }
      }

      await Promise.all(saves).then(async () => {
        this.log.debug(`Vector generation finished. Total vectors created: ${saves.length}`);
      }).catch((e) => {
        this.log.error(`Error while saving vectors: ${(e as Error).message}`, (e as Error).stack);
      });

      return saves.length;
    } catch (error) {
      this.log.error(`Catastrophic failure in createVectors: ${(error as Error).message}`, (error as Error).stack);
      throw error;
    }
  }

}
