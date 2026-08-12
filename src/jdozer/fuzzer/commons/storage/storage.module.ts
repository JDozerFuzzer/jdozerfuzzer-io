import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';
import { DummyStorage } from './dummy-storage';

@Global()
@Module({
  providers: [RedisService, DummyStorage],
  exports: [RedisService, DummyStorage],
})
export class StorageModule { }
