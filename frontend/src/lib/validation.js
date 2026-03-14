export const MAX_NAME_LENGTH = 21;

export function clampName(value = "") {
  if (typeof value !== "string") {
    return "";
  }
  return value.slice(0, MAX_NAME_LENGTH);
}
