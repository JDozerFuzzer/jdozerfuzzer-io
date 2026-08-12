import { Logger } from '@nestjs/common';

export class EngineException extends Error {

    private readonly log = new Logger(EngineException.name);

    constructor(error: { message: string; details?: string }) {
        super(error.message);
        this.name = 'EngineException';
        this.log.error(`${error.message} - ${error.details}`);
    }

}
