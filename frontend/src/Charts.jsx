import React from "react";
import { fmtDate } from "./format";

/* ---------- helpers ---------- */
function toISO(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/* ---------- Calendar heatmap (GitHub-style) ---------- */
export function CalendarHeatmap({
  counts,
  startISO,
  endISO,
  title,
  subtitle,
  cellSize = 15,
}) {
  const start = new Date(startISO + "T00:00:00");
  const end = new Date(endISO + "T00:00:00");

  // Align grid to the Sunday on/before the start date.
  const gridStart = addDays(start, -start.getDay());

  const weeks = [];
  let cursor = new Date(gridStart);
  let max = 0;
  let total = 0;
  Object.values(counts).forEach((v) => {
    total += v || 0;
    if (v > max) max = v;
  });

  while (cursor <= end) {
    const week = [];
    for (let dow = 0; dow < 7; dow++) {
      const iso = toISO(cursor);
      const inRange = cursor >= start && cursor <= end;
      week.push({
        iso,
        count: inRange ? counts[iso] || 0 : null,
        date: new Date(cursor),
      });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }

  function level(count) {
    if (count === null) return "hm-empty";
    if (count === 0) return "hm-0";
    const ratio = max > 0 ? count / max : 0;
    if (ratio > 0.75) return "hm-4";
    if (ratio > 0.5) return "hm-3";
    if (ratio > 0.25) return "hm-2";
    return "hm-1";
  }

  const cell = cellSize;
  const gap = 4;
  const step = cell + gap;
  const leftPad = 36;
  const topPad = 20;
  const width = weeks.length * step + leftPad + 4;
  const height = 7 * step + topPad + 4;

  // Month labels
  const monthLabels = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const first = week[0].date;
    if (first.getMonth() !== lastMonth) {
      lastMonth = first.getMonth();
      monthLabels.push({
        x: leftPad + wi * step,
        label: MONTHS[first.getMonth()],
      });
    }
  });

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="chart-card">
      <div className="chart-head">
        <h4>
          {title} <span className="chart-total">({total})</span>
        </h4>
        {subtitle && <span className="chart-sub">{subtitle}</span>}
      </div>
      <div className="hm-scroll">
        <svg width={width} height={height} className="heatmap">
          {monthLabels.map((m, i) => (
            <text key={i} x={m.x} y={13} className="hm-axis">
              {m.label}
            </text>
          ))}
          {dayLabels.map((lbl, i) => (
            <text
              key={i}
              x={0}
              y={topPad + i * step + cell / 2 + 3}
              className="hm-axis"
            >
              {lbl}
            </text>
          ))}
          {weeks.map((week, wi) =>
            week.map((day, di) => (
              <rect
                key={`${wi}-${di}`}
                x={leftPad + wi * step}
                y={topPad + di * step}
                width={cell}
                height={cell}
                rx={2}
                className={"hm-cell " + level(day.count)}
              >
                {day.count !== null && (
                  <title>
                    {fmtDate(day.iso)}: {day.count}
                  </title>
                )}
              </rect>
            ))
          )}
        </svg>
      </div>
      <div className="hm-legend">
        <span className="hm-legend-less">Less</span>
        <span className="hm-swatch hm-0" />
        <span className="hm-swatch hm-1" />
        <span className="hm-swatch hm-2" />
        <span className="hm-swatch hm-3" />
        <span className="hm-swatch hm-4" />
        <span className="hm-legend-more">More</span>
      </div>
    </div>
  );
}

/* ---------- Line chart ---------- */
export function LineChart({ points, title, subtitle, yLabel }) {
  const W = 720;
  const H = 260;
  const pad = { top: 20, right: 20, bottom: 40, left: 44 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  if (!points.length) {
    return (
      <div className="chart-card">
        <div className="chart-head">
          <h4>{title}</h4>
          {subtitle && <span className="chart-sub">{subtitle}</span>}
        </div>
        <div className="chart-empty">No data to display.</div>
      </div>
    );
  }

  const maxY = Math.max(1, ...points.map((p) => p.value));
  const n = points.length;
  const x = (i) => pad.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v) => pad.top + innerH - (v / maxY) * innerH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.value)}`)
    .join(" ");

  const areaPath =
    `M ${x(0)} ${pad.top + innerH} ` +
    points.map((p, i) => `L ${x(i)} ${y(p.value)}`).join(" ") +
    ` L ${x(n - 1)} ${pad.top + innerH} Z`;

  // Y gridlines
  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) =>
    Math.round((maxY / ticks) * i)
  );

  // X labels — show at most ~8
  const labelEvery = Math.max(1, Math.ceil(n / 8));

  return (
    <div className="chart-card">
      <div className="chart-head">
        <h4>{title}</h4>
        {subtitle && <span className="chart-sub">{subtitle}</span>}
      </div>
      <div className="chart-scroll">
        <svg width={W} height={H} className="linechart">
          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={pad.left}
                x2={W - pad.right}
                y1={y(t)}
                y2={y(t)}
                className="lc-grid"
              />
              <text x={pad.left - 8} y={y(t) + 4} className="lc-axis lc-axis-y">
                {t}
              </text>
            </g>
          ))}
          <path d={areaPath} className="lc-area" />
          <path d={linePath} className="lc-line" />
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={x(i)} cy={y(p.value)} r={3} className="lc-dot">
                <title>
                  {fmtDate(p.date)}: {p.value}
                  {yLabel ? " " + yLabel : ""}
                </title>
              </circle>
              {i % labelEvery === 0 && (
                <text
                  x={x(i)}
                  y={H - pad.bottom + 18}
                  className="lc-axis lc-axis-x"
                  transform={`rotate(35 ${x(i)} ${H - pad.bottom + 18})`}
                >
                  {fmtDate(p.date).slice(0, 5)}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

/* ---------- Multi-series line chart ---------- */
const SERIES_COLORS = [
  "#01a982",
  "#00739d",
  "#ff8d3f",
  "#7630ea",
  "#c140b8",
  "#e8b923",
  "#d13438",
  "#425563",
];

export function MultiLineChart({
  categories,
  series,
  title,
  subtitle,
  yLabel,
}) {
  const W = 760;
  const H = 300;
  const pad = { top: 20, right: 20, bottom: 54, left: 46 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const hasData =
    categories.length > 0 &&
    series.some((s) => s.values.some((v) => v > 0));

  if (!hasData) {
    return (
      <div className="chart-card">
        <div className="chart-head">
          <h4>{title}</h4>
          {subtitle && <span className="chart-sub">{subtitle}</span>}
        </div>
        <div className="chart-empty">No data in the selected range.</div>
      </div>
    );
  }

  const maxY = Math.max(
    1,
    ...series.flatMap((s) => s.values)
  );
  const n = categories.length;
  const x = (i) => pad.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v) => pad.top + innerH - (v / maxY) * innerH;

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) =>
    Math.round((maxY / ticks) * i)
  );

  const labelEvery = Math.max(1, Math.ceil(n / 9));

  return (
    <div className="chart-card">
      <div className="chart-head">
        <h4>{title}</h4>
        {subtitle && <span className="chart-sub">{subtitle}</span>}
      </div>
      <div className="chart-scroll">
        <svg width={W} height={H} className="linechart">
          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={pad.left}
                x2={W - pad.right}
                y1={y(t)}
                y2={y(t)}
                className="lc-grid"
              />
              <text x={pad.left - 8} y={y(t) + 4} className="lc-axis lc-axis-y">
                {t}
              </text>
            </g>
          ))}
          {series.map((s, si) => {
            const color = SERIES_COLORS[si % SERIES_COLORS.length];
            const path = s.values
              .map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`)
              .join(" ");
            return (
              <g key={si}>
                <path
                  d={path}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {s.values.map((v, i) => (
                  <circle key={i} cx={x(i)} cy={y(v)} r={2.6} fill={color}>
                    <title>
                      {s.name} · {categories[i]}: {v}
                      {yLabel ? " " + yLabel : ""}
                    </title>
                  </circle>
                ))}
              </g>
            );
          })}
          {categories.map((c, i) =>
            i % labelEvery === 0 ? (
              <text
                key={i}
                x={x(i)}
                y={H - pad.bottom + 18}
                className="lc-axis lc-axis-x"
                transform={`rotate(35 ${x(i)} ${H - pad.bottom + 18})`}
              >
                {c}
              </text>
            ) : null
          )}
        </svg>
      </div>
      <div className="lc-legend">
        {series.map((s, si) => (
          <span key={si} className="lc-legend-item">
            <span
              className="lc-legend-swatch"
              style={{
                background: SERIES_COLORS[si % SERIES_COLORS.length],
              }}
            />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}
