import { InjectRedis } from "@nestjs-modules/ioredis";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import Redis from "ioredis";
import { EventConsumer } from "../pubsub/event-consumer.interface";
import { EventConsumerRegistry } from "../pubsub/event-consumer-registry.service";



@Injectable()
export class SocketSubscriber implements EventConsumer, OnModuleInit {

    private readonly logger: Logger = new Logger(SocketSubscriber.name);

    readonly channels = ["jdozer:fuzzer:*"];
    readonly entityType = "*";
    readonly eventType = "*";

    constructor(
        private readonly registry: EventConsumerRegistry,
        private readonly eventEmitter: EventEmitter2
    ) { }

    onModuleInit() {
        this.registry.register(this);
        this.logger.log(`${SocketSubscriber.name} registered`);
    }

    handleEvent(data: any, channel: string): Promise<void> | void {
        this.eventEmitter.emit(`jdozer:fuzzer`, data);
        return;
    }


}