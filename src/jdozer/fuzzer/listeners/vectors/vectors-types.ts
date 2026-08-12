export interface CounterMetrics {
    [key: string]: number;
}

export interface RateMetrics {
    [key: string]: number;
}

export type ComparisonsSeverity = 'normal' | 'moderate' | 'significant' | 'critical';

export interface SummaryMetrics {
    min: number;
    max: number;
    count: number;
    mean: number;
    p50: number;
    median: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
    p999: number;
}

export interface IntermediateResult {
    counters: CounterMetrics;
    rates: RateMetrics;
    firstCounterAt: number;
    lastCounterAt: number;
    period: string;
    summaries: {
        [key: string]: SummaryMetrics;
    };
    histograms: {
        [key: string]: SummaryMetrics;
    };
}

export interface EngineSummary {
    aggregate: {
        counters: CounterMetrics;
        rates: RateMetrics;
        summaries: {
            [key: string]: SummaryMetrics;
        };
        histograms: {
            [key: string]: SummaryMetrics;
        };
    };
    intermediate: IntermediateResult[];
}

export interface ResponseTimings {
    start: number;
    socket: number;
    lookup: number;
    connect: number;
    upload: number;
    response: number;
    end: number;
    phases: {
        wait: number;
        dns: number;
        tcp: number;
        request: number;
        firstByte: number;
        download: number;
        total: number;
    };
}

export interface ResponseData {
    operationId: string;
    uuidReq: string;
    payload: string;
    headers: Record<string, string>;
    ip: string;
    complete: boolean;
    statusCode: number;
    statusMessage: string;
    url: string;
    aborted: boolean;
    timings: ResponseTimings;
    time: number;
}

export interface RequestTimeComparison {
    request: {
        operationId: string;
        uuidReq: string;
        statusCode: number;
        url: string;
        totalTime: number;
        timings: ResponseTimings;
    };

    scenarioStats: {
        operationId: string;
        totalRequests: number;
        meanTime: number;
        medianTime: number;
        p90Time: number;
        p95Time: number;
        minTime: number;
        maxTime: number;
        statusCodes: { [code: string]: number };
        endpointPath: string;
    } | null;

    globalStats: {
        totalRequests: number;
        meanTime: number;
        medianTime: number;
        p90Time: number;
        p95Time: number;
        minTime: number;
        maxTime: number;
        successRate: number;
    };

    comparisons: {
        vsScenarioMean: {
            difference: number;
            percentageDifference: number;
            isSlower: boolean;
            severity: ComparisonsSeverity;
        };
        vsGlobalMean: {
            difference: number;
            percentageDifference: number;
            isSlower: boolean;
            severity: ComparisonsSeverity;
        };
        vsScenarioP95: {
            difference: number;
            percentageDifference: number;
            isSlower: boolean;
            severity: ComparisonsSeverity;
        };
    };

    riskAnalysis: {
        isXSSPayload: boolean;
        timeImpact: 'low' | 'medium' | 'high' | 'critical';
        recommendation: string;
    };
}
