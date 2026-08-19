import { Logger } from '@nestjs/common';
import { UUID } from 'crypto';

export class KeyManager {
  private readonly log = new Logger(KeyManager.name);
  private readonly JDF = 'JDF';

  public forFuzz(id: UUID): string {
    return `${this.JDF}:${id}`;
  }

  public forOperation(id: string, fuzzerId: UUID): string {
    return `${this.JDF}:${fuzzerId}:OP:${id}`;
  }

  public forFake(fuzzerId: string, operation: string, context: string, fid: string): string {
    return `${this.JDF}:${fuzzerId}:DMM:${operation}:${context}:${fid}`;
  }

  public forEngine(fuzzerId: string): string {
    return `${this.JDF}:${fuzzerId}:ENG`;
  }
  public forApi(fuzzerId: string): string {
    return `${this.JDF}:${fuzzerId}:API`;
  }

  public vecPrefix(): string {
    return `${this.JDF}:VEC`;
  }

  public forVector(vectorId: number): string {
    return `${this.vecPrefix()}:${vectorId}`;
  }

  public vectorsPattern() {
    return this.vecPrefix().concat(`:*`);
  }

  public getUUIDForFuzz(fuzzer: string): string {
    const parts = fuzzer.split(':');
    if (parts.length !== 2) {
      this.log.error(`The fuzzer key does not have the expected format (2 parts): ${fuzzer}`);
      throw new Error('The chain does not have exactly two parts separated by :');
    }
    return parts[1];
  }

  public getUUIDForOperation(operation: string): string {
    const parts = operation.split(':');
    if (parts.length < 4) {
      this.log.error(`The operation key does not have the expected format (at least 4 parts): ${operation}`);
      throw new Error('The chain does not have at least four parts separated by :');
    }
    return parts[3];
  }

  public requestIdPattern(fuzzerId: UUID, requestId: UUID) {
    return this.forEngine(fuzzerId).concat(`:*:`).concat(requestId).concat(`:REQ`);
  }

  // JDF:8a015184-b979-4058-bd9b-11384315b88c:ENG:addPet:02ffeff5-3456-42e2-a8b5-de9e7d01c756:REQ
  public forRequest(fuzzerId: UUID, operation: string, requestId: UUID) {
    return this.forEngine(fuzzerId).concat(`:${operation}:`).concat(requestId).concat(`:REQ`);
  }


  public responseIdPattern(fuzzerId: UUID, responseId: UUID) {
    return this.forEngine(fuzzerId).concat(`:*:`).concat(responseId).concat(`:RES`);
  }

  public responseToOperation(responseKey: string) {
    return responseKey.replaceAll("ENG", "OP").split(`:`).slice(0, 4).join(`:`);
  }

  public statusCodePattern(fuzzerId: UUID, responseId: UUID) {
    return this.forEngine(fuzzerId).concat(`:*:`).concat(responseId).concat(`:schemaResponseStatusCode`);
  }

  public dmmPattern(fuzzerId: UUID, dmmId: UUID) {
    return this.forFuzz(fuzzerId).concat(`:DMM:*:*:`).concat(dmmId);
  }

  public dmmOperationPattern(fuzzerId: UUID, operation: string) {
    return this.forFuzz(fuzzerId).concat(`:DMM:${operation}:*:*`);
  }

  public dmmAllPattern(fuzzerId: UUID): string {
    return this.forFuzz(fuzzerId).concat(`:DMM:*`);
  }

  public dmmContextPattern(fuzzerId: UUID, operationId: string, context: string) {
    return this.forFuzz(fuzzerId).concat(`:DMM:`).concat(operationId).concat(`:${context}:*`);
  }

  public forDmm(fuzzerId: UUID, operationId: string, context: string, id: UUID): string {
    return this.forFuzz(fuzzerId).concat(`:DMM:`).concat(operationId).concat(`:${context}:`).concat(id);
  }

  public dmmIdPattern(fuzzerId: UUID, id: UUID) {
    return this.forFuzz(fuzzerId).concat(`:DMM:*:*:`).concat(id);
  }

  public forResponseVector(fuzzerId: UUID, operationId: string, responseId: UUID): string {
    return this.forEngine(fuzzerId).concat(`:${operationId}:`).concat(responseId).concat(`:VEC`);
  }

  public responsesPattern(fuzzerId: UUID) {
    return this.forEngine(fuzzerId).concat(`:*:*:RES`);
  }

  public responsesForOperationPattern(fuzzerId: UUID, operationId: string) {
    return this.forEngine(fuzzerId).concat(`:${operationId}:*:RES`);
  }

  public fuzzerIdsPattern(): RegExp {
    return /^JDF:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  }

  public forFuzzingCase(fuzzerId: UUID, operationId: string, requestId: UUID) {
    return this.forEngine(fuzzerId).concat(`:${operationId}:`).concat(requestId).concat(`:fuzzingCase`);
  }


}
