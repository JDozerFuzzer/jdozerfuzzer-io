import { Injectable, Logger } from '@nestjs/common';
import * as YAML from 'yaml';
import { RedisService } from '../commons/storage/redis.service';
import { KeyManager } from '../commons/storage/key-manager';
import { EngineException } from './engine-exception';
import { UUID } from 'crypto';
import { RedisPubSub } from '../commons/pubsub/redis-pub-sub';
import { Fuzzer } from '../commons/schemas/fuzzer.dto';
import { FuzzerOperation } from '../commons/schemas/fuzzer-operation.dto';
import { EngineScenarios } from './engine-scenarios';
import { EnginePhases } from './engine-phases';

@Injectable()
export class JDozerFuzzerEngineBaseCfg {

    private readonly log = new Logger(JDozerFuzzerEngineBaseCfg.name);
    private readonly keyManager: KeyManager = new KeyManager();

    constructor(
        private readonly redis: RedisService,
        private readonly pubsub: RedisPubSub
    ) {
        this.log.verbose('[JDozerFuzzerEngineCfg] Initializing Engine Config builder...');
    }

    public async build(fuzzerId: UUID, timeLength: number = 1): Promise<any> {

        const fuzzer: Fuzzer = await this.redis.get(this.keyManager.forFuzz(fuzzerId));
        const engineCfg = this.buildBaseCfg();

        engineCfg.config.variables.testId = fuzzer.id;
        //engineCfg.config.plugins[`publish-metrics`][0].tags.push(`jdozer:${fuzzer.name}`);
        engineCfg.config.target = this.getServerUrl(fuzzer);

        const opKeys: string[] = fuzzer.operationIds.map(op => this.keyManager.forOperation(op, fuzzer.id));
        const operations: FuzzerOperation[] = await this.redis.mget(opKeys);
        const testCasesKeys: string[] = await this.redis.scan(this.keyManager.dmmAllPattern(fuzzer.id));

        const scenarios: EngineScenarios = new EngineScenarios();
        engineCfg.scenarios = scenarios.build(operations, testCasesKeys);
        const phases: EnginePhases = new EnginePhases();
        engineCfg.config.phases = phases.build(engineCfg.scenarios, testCasesKeys.length, operations.length, timeLength);

        engineCfg.config.ensure = ['onError'];
        engineCfg.config.processor = this.targetRunner();
        engineCfg.config.plugins = this.targetPlugins(fuzzer);
        engineCfg.before = this.getBeforeFunctions();

        await Promise.all([
            this.redis.set(this.keyManager.forEngine(fuzzer.id), engineCfg),
            this.pubsub.publish(`jdozer:fuzzer:engine`, fuzzer.id, 'configurated', 'engine', this.buildEventPayload(engineCfg, testCasesKeys.length, fuzzer.id))
        ]).catch((error) => {
            this.log.error(`Error publishing the engine configuration event ${fuzzer.name}`, error);
            throw new EngineException({
                message: `Error publishing the engine configuration event`,
                details: error.message
            });
        });

        return engineCfg;
    }

    private buildEventPayload(config: any, cases: number, fuzzerId: UUID): any {
        const payload: any = {
            fuzzerId,
            phases: {},
            scenarios: {},
            totalCases: cases
        };

        for (const phase of config.config.phases) {
            payload.phases[phase.name] = {
                duration: phase.duration,
                arrivalRate: phase.arrivalRate,
                maxUsers: phase.maxVusers,
                rampTo: phase.rampTo
            };
        }

        for (const scenario of config.scenarios) {
            payload.scenarios[scenario.name] = {
                weight: scenario.weight
            };
        }

        return payload;
    }

    private getBeforeFunctions(): any {
        return { flow: [{ function: 'before' }] };
    }

    private targetPlugins(fuzzer: any): any {
        const plugins: any = {};
        plugins['publish-metrics'] = [];
        // plugins['publish-metrics'].push(this.getPrometheusMetrics(fuzzer.name, fuzzer.version));
        return plugins;
    }

    private getPrometheusMetrics(fuzzName: string, fuzzVersion: string): any {
        return {
            type: 'prometheus',
            prefix: 'jdozzerfuzzer',
            pushgateway: `http://${process.env.FUZZER_PUSHGATEWAY_HOST}:${process.env.FUZZER_PUSHGATEWAY_PORT}`,
            tags: [`JDozerFuzzer:${fuzzName.concat('_').concat(fuzzVersion).replaceAll(' ', '_')}`]
        };
    }

    private targetRunner(): string {
        return `${process.cwd()}/src/jdozer/fuzzer/engine/runner/JDozerFuzzerEngineRunner.cjs`;
    }

    private getServerUrl(fuzzer: any): string {
        const server = (fuzzer.servers as any[]).filter(s => s.description === 'FUZZING');
        if (server.length === 0) {
            throw new EngineException({
                message: `The fuzzer ${fuzzer.name} has no server with description 'FUZZING'`,
                details: 'No environment selected'
            });
        }

        try {
            const serverUrl: URL = new URL(server[0].url);
            return serverUrl.toString().slice(0, -1);
        } catch (e) {
            throw new EngineException({
                message: `The fuzzer ${fuzzer.name} has an invalid server URL: ${server[0].url}`,
                details: e.message
            });
        }
    }

    private getScenarios(operation: any): { name: string; flow: any[] } {
        return {
            name: `${operation.name}`,
            flow: []
        };
    }

    private getFlows(operation: any): object {
        return {
            [`${operation.method}`]: {
                beforeRequest: `beforeRequest`,
                url: `${operation.path}`,
                afterResponse: `afterResponse`
            }
        };
    }

    private buildBaseCfg(): any {
        return {
            config: {
                plugins: {
                    'publish-metrics': [{
                        type: `prometheus`,
                        pushgateway: `http://localhost:9091`,
                        tags: [`jdozer:testName`, `version:1.0`]
                    }]
                },
                target: `url`,
                processor: `./JDozerFuzzerArtillery.js`,
                phases: [
                    { duration: '1', arrivalRate: 3, maxVusers: 6, name: `phase-1` },
                    { duration: '1', arrivalRate: 5, maxVusers: 10, name: `phase-2` }
                ],
                defaults: {
                    headers: { 'Content-Type': `application/json` }
                },
                variables: { testId: `` }
            },
            scenarios: [],
            after: {
                flow: [{ function: `attackCompleted` }]
            }
        };
    }

}
