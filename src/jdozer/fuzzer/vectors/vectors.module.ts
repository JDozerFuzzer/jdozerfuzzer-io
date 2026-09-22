import { Module } from '@nestjs/common';
import { VectorsBootstrap } from './vectors-bootstrap';
import { VectorUtils } from './vector-utils';
import { JDozerFuzzerVectors } from './jdozer-fuzzer-vectors';
import { VectorsSubscriber } from './jdozer-fuzzer-vectors.sub';
import { JDozerFuzzerSeed } from './jdozer-fuzzer-seed.service';

@Module({
    imports: [],
    providers: [
        VectorsBootstrap,
        VectorUtils,
        VectorsSubscriber,
        JDozerFuzzerVectors,
        JDozerFuzzerSeed
    ],
    exports: [VectorsBootstrap, VectorUtils, JDozerFuzzerVectors],
})
export class VectorsModule { }
