const BASE = "/api";

async function handle(res) {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch (e) {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

export function listEngagements(search, recentDays) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (recentDays != null) params.set("recent_days", String(recentDays));
  const q = params.toString();
  return fetch(`${BASE}/engagements${q ? `?${q}` : ""}`).then(handle);
}

export function createEngagement(data) {
  return fetch(`${BASE}/engagements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then(handle);
}

export function updateEngagement(id, data) {
  return fetch(`${BASE}/engagements/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then(handle);
}

export function deleteEngagement(id) {
  return fetch(`${BASE}/engagements/${id}`, { method: "DELETE" }).then(handle);
}

export function getOptions() {
  return fetch(`${BASE}/options`).then(handle);
}

export function updateOptions(category, values) {
  return fetch(`${BASE}/options/${category}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  }).then(handle);
}

export function getStatusEvents(id) {
  return fetch(`${BASE}/engagements/${id}/status-events`).then(handle);
}
