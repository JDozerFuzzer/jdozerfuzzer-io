import { Controller, Post, Body, UploadedFile, UseInterceptors, BadRequestException, Get, Param, Logger, HttpStatus } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import express from 'express';
import { Response } from '@nestjs/common';
import type { UUID } from 'crypto';
import { JDozerFuzzerSeeder } from '../seeder/jdozer-fuzzer-seeder.service';
import { ControllerStorage } from './controller-storage.service';
import { Fuzzer } from '../commons/schemas/fuzzer.dto';

@Controller('/jdozerfuzzer')
export class ApiController {

  private readonly logger = new Logger(ApiController.name);

  constructor(
    private readonly sotrage: ControllerStorage,
    private readonly seeder: JDozerFuzzerSeeder
  ) { }

  @Post('/fuzzer')
  @UseInterceptors(FileInterceptor('contract'))
  async create(@UploadedFile() contract: Express.Multer.File) {
    if (!contract) {
      throw new BadRequestException('Contract file is required');
    }
    const content = contract.buffer.toString('utf-8');
    const fuzzerData = await this.seeder.run(content);
    return fuzzerData;
  }


  @Get('/fuzzer/:fuzzerId')
  async getDetails(@Param('fuzzerId') fuzzerId: UUID, @Response() res: express.Response) {
    try {
      this.logger.verbose(`Getting fuzzer details for fuzzer ID: ${fuzzerId}`);
      const fuzzer: Fuzzer = await this.sotrage.getFuzzerDetails(fuzzerId);
      if (!fuzzer) {
        return res.status(HttpStatus.NOT_FOUND).json({ message: 'Fuzzer not found' });
      }
      return res.json(fuzzer);
    } catch (e) {
      const err = `An error occurred while trying to obtain fuzzer details.`;
      this.logger.error(err, e);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: err });
    }
  }

  @Get('/fuzzers')
  async getFuzzerList(@Response() res: express.Response) {
    try {
      this.logger.verbose(`Getting fuzzer list`);
      const fuzzers: any[] = await this.sotrage.getFuzzers();
      return res.json(fuzzers);
    } catch (e) {
      const err = `An error occurred while trying to obtain fuzzer list.`;
      this.logger.error(err, e);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: err });
    }
  }

}
