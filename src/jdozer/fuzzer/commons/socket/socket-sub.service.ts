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

    async handleEvent(data: any, channel: string): Promise<void> {
        this.logger.verbose(`[handleEvent] Event received: ${channel} | ${data.headers.entityType} | ${data.headers.eventType}`);
        if (!this.filter(data.headers.entityType, data.headers.eventType)) {
            return;
        }
        this.eventEmitter.emit(`jdozer:fuzzer`, data);
    }

    private readonly eventKeys = [
        `fuzzer:created`,
        `operations:created`,
        `test-cases:generated`,
        `engine:configurated`,
        `engine:started`,
        `configuration:attack-surface`
    ];

    private filter(entityType: string, eventType: string): boolean {
        try {
            const key: string = `${entityType}:${eventType}`;
            for (const eventKey of this.eventKeys) {
                if (eventKey.includes('*')) {
                    const escaped = eventKey
                        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
                        .replace(/\*/g, '.*');
                    const regex = new RegExp(`^${escaped}$`);
                    if (regex.test(key)) {
                        return true;
                    }
                } else if (eventKey === key) {
                    return true;
                }
            }
            return false;
        } catch (e) {
            this.logger.error(`[filter] Error filtering event: ${e.message}`);
            return false;
        }
    }

}

