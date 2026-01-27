import { jsonRequest, buildApiUrl } from './http';

export function listLineykaDatasets() {
  return jsonRequest('/api/lineyka/datasets');
}

export function listLineykaVersions(datasetId) {
  return jsonRequest(`/api/lineyka/datasets/${datasetId}/versions`);
}

export function fetchLineykaVersion(datasetId, versionId) {
  return jsonRequest(`/api/lineyka/datasets/${datasetId}/versions/${versionId}`);
}

export function queryLineykaData(datasetId, versionId, payload) {
  return jsonRequest(`/api/lineyka/datasets/${datasetId}/versions/${versionId}/query`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchLineykaColumnValues(datasetId, versionId, column, params = {}) {
  const search = new URLSearchParams();
  if (params.search) {
    search.set('search', params.search);
  }
  if (params.limit) {
    search.set('limit', params.limit);
  }
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return jsonRequest(`/api/lineyka/datasets/${datasetId}/versions/${versionId}/values/${encodeURIComponent(column)}${suffix}`);
}

export function applyLineykaOperations(datasetId, versionId, operations) {
  return jsonRequest(`/api/lineyka/datasets/${datasetId}/versions/${versionId}/transform`, {
    method: 'POST',
    body: JSON.stringify({ operations }),
  });
}

export function revertLineykaVersion(datasetId, versionId, targetVersionId, reason) {
  return jsonRequest(`/api/lineyka/datasets/${datasetId}/versions/${versionId}/revert`, {
    method: 'POST',
    body: JSON.stringify({
      target_version_id: targetVersionId,
      reason,
    }),
  });
}

export function exportLineykaHistory(datasetId) {
  return jsonRequest(`/api/lineyka/datasets/${datasetId}/history/export`);
}

export async function exportLineykaVersion(datasetId, versionId, format = 'csv') {
  const url = buildApiUrl(`/api/lineyka/datasets/${datasetId}/versions/${versionId}/export?format=${format}`);
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error('Не удалось экспортировать версию');
  }
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match ? match[1] : `lineyka-${datasetId}.${format}`;
  return { blob, filename };
}

export function startLineykaForecastJob(datasetId, versionId, payload) {
  return jsonRequest(`/api/lineyka/datasets/${datasetId}/versions/${versionId}/forecast/jobs`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchLineykaJob(jobId) {
  return jsonRequest(`/api/lineyka/jobs/${jobId}`);
}

export function runLineykaAudit(datasetId, versionId, payload) {
  return jsonRequest(`/api/lineyka/datasets/${datasetId}/versions/${versionId}/audit`, {
    method: 'POST',
    body: JSON.stringify(payload || {}),
  });
}

export function fetchLineykaAudit(datasetId, versionId) {
  return jsonRequest(`/api/lineyka/datasets/${datasetId}/versions/${versionId}/audit`);
}

export function publishLineykaVersion(datasetId, versionId, payload) {
  return jsonRequest(`/api/lineyka/datasets/${datasetId}/versions/${versionId}/publish`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
