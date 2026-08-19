// types/schema-validation.types.ts

export interface SchemaValidationFinding {
    /** Indica si el payload cumple con el esquema */
    isValid: boolean;
    /** Categoría del código de respuesta HTTP */
    statusCategory: '2xx' | '4xx' | '5xx';
    /** Código HTTP recibido */
    statusCode: number;
    /** Descripción del hallazgo */
    description: string;
    /** Nivel de criticidad (1 = baja, 5 = crítica) */
    severity: 1 | 2 | 3 | 4 | 5;
    /** Etiquetas para categorización */
    tags: string[];
    /** Recomendación para el desarrollador */
    recommendation: string;
    /** Tipo de hallazgo */
    findingType: 'valid-request-success' | 'valid-request-error' | 'invalid-request-accepted' | 'invalid-request-rejected' | 'valid-request-server-error' | 'invalid-request-server-error';
}

export const SchemaValidationFindings: Record<string, Omit<SchemaValidationFinding, 'statusCode'>> = {
    // ============ CASO 1: PAYLOAD VÁLIDO + 2xx ============
    'valid-2xx': {
        isValid: true,
        statusCategory: '2xx',
        severity: 1,
        findingType: 'valid-request-success',
        description: 'The request payload is valid according to the schema. The server responded with a 2xx success status code, indicating the request was accepted and processed correctly.',
        tags: ['success', 'valid-payload', '2xx', 'expected-behavior', 'contract-compliant'],
        recommendation: 'No action required. The API is behaving correctly by accepting valid requests.'
    },

    // ============ CASO 2: PAYLOAD VÁLIDO + 4xx ============
    'valid-4xx': {
        isValid: true,
        statusCategory: '4xx',
        severity: 2,
        findingType: 'valid-request-error',
        description: 'The request payload is valid according to the schema, but the server responded with a 4xx client error. This suggests the server is rejecting a request that should be accepted.',
        tags: ['error', 'valid-payload', '4xx', 'false-positive', 'potential-bug', 'needs-investigation'],
        recommendation: 'Investigate why a valid request is being rejected with a 4xx status code. This could indicate a server-side validation bug, a missing resource, or an authentication issue that should be documented.'
    },

    // ============ CASO 3: PAYLOAD VÁLIDO + 5xx ============
    'valid-5xx': {
        isValid: true,
        statusCategory: '5xx',
        severity: 3,
        findingType: 'valid-request-server-error',
        description: 'The request payload is valid according to the schema, but the server responded with a 5xx server error. This indicates an internal server error when processing a valid request.',
        tags: ['error', 'valid-payload', '5xx', 'server-error', 'high-severity', 'needs-urgent-fix'],
        recommendation: 'Critical: Investigate the internal server error. A valid request should never result in a 5xx status code. This indicates a bug in the server-side logic.'
    },

    // ============ CASO 4: PAYLOAD INVÁLIDO + 2xx ============
    'invalid-2xx': {
        isValid: false,
        statusCategory: '2xx',
        severity: 4,
        findingType: 'invalid-request-accepted',
        description: 'The request payload is invalid according to the schema, but the server responded with a 2xx success status code. This is a serious security vulnerability as the system is accepting malformed or malicious data.',
        tags: ['critical', 'invalid-payload', '2xx', 'security-vulnerability', 'false-negative', 'high-severity'],
        recommendation: 'CRITICAL: The server is accepting and processing invalid data. This could lead to data corruption, injection attacks, or business logic bypass. Immediate action is required to enforce schema validation on the server side.'
    },

    // ============ CASO 5: PAYLOAD INVÁLIDO + 4xx ============
    'invalid-4xx': {
        isValid: false,
        statusCategory: '4xx',
        severity: 1,
        findingType: 'invalid-request-rejected',
        description: 'The request payload is invalid according to the schema, and the server correctly responded with a 4xx client error. This is the expected behavior for invalid requests.',
        tags: ['success', 'invalid-payload', '4xx', 'expected-behavior', 'security-compliant'],
        recommendation: 'No action required. The API is correctly rejecting invalid requests with appropriate status codes.'
    },

    // ============ CASO 6: PAYLOAD INVÁLIDO + 5xx ============
    'invalid-5xx': {
        isValid: false,
        statusCategory: '5xx',
        severity: 3,
        findingType: 'invalid-request-server-error',
        description: 'The request payload is invalid according to the schema, but the server responded with a 5xx server error. Invalid input should be rejected gracefully, not cause server failures.',
        tags: ['error', 'invalid-payload', '5xx', 'server-error', 'unexpected-behavior', 'needs-fix'],
        recommendation: 'Investigate why invalid requests are causing internal server errors. Invalid inputs should be caught and rejected with appropriate 4xx status codes, not propagate to cause server crashes.'
    }
};