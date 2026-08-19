import { Module } from '@nestjs/common';
import { SchemaResponseStatusCode, SchemaResponseStatusCodeSub } from './schema-response-status-code.service';
import { SchemaResponsePayload, SchemaResponsePayloadSub } from './schema-response-payload.service';
import { VectorInsertion, VectorInsertionSub } from './vector-insertion.service';
import { VectorAnalyze, VectorAnalyzeSub } from './vectors/vector-analyze.service';
import { TotalCases, TotalCasesSub } from './total-cases.service';
import { FuzzingCaseValidatorSub, FuzzingCaseValidator } from './fuzzing-case-validator.service';

@Module({
    providers: [
        SchemaResponseStatusCodeSub,
        SchemaResponseStatusCode,
        SchemaResponsePayloadSub,
        SchemaResponsePayload,
        VectorInsertionSub,
        VectorInsertion,
        VectorAnalyzeSub,
        VectorAnalyze,
        TotalCasesSub,
        TotalCases,
        FuzzingCaseValidatorSub,
        FuzzingCaseValidator
    ],
    exports: [],
})
export class ListenersModule { }
