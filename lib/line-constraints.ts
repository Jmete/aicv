export interface FieldLengthConstraint {
  maxLines: number;
  maxCharsPerLine: number;
  maxCharsTotal: number;
  availableWidthPx: number;
  fontSizePx: number;
  fontFamily: string;
  safetyBuffer: number;
}

export const DEFAULT_LINE_SAFETY_BUFFER = 0.97;

export const getFontSafetyBuffer = (fontFamily: string): number => {
  const normalized = fontFamily.toLowerCase();
  if (normalized.includes("mono")) {
    return 0.995;
  }
  if (
    normalized.includes("georgia") ||
    normalized.includes("times") ||
    normalized.includes("serif")
  ) {
    return 0.97;
  }
  if (normalized.includes("geist") || normalized.includes("sans")) {
    return 0.98;
  }
  return DEFAULT_LINE_SAFETY_BUFFER;
};

export const estimateWrappedLineCount = (
  value: string,
  maxCharsPerLine: number
): number => {
  if (maxCharsPerLine <= 0) return Number.POSITIVE_INFINITY;
  const normalized = value.replace(/\r\n/g, "\n");
  if (!normalized.trim()) return 1;
  return normalized
    .split("\n")
    .reduce(
      (count, line) => count + Math.max(1, Math.ceil(line.length / maxCharsPerLine)),
      0
    );
};
