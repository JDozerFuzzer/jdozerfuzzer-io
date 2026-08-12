import { Module } from '@nestjs/common';
import { StorageModule } from './jdozer/fuzzer/commons/storage/storage.module';
import { VectorsModule } from './jdozer/fuzzer/vectors/vectors.module';
import { PubSubModule } from './jdozer/fuzzer/commons/pubsub/pub-sub-module';
import { EngineModule } from './jdozer/fuzzer/engine/engine.module';
import { SeederModule } from './jdozer/fuzzer/seeder/seeder.module';
import { SeederController } from './jdozer/fuzzer/seeder/seeder.controller';
import { ListenersModule } from './jdozer/fuzzer/listeners/listeners.module';
import { SocketModule } from './jdozer/fuzzer/commons/socket/socket.module';
import { RedisModule } from '@nestjs-modules/ioredis';

@Module({
  imports: [
    RedisModule.forRoot({
      type: 'single',
      url: process.env.FUZZER_REDIS_HOST || 'redis://localhost:6379',
      options: {
        retryStrategy: (times: number) => {
          return Math.min(times * 50, 2000);
        }
      }
    }),
    StorageModule,
    PubSubModule,
    SeederModule,
    VectorsModule,
    EngineModule,
    ListenersModule,
    SocketModule
  ],
  controllers: [SeederController],
  providers: [],
})
export class AppModule { }
