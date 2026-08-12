import { Module } from '@nestjs/common';
import { StatusCodeValidator, StatusCodeValidatorSub } from './status-code-validator.service';
import { ResponseSchemaValidator, ResponseSchemaValidatorSub } from './response-schema-validator.service';
import { VectorInsertion, VectorInsertionSub } from './vector-insertion.service';
import { VectorAnalyze, VectorAnalyzeSub } from './vectors/vector-analyze.service';

@Module({
    providers: [
        StatusCodeValidatorSub,
        StatusCodeValidator,
        ResponseSchemaValidatorSub,
        ResponseSchemaValidator,
        VectorInsertionSub,
        VectorInsertion,
        VectorAnalyzeSub,
        VectorAnalyze
    ],
    exports: [],
})
export class ListenersModule { }
