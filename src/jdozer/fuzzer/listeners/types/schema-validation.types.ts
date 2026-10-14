import { Logger } from "@nestjs/common";
import { Severity, SeverityLevel, DEFAULT_SEVERITY_LEVELS } from "./severity-levels.types";

/**
 * Ajv validation error shape (as produced by Ajv's `ErrorObject`).
 * Only the fields we actually consume are typed here; Ajv exposes more.
 */
export interface AjvErrorObject {
    instancePath: string;
    schemaPath: string;
    keyword: string;
    params: Record<string, unknown>;
    message?: string;
    schema?: unknown;
    parentSchema?: unknown;
    data?: unknown;
}

/**
 * Fuzzing-oriented classification of a single Ajv validation finding.
 */
export interface FindingClassification {
    severity: Severity;
    findingType: FindingType;
    description: string;
    tags: string[];
}

/**
export type Severity = "critical" | "high" | "medium" | "low" | "info";

export const DEFAULT_SEVERITY_LEVELS: SeverityLevel[] = [
    { name: "info", value: 1 },
    { name: "low", value: 2 },
    { name: "medium", value: 3 },
    { name: "high", value: 4 },
    { name: "critical", value: 5 },
];

export interface SeverityLevel {
    name: string;
    value: number;
}
*/

export interface SeverityMetric {
    /** Number of observations. */
    count: number;
    /** Arithmetic mean of severityValue. */
    average: number;
    /** Median of severityValue. */
    median: number;
    /** Mode(s) — could be multimodal. Empty if no observations. */
    mode: number[];
    /** Min severityValue observed. */
    min: number;
    /** Max severityValue observed. */
    max: number;
    /** Sum of severityValue. */
    total: number;
    /** Frequency per severity level name (includes zero-count levels). */
    distribution: Record<string, number>;
    /** Name of the level whose value equals `average` (closest level). */
    averageLevelName: string | null;
    /** Name of the highest level observed in the input. */
    maxLevelName: string | null;
    /** How many observations were 'info' (value = 0). */
    informativeCount: number;
}

export type FindingType =
    | "schema_violation"
    | "type_mismatch"
    | "missing_required_property"
    | "unexpected_property"
    | "constraint_violation"
    | "format_violation"
    | "enum_violation"
    | "structural_violation"
    | "unknown";

/**
 * Maps an Ajv validation error into a fuzzing-oriented finding classification.
 *
 * The classification is keyword-driven: Ajv's `keyword` field identifies the
 * violated JSON Schema constraint, which we translate into severity, finding
 * type, a human-readable description, and fuzzing-relevant tags.
 */
export class AjvFindingClassifier {

    private readonly log: Logger = new Logger(AjvFindingClassifier.name);

    /**
     * @param error A single Ajv `ErrorObject`.
     * @returns The fuzzing-oriented classification of the finding.
     */
    public classify(error: AjvErrorObject): FindingClassification {
        const keyword = (error.keyword || "").toLowerCase();
        const path = error.instancePath || "/";
        const message = error.message ?? "validation failed";

        switch (keyword) {
            case "type":
                return this.build(
                    "high",
                    "type_mismatch",
                    `Type mismatch at '${path}': ${message}.`,
                    ["type", "schema-violation", "input-validation"],
                );

            case "required":
                return this.build(
                    "high",
                    "missing_required_property",
                    `Missing required property at '${path}': ${message}.`,
                    ["required", "schema-violation", "missing-field"],
                );

            case "additionalproperties":
                return this.build(
                    "medium",
                    "unexpected_property",
                    `Unexpected property at '${path}': ${message}.`,
                    ["additionalProperties", "schema-violation", "unexpected-field"],
                );

            case "enum":
                return this.build(
                    "medium",
                    "enum_violation",
                    `Value not in allowed enum at '${path}': ${message}.`,
                    ["enum", "schema-violation", "boundary"],
                );

            case "format":
                return this.build(
                    "medium",
                    "format_violation",
                    `Format constraint violated at '${path}': ${message}.`,
                    ["format", "schema-violation", "input-validation"],
                );

            case "const":
                return this.build(
                    "medium",
                    "constraint_violation",
                    `Constant value constraint violated at '${path}': ${message}.`,
                    ["const", "schema-violation", "constraint"],
                );

            case "minimum":
            case "maximum":
            case "exclusiveminimum":
            case "exclusivemaximum":
                return this.build(
                    "medium",
                    "constraint_violation",
                    `Numeric boundary violated at '${path}': ${message}.`,
                    ["numeric", "boundary", "constraint", "fuzz-vector"],
                );

            case "minlength":
            case "maxlength":
                return this.build(
                    "medium",
                    "constraint_violation",
                    `String length constraint violated at '${path}': ${message}.`,
                    ["string", "length", "boundary", "fuzz-vector"],
                );

            case "minitems":
            case "maxitems":
                return this.build(
                    "medium",
                    "constraint_violation",
                    `Array size constraint violated at '${path}': ${message}.`,
                    ["array", "size", "boundary", "fuzz-vector"],
                );

            case "pattern":
                return this.build(
                    "medium",
                    "constraint_violation",
                    `Pattern constraint violated at '${path}': ${message}.`,
                    ["pattern", "regex", "constraint", "input-validation"],
                );

            case "multipleof":
                return this.build(
                    "low",
                    "constraint_violation",
                    `MultipleOf constraint violated at '${path}': ${message}.`,
                    ["numeric", "constraint"],
                );

            case "uniqueitems":
                return this.build(
                    "low",
                    "constraint_violation",
                    `UniqueItems constraint violated at '${path}': ${message}.`,
                    ["array", "uniqueness", "constraint"],
                );

            case "minproperties":
            case "maxproperties":
                return this.build(
                    "low",
                    "constraint_violation",
                    `Object property count constraint violated at '${path}': ${message}.`,
                    ["object", "size", "constraint"],
                );

            case "dependencies":
            case "dependentrequired":
            case "dependentSchemas".toLowerCase():
                return this.build(
                    "medium",
                    "structural_violation",
                    `Dependency constraint violated at '${path}': ${message}.`,
                    ["dependencies", "structural", "schema-violation"],
                );

            case "anyof":
            case "oneof":
            case "allof":
            case "not":
                return this.build(
                    "high",
                    "structural_violation",
                    `Composite schema constraint violated at '${path}' (${keyword}): ${message}.`,
                    [keyword, "structural", "schema-violation", "composite"],
                );

            case "if":
            case "then":
            case "else":
                return this.build(
                    "medium",
                    "structural_violation",
                    `Conditional schema constraint violated at '${path}' (${keyword}): ${message}.`,
                    ["conditional", "structural", "schema-violation"],
                );

            default:
                return this.build(
                    "info",
                    "unknown",
                    `Unclassified validation error at '${path}' (keyword '${keyword}'): ${message}.`,
                    ["unknown", "schema-violation", keyword].filter(Boolean),
                );
        }
    }

    /**
     * Convenience helper: classify an array of Ajv errors.
     */
    public classifyAll(errors: AjvErrorObject[]): FindingClassification[] {
        return errors.map((error) => this.classify(error));
    }

    private build(
        severity: Severity,
        findingType: FindingType,
        description: string,
        tags: string[],
    ): FindingClassification {
        return {
            severity,
            findingType,
            description,
            tags: Array.from(new Set(tags)),
        };
    }

    /**
     * Computes an aggregate severity metric.
     *
     * - `null` / `undefined` / "" are treated as "not applicable" and ignored.
     * - "info" (value 0) IS counted as an observation.
     * - Unknown severity names are ignored for numeric metrics but tracked
     *   in `distribution` only if declared in `levels`.
     */
    public computeSeverityMetric(
        severities: Array<string | null | undefined>,
        levels: SeverityLevel[] = DEFAULT_SEVERITY_LEVELS,
    ): SeverityMetric {
        if (!levels || levels.length === 0) {
            throw new Error("Severity levels must not be empty.");
        }

        const nameToValue = new Map<string, number>();
        for (const level of levels) {
            if (nameToValue.has(level.name)) {
                throw new Error(`Duplicate severity level name: '${level.name}'.`);
            }
            nameToValue.set(level.name, level.value);
        }

        const distribution: Record<string, number> = {};
        for (const level of levels) distribution[level.name] = 0;

        const values: number[] = [];
        let informativeCount = 0;

        for (const raw of severities) {
            // null / undefined / "" → not applicable, ignored entirely.
            if (raw == null || raw === "") continue;

            const name = String(raw).toLowerCase();
            if (!(name in distribution)) continue; // unknown level, ignored

            distribution[name] += 1;
            const value = nameToValue.get(name)!;
            values.push(value);
            if (value === 0) informativeCount += 1;
        }

        const count = values.length;

        if (count === 0) {
            return {
                count: 0,
                average: 0,
                median: 0,
                mode: [],
                min: 0,
                max: 0,
                total: 0,
                distribution,
                averageLevelName: null,
                maxLevelName: null,
                informativeCount: 0,
            };
        }

        const total = values.reduce((acc, v) => acc + v, 0);
        const average = total / count;

        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(count / 2);
        const median =
            count % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

        const freq = new Map<number, number>();
        for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
        const maxFreq = Math.max(...freq.values());
        const mode = [...freq.entries()]
            .filter(([, f]) => f === maxFreq)
            .map(([v]) => v)
            .sort((a, b) => a - b);

        const min = sorted[0];
        const max = sorted[sorted.length - 1];

        const averageLevelName = this.closestLevelName(average, levels);
        const maxLevelName = levels.find((l) => l.value === max)?.name ?? null;

        return {
            count,
            average,
            median,
            mode,
            min,
            max,
            total,
            distribution,
            averageLevelName,
            maxLevelName,
            informativeCount,
        };
    }

    /**
     * Returns the name of the level whose numeric value is closest to `target`.
     * Ties are resolved in favor of the higher severity (fail-safe).
     */
    private closestLevelName(target: number, levels: SeverityLevel[]): string | null {
        let best: SeverityLevel | null = null;
        let bestDist = Infinity;
        for (const level of levels) {
            const dist = Math.abs(level.value - target);
            if (dist < bestDist || (dist === bestDist && best && level.value > best.value)) {
                best = level;
                bestDist = dist;
            }
        }
        return best?.name ?? null;
    }

}