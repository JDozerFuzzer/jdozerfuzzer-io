import { Module } from '@nestjs/common';
import { StatusCodeValidator, StatusCodeValidatorSub } from './status-code-validator.service';
import { ResponseSchemaValidator, ResponseSchemaValidatorSub } from './response-schema-validator.service';
import { VectorInsertion, VectorInsertionSub } from './vector-insertion.service';
import { VectorAnalyze, VectorAnalyzeSub } from './vectors/vector-analyze.service';
import { TotalCases, TotalCasesSub } from './total-cases.service';
import { FuzzingCaseValidatorSub, FuzzingCaseValidator } from './fuzzing-case-validator.service';

@Module({
    providers: [
        StatusCodeValidatorSub,
        StatusCodeValidator,
        ResponseSchemaValidatorSub,
        ResponseSchemaValidator,
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
