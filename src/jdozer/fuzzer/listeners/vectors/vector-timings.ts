import { Logger } from '@nestjs/common';
import { EngineSummary, ComparisonsSeverity, RequestTimeComparison, ResponseData } from './vectors-types';

export class VectorsTimings {

    private readonly logger: Logger = new Logger(VectorsTimings.name);
    private report: EngineSummary;

    constructor(report: EngineSummary) {
        this.report = report;
    }

    compareRequestTime(response: ResponseData, operationPath: string): RequestTimeComparison {

        const requestTime = response.timings.phases.total || (response.time - response.timings.start);
        const scenarioStats = this.getScenarioStats(response.operationId, operationPath);
        const globalStats = this.getGlobalStats();

        const comparisons = this.calculateComparisons(
            requestTime,
            scenarioStats,
            globalStats
        );

        const riskAnalysis = this.analyzeRisk(
            requestTime,
            scenarioStats,
            globalStats,
            response.payload
        );

        return {
            request: {
                operationId: response.operationId,
                uuidReq: response.uuidReq,
                statusCode: response.statusCode,
                url: response.url,
                totalTime: requestTime,
                timings: response.timings
            },
            scenarioStats,
            globalStats,
            comparisons,
            riskAnalysis
        };
    }

    private getScenarioStats(operationId: string, path: string): RequestTimeComparison['scenarioStats'] {

        if (!path) return null;

        const metricKey = `plugins.metrics-by-endpoint.response_time.${path}`;
        const summary = this.report.aggregate.summaries[metricKey];

        if (!summary) return null;
        const statusCodes: { [code: string]: number } = {};
        Object.entries(this.report.aggregate.counters).forEach(([key, value]) => {
            if (key.includes(`.${path}.codes.`)) {
                const code = key.split('.').pop() || '';
                statusCodes[code] = value;
            }
        });

        return {
            operationId,
            totalRequests: summary.count,
            meanTime: summary.mean,
            medianTime: summary.median || summary.p50,
            p90Time: summary.p90,
            p95Time: summary.p95,
            minTime: summary.min,
            maxTime: summary.max,
            statusCodes,
            endpointPath: path
        };
    }

    private getGlobalStats(): RequestTimeComparison['globalStats'] {
        const summary = this.report.aggregate.summaries['http.response_time'];
        const totalRequests = this.report.aggregate.counters['http.requests'] || 0;
        const successRequests = this.report.aggregate.counters['http.codes.2xx'] || 0;
        const successRate = totalRequests > 0 ? (successRequests / totalRequests) * 100 : 0;

        return {
            totalRequests,
            meanTime: summary?.mean || 0,
            medianTime: summary?.median || summary?.p50 || 0,
            p90Time: summary?.p90 || 0,
            p95Time: summary?.p95 || 0,
            minTime: summary?.min || 0,
            maxTime: summary?.max || 0,
            successRate
        };
    }

    private calculateComparisons(
        requestTime: number,
        scenarioStats: RequestTimeComparison['scenarioStats'],
        globalStats: RequestTimeComparison['globalStats']
    ): RequestTimeComparison['comparisons'] {
        const calculateSeverity = (percentageDiff: number): ComparisonsSeverity => {
            if (percentageDiff < 10) return 'normal';
            if (percentageDiff < 50) return 'moderate';
            if (percentageDiff < 100) return 'significant';
            return 'critical';
        };

        let vsScenarioMean = {
            difference: 0,
            percentageDifference: 0,
            isSlower: false,
            severity: 'normal' as ComparisonsSeverity
        };

        if (scenarioStats && scenarioStats.meanTime > 0) {
            const diff = requestTime - scenarioStats.meanTime;
            const pctDiff = (diff / scenarioStats.meanTime) * 100;
            vsScenarioMean = {
                difference: diff,
                percentageDifference: pctDiff,
                isSlower: diff > 0,
                severity: calculateSeverity(Math.abs(pctDiff))
            };
        }

        let vsGlobalMean = {
            difference: 0,
            percentageDifference: 0,
            isSlower: false,
            severity: 'normal' as ComparisonsSeverity
        };

        if (globalStats.meanTime > 0) {
            const diff = requestTime - globalStats.meanTime;
            const pctDiff = (diff / globalStats.meanTime) * 100;
            vsGlobalMean = {
                difference: diff,
                percentageDifference: pctDiff,
                isSlower: diff > 0,
                severity: calculateSeverity(Math.abs(pctDiff))
            };
        }

        let vsScenarioP95 = {
            difference: 0,
            percentageDifference: 0,
            isSlower: false,
            severity: 'normal' as ComparisonsSeverity
        };

        if (scenarioStats && scenarioStats.p95Time > 0) {
            const diff = requestTime - scenarioStats.p95Time;
            const pctDiff = (diff / scenarioStats.p95Time) * 100;
            vsScenarioP95 = {
                difference: diff,
                percentageDifference: pctDiff,
                isSlower: diff > 0,
                severity: calculateSeverity(Math.abs(pctDiff))
            };
        }

        return {
            vsScenarioMean,
            vsGlobalMean,
            vsScenarioP95
        };
    }

    private analyzeRisk(
        requestTime: number,
        scenarioStats: RequestTimeComparison['scenarioStats'],
        globalStats: RequestTimeComparison['globalStats'],
        payload: string
    ): RequestTimeComparison['riskAnalysis'] {
        const isXSSPayload = this.detectXSS(payload);

        let timeImpact: 'low' | 'medium' | 'high' | 'critical' = 'low';
        let recommendation = 'The response time is normal.';

        if (scenarioStats) {
            const pctDiff = ((requestTime - scenarioStats.meanTime) / scenarioStats.meanTime) * 100;

            if (pctDiff > 200) {
                timeImpact = 'critical';
                recommendation = 'CRITICAL: Response time is >200% slower than the scenario average. Possible XSS or injection vulnerability.';
            } else if (pctDiff > 100) {
                timeImpact = 'high';
                recommendation = 'HIGH: Response time is >100% slower than the scenario average. Suspicious for XSS injection.';
            } else if (pctDiff > 50) {
                timeImpact = 'medium';
                recommendation = 'MEDIUM: Response time is >50% slower than the average. Worth investigating.';
            } else if (pctDiff > 10) {
                timeImpact = 'medium';
                recommendation = 'The response time is slightly above average.';
            } else {
                recommendation = 'The response time is within normal parameters.';
            }
        }

        if (isXSSPayload && timeImpact !== 'critical') {
            timeImpact = timeImpact === 'low' ? 'medium' : timeImpact;
            recommendation += ' The payload contains XSS vectors. Monitor carefully.';
        }

        return {
            isXSSPayload,
            timeImpact,
            recommendation
        };
    }

    private detectXSS(payload: string): boolean {
        if (!payload) return false;

        try {
            let decodedPayload = payload;
            try {
                decodedPayload = Buffer.from(payload, 'base64').toString('utf-8');
            } catch (e) {

            }

            const xssPatterns = [
                /<script>/i,
                /<\/script>/i,
                /javascript:/i,
                /onerror=/i,
                /onload=/i,
                /onclick=/i,
                /alert\(/i,
                /prompt\(/i,
                /confirm\(/i,
                /document\./i,
                /window\./i,
                /eval\(/i,
                /innerHTML/i,
                /outerHTML/i,
                /src=/i,
                /href=/i,
                /%3Cscript/i,
                /%3C\/script/i,
                /&lt;script/i,
                /&lt;\/script/i,
                /&#60;script/i,
                /&#60;\/script/i
            ];

            return xssPatterns.some(pattern => pattern.test(decodedPayload));
        } catch (e) {
            return false;
        }
    }
}