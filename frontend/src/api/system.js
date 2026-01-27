import { jsonRequest, buildApiUrl } from './http';

export function fetchSystemMetrics() {
  return jsonRequest('/api/system/metrics');
}

export function fetchSystemLogs(params = {}) {
  const query = new URLSearchParams();
  if (params.limit) query.set('limit', params.limit);
  if (params.level && params.level !== 'all') query.set('level', params.level);
  if (params.query) query.set('query', params.query);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return jsonRequest(`/api/system/logs${suffix}`);
}

export async function downloadSystemLogs(params = {}) {
  const query = new URLSearchParams();
  if (params.level && params.level !== 'all') query.set('level', params.level);
  if (params.query) query.set('query', params.query);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const url = buildApiUrl(`/api/system/logs/download${suffix}`);
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Не удалось скачать логи');
  }
  const blob = await response.blob();
  const filename = params.filename || `system_logs_${new Date().toISOString().slice(0, 10)}.log`;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
