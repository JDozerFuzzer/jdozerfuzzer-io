import { Module } from '@nestjs/common';
import { EnginePhases } from './engine-phases';
import { EngineScenarios } from './engine-scenarios';
import { JDozerFuzzerEngineCfg } from './jdozer-fuzzer-engine-cfg';
import { EngineSubscriber } from './jdozer-fuzzer-engine-sub';
import { JDozerFuzzerEngineIgnition } from './jdozer-fuzzer-engine-ignition';
import { EngineService } from './jdozer-fuzzer-engine.service';

@Module({
    providers: [EnginePhases, EngineScenarios, JDozerFuzzerEngineCfg, EngineService, EngineSubscriber, JDozerFuzzerEngineIgnition],
    exports: [EnginePhases, EngineScenarios, JDozerFuzzerEngineCfg, JDozerFuzzerEngineIgnition],
})
export class EngineModule { }

