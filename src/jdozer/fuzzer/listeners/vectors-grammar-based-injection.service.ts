import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventConsumer } from "../commons/pubsub/event-consumer.interface";
import { EventConsumerRegistry } from "../commons/pubsub/event-consumer-registry.service";
import { KeyManager } from "../commons/storage/key-manager";
import { UUID } from "crypto";
import { RedisService } from "../commons/storage/redis.service";
import { RedisPubSub } from "../commons/pubsub/redis-pub-sub";



@Injectable()
export class VectorGrammarBasedInjectionSub implements EventConsumer, OnModuleInit {

    private readonly logger: Logger = new Logger(VectorGrammarBasedInjectionSub.name);

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
export class VectorGrammarBasedInjection implements OnModuleInit {

    private readonly logger: Logger = new Logger(VectorGrammarBasedInjection.name);
    private readonly keyManager: KeyManager = new KeyManager();

    constructor(
        private readonly redisService: RedisService,
        private readonly redisPubSub: RedisPubSub,
        private readonly sub: VectorGrammarBasedInjectionSub
    ) { }

    onModuleInit() {
        this.sub.handleEvent = async (event: any, channel: string) => {
            if (event.headers.entityType === `fuzzer-engine` && event.headers.eventType === `after-response`) {
                await this.validate(event.payload.fuzzerId, event.payload.operationId, event.payload.caseId);
            }
        }
    }

    public async validate(fuzzerId: UUID, operationId: string, caseId: UUID) {
        try {
            const req = await this.redisService.get(this.keyManager.forRequest(fuzzerId, operationId, caseId));
            if (req.params.payloadId) {
                const dmm = await this.redisService.get(this.keyManager.forDmm(fuzzerId, operationId, 'payload', req.params.payloadId));
                if (dmm.vectorId) {
                    const [vector, resp] = await this.redisService.mget<any>([
                        this.keyManager.forVector(dmm.vectorId),
                        this.keyManager.responseKey(fuzzerId, operationId, caseId)
                    ]);

                    const finding: any = {};
                    if (resp.statusCode >= 200 && resp.statusCode < 300) {
                        finding.finding = "False Negative";
                        finding.insertion = true;
                    } else if (resp.statusCode >= 400 && resp.statusCode < 500) {
                        finding.finding = "True Positive";
                        finding.insertion = false;
                    } else if (resp.statusCode >= 500 && resp.statusCode < 600) {
                        finding.finding = "Server Error";
                        finding.insertion = false;
                    } else {
                        finding.finding = "Unknown";
                        finding.insertion = false;
                    }

                    finding.reflection = this.analyzer(resp, vector);
                    finding.id = resp.uuidReq;
                    finding.statusCode = resp.statusCode;
                    finding.vectorId = vector.id;
                    finding.vectorApplied = vector;

                    await Promise.all([
                        this.redisService.set(this.keyManager.forGrammarVector(fuzzerId, req.operationId, resp.uuidReq), finding),
                        this.redisPubSub.publish("jdozer:fuzzer:vector-grammar", fuzzerId, "injection", "vector-grammar", finding)
                    ]);
                } else {
                    this.logger.verbose(`[validate] Vector not found for key pattern ${this.keyManager.dmmPattern(fuzzerId, req.params.payloadId)}`);
                }
            }
        } catch (e) {
            this.logger.error(`[validate] Error validating vector: ${e.message}`);
            throw new Error(e.message);
        }
    }

    private analyzer(res: any, vector: any): string {
        try {
            const resPayload: string = Buffer.from(res.payload, 'base64').toString('utf-8');
            const vectorRaw: string = Buffer.from(vector.script, 'base64').toString('utf-8');
            return this.analyzeReflectionContext(resPayload, vectorRaw);
        } catch (e) {
            this.logger.error(`[analyzer] Error analyzing vector: ${e.message}`);
            return 'UNKNOWN';
        }
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