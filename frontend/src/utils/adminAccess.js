const STORAGE_KEYS = {
  roles: "admin-role-definitions",
  audit: "admin-audit-log",
  userRoleOverrides: "admin-user-role-overrides",
};

export const ACCESS_ITEMS = [
  { key: "Dashboard", label: "Панель управления", public: true },
  { key: "Assistant", label: "Аналитический ассистент" },
  { key: "AILab", label: "ИИ-лаборатория" },
  { key: "AdvancedAnalytics", label: "Продвинутая аналитика" },
  { key: "CyberSecurity", label: "Кибербезопасность" },
  { key: "Messenger", label: "Мессенджер" },
  { key: "DataSources", label: "Источники данных" },
  { key: "DataTransformation", label: "Преобразование данных" },
  { key: "Lineyka", label: "Линейка" },
  { key: "Maps", label: "Карты" },
  { key: "Charts", label: "Графики" },
  { key: "Forecasting", label: "Прогнозирование" },
  { key: "NetworkGraphs", label: "Графы связей" },
  { key: "Constructor", label: "Конструктор" },
  { key: "Settings", label: "Настройки" },
  { key: "Admin", label: "Администрирование" },
];

const DEFAULT_STANDARD_ACCESS = ACCESS_ITEMS.filter((item) => !item.public && item.key !== "CyberSecurity" && item.key !== "Admin").map((item) => item.key);
const DEFAULT_SECURITY_ACCESS = ACCESS_ITEMS.filter((item) => !item.public && item.key !== "Admin" && item.key !== "Messenger").map((item) => item.key);
const DEFAULT_ADMIN_ACCESS = ACCESS_ITEMS.filter((item) => !item.public).map((item) => item.key);

export const SYSTEM_ROLES = ["admin", "security", "security_viewer", "user"];

const DEFAULT_ROLE_DEFINITIONS = [
  {
    key: "admin",
    label: "Администратор",
    description: "Полный доступ к разделам платформы и управлению ролями.",
    system: true,
    access: DEFAULT_ADMIN_ACCESS,
  },
  {
    key: "security",
    label: "Безопасность",
    description: "Доступ к аналитике, настройкам и разделу кибербезопасности.",
    system: true,
    access: [...DEFAULT_SECURITY_ACCESS, "Messenger"],
  },
  {
    key: "security_viewer",
    label: "Наблюдатель ИБ",
    description: "Просмотр защитных разделов и аналитики без доступа к администрированию.",
    system: true,
    access: DEFAULT_SECURITY_ACCESS,
  },
  {
    key: "user",
    label: "Пользователь",
    description: "Базовый доступ к рабочим разделам без администрирования и ИБ.",
    system: true,
    access: DEFAULT_STANDARD_ACCESS,
  },
];

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStorage(key, fallback) {
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (_error) {
    return fallback;
  }
}

function writeStorage(key, value) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent("admin-access-updated"));
}

function normalizeRoleDefinition(role) {
  return {
    key: String(role.key || "").trim(),
    label: String(role.label || role.key || "").trim(),
    description: String(role.description || "").trim(),
    system: Boolean(role.system),
    access: Array.from(new Set((role.access || []).filter(Boolean))),
  };
}

function mergeSystemRoleDefinition(defaultRole, storedRole) {
  if (!storedRole) {
    return defaultRole;
  }
  const normalizedStored = normalizeRoleDefinition(storedRole);
  return {
    ...defaultRole,
    ...normalizedStored,
    access: Array.from(new Set([...(defaultRole.access || []), ...(normalizedStored.access || [])])),
  };
}

export function slugifyRoleKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getRoleDefinitions() {
  const stored = readStorage(STORAGE_KEYS.roles, []);
  const storedMap = new Map((Array.isArray(stored) ? stored : []).map((item) => [item.key, normalizeRoleDefinition(item)]));

  return DEFAULT_ROLE_DEFINITIONS
    .map((role) => mergeSystemRoleDefinition(role, storedMap.get(role.key)))
    .concat(
      (Array.isArray(stored) ? stored : [])
        .map(normalizeRoleDefinition)
        .filter((role) => !DEFAULT_ROLE_DEFINITIONS.some((item) => item.key === role.key))
    );
}

export function saveRoleDefinitions(roles) {
  const normalized = roles.map(normalizeRoleDefinition).filter((role) => role.key);
  writeStorage(STORAGE_KEYS.roles, normalized);
  return normalized;
}

export function getRoleDefinitionMap() {
  return new Map(getRoleDefinitions().map((role) => [role.key, role]));
}

export function getRoleLabel(roleKey) {
  return getRoleDefinitionMap().get(roleKey)?.label || roleKey;
}

export function getUserRoleOverrides() {
  const overrides = readStorage(STORAGE_KEYS.userRoleOverrides, {});
  return overrides && typeof overrides === "object" ? overrides : {};
}

export function setUserRoleOverride(userId, role) {
  const overrides = getUserRoleOverrides();
  overrides[String(userId)] = role;
  writeStorage(STORAGE_KEYS.userRoleOverrides, overrides);
}

export function clearUserRoleOverride(userId) {
  const overrides = getUserRoleOverrides();
  delete overrides[String(userId)];
  writeStorage(STORAGE_KEYS.userRoleOverrides, overrides);
}

export function resolveUserRole(user) {
  if (!user) return null;
  const overrides = getUserRoleOverrides();
  const override = overrides[String(user.id)] || overrides[String(user.email)];
  return override || user.role || "user";
}

export function canRoleAccess(roleKey, accessKey) {
  if (!accessKey) return true;
  const item = ACCESS_ITEMS.find((entry) => entry.key === accessKey);
  if (item?.public) return true;
  const role = getRoleDefinitionMap().get(roleKey);
  return Boolean(role?.access?.includes(accessKey));
}

export function getAuditLog() {
  const items = readStorage(STORAGE_KEYS.audit, []);
  if (!Array.isArray(items)) return [];
  return items
    .filter(Boolean)
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
}

export function appendAuditLog(entry) {
  const next = [
    {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      created_at: new Date().toISOString(),
      ...entry,
    },
    ...getAuditLog(),
  ].slice(0, 250);
  writeStorage(STORAGE_KEYS.audit, next);
  return next[0];
}
