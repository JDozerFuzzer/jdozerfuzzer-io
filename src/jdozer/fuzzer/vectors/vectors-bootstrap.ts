import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { RedisService } from '../commons/storage/redis.service';
import { KeyManager } from '../commons/storage/key-manager';

@Injectable()
export class VectorsBootstrap implements OnModuleInit {
  private readonly log = new Logger(VectorsBootstrap.name);
  private static readonly INIT_DATA_PATH = 'vectors-v2.json';
  private readonly keyManager = new KeyManager();

  constructor(private readonly redisService: RedisService) { }

  async onModuleInit(): Promise<void> {
    await this.init();
  }

  async init(): Promise<void> {
    try {

      let filePath = path.join(__dirname, VectorsBootstrap.INIT_DATA_PATH);

      if (!fs.existsSync(filePath)) {
        filePath = path.join(process.cwd(), 'src/resources', VectorsBootstrap.INIT_DATA_PATH);
        if (!fs.existsSync(filePath)) {
          filePath = path.join(process.cwd(), VectorsBootstrap.INIT_DATA_PATH);
        }
      }

      if (!fs.existsSync(filePath)) {
        this.log.warn(`Initial vector file not found. Skipping initialization process.`);
        return;
      }

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const vectors = JSON.parse(fileContent);

      if (!Array.isArray(vectors)) {
        this.log.error('The initial vector file does not contain a valid array.');
        return;
      }

      let insertedCount = 0;
      let existingCount = 0;

      for (const vector of vectors) {
        if (!vector.id) {
          this.log.warn('Found a vector without an ID in the file, it will be skipped.');
          continue;
        }

        const key = this.keyManager.forVector(vector.id);
        const existing = await this.redisService.get(key);

        if (existing === null || existing === undefined || existing === '') {
          await this.redisService.set(key, vector);
          insertedCount++;
        } else {
          existingCount++;
        }
      }

      this.log.log(`Initialization of vectors completed. Inserted: ${insertedCount}, Already existing: ${existingCount}.`);
    } catch (error) {
      this.log.error(`Error during vector initialization: ${(error as Error).message}`, (error as Error).stack);
    }
  }
}
