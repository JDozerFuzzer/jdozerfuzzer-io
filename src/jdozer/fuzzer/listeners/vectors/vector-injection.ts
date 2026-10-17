import { SeverityLevel } from "../types/severity-levels.types";

type ReflectionTypes = "JAVASCRIPT_INLINE" | "URL_ATTRIBUTE" | "HTML_ATTRIBUTE" | "HTML_COMMENT" | "CSS_INLINE" | "JSON_RESPONSE" | "NONE";
type OutcomeTypes = 'ACCEPTED' | 'REJECTED' | 'SERVER_ERROR' | 'UNKNOWN';
type VerdictTypes = "POTENTIAL_INJECTION" | "REFLECTED_ONLY" | "BLOCKED" | "NO_REFLECTION" | "SERVER_ERROR" | "INCONCLUSIVE";

interface InjectionEvaluation {
    isReflected: boolean;
    reflection: ReflectionTypes;
    outcome: OutcomeTypes;
    verdict: VerdictTypes;
    insertion: true;
    confidence: number;
    severity: SeverityLevel;
}

export class VectorOracle {

    public evaluateInjection(
        payload: string,
        vector: string,
        statusCode: number
    ): InjectionEvaluation {

        const reflection = this.analyzeReflectionContext(payload, vector);

        const outcome = this.classifyOutcome(statusCode);
        const reflected = reflection !== "NONE";
        const verdict = this.deriveVerdict(outcome, reflected);
        const confidence = this.deriveConfidence(outcome, reflected);
        const severity = this.deriveSeverity(verdict, reflection);

        return {
            isReflected: reflected,
            reflection,
            outcome,
            verdict,
            insertion: true,
            confidence,
            severity,
        };
    }

    private classifyOutcome(statusCode: number): OutcomeTypes {
        if (statusCode >= 200 && statusCode < 300) return "ACCEPTED";
        if (statusCode >= 400 && statusCode < 500) return "REJECTED";
        if (statusCode >= 500 && statusCode < 600) return "SERVER_ERROR";
        return "UNKNOWN";
    }

    private deriveVerdict(outcome: OutcomeTypes, reflected: boolean): VerdictTypes {
        if (outcome === "SERVER_ERROR") return "SERVER_ERROR";

        if (outcome === "ACCEPTED" && reflected) return "POTENTIAL_INJECTION";
        if (outcome === "ACCEPTED" && !reflected) return "NO_REFLECTION";
        if (outcome === "REJECTED" && reflected) return "REFLECTED_ONLY";
        if (outcome === "REJECTED" && !reflected) return "BLOCKED";

        return "INCONCLUSIVE";
    }

    private deriveConfidence(outcome: OutcomeTypes, reflected: boolean): number {
        if (outcome === "SERVER_ERROR") return 0.0;
        if (outcome === "UNKNOWN") return 0.0;

        if (outcome === "ACCEPTED" && reflected) return 0.7;
        if (outcome === "ACCEPTED" && !reflected) return 0.1;
        if (outcome === "REJECTED" && reflected) return 0.4;
        if (outcome === "REJECTED" && !reflected) return 0.05;

        return 0.0;
    }

    private deriveSeverity(verdict: VerdictTypes, reflection: ReflectionTypes): SeverityLevel {

        const highRiskReflection = ["CSS_INLINE", "HTML_BODY", "HTML_ATTRIBUTE"];
        const isHighRisk = highRiskReflection.includes(reflection);

        switch (verdict) {
            case "POTENTIAL_INJECTION":
                return isHighRisk
                    ? { name: "critical", value: 4 }
                    : { name: "high", value: 3 };
            case "REFLECTED_ONLY":
                return { name: "medium", value: 2 };
            case "NO_REFLECTION":
                return { name: "low", value: 1 };
            case "BLOCKED":
                return { name: "info", value: 0 };
            case "SERVER_ERROR":
                return { name: "medium", value: 2 };
            case "INCONCLUSIVE":
            default:
                return { name: "info", value: 0 };
        }
    }

    public analyzeReflectionContext(responseBody: string, vector: string): ReflectionTypes {
        const index = responseBody.indexOf(vector);
        const contextWindow = responseBody.substring(Math.max(0, index - 200), index + 200);

        if (/<script[^>]*>[\s\S]*$/.test(contextWindow)) return 'JAVASCRIPT_INLINE';
        if (/\b(href|src|action|data|formaction)\s*=\s*["'][^"']*$/.test(contextWindow)) return 'URL_ATTRIBUTE';
        if (/<[^>]+\s+\w+\s*=\s*["'][^"']*$/.test(contextWindow)) return 'HTML_ATTRIBUTE';
        if (/<!--[\s\S]*$/.test(contextWindow)) return 'HTML_COMMENT';
        if (/<style[^>]*>[\s\S]*$/.test(contextWindow)) return 'CSS_INLINE';
        if (/"[^"]*$/.test(contextWindow) && responseBody.includes('application/json')) return 'JSON_RESPONSE';

        return 'NONE';
    }

    public detectSanitization(originalVector: string, reflected: string) {
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