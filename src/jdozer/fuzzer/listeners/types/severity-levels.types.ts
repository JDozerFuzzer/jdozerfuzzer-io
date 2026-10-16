import { LogLevel } from "@nestjs/common";

export interface SeverityLevel {
    name: string;
    value: number;
};

export const INFO: SeverityLevel = { name: "info", value: 0 };
export const LOW: SeverityLevel = { name: "low", value: 1 };
export const MEDIUM: SeverityLevel = { name: "medium", value: 2 };
export const HIGH: SeverityLevel = { name: "high", value: 3 };
export const CRITICAL: SeverityLevel = { name: "critical", value: 4 };

export const SeverityTypes = {
    info: INFO,
    low: LOW,
    medium: MEDIUM,
    high: HIGH,
    critical: CRITICAL
};

export const DEFAULT_SEVERITY_LEVELS: SeverityLevel[] = [
    INFO,
    LOW,
    MEDIUM,
    HIGH,
    CRITICAL
];

export interface SeverityMetric {
    /** Number of observations. */
    count: number;
    /** Arithmetic mean of severityValue. */
    average: number;
    /** Median of severityValue. */
    median: number;
    /** Mode(s) — could be multimodal. Empty if no observations. */
    mode: SeverityLevel[];
    /** Min severityValue observed. */
    min: number;
    /** Max severityValue observed. */
    max: number;
    /** Sum of severityValue. */
    total: number;
    /** Frequency per severity level name (includes zero-count levels). */
    distribution: Record<string, number>;
    /** Name of the level whose value equals `average` (closest level). */
    averageLevel: SeverityLevel | null;
    /** Name of the highest level observed in the input. */
    maxLevel: SeverityLevel | null;
    /** How many observations were 'info' (value = 0). */
    informativeCount: number;
}

export class SeverityLevelCompute {
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
                averageLevel: null,
                maxLevel: null,
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

        const averageLevel = this.closestLevelName(average, levels);
        const maxLevel = levels.find((l) => l.value === max) ?? null;

        return {
            count,
            average,
            median,
            mode: DEFAULT_SEVERITY_LEVELS.filter((l: SeverityLevel) => mode.includes(l.value)),
            min,
            max,
            total,
            distribution,
            averageLevel,
            maxLevel,
            informativeCount,
        };
    }

    /**
     * Returns the name of the level whose numeric value is closest to `target`.
     * Ties are resolved in favor of the higher severity (fail-safe).
     */
    private closestLevelName(target: number, levels: SeverityLevel[]): SeverityLevel | null {
        let best: SeverityLevel | null = null;
        let bestDist = Infinity;
        for (const level of levels) {
            const dist = Math.abs(level.value - target);
            if (dist < bestDist || (dist === bestDist && best && level.value > best.value)) {
                best = level;
                bestDist = dist;
            }
        }
        return best ?? null;
    }
}