import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EngineSubscriber } from "./jdozer-fuzzer-engine-sub";
import { RedisPubSub } from "../commons/pubsub/redis-pub-sub";
import { JDozerFuzzerEngineIgnition } from "./jdozer-fuzzer-engine-ignition";
import { JDozerFuzzerEngineBaseCfg } from "./jdozer-fuzzer-engine-base-cfg";
import { omap } from "node_modules/yaml/dist/schema/yaml-1.1/omap";
import { UUID } from "crypto";


@Injectable()
export class EngineService implements OnModuleInit {

    private readonly logger = new Logger(EngineService.name);

    constructor(
        private readonly engineCfg: JDozerFuzzerEngineBaseCfg,
        private readonly engineIgnition: JDozerFuzzerEngineIgnition,
        private readonly engineSubscriber: EngineSubscriber
    ) { }

    onModuleInit() {
        this.engineSubscriber.handleEvent = async (event: any, channel: string): Promise<void> => {
            const key = this.engineSubscriber.entityType + ':' + this.engineSubscriber.eventType;
            const inboundKey = event.headers.entityType + ':' + event.headers.eventType;
            if (inboundKey === key) {
                await this.startFuzzing(event.payload.id as UUID);
            }
        }
    }

    async startFuzzing(fuzzerId: UUID): Promise<void> {
        this.logger.log(`[startFuzzing] Starting fuzzing for fuzzerId: ${fuzzerId}`);
        await this.engineCfg.build(fuzzerId);
        await this.engineIgnition.start(fuzzerId);
    }


}
