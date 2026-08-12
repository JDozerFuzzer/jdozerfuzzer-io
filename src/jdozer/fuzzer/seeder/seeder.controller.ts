import { Controller, Post, Body, UploadedFile, UseInterceptors, BadRequestException, Get, Param, Logger } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JDozerFuzzerSeeder } from './jdozer-fuzzer-seeder.service';

@Controller('/jdozerfuzzer')
export class SeederController {

  private readonly logger = new Logger(SeederController.name);

  constructor(
    private readonly seeder: JDozerFuzzerSeeder
  ) { }

  @Post('/fuzzer')
  @UseInterceptors(FileInterceptor('contract'))
  async create(
    @Body('name') name: string,
    @UploadedFile() contract: Express.Multer.File
  ) {
    if (!contract) {
      throw new BadRequestException('Contract file is required');
    }

    if (!name) {
      throw new BadRequestException('Name is required');
    }

    const content = contract.buffer.toString('utf-8');
    const fuzzerData = await this.seeder.run(name, content);
    return fuzzerData;
  }
}
