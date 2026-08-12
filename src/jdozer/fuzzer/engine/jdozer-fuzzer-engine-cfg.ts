import { Injectable, Logger } from '@nestjs/common';
import * as YAML from 'yaml';
import { RedisService } from '../commons/storage/redis.service';
import { KeyManager } from '../commons/storage/key-manager';
import { EngineException } from './engine-exception';
import { UUID } from 'crypto';

@Injectable()
export class JDozerFuzzerEngineCfg {

    private readonly log = new Logger(JDozerFuzzerEngineCfg.name);
    private readonly keyManager: KeyManager = new KeyManager();

    constructor(private readonly redis: RedisService) {
        this.log.verbose('[JDozerFuzzerEngineCfg] Initializing Engine Config builder...');
    }

    public async build(fuzzerId: UUID): Promise<string> {

        const fuzzer: any = await this.redis.get(this.keyManager.forFuzz(fuzzerId));
        const engineCfg = this.buildBaseCfg();

        engineCfg.config.variables.testId = fuzzer.id;
        engineCfg.config.plugins[`publish-metrics`][0].tags.push(`jdozer:${fuzzer.name}`);
        engineCfg.config.target = this.getServerUrl(fuzzer);

        for (const id of fuzzer.operationIds) {
            const op: any = await this.redis.get(this.keyManager.forOperation(id, fuzzer.id));
            const scenario = this.getScenarios(op);
            scenario.flow.push(this.getFlows(op));
            engineCfg.scenarios.push(scenario);
        }

        await this.redis.set(this.keyManager.forEngine(fuzzer.id), engineCfg);
        return YAML.stringify(engineCfg);
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
