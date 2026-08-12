import { Injectable, Logger } from '@nestjs/common';
import { KeyManager } from './key-manager';
import { RedisService } from './redis.service';
import { UUID } from 'crypto';

export class DummyStorageException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DummyStorageException';
  }
}

@Injectable()
export class DummyStorage {

  private readonly log = new Logger(DummyStorage.name);
  private readonly keyManager = new KeyManager();

  constructor(private readonly redisService: RedisService) { }

  async findFuzzer(fuzzerId: UUID): Promise<string> {
    try {
      const key = this.keyManager.forFuzz(fuzzerId);
      this.log.verbose(`Looking for fuzzer with ID ${key}`);
      const result = await this.redisService.get(key);
      return result ? JSON.stringify(result) : '';
    } catch (error) {
      this.log.error(`Error in findFuzzer for ${fuzzerId}`, error);
      throw new DummyStorageException(`Error finding fuzzer: ${(error as Error).message}`);
    }
  }

  async findOperation(operationName: string, fuzzerId: string): Promise<string> {
    try {
      const key = this.keyManager.forOperation(operationName, fuzzerId as UUID);
      const result = await this.redisService.get(key);
      return result ? JSON.stringify(result) : '';
    } catch (error) {
      this.log.error(`Error in findOperation for ${operationName}`, error);
      throw new DummyStorageException(`Error finding operation: ${(error as Error).message}`);
    }
  }

  async getContextParameters(fuzzerId: string, operationName: string): Promise<string[]> {
    const contexts = ['payload', 'headers', 'path', 'query'];
    const validContexts: string[] = [];

    for (const context of contexts) {
      const count = await this.getDummyCant(fuzzerId, operationName, context);
      if (count > 0) {
        validContexts.push(context);
      }
    }
    return validContexts;
  }

  async getDummyCant(fuzzerId: string, operationName: string, property: string): Promise<number> {
    try {
      const pattern = this.keyManager.forFake(fuzzerId, operationName, property, '*');
      const client = (this.redisService as any).client;
      const keys = await client.keys(pattern);
      return keys.length;
    } catch (error) {
      this.log.error(`Error in getDummyCant for ${property}`, error);
      throw new DummyStorageException(`Error getting dummy count: ${(error as Error).message}`);
    }
  }

  async getDummyValid(fuzzerId: UUID, operationName: string, property: string): Promise<string> {
    try {
      const pattern = this.keyManager.forFake(fuzzerId, operationName, property, '*');
      this.log.verbose(`[getDummyValid] Pattern: ${pattern}`);
      const client = (this.redisService as any).client;
      const keys = await client.keys(pattern);

      for (const key of keys) {
        const value = await this.redisService.get(key);
        if (value && value.valid === true) {
          return JSON.stringify(value);
        }
      }

      return '';
    } catch (error) {
      this.log.error(`Error in getDummyValid for ${property}`, error);
      throw error;
    }
  }

  async getOperationsName(operation: string, fuzzerId: string): Promise<string> {
    try {
      const opJson = await this.findOperation(operation, fuzzerId);
      if (opJson) {
        const opData = JSON.parse(opJson);
        return opData.name || '';
      }
      return '';
    } catch (error) {
      this.log.error(`Error in getOperationsName for ${operation}`, error);
      throw new DummyStorageException(`Error getting operation name: ${(error as Error).message}`);
    }
  }

  async save(key: string, value: string): Promise<void> {
    try {
      let toSave: any;
      try {
        toSave = JSON.parse(value);
      } catch (e) {
        toSave = value;
      }
      await this.redisService.set(key, toSave);
    } catch (error) {
      this.log.error(`Error in save for key ${key}`, error);
      throw new DummyStorageException(`Error saving data: ${(error as Error).message}`);
    }
  }

  async getRndFuzzVector(cant: number): Promise<any[]> {
    try {
      this.log.verbose(`[getRndFuzzVector] Searching for random vectors`);
      if (cant <= 0) return [];

      let pattern = 'JDF:VEC:*';
      if (typeof (this.keyManager as any).vecPrefix === 'function') {
        pattern = (this.keyManager as any).vecPrefix() + '*';
      }

      const client = (this.redisService as any).client;
      const keys = await client.keys(pattern);

      if (!keys || keys.length === 0) return [];

      const vectors: any[] = [];
      for (let i = 0; i < cant; i++) {
        const index = this.random(0, keys.length - 1);
        const randomKey = keys[index];
        const vectorData = await this.redisService.get(randomKey);
        if (vectorData) {
          vectors.push(vectorData);
        }
      }
      this.log.verbose(`[getRndFuzzVector] Found ${vectors.length} random vectors`);
      return vectors;
    } catch (error) {
      this.log.error('getRndFuzzVector failed!', error);
      throw new DummyStorageException('getRndFuzzVector failed!');
    }
  }

  private random(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
