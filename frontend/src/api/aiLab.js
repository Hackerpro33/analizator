import { jsonRequest } from './http';

export function fetchSeries(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      if (value.length > 0) {
        search.append(key, value.join(','));
      }
    } else {
      search.append(key, value);
    }
  });
  const suffix = search.toString() ? `?${search.toString()}` : '';
  return jsonRequest(`/api/ai-lab/series${suffix}`);
}

export function runAiForecast(payload) {
  return jsonRequest('/api/ai-lab/forecast', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listAiModels() {
  return jsonRequest('/api/ai-lab/models');
}

export function activateAiModel(modelId) {
  return jsonRequest(`/api/ai-lab/models/${modelId}/activate`, {
    method: 'POST',
  });
}

export function submitTrainingJob(payload) {
  return jsonRequest('/api/ai-lab/models/train', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchTrainingJob(jobId) {
  return jsonRequest(`/api/ai-lab/jobs/${jobId}`);
}

export function fetchAuditSuggestions(datasetId) {
  return jsonRequest(`/api/ai-lab/audit-suggestions/${datasetId}`);
}

export function runDataAudit(payload) {
  return jsonRequest('/api/audit/data/run', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchDataAuditReport(datasetId) {
  return jsonRequest(`/api/audit/data/report/${datasetId}`);
}
