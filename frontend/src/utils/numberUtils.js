const ALT_MINUS_SIGNS = /[\u2212\u2010-\u2015\uFE58\uFF0D]/g;
const WHITESPACE_SIGNS = /[\s\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000]/g;
const PERCENT_SIGNS = /[%％]/g;
const NUMERIC_PATTERN = /^[+-]?(?:\d+\.?\d*|\d*\.?\d+)(?:e[+-]?\d+)?$/i;

const normaliseString = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  let normalized = value
    .replace(ALT_MINUS_SIGNS, "-")
    .replace(/\uFF0E/g, ".") // full-width dot
    .replace(/\uFF0C/g, ",") // full-width comma
    .trim();

  if (!normalized) {
    return null;
  }

  let hasParenthesesNegative = false;
  const parenthesesMatch = normalized.match(/^\((.*)\)$/);
  if (parenthesesMatch) {
    hasParenthesesNegative = true;
    normalized = parenthesesMatch[1].trim();
  }

  normalized = normalized
    .replace(WHITESPACE_SIGNS, "")
    .replace(/,/g, ".")
    .replace(PERCENT_SIGNS, "");

  if (!normalized) {
    return null;
  }

  if (!NUMERIC_PATTERN.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  if (hasParenthesesNegative) {
    return -Math.abs(parsed);
  }

  return parsed;
};

export const parseNumberLike = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (value === null || value === undefined) {
    return null;
  }

  return normaliseString(String(value));
};
