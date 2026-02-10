export interface FieldLengthConstraint {
  maxLines: number;
  maxCharsPerLine: number;
  maxCharsTotal: number;
  availableWidthPx: number;
  fontSizePx: number;
  fontFamily: string;
  safetyBuffer: number;
}

export interface FieldLengthMetrics {
  availableWidthPx: number;
  fontSizePx: number;
  fontFamily: string;
  charWidthPx: number;
  safetyBuffer: number;
}

export interface ElementWordLength {
  index: number;
  word: string;
  charCount: number;
  start: number;
  end: number;
}

export interface ElementLengthProfile {
  path: string;
  text: string;
  maxLines: number;
  maxCharsPerLine: number;
  maxCharsTotal: number;
  usedLineCount: number;
  remainingLineCount: number;
  overflowLineCount: number;
  totalCharCount: number;
  remainingCharCount: number;
  overflowCharCount: number;
  words: ElementWordLength[];
}

export interface ElementLengthProfileInput {
  path: string;
  text: string;
  constraint?: FieldLengthConstraint | null;
}

export const DEFAULT_LINE_SAFETY_BUFFER = 0.97;
export const MIN_CHARS_PER_LINE = 8;

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

const normalizeTextForLineConstraints = (value: string) =>
  value.replace(/\r\n/g, "\n");

export const estimateWrappedLineCount = (
  value: string,
  maxCharsPerLine: number
): number => {
  if (maxCharsPerLine <= 0) return Number.POSITIVE_INFINITY;
  const normalized = normalizeTextForLineConstraints(value);
  if (!normalized.trim()) return 1;
  return normalized
    .split("\n")
    .reduce(
      (count, line) => count + Math.max(1, Math.ceil(line.length / maxCharsPerLine)),
      0
    );
};

export const calculateMaxCharsPerLine = (
  metrics: Pick<FieldLengthMetrics, "availableWidthPx" | "charWidthPx" | "safetyBuffer">,
  minCharsPerLine = MIN_CHARS_PER_LINE
) => {
  const safeCharWidth =
    Number.isFinite(metrics.charWidthPx) && metrics.charWidthPx > 0
      ? metrics.charWidthPx
      : 1;
  const estimated = Math.floor(
    (metrics.availableWidthPx * metrics.safetyBuffer) / safeCharWidth
  );
  return Math.max(minCharsPerLine, estimated);
};

export const buildFieldLengthConstraint = (
  metrics: FieldLengthMetrics,
  maxLines: number
): FieldLengthConstraint | null => {
  if (maxLines < 1) return null;
  const maxCharsPerLine = calculateMaxCharsPerLine(metrics);
  return {
    maxLines,
    maxCharsPerLine,
    maxCharsTotal: maxCharsPerLine * maxLines,
    availableWidthPx: metrics.availableWidthPx,
    fontSizePx: metrics.fontSizePx,
    fontFamily: metrics.fontFamily,
    safetyBuffer: metrics.safetyBuffer,
  };
};

export const extractElementWordLengths = (value: string): ElementWordLength[] => {
  const normalized = normalizeTextForLineConstraints(value);
  const words: ElementWordLength[] = [];
  const matcher = /\S+/g;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = matcher.exec(normalized))) {
    const word = match[0];
    const start = match.index;
    words.push({
      index,
      word,
      charCount: word.length,
      start,
      end: start + word.length,
    });
    index += 1;
  }
  return words;
};

export const buildElementLengthProfile = (
  path: string,
  text: string,
  constraint: FieldLengthConstraint
): ElementLengthProfile => {
  const normalizedText = normalizeTextForLineConstraints(text);
  const totalCharCount = normalizedText.length;
  const usedLineCount = estimateWrappedLineCount(
    normalizedText,
    constraint.maxCharsPerLine
  );
  const remainingLineCount = Math.max(0, constraint.maxLines - usedLineCount);
  const overflowLineCount = Math.max(0, usedLineCount - constraint.maxLines);
  const remainingCharCount = Math.max(0, constraint.maxCharsTotal - totalCharCount);
  const overflowCharCount = Math.max(0, totalCharCount - constraint.maxCharsTotal);

  return {
    path,
    text: normalizedText,
    maxLines: constraint.maxLines,
    maxCharsPerLine: constraint.maxCharsPerLine,
    maxCharsTotal: constraint.maxCharsTotal,
    usedLineCount,
    remainingLineCount,
    overflowLineCount,
    totalCharCount,
    remainingCharCount,
    overflowCharCount,
    words: extractElementWordLengths(normalizedText),
  };
};

export const buildElementLengthProfiles = (
  elements: ElementLengthProfileInput[]
): ElementLengthProfile[] => {
  return elements.flatMap((element) => {
    if (!element.constraint) return [];
    return [buildElementLengthProfile(element.path, element.text, element.constraint)];
  });
};
