const RAW_API_BASE = (import.meta?.env?.VITE_API_BASE ?? '').trim();

const NORMALIZED_API_BASE = RAW_API_BASE.replace(/\/+$/, '');
const API_PATH_PREFIX = '/api';

export function buildApiUrl(path, base = NORMALIZED_API_BASE) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (!base) {
    return normalizedPath;
  }

  const trimmedBase = base.replace(/\/+$/, '');

  if (trimmedBase.endsWith(API_PATH_PREFIX) && normalizedPath.startsWith(`${API_PATH_PREFIX}/`)) {
    return `${trimmedBase}${normalizedPath.slice(API_PATH_PREFIX.length)}`;
  }

  return `${trimmedBase}${normalizedPath}`;
}

export async function jsonRequest(path, options = {}, base = NORMALIZED_API_BASE) {
  const url = buildApiUrl(path, base);
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message;
    try {
      message = await response.text();
    } catch (error) {
      message = response.statusText;
    }
    throw new Error(message || 'Request failed');
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

