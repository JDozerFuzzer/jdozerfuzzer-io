import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { UUID } from 'crypto';
import * as YAML from 'yaml';
import * as fs from 'fs';

import { RedisService } from '../commons/storage/redis.service';
import { RedisPubSub } from '../commons/pubsub/redis-pub-sub';
import { KeyManager } from '../commons/storage/key-manager';
import { EngineScenarios } from './engine-scenarios';
import { EnginePhases } from './engine-phases';
import { EngineException } from './engine-exception';

@Injectable()
export class JDozerFuzzerEngineIgnition {

    private readonly log = new Logger(JDozerFuzzerEngineIgnition.name);
    private readonly keyManger: KeyManager = new KeyManager();

    private fuzzer: any;

    private readonly _MSG_NOTFOUND: string = 'Fuzzer not found or not owned by the current user!';

    constructor(
        private readonly redisService: RedisService,
        private readonly engineScenarios: EngineScenarios,
        private readonly enginePhases: EnginePhases,
        private readonly redisPubSub: RedisPubSub
    ) { }

    async start(fuzzerId: UUID, timeLength: number = 1): Promise<void> {
        try {
            this.fuzzer = await this.redisService.get(this.keyManger.forFuzz(fuzzerId as UUID));
            if (!this.fuzzer) {
                throw new EngineException({ message: this._MSG_NOTFOUND, details: `fuzzerId: ${fuzzerId}` });
            }

            const operations: any[] = await this.getOperations(fuzzerId);
            const cases: string[] = await this.getCasesKeys(fuzzerId);

            let engCfg = await this.redisService.get(this.keyManger.forEngine(fuzzerId as string));

            engCfg.scenarios = await this.engineScenarios.build(operations, cases);
            engCfg.config.phases = this.enginePhases.build(engCfg.scenarios, cases.length, operations.length, timeLength);

            engCfg.config.ensure = ['onError'];
            engCfg.config.processor = this.targetRunner();
            engCfg.config.plugins = this.targetPlugins(this.fuzzer);
            engCfg.before = { flow: [{ function: 'before' }] };

            this.redisService.set(this.keyManger.forEngine(fuzzerId as string), engCfg);

            const engCfgYml = YAML.stringify(engCfg);
            this.exec(engCfgYml, fuzzerId as string);

            await this.engineStartedEvent(engCfg, cases.length, fuzzerId);

            this.log.log('Fuzzer Engine started!');

        } catch (e) {
            throw new EngineException({
                message: `Oops! Fuzzer Engine failed to start!, fuzzerId: ${fuzzerId}`,
                details: `${e.message}`
            });
        }
    }

    private targetRunner(): string {
        return `${process.cwd()}/src/jdozer/fuzzer/engine/runner/JDozerFuzzerEngineRunner.cjs`;
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

    private async exec(cfg: string, prefix: string, options: string[] = []): Promise<void> {
        const fileName = `${prefix}-engine-cfg.yml`;
        const summaryFile = `${prefix}-summary.json`;
        const pathFile = `/tmp/${fileName}`;
        fs.writeFileSync(pathFile, cfg);

        return new Promise((resolve, reject) => {
            const workingDirectory = __dirname;

            const engineProcess = spawn(
                'artillery',
                ['run', '--quiet', '--output', `/tmp/${summaryFile}`, ...options, pathFile],
                {
                    detached: true,
                    cwd: workingDirectory,
                    stdio: ['pipe', 'inherit', 'inherit']
                }
            );

            engineProcess.on('close', async (code) => {
                if (code !== 0) {
                    reject(new Error(`Engine process exited with code ${code}`));
                } else {
                    const summary: any = fs.readFileSync(`/tmp/${summaryFile}`, 'utf-8');
                    await this.redisService.set(this.keyManger.forEngine(this.fuzzer.id).concat(`:SUM`), JSON.parse(summary));
                    await this.engineStoppedEvent(this.fuzzer.id);
                    this.log.log(`Engine process with id ${engineProcess.pid} exited successfully!`);
                    resolve();
                }
            });

            engineProcess.on('error', (err) => {
                this.log.error(`Engine process encountered an error: ${err}`);
                reject(err);
            });

            this.log.log(`Engine process started with id ${engineProcess.pid}`);
            engineProcess.unref();
        });
    }

    private async getOperations(fuzzerId: UUID): Promise<any[]> {
        try {
            const fuzzer = await this.redisService.get(this.keyManger.forFuzz(fuzzerId));
            if (!fuzzer || !fuzzer.operationIds) return [];
            const operations: any[] = [];
            for (const opId of fuzzer.operationIds) {
                const op = await this.redisService.get(this.keyManger.forOperation(opId, fuzzerId));
                if (op) operations.push(op);
            }
            return operations;
        } catch (e) {
            throw new EngineException({ message: 'Oops! Failed to get Operations!', details: e.message });
        }
    }

    private async getCasesKeys(fuzzerId: UUID): Promise<string[]> {
        try {
            const client = (this.redisService as any).client;
            const pattern = this.keyManger.forFake(fuzzerId as string, '*', '*', '*');
            return await client.keys(pattern);
        } catch (e) {
            throw new EngineException({ message: 'Oops! Failed to get Cases Keys!', details: e.message });
        }
    }

    private async engineStartedEvent(config: any, cases: number, fuzzerId: UUID): Promise<void> {
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

        await this.redisPubSub.publish('jdozer:fuzzer:engine', fuzzerId, 'engine-started', 'fuzzer-engine', payload);
    }

    private async engineStoppedEvent(fuzzerId: UUID): Promise<void> {
        await this.redisPubSub.publish('jdozer:fuzzer:engine', fuzzerId, 'engine-stopped', 'fuzzer-engine', { fuzzerId });
    }

}
