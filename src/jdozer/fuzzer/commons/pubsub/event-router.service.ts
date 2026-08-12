// src/common/services/event-router.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger, OnApplicationBootstrap } from '@nestjs/common';
import Redis from 'ioredis';
import { EventConsumerRegistry } from './event-consumer-registry.service';
import { EventConsumer } from './event-consumer.interface';

@Injectable()
export class EventRouterService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(EventRouterService.name);
  private redisClient: Redis;

  private consumerMap = new Map<string, EventConsumer>();

  constructor(private readonly registry: EventConsumerRegistry) {
    this.redisClient = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '', 10) || 6379
    });
  }

  async onApplicationBootstrap() {
    this.logger.log('EventRouterService initialization...');
    this.logger.verbose(`Current registry:`, this.registry);
    const consumers = this.registry.findAll();

    for (const consumer of consumers) {
      for (const channel of consumer.channels) {
        const key = consumer.constructor.name;
        if (this.consumerMap.has(key)) {
          this.logger.warn(
            `Routing conflict: The key ${key} is already registered by ${this.consumerMap.get(key)?.constructor.name}`
          );
        }
        this.consumerMap.set(key, consumer);
        this.logger.debug(`Registered: ${key} -> ${consumer.constructor.name}`);
      }
    }

    const uniqueChannels = new Set<string>();
    for (const consumer of consumers) {
      for (const channel of consumer.channels) {
        uniqueChannels.add(channel);
      }
    }

    for (const channel of uniqueChannels) {
      await this.redisClient.subscribe(channel);
      this.logger.log(`Subscribed to Redis channel: ${channel}`);
    }
    this.redisClient.on('message', (channel, message) => {
      this.handleMessage(channel, message);
    });

    this.logger.debug(`EventRouterService initialization complete. Consumers registered: ${consumers.length}`);
  }

  private handleMessage(channel: string, message: string) {
    try {
      const event = JSON.parse(message);
      const { headers: { entityType, eventType }, payload } = event;

      const match = this.filterChannels(this.consumerMap, channel);
      const matchKeys = match.keys();
      for (const key of matchKeys) {
        match.get(key)?.handleEvent(event, channel);
        this.logger.verbose(
          `Event ${eventType} for ${entityType} on channel ${channel} handled by ${match.get(key)?.constructor.name}`
        );
      }
    } catch (error) {
      this.logger.error(`Error processing channel message ${channel}: ${error.message}`);
    }
  }

  private buildKey(channel: string, entityType: string, eventType: string): string {
    return `${channel}|${entityType}|${eventType}`;
  }

  async onModuleDestroy() {
    await this.redisClient.quit();
  }

  private filterChannels(consumerMap: Map<string, EventConsumer>, target: string): Map<string, EventConsumer | undefined> {
    const matched: Map<string, EventConsumer | undefined> = new Map();

    const keys = consumerMap.keys();
    for (const consumerKey of keys) {
      const channels: string[] | undefined = consumerMap.get(consumerKey)?.channels;
      if (channels == undefined) {
        continue;
      }
      for (const channel of channels) {
        if (channel.includes('*')) {
          const escaped = channel
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*');
          const regex = new RegExp(`^${escaped}$`);
          if (regex.test(target)) {
            matched.set(consumerKey, consumerMap.get(consumerKey));
          }
        } else if (channel === target) {
          matched.set(consumerKey, consumerMap.get(consumerKey));
        }
      }
    }
    this.logger.verbose(`[filterChannels] Channel inbound: ${target} | Channels matched: ${Array.from(matched.keys()).join(', ')}`);
    return matched;
  }

}