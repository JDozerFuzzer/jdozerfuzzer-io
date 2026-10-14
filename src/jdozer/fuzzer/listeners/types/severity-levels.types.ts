

export interface SeverityLevel {
    name: string;
    value: number;
};

export type Severity = "critical" | "high" | "medium" | "low" | "info";

export const DEFAULT_SEVERITY_LEVELS: SeverityLevel[] = [
    { name: "info", value: 0 },
    { name: "low", value: 1 },
    { name: "medium", value: 2 },
    { name: "high", value: 3 },
    { name: "critical", value: 4 },
];

export const SeverityTypes = {
    info: { name: "info", value: 0 },
    low: { name: "low", value: 1 },
    medium: { name: "medium", value: 2 },
    high: { name: "high", value: 3 },
    critical: { name: "critical", value: 4 }
};