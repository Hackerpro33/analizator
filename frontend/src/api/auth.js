import { jsonRequest } from './http';

export function registerUser(payload) {
  return jsonRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function loginUser(payload) {
  return jsonRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function logoutUser() {
  return jsonRequest('/api/auth/logout', {
    method: 'POST',
  });
}

export function fetchCurrentUser() {
  return jsonRequest('/api/auth/me', { method: 'GET' });
}

export function refreshSession() {
  return jsonRequest('/api/auth/refresh', { method: 'POST' });
}

export function updateProfile(payload) {
  return jsonRequest('/api/auth/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}
