import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventConsumer } from "../commons/pubsub/event-consumer.interface";
import { EventConsumerRegistry } from "../commons/pubsub/event-consumer-registry.service";


@Injectable()
export class VectorsSubscriber implements EventConsumer, OnModuleInit {

    private readonly logger = new Logger(VectorsSubscriber.name);

    readonly channels = ["jdozer:fuzzer:seeder"];
    readonly entityType = "fuzzer-seeder";
    readonly eventType = "builder-successful";

    constructor(
        private readonly registry: EventConsumerRegistry
    ) { }

    onModuleInit() {
        this.registry.register(this);
        this.logger.log("VectorsSubscriber registered");
    }

    async handleEvent(event: any, channel: string): Promise<void> {
        this.logger.warn(`Method not implemented: ${channel} | ${this.entityType} | ${this.eventType} `);
    }
}
