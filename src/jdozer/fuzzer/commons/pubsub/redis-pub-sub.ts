import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../storage/redis.service';
import { UUID } from 'crypto';


@Injectable()
export class RedisPubSub {

  private readonly log = new Logger(RedisPubSub.name);

  constructor(
    private readonly redisService: RedisService,
  ) { }

  async publish(channel: string, entityId: UUID, eventType: string, entityType: string, payload: any): Promise<void> {
    try {
      const event = {
        headers: {
          entityId,
          eventType,
          entityType,
          timestamp: new Date().toISOString()
        },
        payload
      };
      await this.redisService.publish(channel, event);
    } catch (error) {
      this.log.error(`Error publishing event to channel ${channel}`, error);
      this.log.debug(payload);
      throw error;
    }
  }

}
