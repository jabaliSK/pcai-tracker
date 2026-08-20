import React from "react";

/* Small presentational primitives shared by the table, detail view and
   reports so the same value always renders the same way. */

export function fmtDuration(hours) {
  const totalMin = Math.max(0, Math.round((Number(hours) || 0) * 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function initials(name) {
  const parts = String(name || "").trim().split(/\s+/);
  if (!parts[0]) return "?";
  return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
}

// Stable colour per person, so the same resource keeps the same avatar.
export function avatarStyle(name) {
  let hash = 0;
  const s = String(name || "");
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) % 360;
  return { background: `hsl(${hash} 52% 42%)` };
}

export function Avatar({ name }) {
  return (
    <span className="avatar" style={avatarStyle(name)}>
      {initials(name)}
    </span>
  );
}

export function statusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "done") return "badge-done";
  if (s === "in progress") return "badge-progress";
  if (s === "pending") return "badge-pending";
  if (s === "paused") return "badge-paused";
  return "badge-other";
}

export function Badge({ status, fallback = "—" }) {
  if (!status) return <span className="cell-empty">{fallback}</span>;
  return <span className={"badge " + statusClass(status)}>{status}</span>;
}
