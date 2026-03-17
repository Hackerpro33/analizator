import { jsonRequest } from './http';

export function listUsers() {
  return jsonRequest('/api/admin/users');
}

export function updateUser(userId, payload) {
  return jsonRequest(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function listRoles() {
  return jsonRequest('/api/admin/roles');
}

export function createRole(payload) {
  return jsonRequest('/api/admin/roles', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateRole(roleKey, payload) {
  return jsonRequest(`/api/admin/roles/${roleKey}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteRole(roleKey) {
  return jsonRequest(`/api/admin/roles/${roleKey}`, {
    method: 'DELETE',
  });
}

export function listAuditLogs() {
  return jsonRequest('/api/admin/audit');
}
