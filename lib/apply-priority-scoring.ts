const MUST_HAVE_WEIGHT = 1.0;
const NICE_TO_HAVE_WEIGHT = 0.4;

const COVERAGE_FACTORS = {
  explicit: 1.0,
  partial: 0.6,
  none: 0.0,
} as const;

const FEASIBILITY_FACTORS = {
  feasible: 1.0,
  maybe: 0.5,
  not_feasible: 0.0,
} as const;

const STRICT_MULTIPLIER = 1.2;
const DEFAULT_MULTIPLIER = 1.0;

const STRICT_TYPES = new Set([
  "tool",
  "platform",
  "domain",
  "constraint",
  "education",
]);

export type AtomicUnitType =
  | "tool"
  | "platform"
  | "method"
  | "responsibility"
  | "domain"
  | "governance"
  | "leadership"
  | "commercial"
  | "education"
  | "constraint";

export type CoverageStatus = "explicit" | "partial" | "none";
export type Feasibility = "feasible" | "maybe" | "not_feasible";

export interface ScoringMatchedResumeRef {
  matchStrength?: number;
}

export interface ScoringAtomicUnit {
  id?: string;
  canonical?: string;
  type?: AtomicUnitType;
  weight?: number;
  mustHave?: boolean;
  coverageStatus?: CoverageStatus;
  feasibility?: Feasibility;
  matchedResumeRefs?: ScoringMatchedResumeRef[];
  gaps?: string[];
}

export interface ScoringBlocker {
  unitId: string;
  canonical: string;
  type: AtomicUnitType;
  reason: string;
}

export interface ScoringGapUnit {
  unitId: string;
  canonical: string;
  type: AtomicUnitType;
  weight: number;
  effectiveWeight: number;
  mustHave: boolean;
  coverageStatus: CoverageStatus;
  feasibility: Feasibility;
  reason: string;
}

export interface ApplyPriorityScoringResult {
  CurrentFit: number;
  AchievableFit: number;
  ApplyPriority: number;
  blockerCount: number;
  blockerWeightSum: number;
  blockers: ScoringBlocker[];
  topFeasibleGaps: ScoringGapUnit[];
  topNotFeasibleGaps: ScoringGapUnit[];
}

const DEFAULT_TYPE: AtomicUnitType = "responsibility";
const DEFAULT_COVERAGE: CoverageStatus = "none";
const DEFAULT_FEASIBILITY: Feasibility = "not_feasible";
const BLOCKER_REASON = "must-have strict requirement not evidenced in resume";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const clamp01 = (value: number) => clamp(value, 0, 1);
const clamp100 = (value: number) => clamp(value, 0, 100);

const round1 = (value: number) => Math.round(value * 10) / 10;

const normalizeString = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const normalizeType = (value: unknown): AtomicUnitType =>
  typeof value === "string" &&
  [
    "tool",
    "platform",
    "method",
    "responsibility",
    "domain",
    "governance",
    "leadership",
    "commercial",
    "education",
    "constraint",
  ].includes(value)
    ? (value as AtomicUnitType)
    : DEFAULT_TYPE;

const normalizeCoverage = (value: unknown): CoverageStatus =>
  value === "explicit" || value === "partial" || value === "none"
    ? value
    : DEFAULT_COVERAGE;

const normalizeFeasibility = (value: unknown): Feasibility =>
  value === "feasible" || value === "maybe" || value === "not_feasible"
    ? value
    : DEFAULT_FEASIBILITY;

const normalizeWeight = (value: unknown) =>
  typeof value === "number" ? clamp(value, 0, 100) : 0;

const getEvidenceBonus = (refs: ScoringMatchedResumeRef[] | undefined) => {
  if (!Array.isArray(refs) || refs.length === 0) return 0;
  let bonus = 0;
  for (const ref of refs) {
    const matchStrength = ref?.matchStrength;
    if (typeof matchStrength !== "number") continue;
    if (matchStrength > bonus) bonus = matchStrength;
  }
  return clamp01(bonus);
};

const getCoverageFactor = (coverageStatus: CoverageStatus) =>
  COVERAGE_FACTORS[coverageStatus] ?? 0;

const getFeasibilityFactor = (feasibility: Feasibility) =>
  FEASIBILITY_FACTORS[feasibility] ?? 0;

const isStrictType = (type: AtomicUnitType) => STRICT_TYPES.has(type);

interface DerivedUnit {
  unitId: string;
  canonical: string;
  type: AtomicUnitType;
  weight: number;
  mustHave: boolean;
  coverageStatus: CoverageStatus;
  feasibility: Feasibility;
  gaps: string[];
  effectiveWeight: number;
  upgradedCoverage: number;
  coverageFactor: number;
  feasibilityFactor: number;
  strictType: boolean;
}

const toDerivedUnit = (unit: ScoringAtomicUnit): DerivedUnit => {
  const type = normalizeType(unit.type);
  const strictType = isStrictType(type);
  const coverageStatus = normalizeCoverage(unit.coverageStatus);
  const feasibility = normalizeFeasibility(unit.feasibility);
  const coverageFactor = getCoverageFactor(coverageStatus);
  const feasibilityFactor = getFeasibilityFactor(feasibility);
  const weight = normalizeWeight(unit.weight);
  const mustHave = unit.mustHave === true;
  const baseMust = mustHave ? MUST_HAVE_WEIGHT : NICE_TO_HAVE_WEIGHT;
  const typeMult = strictType ? STRICT_MULTIPLIER : DEFAULT_MULTIPLIER;
  const effectiveWeight = weight * baseMust * typeMult;
  const evidenceBonus = strictType ? 0 : getEvidenceBonus(unit.matchedResumeRefs);
  const upgradedCoverage = strictType
    ? coverageFactor
    : Math.max(coverageFactor, 0.8 * evidenceBonus);

  return {
    unitId: normalizeString(unit.id, ""),
    canonical: normalizeString(unit.canonical, ""),
    type,
    weight,
    mustHave,
    coverageStatus,
    feasibility,
    gaps: Array.isArray(unit.gaps)
      ? unit.gaps.filter((gap): gap is string => typeof gap === "string")
      : [],
    effectiveWeight,
    upgradedCoverage,
    coverageFactor,
    feasibilityFactor,
    strictType,
  };
};

const compareGapUnits = (a: DerivedUnit, b: DerivedUnit) => {
  if (b.effectiveWeight !== a.effectiveWeight) {
    return b.effectiveWeight - a.effectiveWeight;
  }
  if (b.weight !== a.weight) return b.weight - a.weight;
  return a.canonical.localeCompare(b.canonical);
};

const toGapReason = (unit: DerivedUnit) => {
  if (unit.gaps.length > 0) return unit.gaps[0];
  if (unit.coverageStatus === "none") return "No resume evidence found";
  if (unit.coverageStatus === "partial") return "Only partial resume evidence found";
  return "Feasibility is limited";
};

const toGapUnit = (unit: DerivedUnit): ScoringGapUnit => ({
  unitId: unit.unitId,
  canonical: unit.canonical,
  type: unit.type,
  weight: round1(unit.weight),
  effectiveWeight: round1(unit.effectiveWeight),
  mustHave: unit.mustHave,
  coverageStatus: unit.coverageStatus,
  feasibility: unit.feasibility,
  reason: toGapReason(unit),
});

export const computeApplyPriorityScoring = (
  atomicUnits: ScoringAtomicUnit[]
): ApplyPriorityScoringResult => {
  const derivedUnits = Array.isArray(atomicUnits)
    ? atomicUnits.map(toDerivedUnit)
    : [];

  const denominator = derivedUnits.reduce(
    (sum, unit) => sum + unit.effectiveWeight,
    0
  );

  const currentNumerator = derivedUnits.reduce(
    (sum, unit) => sum + unit.effectiveWeight * clamp01(unit.upgradedCoverage),
    0
  );

  const achievableNumerator = derivedUnits.reduce((sum, unit) => {
    let achievableCoverage = unit.coverageFactor;
    if (!unit.strictType) {
      achievableCoverage = Math.max(
        unit.upgradedCoverage,
        0.8 * unit.feasibilityFactor
      );
      if (unit.coverageStatus !== "explicit") {
        achievableCoverage = Math.min(achievableCoverage, 0.8);
      }
    }
    return sum + unit.effectiveWeight * clamp01(achievableCoverage);
  }, 0);

  const rawCurrentFit =
    denominator > 0 ? clamp100((100 * currentNumerator) / denominator) : 0;
  const rawAchievableFit =
    denominator > 0 ? clamp100((100 * achievableNumerator) / denominator) : 0;

  let blockerWeightSum = 0;
  const blockers: ScoringBlocker[] = [];

  for (const unit of derivedUnits) {
    const isBlocker =
      unit.mustHave &&
      unit.strictType &&
      unit.coverageStatus !== "explicit" &&
      unit.feasibility === "not_feasible";

    if (!isBlocker) continue;
    blockerWeightSum += unit.weight;
    blockers.push({
      unitId: unit.unitId,
      canonical: unit.canonical,
      type: unit.type,
      reason: BLOCKER_REASON,
    });
  }

  const blockerPenalty = Math.min(40, blockerWeightSum / 5);
  const rawApplyPriority = clamp100(
    0.35 * rawCurrentFit + 0.65 * rawAchievableFit - blockerPenalty
  );

  const topFeasibleGaps = [...derivedUnits]
    .filter(
      (unit) =>
        unit.coverageStatus !== "explicit" &&
        (unit.feasibility === "feasible" || unit.feasibility === "maybe")
    )
    .sort(compareGapUnits)
    .slice(0, 5)
    .map(toGapUnit);

  const topNotFeasibleGaps = [...derivedUnits]
    .filter(
      (unit) =>
        unit.coverageStatus !== "explicit" && unit.feasibility === "not_feasible"
    )
    .sort(compareGapUnits)
    .slice(0, 5)
    .map(toGapUnit);

  return {
    CurrentFit: round1(rawCurrentFit),
    AchievableFit: round1(rawAchievableFit),
    ApplyPriority: round1(rawApplyPriority),
    blockerCount: blockers.length,
    blockerWeightSum: round1(blockerWeightSum),
    blockers,
    topFeasibleGaps,
    topNotFeasibleGaps,
  };
};
