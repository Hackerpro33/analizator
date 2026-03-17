const STORAGE_KEY = "remembered-login-account";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadRememberedAccount() {
  if (!canUseStorage()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const email = typeof parsed.email === "string" ? parsed.email.trim() : "";
    return email ? { email } : null;
  } catch (_error) {
    return null;
  }
}

export function saveRememberedAccount(email) {
  if (!canUseStorage()) return;
  const normalizedEmail = String(email || "").trim();
  if (!normalizedEmail) {
    clearRememberedAccount();
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ email: normalizedEmail }));
}

export function clearRememberedAccount() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}
