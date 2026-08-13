// Format an ISO date string (YYYY-MM-DD) as dd-mm-yyyy.
export function fmtDate(value) {
  if (!value) return "";
  const s = String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  const [, y, mo, d] = m;
  return `${d}-${mo}-${y}`;
}
