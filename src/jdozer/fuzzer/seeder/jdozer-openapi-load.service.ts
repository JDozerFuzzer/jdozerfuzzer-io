import { Injectable, Logger } from '@nestjs/common';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import { JSONPath } from "jsonpath-plus";
import { openapiSchemaToJsonSchema } from '@openapi-contrib/openapi-schema-to-json-schema';
import * as YAML from 'yaml';
import { UniqueList } from '../commons/unique-list';
import { randomUUID, UUID } from 'crypto';

@Injectable()
export class JDozerOpenApiLoad {

  private readonly logger = new Logger(JDozerOpenApiLoad.name);
  private contract: any = {};

  constructor() { }

  async build(openapi: string) {
    this.contract = await this.refParser(this.toJson(openapi));
    return this;
  }

  private getRequestBody(operationId: string) {
    let query = `$.paths.*.[?(@.operationId == '${operationId}')].requestBody.content.['application/json'].schema`;
    let requestBody: any = JSONPath({ path: query, json: this.contract });
    if (requestBody.length == 1)
      return this.toJSONSchema(requestBody[0]);
    else
      return undefined;
  }

  private getResponsesSchemas(operationId: string) {
    let query = `$.paths.*.[?(@.operationId == '${operationId}')].responses`;
    let responses: any[] = JSONPath({ path: query, json: this.contract });

    if (responses.length != 1)
      return [];

    let statusCodeKeys: any[] = Object.keys(responses[0]);
    let ress: any[] = statusCodeKeys.map((value) => {
      let res: any = { statusCode: value };
      let query = `$.content.['application/json'].schema`;
      let schema = JSONPath({ path: query, json: responses[0][value] });
      if (schema.length == 1)
        res.schema = schema[0];

      return res;

    });
    return ress;
  }

  private getOperationIds(): UniqueList<string> {
    let query: string = `$.paths.*.*.operationId`;
    const ops: string[] = JSONPath({ path: query, json: this.contract });
    if (ops.length <= 0) {
      const errorMsg = `getOperationIds: No operation found!`;
      this.logger.error(errorMsg);
      throw new JDozerOpenApiLoadException({ message: errorMsg });
    } else {
      try {
        return new UniqueList<string>(ops);
      } catch (e) {
        const errorMsg = `getOperationIds: Duplicate operationId found!: ${e}`;
        this.logger.error(errorMsg);
        throw new JDozerOpenApiLoadException({ message: errorMsg });
      }
    }
  }

  private toJSONSchema(openapiSchema: any) {
    return openapiSchemaToJsonSchema(openapiSchema);
  }

  private getParametersSchema(operationId: string) {
    let query: string = `$.paths.*.[?(@.operationId == '${operationId}')].parameters`;
    let parameters: any[] = JSONPath({ path: query, json: this.contract });

    let params: any = {};
    if (parameters.length == 1) {
      parameters[0].forEach((parameter: any) => {
        if (!params[`${parameter.in}`])
          params[`${parameter.in}`] = { properties: {}, required: [] };

        params[`${parameter.in}`][`properties`][`${parameter.name}`] = parameter.schema;
        if (parameter.required) params[`${parameter.in}`].required.push(parameter.name);
      });

    }

    return params;

  }

  private getPath(operationId: string): string {
    let query: string = `$.paths.*.[?(@.operationId == '${operationId}')]`;
    let pointer: string[] = JSONPath({ path: query, json: this.contract, resultType: `pointer` });
    if (pointer.length == 1) {
      return (pointer[0].split(`/`)[2].replaceAll(`~1`, `/`));
    } else {
      throw new JDozerOpenApiLoadException({ message: `getPath: operationId no valid!` });
    }
  }

  private getMethod(operationId: string) {
    let query: string = `$.paths.*.[?(@.operationId == '${operationId}')]`;
    let pointer: string[] = JSONPath({ path: query, json: this.contract, resultType: `pointer` });
    if (pointer.length == 1) {
      return pointer[0].split(`/`)[3];
    } else {
      const errorMsg = `getMethod: method not found!`;
      this.logger.error(`getMethod: ${errorMsg}`);
      this.logger.debug(operationId, pointer);
      throw new JDozerOpenApiLoadException({ message: errorMsg, details: operationId });
    }
  }

  getServers(): any[] {
    if (this.contract.servers) {
      return this.contract.servers;
    } else {
      const errorMsg = `Servers not found.`;
      this.logger.error(`getServers: ${errorMsg}`);
      throw new JDozerOpenApiLoadException({ message: errorMsg });
    }
  }

  private toJson(contract: string) {
    try {
      return YAML.parse(contract);
    } catch (e) {
      this.logger.error(`toJson: ${e}`);
      throw new JDozerOpenApiLoadException({ message: `toJson: ${e}` });
    }
  }

  private async refParser(contract: any) {
    try {
      return await $RefParser.dereference(contract, { mutateInputSchema: false });
    } catch (e) {
      this.logger.error(`refParser: ${e}`);
      throw new JDozerOpenApiLoadException({ message: `refParser: ${e}` });
    }
  }

  public getOperation(operationId: string): any {

    let requestBodySchema: any = this.getRequestBody(operationId);
    let responsesBodySchemas: any[] = this.getResponsesSchemas(operationId);
    let parametersSchemas: any = this.getParametersSchema(operationId);
    let path: string = this.getPath(operationId);
    let method: string = this.getMethod(operationId);


    let operation = {
      name: operationId,
      req: {
        payload: requestBodySchema
      },
      res: responsesBodySchemas,
      parameters: parametersSchemas,
      path: path,
      method: method
    };

    return operation;

  }

  public getToEncode(): string {
    const encode: string = Buffer.from(JSON.stringify(this.contract)).toString(`base64`);
    return encode;
  }

  public getOperations(): any[] {
    try {

      let operationIds: UniqueList<string> = this.getOperationIds();

      let operations: any[] = operationIds.values().map((operationId) => {
        let operation: any = this.getOperation(operationId);
        operation.id = randomUUID() as UUID;
        //this.redisService.set(this.keyManager.forOperation(operation.name, this.fuzzer.id), operation);
        return operation;
      });

      return operations;

    } catch (e) {
      this.logger.error(`buidOperations: ${e}`);
      throw new JDozerOpenApiLoadException({ message: `buidOperations: ${e}` });
    }
  }

  public getFuzzer(): Fuzzer {
    try {

      let fuzzer = new Fuzzer();
      fuzzer.id = randomUUID() as UUID;
      fuzzer.name = this.contract.info?.title;
      fuzzer.version = this.contract.info?.version;
      fuzzer.servers = this.getServers();
      fuzzer.operationIds = this.getOperationIds().values();
      return fuzzer;

    } catch (e) {
      this.logger.error(`buildFuzzer: ${e}`);
      throw new JDozerOpenApiLoadException({ message: `buildFuzzer: ${e}` });
    }
  }

  /**
  async loadContract(name: string, content: string): Promise<any> {

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

    if (!doc.openapi || typeof doc.openapi !== 'string' || !doc.openapi.startsWith('3.')) {
      throw new BadRequestException('Unsupported OpenAPI version. Must be >= 3.0.0');
    }

    let dereferencedDoc: any;
    try {
      dereferencedDoc = await $RefParser.dereference(doc);
    } catch (error) {
      throw new BadRequestException(`Failed to dereference OpenAPI document: ${error.message}`);
    }

    const servers = dereferencedDoc.servers || [];
    const fuzzingServer = servers.find((s: any) => s.description === 'FUZZING');
    if (!fuzzingServer) {
      throw new BadRequestException("No server with description 'FUZZING' found");
    }

    const fuzzerId = uuidv4();
    const fuzzerKey = `JDF:${fuzzerId}`;

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

        let requestObj: any = { contentType: 'application/json', schema: {} };
        const requestBody = (operationDetails as any).requestBody;
        if (requestBody && requestBody.content) {
          const contentTypes = Object.keys(requestBody.content);
          if (contentTypes.length > 0) {
            const ct = contentTypes[0];
            requestObj.contentType = ct;
            if (requestBody.content[ct].schema) {
              requestObj.schema = toJsonSchema(requestBody.content[ct].schema);
            }
          }
        }

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

        const operationKey = `${fuzzerKey}:OP:${operationId}`;
        await this.redisService.set(operationKey, operationData);
      }
    }

    const fuzzerData = {
      id: fuzzerId,
      name,
      version: dereferencedDoc.info?.version || '1.0.0',
      servers: [fuzzingServer],
      operationIds,
    };
    await this.redisService.set(fuzzerKey, fuzzerData);

    const apiKey = `${fuzzerKey}:API`;
    const originalBase64 = Buffer.from(content).toString('base64');
    await this.redisService.set(apiKey, originalBase64);

    await this.fuzzerDummyService.generatePayloads(fuzzerId, operations);

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
  */
}

export class Fuzzer {

  id: UUID;
  name: string;
  version: string;
  servers: any[];
  operationIds: string[];

}

export class JDozerOpenApiLoadException extends Error {
  constructor(error: { message: string, details?: any }) {
    super(error.message);
    this.name = 'CoreException';
  }
}
