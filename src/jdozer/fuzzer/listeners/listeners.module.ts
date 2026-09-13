import { Module } from '@nestjs/common';
import { ContractDriftStatusCodeSub, ContractDriftStatusCode } from './contract-drift-status-code.service';
import { ContractDriftResponsePayload, ContractDriftResponsePayloadSub } from './contract-drift-response-payload.service';
import { VectorGrammarBasedInjection, VectorGrammarBasedInjectionSub } from './vectors-grammar-based-injection.service';
import { VectorAnalyze, VectorAnalyzeSub } from './vectors/vector-analyze.service';
import { Configurations, ConfugurationsSub } from './configurations.service';
import { VectorsSub, Vectors } from './vectors.service';
import { ContractDriftRequestPayload, ContractDriftRequestPayloadSub } from './contract-drift-request-payload.service';
import { TestCaseSummary, TestCaseSummarySub } from './test-case-summary.service';

@Module({
    providers: [
        ContractDriftStatusCodeSub,
        ContractDriftStatusCode,
        ContractDriftResponsePayloadSub,
        ContractDriftResponsePayload,
        VectorGrammarBasedInjectionSub,
        VectorGrammarBasedInjection,
        VectorAnalyzeSub,
        VectorAnalyze,
        ConfugurationsSub,
        Configurations,
        VectorsSub,
        Vectors,
        ContractDriftRequestPayloadSub,
        ContractDriftRequestPayload,
        TestCaseSummarySub,
        TestCaseSummary
    ],
    exports: [],
})
export class ListenersModule { }
