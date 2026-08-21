import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';
import { DummyStorage } from './dummy-storage';
import { RedisAdapter } from './redis-adapter.service';

@Global()
@Module({
  providers: [RedisService, DummyStorage, RedisAdapter],
  exports: [RedisService, DummyStorage, RedisAdapter],
})
export class StorageModule { }
