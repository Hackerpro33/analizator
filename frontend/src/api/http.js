const RAW_API_BASE = (import.meta?.env?.VITE_API_BASE ?? '').trim();

const NORMALIZED_API_BASE = RAW_API_BASE.replace(/\/+$/, '');
const API_PATH_PREFIX = '/api/v1';

function normalizePath(path) {
  if (!path) return API_PATH_PREFIX;
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const trimmed = path.startsWith('/') ? path : `/${path}`;
  const [pathname, query = ''] = trimmed.split('?');
  let normalizedPath = pathname;
  if (pathname.startsWith(API_PATH_PREFIX)) {
    normalizedPath = pathname;
  } else if (pathname === '/api') {
    normalizedPath = API_PATH_PREFIX;
  } else if (pathname.startsWith('/api/')) {
    normalizedPath = `${API_PATH_PREFIX}${pathname.slice(4)}`;
  } else {
    normalizedPath = `${API_PATH_PREFIX}${pathname}`;
  }
  return query ? `${normalizedPath}?${query}` : normalizedPath;
}

export function buildApiUrl(path, base = NORMALIZED_API_BASE) {
  const normalizedPath = normalizePath(path);

  if (!base) {
    return normalizedPath;
  }

  const trimmedBase = base.replace(/\/+$/, '');

  if (normalizedPath.startsWith(API_PATH_PREFIX) && trimmedBase.endsWith(API_PATH_PREFIX)) {
    return `${trimmedBase}${normalizedPath.slice(API_PATH_PREFIX.length)}`;
  }

  return `${trimmedBase}${normalizedPath}`;
}

export function buildWsUrl(path, base = NORMALIZED_API_BASE) {
  const httpUrl = buildApiUrl(path, base);
  if (/^https?:\/\//i.test(httpUrl)) {
    return httpUrl.replace(/^http/i, 'ws');
  }
  if (typeof window !== 'undefined' && window.location) {
    const origin = window.location.origin.replace(/^http/i, 'ws');
    const normalized = httpUrl.startsWith('/') ? httpUrl : `/${httpUrl}`;
    return `${origin}${normalized}`;
  }
  return httpUrl;
}

export async function jsonRequest(path, options = {}, base = NORMALIZED_API_BASE) {
  const url = buildApiUrl(path, base);
  const { headers, credentials = 'include', ...rest } = options;
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
    credentials,
    ...rest,
  });

  if (!response.ok) {
    let message;
    try {
      message = await response.text();
    } catch (_error) {
      message = response.statusText;
    }
    throw new Error(message || 'Request failed');
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}
