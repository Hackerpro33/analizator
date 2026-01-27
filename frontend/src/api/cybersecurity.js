import { jsonRequest } from './http';

export function fetchCyberControls() {
  return jsonRequest('/api/cybersecurity/controls');
}

export function analyzeCyberPosture(payload) {
  return jsonRequest('/api/cybersecurity/posture', {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  });
}

export function planMovingTarget(payload) {
  return jsonRequest('/api/cybersecurity/moving-target', {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  });
}

function appendList(params, key, values) {
  if (!Array.isArray(values) || !values.length) {
    return;
  }
  values.forEach((value) => {
    if (value) {
      params.append(key, value);
    }
  });
}

export function buildCyberQuery(filters = {}, extras = {}) {
  const params = new URLSearchParams();
  const { page, pageSize } = extras;

  if (filters.customRange?.from && filters.customRange?.to) {
    params.set('from', new Date(filters.customRange.from).toISOString());
    params.set('to', new Date(filters.customRange.to).toISOString());
  } else if (filters.timeRange) {
    params.set('range', filters.timeRange);
  }

  appendList(params, 'severity', filters.severity);
  appendList(params, 'segment', filters.segments);
  appendList(params, 'source', filters.sources);
  appendList(params, 'event_type', filters.eventTypes);
  appendList(params, 'phase', filters.phases);
  if (filters.scenarioId) {
    params.set('scenario', filters.scenarioId);
  }
  if (filters.runId) {
    params.set('run_id', filters.runId);
  }

  if (filters.search) {
    params.set('q', filters.search);
  }

  if (typeof page === 'number') {
    params.set('page', String(page));
  }
  if (typeof pageSize === 'number') {
    params.set('pageSize', String(pageSize));
  }

  return params.toString();
}

function withQuery(path, query) {
  if (!query) {
    return path;
  }
  return `${path}?${query}`;
}

export function fetchCyberSummary(filters) {
  const query = buildCyberQuery(filters);
  return jsonRequest(withQuery('/api/cyber/summary', query));
}

export function fetchCyberEvents(filters, { page = 1, pageSize = 120 } = {}) {
  const query = buildCyberQuery(filters, { page, pageSize });
  return jsonRequest(withQuery('/api/cyber/events', query));
}

export function fetchCyberMap(filters) {
  const query = buildCyberQuery(filters);
  return jsonRequest(withQuery('/api/cyber/map', query));
}

export function fetchCyberGraph(filters, limits = {}) {
  const query = buildCyberQuery(filters);
  const params = new URLSearchParams(query);
  if (limits.limitNodes) {
    params.set('limitNodes', String(limits.limitNodes));
  }
  if (limits.limitEdges) {
    params.set('limitEdges', String(limits.limitEdges));
  }
  return jsonRequest(withQuery('/api/cyber/graph', params.toString()));
}

export function fetchCyberHeatmap(filters, mode = 'segment_time') {
  const params = new URLSearchParams(buildCyberQuery(filters));
  params.set('mode', mode);
  return jsonRequest(withQuery('/api/cyber/heatmap', params.toString()));
}

export function fetchCyberEventById(id) {
  return jsonRequest(`/api/cyber/event/${id}`);
}

export function fetchArchitectureVersions() {
  return jsonRequest('/api/cyber/architecture/versions');
}

export function saveArchitectureVersion(payload) {
  return jsonRequest('/api/cyber/architecture/versions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function cloneArchitectureVersion(id, name) {
  return jsonRequest(`/api/cyber/architecture/versions/${id}/clone${name ? `?name=${encodeURIComponent(name)}` : ''}`, {
    method: 'POST',
  });
}

export function diffArchitectureVersions(left, right) {
  const params = new URLSearchParams({ left, right });
  return jsonRequest(`/api/cyber/architecture/diff?${params.toString()}`);
}

export function fetchScenarios() {
  return jsonRequest('/api/cyber/scenarios');
}

export function saveScenario(payload) {
  return jsonRequest('/api/cyber/scenarios', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function runScenario(scenarioId, payload) {
  return jsonRequest(`/api/cyber/scenarios/${scenarioId}/run`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchSimulationRuns(limit = 20) {
  return jsonRequest(`/api/cyber/runs?limit=${limit}`);
}

export function fetchHostStatus() {
  return jsonRequest('/api/cyber/host');
}
