import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  onModuleInit() {
    this.client = new Redis({
      host: process.env.FUZZER_REDIS_HOST || 'localhost',
      port: parseInt(process.env.FUZZER_REDIS_PORT || '6379', 10),
    });
    this.logger.log('Redis client initialized');
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.quit();
    }
  }

  async set(key: string, value: any): Promise<void> {
    const data = typeof value === 'string' ? value : JSON.stringify(value);
    await this.client.set(key, data);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async publish(channel: string, message: any): Promise<number> {
    const data = typeof message === 'string' ? message : JSON.stringify(message);
    return this.client.publish(channel, data);
  }

  getClient(): Redis {
    return this.client;
  }
}
