import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventConsumer } from "../commons/pubsub/event-consumer.interface";
import { EventConsumerRegistry } from "../commons/pubsub/event-consumer-registry.service";
import { KeyManager } from "../commons/storage/key-manager";
import { UUID } from "crypto";
import { RedisService } from "../commons/storage/redis.service";
import { RedisPubSub } from "../commons/pubsub/redis-pub-sub";



@Injectable()
export class VectorInsertionSub implements EventConsumer, OnModuleInit {

    private readonly logger: Logger = new Logger(VectorInsertionSub.name);

    readonly channels = ["jdozer:fuzzer:engine"];
    readonly entityType = "fuzzer-engine";
    readonly eventType = "after-response";

    constructor(
        private readonly registry: EventConsumerRegistry
    ) { }

    onModuleInit() {
        this.registry.register(this);
        this.logger.log("VectorInsertionSub registered");
    }

    async handleEvent(event: any, channel: string): Promise<void> {
        this.logger.warn(`Method not implemented: ${channel} | ${this.entityType} | ${this.eventType} `);
    }

}

@Injectable()
export class VectorInsertion implements OnModuleInit {

    private readonly logger: Logger = new Logger(VectorInsertion.name);
    private readonly keyManager: KeyManager = new KeyManager();

    constructor(
        private readonly redisService: RedisService,
        private readonly redisPubSub: RedisPubSub,
        private readonly sub: VectorInsertionSub
    ) { }

    onModuleInit() {
        this.sub.handleEvent = async (event: any, channel: string) => {
            if (event.headers.entityType === `fuzzer-engine` && event.headers.eventType === `after-response`) {
                await this.validate(event.payload.fuzzerId, event.payload.caseId);
            }
        }
    }

    public async validate(fuzzerId: UUID, responseId: UUID) {
        try {
            this.logger.verbose(`[validate] Vector insertion validation...`);
            const keys: string[] = await this.redisService.getKeys(this.keyManager.requestIdPattern(fuzzerId, responseId));
            if (keys.length === 1) {
                const req = await this.redisService.get(keys[0]);
                if (req.params.payloadId) {
                    const dmmKeys: string[] = await this.redisService.getKeys(this.keyManager.dmmPattern(fuzzerId, req.params.payloadId));
                    if (dmmKeys.length === 1) {
                        const dmm = await this.redisService.get(dmmKeys[0]);
                        if (dmm.vectorId) {
                            const vector = await this.redisService.get(this.keyManager.forVector(dmm.vectorId));
                            const respKeys: string[] = await this.redisService.getKeys(this.keyManager.responseIdPattern(fuzzerId, responseId));
                            const resp = await this.redisService.get(respKeys[0]);
                            if (resp.statusCode >= 200 && resp.statusCode < 300) {
                                await this.redisService.set(this.keyManager.forResponseVector(fuzzerId, req.operationId, resp.uuidReq), {
                                    id: resp.uuidReq,
                                    statusCode: resp.statusCode,
                                    vectorId: vector.id,
                                    vectorApplied: vector,
                                    insertion: true
                                });
                                await this.redisPubSub.publish("jdozer:fuzzer:listeners", fuzzerId, "success", "vector-insertion", resp.uuidReq);
                            }
                        } else {
                            this.logger.verbose(`[validate] Vector not found for key pattern ${this.keyManager.dmmPattern(fuzzerId, req.params.payloadId)}`);
                        }
                    } else {
                        this.logger.warn(`[validate] DMM not found for key pattern ${this.keyManager.dmmPattern(fuzzerId, req.params.payloadId)}`);
                    }
                }
            } else {
                this.logger.warn(`[validate] Request not found for key pattern ${this.keyManager.requestIdPattern(fuzzerId, responseId)}`);
            }
        } catch (e) { }
    }

    private analyzer(req: any, res: any, dmm: any, vector: any) {
        try {
            const resPayload: string = Buffer.from(res.payload, 'base64').toString('utf-8');
            const vectorRaw: string = Buffer.from(vector.script, 'base64').toString('utf-8');
            const reflectionContext: string = this.analyzeReflectionContext(resPayload, vectorRaw);
            this.logger.verbose(`[analyzer] Reflection context: ${reflectionContext}`);

        } catch (e) { }
    }

    private analyzeReflectionContext(responseBody: string, vector: string): string {
        const index = responseBody.indexOf(vector);
        const contextWindow = responseBody.substring(Math.max(0, index - 200), index + 200);

        if (/<script[^>]*>[\s\S]*$/.test(contextWindow)) return 'JAVASCRIPT_INLINE';
        if (/\b(href|src|action|data|formaction)\s*=\s*["'][^"']*$/.test(contextWindow)) return 'URL_ATTRIBUTE';
        if (/<[^>]+\s+\w+\s*=\s*["'][^"']*$/.test(contextWindow)) return 'HTML_ATTRIBUTE';
        if (/<!--[\s\S]*$/.test(contextWindow)) return 'HTML_COMMENT';
        if (/<style[^>]*>[\s\S]*$/.test(contextWindow)) return 'CSS_INLINE';
        if (/"[^"]*$/.test(contextWindow) && responseBody.includes('application/json')) return 'JSON_RESPONSE';

        return 'HTML_BODY';
    }

    private detectSanitization(originalVector: string, reflected: string) {
        const result: string[] = [];

        if (reflected.includes('&lt;') || reflected.includes('&gt;'))
            result.push('HTML_ENTITY');
        if (reflected.includes('%3C') || reflected.includes('%3E'))
            result.push('URL_ENCODING');
        if (originalVector.length > reflected.length && reflected.length > 0)
            result.push('TRUNCATED');
        if (originalVector.replace(/[<>]/g, '') === reflected)
            result.push('CHARACTER_REMOVAL');

        return result;
    }

    private detectWaf(response: any, responseTime: number, baselineResponseTime: number): WafDetectionResult {

        const result: WafDetectionResult = {
            probableWaf: false,
            indicators: [],
            wafSignatures: []
        };

        const wafPatterns = {
            'Cloudflare': [/cloudflare/i, /cf-ray/i],
            'AWS WAF': [/aws.*waf/i, /x-amzn-requestid/i],
            'ModSecurity': [/mod_security/i, /not acceptable/i],
            'Akamai': [/akamai/i, /x-akamai-/i],
            'Imperva': [/imperva/i, /incapsula/i, /x-iinfo/i]
        };

        if (response.statusCode === 403) result.indicators.push('HTTP_403');
        if (response.statusCode === 406) result.indicators.push('HTTP_406');

        const body = response.body?.toLowerCase() || '';
        if (/blocked|forbidden|access denied/i.test(body))
            result.indicators.push('BLOCK_MESSAGE');

        for (const [waf, patterns] of Object.entries(wafPatterns)) {
            if (patterns.some(p => p.test(body))) {
                result.wafSignatures.push(waf);
                result.probableWaf = true;
            }
        }

        if (responseTime > baselineResponseTime * 4)
            result.indicators.push('LATENCY_ANOMALY');

        return result;
    }

}

export interface WafDetectionResult {
    probableWaf: boolean;
    indicators: string[];
    wafSignatures: string[];
}