import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly log = new Logger(RedisService.name);

  constructor(
    @InjectRedis() private readonly client: Redis
  ) {
    this.log.log('Redis client initialized');
  }

  async set(key: string, value: any): Promise<void> {
    try {
      const data = JSON.stringify(value);
      await this.client.set(key, data);
    } catch (error) {
      this.log.error(`Error in SET operation for key ${key}:`, error);
      throw error;
    }
  }

  async get(key: string): Promise<any> {
    try {
      const data = await this.client.get(key);
      if (data === null) {
        return null;
      }
      return JSON.parse(data);
    } catch (error) {
      if (error instanceof SyntaxError) {
        this.log.error(`Syntax error while parsing JSON for key ${key}:`, error);
      } else {
        this.log.error(`Error in GET operation for key ${key}:`, error);
      }
      throw error;
    }
  }

  public async getKeys(pattern: string): Promise<string[]> {
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      this.log.error(`Error in GETKEYS operation for pattern ${pattern}:`, error);
      throw error;
    }
  }

  public async scanWithPattern(pattern: RegExp, keyPattern: string): Promise<string[]> {
    try {
      const result: string[] = [];
      let cursor = '0';

      do {
        const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', keyPattern, 'COUNT', 100);
        cursor = nextCursor;
        keys.forEach(k => {
          if (pattern.test(k)) {
            result.push(k);
          }
        });
      } while (cursor !== '0');

      return result;
    } catch (error) {
      this.log.error(`Error in SCANWithPattern operation for pattern ${pattern} and keyPattern ${keyPattern}:`, error);
      throw error;
    }
  }

  public async scan(keyPattern: string): Promise<string[]> {
    try {
      const result: string[] = [];
      let cursor = '0';

      do {
        const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', keyPattern, 'COUNT', 100);
        cursor = nextCursor;
        result.push(...keys);
      } while (cursor !== '0');

      return result;
    } catch (error) {
      this.log.error(`Error in SCAN operation for pattern ${keyPattern}:`, error);
      throw error;
    }
  }

  public async mget<T>(keys: Array<string>): Promise<T[]> {
    try {
      if (!keys || keys.length === 0) return [];
      const result: T[] = [];
      const data = await this.client.mget(keys);
      data.filter((k): k is string => k !== null).forEach(d => {
        result.push(JSON.parse(d));
      });
      return result;
    } catch (error) {
      this.log.error(`Error in MGET operation for keys ${keys}:`, error);
      throw error;
    }
  }

  async flushall(): Promise<void> {
    try {
      await this.client.flushall();
      this.log.log('Redis database cleaned successfully (flushall)');
    } catch (error) {
      this.log.error('Error in FLUSHALL operation:', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.client) {
        await this.client.quit();
        this.log.log('Connection to Redis successfully closed.');
      }
    } catch (error) {
      this.log.error('Error while closing connection to Redis:', error);
      throw error;
    }
  }
}
