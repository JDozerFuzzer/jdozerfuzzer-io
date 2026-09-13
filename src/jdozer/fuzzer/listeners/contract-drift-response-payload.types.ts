import { UUID } from "crypto";

export interface Validation {
    id: UUID,
    fuzzerId: UUID,
    operationId: string,
    isValid: boolean;
    finding: ContractDriftResponsePayloadFinding;
    errors: any;
}

export interface ContractDriftResponsePayloadFinding {
    type: string;
    description: string;
    severityLevel: number;
    severityName: string;
    tags: string[];
    recommendation: string[];
}

export const ContractDriftResponsePayloadFindings: Record<string, Omit<ContractDriftResponsePayloadFinding, 'schema-payload'>> = {
    '1-0': {
        type: 'MISSING_RESPONSE_BODY',
        description: 'The API response does not contain a body even though the contract defines a schema. This indicates incomplete implementation or unexpected behavior.',
        severityLevel: 3,
        severityName: 'MEDIUM',
        tags: ['response-body-validation', 'contract-violation', 'response-body-not-found'],
        recommendation: [
            'Ensure the API returns a response body when the contract defines one',
            'Check if 204 No Content is being returned incorrectly',
            'Verify the server logic for conditional response generation'
        ]
    },
    '0-1': {
        type: 'UNDOCUMENTED_DATA_LEAK',
        description: 'The API returns unexpected data in the response body that is not defined in the contract. This indicates the API may be exposing internal data, debug information, or sensitive fields that should not be returned to clients.',
        severityLevel: 5,
        severityName: 'CRITICAL',
        tags: ['response-body-validation', 'contract-violation', 'response-body-leak', 'information-disclosure'],
        recommendation: [
            'Review API code to identify why undocumented data is being returned',
            'Check for debug mode enabled in production',
            'Implement DTOs to control response serialization',
            'Remove internal fields, stack traces, and debug information'
        ]
    },
    '0-0': {
        type: 'EMPTY_RESPONSE_VALID',
        description: 'Both the contract and the API response are empty. This is consistent behavior with no data being returned.',
        severityLevel: 1,
        severityName: 'INFO',
        tags: ['response-body-validation', 'contract-validation', 'response-body-empty'],
        recommendation: [
            'No action required - behavior matches contract',
            'Consider if 204 No Content status code would be more appropriate'
        ]
    },
    '1-1-0': {
        type: 'SCHEMA_VALIDATION_ERROR',
        description: 'The API response is not valid and does not conform to the contract schema.',
        severityLevel: 4,
        severityName: 'HIGH',
        tags: ['response-body-validation', 'contract-violation', 'response-body-not-valid', 'schema-not-match'],
        recommendation: [
            'Fix the API response to match the contract schema',
            'Update the contract if the response intentionally changed',
            'Review the data serialization logic on the server'
        ]
    },
    '1-1-1': {
        type: 'SCHEMA_VALIDATION_SUCCESS',
        description: 'The API response is valid and conforms to the contract schema.',
        severityLevel: 1,
        severityName: 'INFO',
        tags: ['response-body-validation', 'contract-validation', 'response-body-valid', 'schema-match'],
        recommendation: [
            'Continue monitoring for schema compliance',
            'Consider adding more strict validation rules if needed'
        ]
    },
    '0-0-1': {
        type: 'UNREADABLE_RESPONSE_PAYLOAD',
        description: 'The API response body cannot be parsed or interpreted. This may indicate binary data, encryption, compression, encoding issues, or a malformed response.',
        severityLevel: 2,
        severityName: 'LOW',
        tags: ['response-body-validation', 'response-body-unreadable', 'parsing-error'],
        recommendation: [
            'Check if the API is returning the correct Content-Type header',
            'Verify the response encoding matches the declared charset',
            'Ensure the response body is not compressed when not expected',
            'Review if binary responses (images, PDFs) are intentional for this endpoint',
            'Check for server-side errors causing malformed responses',
            'Validate the response against expected format (JSON, XML, etc.)'
        ]
    }
} as const;