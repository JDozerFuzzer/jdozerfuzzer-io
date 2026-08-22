import { Logger } from '@nestjs/common';
import { UUID } from 'crypto';

export class KeyManager {

  private readonly log = new Logger(KeyManager.name);
  private readonly JDF = "JDF";
  private readonly ENGINE = "ENG";
  private readonly OPERATION = "OP";
  private readonly REQUEST = "REQ";
  private readonly RESPONSE = "RES";
  private readonly SCHEMA_PROBE_SUMMARY = "SCHEMA_PROBE_SUMMARY";
  private readonly SCHEMA_PROBE_REQUEST_PAYLOAD = "SCHEMA_PROBE_REQUEST_PAYLOAD";
  private readonly SCHEMA_PROBE_RESPONSE_PAYLOAD = "SCHEMA_PROBE_RESPONSE_PAYLOAD";
  private readonly STATUS_CODE_SCHEMA = "STATUS_CODE_SCHEMA";

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

  public caseIdPattern(fuzzerId: UUID, responseId: UUID) {
    return this.forEngine(fuzzerId).concat(`:*:`).concat(responseId).concat(`:*`);
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

  public requestListPattern(fuzzerId: UUID, operationId: string) {
    return this.forEngine(fuzzerId).concat(`:${operationId}:*:REQ`);
  }

  public requestSummaryListPattern(fuzzerId: UUID, operationId: string): string {
    return this.forEngine(fuzzerId).concat(`:${operationId}:*:SUMMARY`);
  }

  private caseBaseKey(fuzzerId: UUID, operation: string, id: UUID): string {
    return this.forEngine(fuzzerId).concat(`:${operation}`).concat(`:${id}`);
  }

  public schemaProbeSummaryKey(fuzzerId: UUID, operationId: string, id: UUID): string {
    return this.caseBaseKey(fuzzerId, operationId, id).concat(`:${this.SCHEMA_PROBE_SUMMARY}`);
  }

  public schemaProbeRequestPayloadKey(fuzzerId: UUID, operationId: string, id: UUID): string {
    return this.caseBaseKey(fuzzerId, operationId, id).concat(`:${this.SCHEMA_PROBE_REQUEST_PAYLOAD}`);
  }

  public schemaProbeResponsePayloadKey(fuzzerId: UUID, operationId: string, id: UUID): string {
    return this.caseBaseKey(fuzzerId, operationId, id).concat(`:${this.SCHEMA_PROBE_RESPONSE_PAYLOAD}`);
  }

  public responseKey(fuzzerId: UUID, operationId: string, id: UUID): string {
    return this.caseBaseKey(fuzzerId, operationId, id).concat(`:${this.RESPONSE}`);
  }

  public schemaStatusCodeKey(fuzzerId: UUID, operationId: string, id: UUID): string {
    return this.caseBaseKey(fuzzerId, operationId, id).concat(`:${this.STATUS_CODE_SCHEMA}`);
  }

  public statusCodeSchemaPattern(fuzzerId: UUID, id: UUID): string {
    return this.caseBaseKey(fuzzerId, "*", id).concat(`:${this.STATUS_CODE_SCHEMA}`);
  }

  public toResponseKey(key: string): string {
    const parts = key.split(`:`);
    parts[parts.length - 1] = this.RESPONSE;
    return parts.join(`:`);
  }

}
