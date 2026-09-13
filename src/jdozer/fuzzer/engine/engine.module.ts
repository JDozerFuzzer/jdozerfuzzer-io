import { Module } from '@nestjs/common';
import { EnginePhases } from './engine-phases';
import { EngineScenarios } from './engine-scenarios';
import { JDozerFuzzerEngineBaseCfg } from './jdozer-fuzzer-engine-base-cfg';
import { EngineSubscriber } from './jdozer-fuzzer-engine-sub';
import { JDozerFuzzerEngineIgnition } from './jdozer-fuzzer-engine-ignition';
import { EngineService } from './jdozer-fuzzer-engine.service';

@Module({
    providers: [EnginePhases, EngineScenarios, JDozerFuzzerEngineBaseCfg, EngineService, EngineSubscriber, JDozerFuzzerEngineIgnition],
    exports: [EnginePhases, EngineScenarios, JDozerFuzzerEngineBaseCfg, JDozerFuzzerEngineIgnition],
})
export class EngineModule { }

