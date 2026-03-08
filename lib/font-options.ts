export type FontCategory = "sans-serif" | "serif" | "mono";

export const FONT_CATEGORY_LABELS: Record<FontCategory, string> = {
  "sans-serif": "Sans-Serif",
  serif: "Serif",
  mono: "Mono",
};

export const FONT_OPTIONS = [
  {
    value: "geist-sans",
    label: "Geist Sans",
    category: "sans-serif",
    stack: "var(--font-geist-sans), Arial, Helvetica, system-ui, sans-serif",
  },
  {
    value: "arial",
    label: "Arial",
    category: "sans-serif",
    stack: "Arial, Helvetica, sans-serif",
  },
  {
    value: "calibri",
    label: "Calibri",
    category: "sans-serif",
    stack: "Calibri, Candara, 'Segoe UI', Arial, sans-serif",
  },
  {
    value: "helvetica",
    label: "Helvetica",
    category: "sans-serif",
    stack: "Helvetica, Arial, sans-serif",
  },
  {
    value: "verdana",
    label: "Verdana",
    category: "sans-serif",
    stack: "Verdana, Geneva, sans-serif",
  },
  {
    value: "trebuchet-ms",
    label: "Trebuchet MS",
    category: "sans-serif",
    stack: "'Trebuchet MS', Helvetica, Arial, sans-serif",
  },
  {
    value: "georgia",
    label: "Georgia",
    category: "serif",
    stack: "Georgia, 'Times New Roman', serif",
  },
  {
    value: "times-new-roman",
    label: "Times New Roman",
    category: "serif",
    stack: "'Times New Roman', Times, serif",
  },
  {
    value: "cambria",
    label: "Cambria",
    category: "serif",
    stack: "Cambria, Georgia, serif",
  },
  {
    value: "garamond",
    label: "Garamond",
    category: "serif",
    stack: "Garamond, Baskerville, 'Times New Roman', serif",
  },
  {
    value: "geist-mono",
    label: "Geist Mono",
    category: "mono",
    stack: "var(--font-geist-mono), Consolas, 'Courier New', monospace",
  },
  {
    value: "consolas",
    label: "Consolas",
    category: "mono",
    stack: "Consolas, 'Liberation Mono', Menlo, Monaco, 'Courier New', monospace",
  },
  {
    value: "courier-new",
    label: "Courier New",
    category: "mono",
    stack: "'Courier New', Courier, monospace",
  },
] as const satisfies readonly {
  value: string;
  label: string;
  category: FontCategory;
  stack: string;
}[];

export type FontFamily = (typeof FONT_OPTIONS)[number]["value"];
type LegacyFontFamily = "sans" | "serif" | "mono";

export const DEFAULT_FONT_FAMILY: FontFamily = "georgia";
export const FONT_FAMILY_VALUES = FONT_OPTIONS.map((option) => option.value) as FontFamily[];

const FONT_OPTION_MAP = FONT_OPTIONS.reduce(
  (accumulator, option) => {
    accumulator[option.value] = option;
    return accumulator;
  },
  {} as Record<FontFamily, (typeof FONT_OPTIONS)[number]>
);

const LEGACY_FONT_FAMILY_MAP: Record<LegacyFontFamily, FontFamily> = {
  sans: "geist-sans",
  serif: "georgia",
  mono: "geist-mono",
};

export const FONT_OPTION_GROUPS = (
  Object.keys(FONT_CATEGORY_LABELS) as FontCategory[]
).map((category) => ({
  category,
  label: FONT_CATEGORY_LABELS[category],
  options: FONT_OPTIONS.filter((option) => option.category === category),
}));

export const normalizeFontFamily = (
  value: unknown,
  fallback: FontFamily = DEFAULT_FONT_FAMILY
): FontFamily => {
  if (typeof value !== "string" || !value) {
    return fallback;
  }
  if (value in LEGACY_FONT_FAMILY_MAP) {
    return LEGACY_FONT_FAMILY_MAP[value as LegacyFontFamily];
  }
  return Object.prototype.hasOwnProperty.call(FONT_OPTION_MAP, value)
    ? (value as FontFamily)
    : fallback;
};

export const getFontOption = (value: unknown) =>
  FONT_OPTION_MAP[normalizeFontFamily(value)];

export const getFontStack = (value: unknown) => getFontOption(value).stack;
