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
