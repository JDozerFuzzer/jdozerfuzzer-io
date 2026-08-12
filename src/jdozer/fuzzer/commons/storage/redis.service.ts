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

  async flushall(): Promise<void> {
    try {
      await this.client.flushall();
      this.log.log('Redis database cleaned successfully (flushall)');
    } catch (error) {
      this.log.error('Error in FLUSHALL operation:', error);
      throw error;
    }
  }

  async publish(channel: string, event: any): Promise<void> {
    try {
      const data = JSON.stringify(event);
      const subscribers = await this.client.publish(channel, data);
      this.log.verbose(`Message posted in the channel ${channel} (${subscribers} subscribers)`);
    } catch (error) {
      this.log.error(`Error on publish operation for channel ${channel}:`, error);
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
