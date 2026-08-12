import { Module } from '@nestjs/common';
import { JDozerFuzzerSeeder } from './jdozer-fuzzer-seeder.service';
import { JDozerFuzzerDummy } from './jdozer-fuzzer-dummy.service';
import { JDozerOpenApiLoad } from './jdozer-openapi-load.service';
import { SeederController } from './seeder.controller';

@Module({
    imports: [],
    providers: [JDozerFuzzerSeeder, JDozerFuzzerDummy, JDozerOpenApiLoad],
    exports: [JDozerFuzzerSeeder, JDozerFuzzerDummy, JDozerOpenApiLoad],
    controllers: [SeederController]
})
export class SeederModule { }
