import { Module } from '@nestjs/common';
import { SchemaStatusCodeSub, SchemaStatusCode } from './schema-status-code.service';
import { SchemaResponsePayload, SchemaResponsePayloadSub } from './schema-response-payload.service';
import { VectorInsertion, VectorInsertionSub } from './vector-insertion.service';
import { VectorAnalyze, VectorAnalyzeSub } from './vectors/vector-analyze.service';
import { TotalCases, TotalCasesSub } from './total-cases.service';
import { SchemasProbeSummarySub, SchemasProbeSummary } from './schemas-probe-summary.service';
import { SchemaProbeRequestPayload, SchemaProbeRequestPayloadSub } from './schema-probe-request-payload.service';
import { ResponseSummary, ResponseSummarySubscriber } from './response-summary.service';

@Module({
    providers: [
        SchemaStatusCodeSub,
        SchemaStatusCode,
        SchemaResponsePayloadSub,
        SchemaResponsePayload,
        VectorInsertionSub,
        VectorInsertion,
        VectorAnalyzeSub,
        VectorAnalyze,
        TotalCasesSub,
        TotalCases,
        SchemasProbeSummarySub,
        SchemasProbeSummary,
        SchemaProbeRequestPayloadSub,
        SchemaProbeRequestPayload,
        ResponseSummarySubscriber,
        ResponseSummary
    ],
    exports: [],
})
export class ListenersModule { }
