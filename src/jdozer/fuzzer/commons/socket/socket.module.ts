import { RedisModule } from "@nestjs-modules/ioredis";
import { Module } from "@nestjs/common";
import { SocketSubscriber } from "./socket-sub.service";
import { EventEmitterModule } from "@nestjs/event-emitter";

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
        EventEmitterModule.forRoot({
            wildcard: true,
            delimiter: ":",
            maxListeners: 100,
            verboseMemoryLeak: true,
            ignoreErrors: false
        })
    ],
    providers: [SocketSubscriber],
    exports: []
})
export class SocketModule {
}