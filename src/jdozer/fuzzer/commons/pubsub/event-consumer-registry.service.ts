import { Injectable } from '@nestjs/common';
import { EventConsumer } from './event-consumer.interface';

@Injectable()
export class EventConsumerRegistry {
    private consumers: EventConsumer[] = [];

    register(consumer: EventConsumer): void {
        this.consumers.push(consumer);
    }

    findAll(): EventConsumer[] {
        return this.consumers;
    }
}