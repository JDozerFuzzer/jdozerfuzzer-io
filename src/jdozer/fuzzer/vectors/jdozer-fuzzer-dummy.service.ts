import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../commons/storage/redis.service';
import { generate } from '../../../generators/dummy.generator';

@Injectable()
export class JDozerFuzzerDummy {

  private readonly logger = new Logger(JDozerFuzzerDummy.name);

  constructor(private readonly redisService: RedisService) { }

  async generatePayloads(fuzzerId: string, operations: any[]): Promise<number> {

    const saves: Promise<void>[] = [];
    for (const operation of operations) {

      if (operation.req && operation.req.payload) {
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
        testCases.forEach(testCase => saves.push(this.redisService.set(`JDF:${fuzzerId}:DMM:${testCase.operationId}:payload:${testCase.id}`, testCase)));
      }
    }
    await Promise.all(saves);
    return saves.length;
  }
}
