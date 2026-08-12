import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EngineSubscriber } from "./jdozer-fuzzer-engine-sub";
import { RedisPubSub } from "../commons/pubsub/redis-pub-sub";
import { JDozerFuzzerEngineIgnition } from "./jdozer-fuzzer-engine-ignition";
import { JDozerFuzzerEngineCfg } from "./jdozer-fuzzer-engine-cfg";
import { omap } from "node_modules/yaml/dist/schema/yaml-1.1/omap";
import { UUID } from "crypto";


@Injectable()
export class EngineService implements OnModuleInit {

    private readonly logger = new Logger(EngineService.name);

    constructor(
        private readonly engineCfg: JDozerFuzzerEngineCfg,
        private readonly engineIgnition: JDozerFuzzerEngineIgnition,
        private readonly engineSubscriber: EngineSubscriber
    ) { }

    onModuleInit() {
        this.engineSubscriber.handleEvent = async (event: any, channel: string): Promise<void> => {
            if (event.headers.entityType === 'fuzzer-vectors' && event.headers.eventType === 'builder-successful') {
                await this.startFuzzing(event.payload.fuzzerId as UUID);
            }
        }
    }

    async startFuzzing(fuzzerId: UUID): Promise<void> {
        this.logger.log(`Starting fuzzing for fuzzerId: ${fuzzerId}`);
        await this.engineCfg.build(fuzzerId);
        await this.engineIgnition.start(fuzzerId);
        this.logger.debug('Fuzzing started successfully...');
    }


}
