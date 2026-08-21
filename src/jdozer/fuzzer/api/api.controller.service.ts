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

  @Get('/fuzzers/:fuzzerId/contract')
  async getContract(@Param('fuzzerId') fuzzerId: UUID, @Response() res: express.Response) {
    try {
      this.logger.verbose(`Getting contract for fuzzer ID: ${fuzzerId}`);
      const contract = await this.sotrage.getContract(fuzzerId);
      if (!contract) {
        return res.status(HttpStatus.NOT_FOUND).end();
      }
      return res.status(HttpStatus.OK).json(JSON.parse(Buffer.from(contract, 'base64').toString('utf-8')));
    } catch (e) {
      const err = `An error occurred while trying to obtain contract details.`;
      this.logger.error(err, e);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ message: err });
    }
  }

  @Get('/fuzzers/:fuzzerId/operations/:operationId')
  async getOperation(@Param('fuzzerId') fuzzerId: UUID, @Param('operationId') operationId: string) {
    try {
      return this.sotrage.getOperation(fuzzerId, operationId);
    } catch (e) {
      this.logger.error(`An error occurred while trying to obtain operation details for fuzzer ${fuzzerId} and operation ${operationId}.`, e);
      throw e;
    }
  }

  @Get('/fuzzers/:fuzzerId/operations/:operationId/requests')
  async getRequestsList(@Param('fuzzerId') fuzzerId: UUID, @Param('operationId') operationId: string) {
    try {
      return await this.sotrage.getResponsesSummaryList(fuzzerId, operationId);
    } catch (e) {
      this.logger.error(`[getRequestsList] An error has occurred: ${e.message}`, e);
      throw e;
    }
  }

  @Get('/fuzzers/:fuzzerId/operations/:operationId/case/:caseId')
  async getRequest(@Param('fuzzerId') fuzzerId: UUID, @Param('operationId') operationId: string, @Param('caseId') caseId: UUID) {
    try {
      return await this.sotrage.getCaseDetails(fuzzerId, caseId);
    } catch (e) {
      const err = `An error occurred while trying to obtain case details for fuzzer ${fuzzerId}, operation ${operationId} and case ${caseId}.`;
      this.logger.error(err, e);
    }
  }

  @Get('/fuzzers/:fuzzerId/operations/:operationId/requests/:requestId/response')
  async getResponse() { }


}
