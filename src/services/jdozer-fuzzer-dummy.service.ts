import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../redis/redis.service';
import { generate } from '../generators/dummy.generator';

@Injectable()
export class JDozerFuzzerDummy {
  private readonly logger = new Logger(JDozerFuzzerDummy.name);

  constructor(private readonly redisService: RedisService) {}

  async generateDummies(fuzzerId: string, operations: any[]): Promise<void> {
    for (const operation of operations) {
      if (operation.request && operation.request.schema) {
        // Generate payload tests
        const generatedTests = generate(operation.request.schema);

        for (const test of generatedTests) {
          const dummyId = uuidv4();
          const dmmKey = `JDF:${fuzzerId}:DMM:${operation.name}:payload:${dummyId}`;
          
          const dummyData: any = {
            valid: test.valid,
            in: 'payload',
            data: Buffer.from(JSON.stringify(test.data)).toString('base64'),
            message: test.message || '',
            id: dummyId,
          };
          if (test.property) {
            dummyData['property'] = test.property;
          }

          await this.redisService.set(dmmKey, dummyData);
        }
        
        this.logger.log(`Generated ${generatedTests.length} payload dummy cases for operation ${operation.name}`);
      }
      
      // TODO: Generate query, path, and header cases if there are schemas in operation.parameters
    }
  }
}
