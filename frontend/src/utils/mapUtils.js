import { parseNumberLike } from "./numberUtils";

export const parseCoordinate = (value) => {
  return parseNumberLike(value);
};

export const parseNumericValue = (value) => {
  return parseNumberLike(value);
};

export const findFirstValue = (point, candidates = []) => {
  for (const key of candidates) {
    if (!key) continue;
    const value = point?.[key];
    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }
  return undefined;
};

export const findNameField = (point) => {
  const entries = Object.entries(point || {});
  const candidate = entries.find(([key]) => {
    const normalized = key.toLowerCase();
    return (
      normalized.includes("name") ||
      normalized.includes("region") ||
      normalized.includes("city") ||
      normalized.includes("location")
    );
  });

  return candidate ? candidate[1] : undefined;
};
