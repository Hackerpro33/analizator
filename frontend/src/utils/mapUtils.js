export const parseCoordinate = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.replace(",", ".").trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const parseNumericValue = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.replace(",", ".").trim();
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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
