
import { Module, Global } from '@nestjs/common';
import { RedisPubSub } from './redis-pub-sub';
import { EventConsumerRegistry } from './event-consumer-registry.service';
import { EventRouterService } from './event-router.service';

@Global()
@Module({
    providers: [
        RedisPubSub,
        EventRouterService,
        EventConsumerRegistry
    ],
    exports: [
        RedisPubSub,
        EventRouterService,
        EventConsumerRegistry
    ],
})
export class PubSubModule { }
