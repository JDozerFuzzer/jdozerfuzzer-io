import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventConsumer } from "../commons/pubsub/event-consumer.interface";
import { EventConsumerRegistry } from "../commons/pubsub/event-consumer-registry.service";
import { JDozerFuzzerEngineIgnition } from "./jdozer-fuzzer-engine-ignition";
import { UUID } from "crypto";

@Injectable()
export class EngineSubscriber implements EventConsumer, OnModuleInit {

    private readonly logger = new Logger(EngineSubscriber.name);

    readonly channels = ["jdozer:fuzzer:vector"];
    readonly entityType = "fuzzer-vectors";
    readonly eventType = "builder-successful";

    constructor(
        private readonly registry: EventConsumerRegistry
    ) { }

    onModuleInit() {
        this.registry.register(this);
        this.logger.log("EngineSubscriber registered");
    }

    async handleEvent(event: any, channel: string): Promise<void> {
        this.logger.error("EngineSubscriber event not implemented");
    }
}