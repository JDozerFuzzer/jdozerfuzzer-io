import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import * as yaml from 'yaml';
import $RefParser from '@apidevtools/json-schema-ref-parser';
const { openapiSchemaToJsonSchema: toJsonSchema } = require('@openapi-contrib/openapi-schema-to-json-schema');
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from '../redis/redis.service';
import { JDozerFuzzerDummy } from './jdozer-fuzzer-dummy.service';

@Injectable()
export class JDozerOpenApiLoad {
  private readonly logger = new Logger(JDozerOpenApiLoad.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly fuzzerDummyService: JDozerFuzzerDummy,
  ) { }

  async loadContract(name: string, content: string): Promise<any> {
    // 1. Carga y Normalización
    let doc: any;
    try {
      doc = JSON.parse(content);
    } catch (e) {
      try {
        doc = yaml.parse(content);
      } catch (yamlError) {
        throw new BadRequestException('Invalid contract format. Must be JSON or YAML.');
      }
    }

    // 2. Validación de Versión
    if (!doc.openapi || typeof doc.openapi !== 'string' || !doc.openapi.startsWith('3.')) {
      throw new BadRequestException('Unsupported OpenAPI version. Must be >= 3.0.0');
    }

    // 3. Resolución de Referencias Internas
    let dereferencedDoc: any;
    try {
      dereferencedDoc = await $RefParser.dereference(doc);
    } catch (error) {
      throw new BadRequestException(`Failed to dereference OpenAPI document: ${error.message}`);
    }

    // 4. Extracción y Persistencia de Datos Clave
    // 4.1 Servidor de Fuzzing
    const servers = dereferencedDoc.servers || [];
    const fuzzingServer = servers.find((s: any) => s.description === 'FUZZING');
    if (!fuzzingServer) {
      throw new BadRequestException("No server with description 'FUZZING' found");
    }

    const fuzzerId = uuidv4();
    const fuzzerKey = `JDF:${fuzzerId}`;

    // 4.2 Operaciones (Paths)
    const operations: any[] = [];
    const operationIds: string[] = [];
    const paths = dereferencedDoc.paths || {};

    for (const [pathUrl, pathMethods] of Object.entries(paths)) {
      for (const [method, operationDetails] of Object.entries(pathMethods as object)) {
        if (!['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) {
          continue;
        }

        const operationId = (operationDetails as any).operationId || `${method}-${pathUrl}`;
        operationIds.push(operationId);

        // Convert request schema
        let requestObj: any = { contentType: 'application/json', schema: {} };
        const requestBody = (operationDetails as any).requestBody;
        if (requestBody && requestBody.content) {
          const contentTypes = Object.keys(requestBody.content);
          if (contentTypes.length > 0) {
            const ct = contentTypes[0]; // Take first, typically application/json
            requestObj.contentType = ct;
            if (requestBody.content[ct].schema) {
              // Must be strict schema
              requestObj.schema = toJsonSchema(requestBody.content[ct].schema);
            }
          }
        }

        // Parse response schemas filtered by application/json content type
        const responseArr: any[] = [];
        const responses = (operationDetails as any).responses || {};
        for (const [statusCode, responseDetails] of Object.entries(responses)) {
          let responseSchema: any = {};
          const responseContent = (responseDetails as any)?.content;
          if (responseContent && responseContent['application/json']?.schema) {
            responseSchema = toJsonSchema(responseContent['application/json'].schema);
          }
          responseArr.push({ statusCode, schema: responseSchema });
        }

        const opId = uuidv4();
        const operationData = {
          id: opId,
          name: operationId,
          path: pathUrl,
          method: method.toLowerCase(),
          request: requestObj,
          response: responseArr,
          parameters: { inPath: {}, inQuery: {}, inHeaders: {} },
        };

        operations.push(operationData);

        // Persist operation
        const operationKey = `${fuzzerKey}:OP:${operationId}`;
        await this.redisService.set(operationKey, operationData);
      }
    }

    // Persist Fuzzer data
    const fuzzerData = {
      id: fuzzerId,
      name,
      version: dereferencedDoc.info?.version || '1.0.0',
      servers: [fuzzingServer],
      operationIds,
    };
    await this.redisService.set(fuzzerKey, fuzzerData);

    // 5. Persistencia del Contrato Original
    const apiKey = `${fuzzerKey}:API`;
    const originalBase64 = Buffer.from(content).toString('base64');
    await this.redisService.set(apiKey, originalBase64);

    // 6. Generación de Datos Dummy
    await this.fuzzerDummyService.generateDummies(fuzzerId, operations);

    // 7. Event Publication — seeder-successful (AsyncAPI: fuzzer:seeder channel)
    const event = {
      headers: {
        id: uuidv4(),
        timestamp: Date.now(),
        version: '1.0.0',
        entityId: fuzzerId,
        entityType: 'fuzzer-seeder',
        eventType: 'builder-successful',
      },
      payload: {
        fuzzerId,
        name,
        version: dereferencedDoc.info?.version || '1.0.0',
        servers: [fuzzingServer],
        operationIds,
      },
    };
    await this.redisService.publish('fuzzer:seeder', event);
    this.logger.log(`Contract loaded successfully. Fuzzer ID: ${fuzzerId}`);
    this.logger.verbose(`Published seeder-successful event: ${JSON.stringify(event)}`);

    return {
      fuzzerId,
      message: 'Fuzzer created and dummy generation complete',
    };
  }
}
