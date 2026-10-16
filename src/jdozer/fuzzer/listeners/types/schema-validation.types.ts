import { Logger } from "@nestjs/common";
import { SeverityLevel, SeverityTypes, SeverityMetric, DEFAULT_SEVERITY_LEVELS } from "./severity-levels.types";

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
    severity: SeverityLevel;
    findingType: FindingType;
    description: string;
    tags: string[];
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
                    SeverityTypes.high,
                    "type_mismatch",
                    `Type mismatch at '${path}': ${message}.`,
                    ["type", "schema-violation", "input-validation"],
                );

            case "required":
                return this.build(
                    SeverityTypes.high,
                    "missing_required_property",
                    `Missing required property at '${path}': ${message}.`,
                    ["required", "schema-violation", "missing-field"],
                );

            case "additionalproperties":
                return this.build(
                    SeverityTypes.medium,
                    "unexpected_property",
                    `Unexpected property at '${path}': ${message}.`,
                    ["additionalProperties", "schema-violation", "unexpected-field"],
                );

            case "enum":
                return this.build(
                    SeverityTypes.medium,
                    "enum_violation",
                    `Value not in allowed enum at '${path}': ${message}.`,
                    ["enum", "schema-violation", "boundary"],
                );

            case "format":
                return this.build(
                    SeverityTypes.medium,
                    "format_violation",
                    `Format constraint violated at '${path}': ${message}.`,
                    ["format", "schema-violation", "input-validation"],
                );

            case "const":
                return this.build(
                    SeverityTypes.medium,
                    "constraint_violation",
                    `Constant value constraint violated at '${path}': ${message}.`,
                    ["const", "schema-violation", "constraint"],
                );

            case "minimum":
            case "maximum":
            case "exclusiveminimum":
            case "exclusivemaximum":
                return this.build(
                    SeverityTypes.medium,
                    "constraint_violation",
                    `Numeric boundary violated at '${path}': ${message}.`,
                    ["numeric", "boundary", "constraint", "fuzz-vector"],
                );

            case "minlength":
            case "maxlength":
                return this.build(
                    SeverityTypes.medium,
                    "constraint_violation",
                    `String length constraint violated at '${path}': ${message}.`,
                    ["string", "length", "boundary", "fuzz-vector"],
                );

            case "minitems":
            case "maxitems":
                return this.build(
                    SeverityTypes.medium,
                    "constraint_violation",
                    `Array size constraint violated at '${path}': ${message}.`,
                    ["array", "size", "boundary", "fuzz-vector"],
                );

            case "pattern":
                return this.build(
                    SeverityTypes.medium,
                    "constraint_violation",
                    `Pattern constraint violated at '${path}': ${message}.`,
                    ["pattern", "regex", "constraint", "input-validation"],
                );

            case "multipleof":
                return this.build(
                    SeverityTypes.low,
                    "constraint_violation",
                    `MultipleOf constraint violated at '${path}': ${message}.`,
                    ["numeric", "constraint"],
                );

            case "uniqueitems":
                return this.build(
                    SeverityTypes.low,
                    "constraint_violation",
                    `UniqueItems constraint violated at '${path}': ${message}.`,
                    ["array", "uniqueness", "constraint"],
                );

            case "minproperties":
            case "maxproperties":
                return this.build(
                    SeverityTypes.low,
                    "constraint_violation",
                    `Object property count constraint violated at '${path}': ${message}.`,
                    ["object", "size", "constraint"],
                );

            case "dependencies":
            case "dependentrequired":
            case "dependentSchemas".toLowerCase():
                return this.build(
                    SeverityTypes.medium,
                    "structural_violation",
                    `Dependency constraint violated at '${path}': ${message}.`,
                    ["dependencies", "structural", "schema-violation"],
                );

            case "anyof":
            case "oneof":
            case "allof":
            case "not":
                return this.build(
                    SeverityTypes.high,
                    "structural_violation",
                    `Composite schema constraint violated at '${path}' (${keyword}): ${message}.`,
                    [keyword, "structural", "schema-violation", "composite"],
                );

            case "if":
            case "then":
            case "else":
                return this.build(
                    SeverityTypes.medium,
                    "structural_violation",
                    `Conditional schema constraint violated at '${path}' (${keyword}): ${message}.`,
                    ["conditional", "structural", "schema-violation"],
                );

            default:
                return this.build(
                    SeverityTypes.info,
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
        severity: SeverityLevel,
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

}