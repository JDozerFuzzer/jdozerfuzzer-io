import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';
import { RedisAdapter } from './redis-adapter.service';

@Global()
@Module({
  providers: [RedisService, RedisAdapter],
  exports: [RedisService, RedisAdapter],
})
export class StorageModule { }
