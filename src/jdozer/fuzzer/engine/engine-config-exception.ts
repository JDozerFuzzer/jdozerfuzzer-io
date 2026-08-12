import { Logger } from '@nestjs/common';

export class EngineConfigException extends Error {

    private readonly log = new Logger(EngineConfigException.name);

    constructor(error: { message: string; details?: string }) {
        super(error.message);
        this.name = 'EngineConfigException';
        this.log.error(`${error.message} - ${error.details}`);
    }

}
