import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../commons/storage/redis.service';
import { generate } from '../../../generators/dummy.generator';
import { KeyManager } from '../commons/storage/key-manager';
import { UUID } from 'crypto';
import { FuzzerOperation } from '../commons/schemas/fuzzer-operation.dto';

@Injectable()
export class JDozerFuzzerSeed {

  private readonly logger = new Logger(JDozerFuzzerSeed.name);
  private readonly keyManager: KeyManager = new KeyManager();

  constructor(private readonly redisService: RedisService) { }

  async generated(fuzzerId: UUID, operation: FuzzerOperation): Promise<string[]> {
    try {
      const keys = await this.generatePayloads(fuzzerId, operation);
      return keys;
    } catch (e) {
      this.logger.error(`[generated] Failed to generate seeds for fuzzer ${fuzzerId}`, e);
      throw e;
    }
  }

  private async generatePayloads(fuzzerId: string, operation: FuzzerOperation): Promise<string[]> {

    if (operation.req && operation.req.payload) {

      const saves: Promise<void>[] = [];
      const generatedTests = generate(operation.req.payload);

      const testCases: any[] = [];
      for (const test of generatedTests) {
        testCases.push({
          id: uuidv4(),
          operationId: operation.name,
          valid: test.valid,
          in: 'payload',
          property: test.property || undefined,
          data: Buffer.from(JSON.stringify(test.data)).toString('base64'),
          message: test.message || ''
        });
      }

      const keys: string[] = [];
      for (const testCase of testCases) {
        const key = this.keyManager.forTestCase(fuzzerId, testCase.operationId, 'payload', testCase.id);
        saves.push(this.redisService.set(key, testCase));
        keys.push(key);
      }

      await Promise.all(saves);
      return keys;

    }
    return [];
  }
}
