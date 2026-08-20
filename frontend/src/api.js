const BASE = "/api";

import { getStoredUser } from "./auth";

// Attach the signed-in username to every request so the backend can attribute
// actions in the audit log. Merges with any caller-supplied headers.
function withUser(headers) {
  const user = getStoredUser();
  const base = headers || {};
  return user ? { ...base, "X-User": user } : base;
}

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
  return fetch(`${BASE}/engagements${q ? `?${q}` : ""}`, {
    headers: withUser(),
  }).then(handle);
}

export function createEngagement(data) {
  return fetch(`${BASE}/engagements`, {
    method: "POST",
    headers: withUser({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  }).then(handle);
}

export function updateEngagement(id, data) {
  return fetch(`${BASE}/engagements/${id}`, {
    method: "PUT",
    headers: withUser({ "Content-Type": "application/json" }),
    body: JSON.stringify(data),
  }).then(handle);
}

export function deleteEngagement(id) {
  return fetch(`${BASE}/engagements/${id}`, {
    method: "DELETE",
    headers: withUser(),
  }).then(handle);
}

export function getOptions() {
  return fetch(`${BASE}/options`, { headers: withUser() }).then(handle);
}

export function updateOptions(category, values) {
  return fetch(`${BASE}/options/${category}`, {
    method: "PUT",
    headers: withUser({ "Content-Type": "application/json" }),
    body: JSON.stringify({ values }),
  }).then(handle);
}

export function getStatusEvents(id) {
  return fetch(`${BASE}/engagements/${id}/status-events`, {
    headers: withUser(),
  }).then(handle);
}

export function getAuditLogs(params = {}) {
  const q = new URLSearchParams();
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.username) q.set("username", params.username);
  if (params.entityUid) q.set("entity_uid", params.entityUid);
  const qs = q.toString();
  return fetch(`${BASE}/audit-logs${qs ? `?${qs}` : ""}`, {
    headers: withUser(),
  }).then(handle);
}
