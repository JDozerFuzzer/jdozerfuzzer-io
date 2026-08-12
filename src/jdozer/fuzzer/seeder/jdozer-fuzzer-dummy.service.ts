import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../commons/storage/redis.service';
import { generate } from '../../../generators/dummy.generator';

@Injectable()
export class JDozerFuzzerDummy {
  private readonly logger = new Logger(JDozerFuzzerDummy.name);

  constructor(private readonly redisService: RedisService) { }

  async generatePayloads(fuzzerId: string, operations: any[]): Promise<void> {
    this.logger.verbose(`[generatePayloads] Scanning ${operations.length} operations`)
    for (const operation of operations) {
      this.logger.verbose(`[generatePayloads] Processing operation ${operation.name}`);
      if (operation.req && operation.req.payload) {
        this.logger.verbose(`[generatePayloads] ${operation.name} schema found`);
        const generatedTests = generate(operation.req.payload);
        this.logger.verbose(`[generatePayloads] Generated ${generatedTests.length} test cases for operation ${operation.name}`)

        for (const test of generatedTests) {
          const dummyId = uuidv4();
          const dmmKey = `JDF:${fuzzerId}:DMM:${operation.name}:payload:${dummyId}`;

          const dummyData: any = {
            valid: test.valid,
            in: 'payload',
            data: Buffer.from(JSON.stringify(test.data)).toString('base64'),
            message: test.message || '',
            id: dummyId
          };

          if (test.property) {
            dummyData['property'] = test.property;
          }

          await this.redisService.set(dmmKey, dummyData);

        }

        this.logger.log(`Generated ${generatedTests.length} payload dummy cases for operation ${operation.name}`);
      }
      this.logger.verbose(`[generatePayloads] ${operation.name} schema not found`);
    }
  }
}
