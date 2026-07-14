import { Module } from '@nestjs/common';
import { SeederController } from './seeder.controller';
import { RedisModule } from './redis/redis.module';
import { JDozerOpenApiLoad } from './services/jdozer-openapi-load.service';
import { JDozerFuzzerDummy } from './services/jdozer-fuzzer-dummy.service';

@Module({
  imports: [RedisModule],
  controllers: [SeederController],
  providers: [JDozerOpenApiLoad, JDozerFuzzerDummy],
})
export class AppModule {}
