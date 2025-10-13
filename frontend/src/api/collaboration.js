import { jsonRequest } from './http';

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item !== undefined && item !== null && item !== '') {
          search.append(key, item);
        }
      });
      return;
    }
    if (value !== '') {
      search.append(key, value);
    }
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export function listComments(filters = {}) {
  return jsonRequest(`/api/collaboration/comments${buildQuery(filters)}`);
}

export function createComment(payload) {
  return jsonRequest('/api/collaboration/comments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateComment(commentId, payload) {
  return jsonRequest(`/api/collaboration/comments/${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function listWorkspaces() {
  return jsonRequest('/api/collaboration/workspaces');
}

export function createWorkspace(payload) {
  return jsonRequest('/api/collaboration/workspaces', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateWorkspace(workspaceId, payload) {
  return jsonRequest(`/api/collaboration/workspaces/${workspaceId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function getAccessPolicies() {
  return jsonRequest('/api/collaboration/access-policies');
}

export function getAccessPolicy(workspaceId) {
  return jsonRequest(`/api/collaboration/access-policies/${workspaceId}`);
}

export function updateAccessPolicy(workspaceId, payload) {
  return jsonRequest(`/api/collaboration/access-policies/${workspaceId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
