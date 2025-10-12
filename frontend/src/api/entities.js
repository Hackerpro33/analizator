import { jsonRequest as request } from './http';

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.append(key, value);
    }
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const Dataset = {
  async list(orderBy = '-created_at') {
    return request(`/api/dataset/list${buildQuery({ order_by: orderBy })}`);
  },

  async get(id) {
    return request(`/api/dataset/${id}`);
  },

  async create(payload) {
    return request('/api/dataset/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async update(id, payload) {
    return request(`/api/dataset/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async delete(id) {
    return request(`/api/dataset/${id}`, {
      method: 'DELETE',
    });
  },
};

export const Visualization = {
  async list(orderBy = '-created_at') {
    return request(`/api/visualization/list${buildQuery({ order_by: orderBy })}`);
  },

  async filter(filters = {}, orderBy = '-created_at') {
    return request('/api/visualization/filter', {
      method: 'POST',
      body: JSON.stringify({ filters, order_by: orderBy }),
    });
  },

  async get(id) {
    return request(`/api/visualization/${id}`);
  },

  async create(payload) {
    return request('/api/visualization/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async update(id, payload) {
    return request(`/api/visualization/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async delete(id) {
    return request(`/api/visualization/${id}`, {
      method: 'DELETE',
    });
  },
};

export async function getDatasets() {
  return Dataset.list('-created_at');
}

export async function getVisualizations() {
  return Visualization.list('-created_at');
}
