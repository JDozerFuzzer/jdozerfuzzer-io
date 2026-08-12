import { Injectable, Logger } from '@nestjs/common';
import { JSONPath } from "jsonpath-plus";
import { randomUUID, UUID } from 'crypto';
import { RedisService } from '../commons/storage/redis.service';
import { Fuzzer } from '../commons/schemas/fuzzer.dto';
import { KeyManager } from '../commons/storage/key-manager';
import set = require('lodash.set');

export interface Operation {
  id: string;
  name: string;
}

export interface OperationParameter {
  context: string;
  pathAttributes: string[];
}

export class VectorException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VectorException';
  }
}

@Injectable()
export class VectorUtils {

  private readonly log = new Logger(VectorUtils.name);
  private readonly keyManager: KeyManager = new KeyManager();

  private fuzzerId: UUID;

  constructor(
    private readonly redisService: RedisService
  ) { }

  public async getPropertiesString(schema: any): Promise<string[]> {
    try {
      const pointers: string[] = JSONPath({ path: '$..[?(@.type=="string")]', json: schema, resultType: `pointer` });
      this.log.verbose(`Pointers found: ${pointers}`);
      if (pointers.length > 0) {
        return pointers.map((pointer: string) => {
          return pointer.replaceAll(`/items`, `/0`).replaceAll(`/properties`, ``).slice(1);
        });
      }
      return [];
    } catch (error) {
      this.log.error(`Error getting properties from schema: ${(error as Error).message}`, (error as Error).stack);
      throw new VectorException(`Error getting properties from schema: ${(error as Error).message}`);
    }
  }

  public candidateProperties(paths: string[]): string[] {
    return paths;
  }

  public setValueByPath(obj: any, pointer: string, value: any) {
    return set(obj, pointer.split('/'), value);
  }

  public vectorToDmm(dmm: any, pointer: string, vector: any) {
    try {
      const dmmClone = JSON.parse(JSON.stringify(dmm));
      const data: any = JSON.parse(this.decode(dmmClone.data));
      const newDmmData = this.setValueByPath(data, pointer, this.decode(vector.script));

      dmmClone.id = randomUUID();
      dmmClone.valid = false;
      dmmClone.data = this.encode(JSON.stringify(newDmmData));
      dmmClone.property = pointer;
      dmmClone.message = vector.description;
      dmmClone.vectorId = vector.id;

      return dmmClone;

    } catch (e) {
      this.log.error(`Error vector to dmm: ${(e as Error).message}`, (e as Error).stack);
      throw new VectorException(`Error vector to dmm: ${(e as Error).message}`);
    }
  }

  public encode(data: string): string {
    try {
      return Buffer.from(data, 'utf-8').toString('base64');
    } catch (e) {
      this.log.error(`Error encoding data: ${(e as Error).message}`, (e as Error).stack);
      throw new VectorException(`Error encoding data: ${(e as Error).message}`);
    }
  }

  public decode(data: string): string {
    try {
      return Buffer.from(data, 'base64').toString('utf-8');
    } catch (e) {
      this.log.error(`Error decoding data: ${(e as Error).message}`, (e as Error).stack);
      throw new VectorException(`Error decoding data: ${(e as Error).message}`);
    }
  }

  public async getDmmValid(fuzzerId: UUID, operationId: string, context: string): Promise<any> {
    try {
      const dmmKeys: string[] = await this.redisService.getKeys(this.keyManager.dmmContextPattern(fuzzerId, operationId, context));
      const key: number = this.random(0, dmmKeys.length - 1);
      return await this.redisService.get(dmmKeys[key]);
    } catch (e) {
      this.log.error(`Error getting dmm valid: ${(e as Error).message}`, (e as Error).stack);
      throw new VectorException(`Error getting dmm valid: ${(e as Error).message}`);
    }
  }

  public async getRandomVectorsKeys(cant: number): Promise<string[]> {
    const keys: string[] = await this.redisService.getKeys(this.keyManager.vectorsPattern());
    const vectors: string[] = [];
    for (let i = 0; i < cant; i++) {
      const x: number = this.random(0, keys.length - 1);
      vectors.push(keys[x]);
    }
    this.log.verbose(`[getRandomVectorsKeys]: Vectors keys selected ${vectors.join(', ')}`);
    return vectors;
  }

  private random(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }







}
