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
    private readonly vectorUtils: VectorUtils
  ) { }

  onModuleInit() {
    this.vectorsSubscriber.handleEvent = async (event: any, channel: string): Promise<void> => {
      if (event.headers.entityType === 'fuzzer-seeder' && event.headers.eventType === 'builder-successful') {
        this.createVectors(event.payload.id);
      }
      return;
    };
  }

  async createVectors(fuzzerId: UUID): Promise<void> {
    try {

      this.log.log(`Starting vector generation for fuzzerId: ${fuzzerId}`);
      const fuzzer: Fuzzer = await this.redisService.get(this.keyManager.forFuzz(fuzzerId));
      let totalVectorsCreated = 0;

      const _count: any = {};
      for (const operationId of fuzzer.operationIds) {
        _count[operationId] = 0;
        const operation: FuzzerOperation = await this.redisService.get(this.keyManager.forOperation(operationId, fuzzerId));
        this.log.log(`Processing operation: ${operation.name}`);

        let forPayload: any = {};
        if (operation.req.payload) {
          const parameters: string[] = await this.vectorUtils.getPropertiesString(operation.req.payload);
          this.log.verbose(`Parameters found: ${parameters}`);
          const vectorsKeys: string[] = await this.vectorUtils.getRandomVectorsKeys(parameters.length);
          const dmmSeeder: any = await this.vectorUtils.getDmmValid(fuzzer.id, operation.name, 'payload');

          let index: number = parameters.length - 1;
          for (const vk of vectorsKeys) {
            const vector: any = await this.redisService.get(vk);
            const newDmm = this.vectorUtils.vectorToDmm(dmmSeeder, parameters[index], vector);
            this.log.verbose(`New DMM created: ${newDmm.id}`);
            await this.redisService.set(this.keyManager.forDmm(fuzzerId, operation.name, newDmm.in, newDmm.id), newDmm);
            newDmm.data = undefined;
            await this.redisPubSub.publish(`jdozer:fuzzer:vector`, fuzzerId, 'payload', `fuzzer-vector`, newDmm);
            forPayload++;
            (index <= 0) ? index = parameters.length - 1 : index--;
            _count[operationId]++;
          }
          this.log.verbose(`For payload: ${forPayload}`);
          totalVectorsCreated += forPayload;
        }
        this.redisPubSub.publish(`jdozer:fuzzer:vector`, fuzzer.id, 'total-payloads', `fuzzer-vector`, { totalVectors: totalVectorsCreated });
      }

      await this.eventHandler('builder-successful', { totalVectors: totalVectorsCreated, _count }, fuzzerId);
      this.log.log(`Vector generation finished. Total vectors created: ${totalVectorsCreated}`);
      return;
    } catch (error) {
      this.log.error(`Catastrophic failure in createVectors: ${(error as Error).message}`, (error as Error).stack);
      throw error;
    }
  }

  private async eventHandler(eventType: string, payload: any, fuzzerId: string): Promise<void> {
    try {
      const fullPayload = {
        fuzzerId: fuzzerId,
        totalVectors: payload.totalVectors,
        operations: payload._count
      };
      await this.redisPubSub.publish(`jdozer:fuzzer:vector`, fuzzerId as UUID, eventType, 'fuzzer-vectors', fullPayload);
      this.log.log(`Event ${eventType} published for fuzzer ${fuzzerId}`);
    } catch (error) {
      this.log.error(`Failed to publish event ${eventType} for fuzzer ${fuzzerId}: ${(error as Error).message}`, (error as Error).stack);
    }
  }
}
