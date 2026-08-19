import { Module } from "@nestjs/common";
import { ApiController } from "./api.controller.service";
import { ControllerStorage } from "./controller-storage.service";
import { SeederModule } from "../seeder/seeder.module";

@Module({
    providers: [ControllerStorage],
    imports: [SeederModule],
    exports: [],
    controllers: [ApiController]
})
export class ApiModule { }
