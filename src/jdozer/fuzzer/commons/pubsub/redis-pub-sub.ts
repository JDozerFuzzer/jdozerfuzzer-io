import { Injectable, Logger } from '@nestjs/common';
import { UUID } from 'crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';


@Injectable()
export class RedisPubSub {

  private readonly log = new Logger(RedisPubSub.name);

  constructor(
    @InjectRedis() private readonly client: Redis,
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
      await this.client.publish(channel, JSON.stringify(event), (err, sent) => {
        if (err) {
          this.log.error(`Error publishing event to channel ${channel}`, err);
          throw err;
        }
        this.log.verbose(`Message posted in the channel ${channel} ${sent}`);
      });
    } catch (error) {
      this.log.error(`Error publishing event to channel ${channel}`, error);
      this.log.debug(payload);
      throw error;
    }
  }

}
