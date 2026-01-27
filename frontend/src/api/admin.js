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
