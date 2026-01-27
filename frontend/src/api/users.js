import { jsonRequest } from './http';

export function fetchUsersOverview() {
  return jsonRequest('/api/users/overview');
}
