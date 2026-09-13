

export interface ContractDriftStatusCodeFinding {
    matchType: 'exact' | 'wildcard' | 'default' | '5xx' | 'none';
    description: string;
    severity: 1 | 2 | 3 | 4 | 5;
    severityName: string;
    tags: string[];
    recommendation: string;
}

export const ContractDriftStatusCodeFindings: Record<string, Omit<ContractDriftStatusCodeFinding, 'responseId' | 'receivedStatusCode' | 'expectedStatusCode'>> = {
    exact: {
        matchType: 'exact',
        severity: 1,
        severityName: 'info',
        description: 'The received HTTP status code exactly matches one defined in the OpenAPI contract for this operation.',
        tags: ['success', 'valid', 'exact-match', 'contract-compliant'],
        recommendation: 'No action required. The API response is fully compliant with the contract.'
    },

    wildcard: {
        matchType: 'wildcard',
        severity: 2,
        severityName: 'info',
        description: 'The received HTTP status code matches a wildcard pattern (e.g., 4XX, 5XX) defined in the OpenAPI contract, but not an exact code.',
        tags: ['warning', 'wildcard-match', 'partial-compliant', 'needs-review'],
        recommendation: 'Consider defining the specific status code in the contract for better precision. Wildcards are acceptable but less explicit.'
    },

    default: {
        matchType: 'default',
        severity: 3,
        severityName: 'low',
        description: 'The received HTTP status code does not match any defined response, but the OpenAPI contract provides a "default" response that applies to this status code.',
        tags: ['warning', 'default-match', 'fallback', 'needs-clarification'],
        recommendation: 'Review if the "default" response is appropriate for this specific status code. Consider adding explicit definitions for common status codes.'
    },

    '5xx': {
        matchType: '5xx',
        severity: 4,
        severityName: 'medium',
        description: 'The received HTTP status code is a 5xx server error, but the OpenAPI contract does not define any explicit 5xx responses or a wildcard for this category.',
        tags: ['error', 'server-error', 'unexpected', 'security-risk', 'high-severity'],
        recommendation: 'Add explicit 5xx error responses to the OpenAPI contract. Server errors should always be documented to inform clients about failure scenarios.'
    },

    none: {
        matchType: 'none',
        severity: 5,
        severityName: 'high',
        description: 'The received HTTP status code is not defined in the OpenAPI contract. No exact match, wildcard, or default response exists for this status code.',
        tags: ['error', 'unexpected', 'undocumented', 'needs-fix', 'contract-drift'],
        recommendation: 'Update the OpenAPI contract to include this HTTP status code. Clients relying on the contract will not anticipate this response.'
    }
};