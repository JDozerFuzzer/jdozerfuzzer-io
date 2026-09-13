import { Logger } from '@nestjs/common';
import { UUID } from 'crypto';

export class KeyManager {

  private readonly log = new Logger(KeyManager.name);
  public static readonly JDF = "JDF";
  public static readonly ENGINE = "ENG";
  public static readonly OPERATION = "OP";
  public static readonly REQUEST = "REQ";
  public static readonly RESPONSE = "RES";
  public static readonly TEST_CASE_SUMMARY = "TEST_CASE_SUMMARY";
  public static readonly CONTRACT_DRIFT_REQUEST_PAYLOAD = "CONTRACT_DRIFT_REQUEST_PAYLOAD";
  public static readonly CONTRACT_DRIFT_RESPONSE_PAYLOAD = "CONTRACT_DRIFT_RESPONSE_PAYLOAD";
  public static readonly CONTRACT_DRIFT_STATUS_CODE = "CONTRACT_DRIFT_STATUS_CODE";
  public static readonly VECTORS = "VECTORS";
  public static readonly GRAMMAR_VECTOR = "GRAMMAR_VECTOR";
  public static readonly ATTACK_SURFACE = "ATTACK_SURFACE";

  public forFuzz(id: UUID): string {
    return `${KeyManager.JDF}:${id}`;
  }

  public forOperation(id: string, fuzzerId: UUID): string {
    return `${KeyManager.JDF}:${fuzzerId}:OP:${id}`;
  }

  public forFake(fuzzerId: string, operation: string, context: string, fid: string): string {
    return `${KeyManager.JDF}:${fuzzerId}:DMM:${operation}:${context}:${fid}`;
  }

  public forEngine(fuzzerId: string): string {
    return `${KeyManager.JDF}:${fuzzerId}:ENG`;
  }
  public forApi(fuzzerId: string): string {
    return `${KeyManager.JDF}:${fuzzerId}:API`;
  }

  public vecPrefix(): string {
    return `${KeyManager.JDF}:VEC`;
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
    return this.forEngine(fuzzerId).concat(`:*:`).concat(responseId).concat(`:${KeyManager.CONTRACT_DRIFT_STATUS_CODE}`);
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

  public forGrammarVector(fuzzerId: UUID, operationId: string, caseId: UUID): string {
    return this.caseBaseKey(fuzzerId, operationId, caseId).concat(`:${KeyManager.GRAMMAR_VECTOR}`);
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

  public testCaseSummaryKey(fuzzerId: UUID, operationId: string, id: UUID): string {
    return this.caseBaseKey(fuzzerId, operationId, id).concat(`:${KeyManager.TEST_CASE_SUMMARY}`);
  }

  public schemaProbeRequestPayloadKey(fuzzerId: UUID, operationId: string, id: UUID): string {
    return this.caseBaseKey(fuzzerId, operationId, id).concat(`:${KeyManager.CONTRACT_DRIFT_REQUEST_PAYLOAD}`);
  }

  public schemaProbeResponsePayloadKey(fuzzerId: UUID, operationId: string, id: UUID): string {
    return this.caseBaseKey(fuzzerId, operationId, id).concat(`:${KeyManager.CONTRACT_DRIFT_RESPONSE_PAYLOAD}`);
  }

  public responseKey(fuzzerId: UUID, operationId: string, id: UUID): string {
    return this.caseBaseKey(fuzzerId, operationId, id).concat(`:${KeyManager.RESPONSE}`);
  }

  public schemaStatusCodeKey(fuzzerId: UUID, operationId: string, id: UUID): string {
    return this.caseBaseKey(fuzzerId, operationId, id).concat(`:${KeyManager.CONTRACT_DRIFT_STATUS_CODE}`);
  }

  public statusCodeSchemaPattern(fuzzerId: UUID, id: UUID): string {
    return this.caseBaseKey(fuzzerId, "*", id).concat(`:${KeyManager.CONTRACT_DRIFT_STATUS_CODE}`);
  }

  public vectorKey(fuzzerId: UUID, operationId: string, requestId: UUID): string {
    return this.caseBaseKey(fuzzerId, operationId, requestId).concat(`:${KeyManager.VECTORS}`);
  }

  public vectorAttackSurfaceKey(fuzzerId: UUID): string {
    return this.forFuzz(fuzzerId).concat(`:${KeyManager.ATTACK_SURFACE}`);
  }

  public toResponseKey(key: string): string {
    const parts = key.split(`:`);
    parts[parts.length - 1] = KeyManager.RESPONSE;
    return parts.join(`:`);
  }

}
