const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://your-backend.up.railway.app';

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err || `HTTP ${response.status}`);
  }

  return response.json();
}

// Profile endpoints (to be implemented on backend)
export const profileApi = {
  get: (phone: string) => fetchAPI(`/api/profile/${phone}`),
  update: (phone: string, data: Record<string, unknown>) =>
    fetchAPI(`/api/profile/${phone}`, { method: 'PUT', body: JSON.stringify(data) }),
};

// Matches endpoints
export const matchesApi = {
  getAll: (phone: string) => fetchAPI(`/api/matches/${phone}`),
  getById: (id: string) => fetchAPI(`/api/matches/detail/${id}`),
};

// Dashboard
export const dashboardApi = {
  get: (phone: string) => fetchAPI(`/api/dashboard/${phone}`),
};

// Insights
export const insightsApi = {
  get: (phone: string) => fetchAPI(`/api/insights/${phone}`),
};

// Notifications
export const notificationsApi = {
  getAll: (phone: string) => fetchAPI(`/api/notifications/${phone}`),
  markRead: (id: string) => fetchAPI(`/api/notifications/${id}/read`, { method: 'POST' }),
};
