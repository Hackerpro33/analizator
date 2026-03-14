import { jsonRequest as request } from './http';

export function getAlgorithmCatalog() {
  return request('/api/ml/catalog');
}

export function getMlDatasets() {
  return request('/api/ml/datasets');
}

export function getDatasetProfile(datasetId) {
  if (!datasetId) {
    throw new Error('datasetId is required');
  }
  return request(`/api/ml/datasets/${datasetId}/profile`);
}

export function listModels() {
  return request('/api/ml/models');
}

export function getModel(modelId) {
  if (!modelId) {
    throw new Error('modelId is required');
  }
  return request(`/api/ml/models/${modelId}`);
}

export function trainModel(payload) {
  return request('/api/ml/train', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function runInference(modelId, payload) {
  if (!modelId) {
    throw new Error('modelId is required');
  }
  return request(`/api/ml/models/${modelId}/predict`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getInsights() {
  return request('/api/ml/insights');
}

export function startModelRun(payload) {
  return request('/api/ml/model-runs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listModelRuns(limit = 50) {
  return request(`/api/ml/model-runs?limit=${limit}`);
}

export function getModelRun(runId) {
  if (!runId) {
    throw new Error('runId is required');
  }
  return request(`/api/ml/model-runs/${runId}`);
}

export function getModelRunResults(runId) {
  if (!runId) {
    throw new Error('runId is required');
  }
  return request(`/api/ml/model-runs/${runId}/results`);
}

export function getModelRunAlerts(runId) {
  if (!runId) {
    throw new Error('runId is required');
  }
  return request(`/api/ml/model-runs/${runId}/alerts`);
}
