import { Module } from '@nestjs/common';
import { JDozerFuzzerSeeder } from './jdozer-fuzzer-seeder.service';
import { JDozerOpenApiLoad } from './jdozer-openapi-load.service';

@Module({
    imports: [],
    providers: [JDozerFuzzerSeeder, JDozerOpenApiLoad],
    exports: [JDozerFuzzerSeeder],
    controllers: []
})
export class SeederModule { }
