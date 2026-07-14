import { Controller, Post, Body, UploadedFile, UseInterceptors, BadRequestException, Get, Param } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JDozerOpenApiLoad } from './services/jdozer-openapi-load.service';
import { RedisService } from './redis/redis.service';

@Controller('/jdozerfuzzer')
export class SeederController {
  constructor(
    private readonly openapiLoadService: JDozerOpenApiLoad,
    private readonly redisService: RedisService,
  ) { }

  @Post('/fuzzer')
  @UseInterceptors(FileInterceptor('contract'))
  async create(
    @Body('name') name: string,
    @UploadedFile() contract: Express.Multer.File,
  ) {
    if (!contract) {
      throw new BadRequestException('Contract file is required');
    }

    if (!name) {
      throw new BadRequestException('Name is required');
    }

    const content = contract.buffer.toString('utf-8');
    const result = await this.openapiLoadService.loadContract(name, content);

    // We fetch the stored fuzzer data to return the fuzzerCreated schema representation
    const fuzzerKey = `JDF:${result.fuzzerId}`;
    const fuzzerDataStr = await this.redisService.get(fuzzerKey);
    return JSON.parse(fuzzerDataStr || '{}');
  }
}
