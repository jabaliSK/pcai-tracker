import React, { useEffect, useMemo, useState } from "react";
import { listEngagements } from "./api";
import { CalendarHeatmap, LineChart, MultiLineChart } from "./Charts";
import { fmtDate } from "./format";
import { IconAlert, IconCheckCircle, IconClock } from "./Icons";

function isDone(status) {
  return String(status).toLowerCase() === "done";
}

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function parseISO(iso) {
  return new Date(String(iso).slice(0, 10) + "T00:00:00");
}

function daysBetween(iso, today) {
  return Math.floor((today - parseISO(iso)) / (1000 * 60 * 60 * 24));
}

// Monday of the week containing d.
function weekStart(d) {
  const day = d.getDay(); // 0=Sun
  const diff = (day + 6) % 7; // days since Monday
  return addDays(d, -diff);
}

function buildWeekCategories(fromISO, toISO_) {
  const start = weekStart(parseISO(fromISO));
  const end = parseISO(toISO_);
  const weeks = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    weeks.push(toISO(cursor));
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

const PRESETS = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "6m", days: 182 },
  { label: "1y", days: 365 },
  { label: "All", days: null },
];

export default function Reports() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const [from, setFrom] = useState(toISO(addDays(today, -90)));
  const [to, setTo] = useState(toISO(today));
  const [preset, setPreset] = useState("90d");

  useEffect(() => {
    let active = true;
    listEngagements()
      .then((data) => active && setRows(data))
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  // Earliest date present in data (for the "All" preset).
  const earliestISO = useMemo(() => {
    let min = null;
    for (const r of rows) {
      for (const key of ["testing_date", "orientation_date"]) {
        if (r[key]) {
          const iso = String(r[key]).slice(0, 10);
          if (!min || iso < min) min = iso;
        }
      }
    }
    return min || toISO(addDays(today, -365));
  }, [rows, today]);

  function applyPreset(days, label) {
    setTo(toISO(today));
    setFrom(days === null ? earliestISO : toISO(addDays(today, -(days - 1))));
    setPreset(label);
  }

  // Fixed mandatory metrics (independent of the range picker).
  const fixed = useMemo(() => {
    let t7 = 0,
      t30 = 0,
      o7 = 0,
      o30 = 0;
    const test30 = {};
    const orient30 = {};
    const start30 = toISO(addDays(today, -29));
    for (const r of rows) {
      if (r.testing_date && isDone(r.testing_status)) {
        const iso = String(r.testing_date).slice(0, 10);
        const age = daysBetween(iso, today);
        if (age >= 0 && age <= 6) t7 += 1;
        if (age >= 0 && age <= 29) {
          t30 += 1;
          test30[iso] = (test30[iso] || 0) + 1;
        }
      }
      if (r.orientation_date && isDone(r.orientation_status)) {
        const iso = String(r.orientation_date).slice(0, 10);
        const age = daysBetween(iso, today);
        if (age >= 0 && age <= 6) o7 += 1;
        if (age >= 0 && age <= 29) {
          o30 += 1;
          orient30[iso] = (orient30[iso] || 0) + 1;
        }
      }
    }
    return { t7, t30, o7, o30, test30, orient30, start30 };
  }, [rows, today]);

  // Range-based aggregations.
  const ranged = useMemo(() => {
    const inRange = (iso) => {
      const s = String(iso).slice(0, 10);
      return s >= from && s <= to;
    };

    const testDaily = {};
    const orientDaily = {};
    const hoursDaily = {};

    const weeks = buildWeekCategories(from, to);
    const weekIndex = {};
    weeks.forEach((w, i) => (weekIndex[w] = i));
    const weekOf = (iso) => toISO(weekStart(parseISO(iso)));

    // series maps: resource -> array aligned to weeks
    const testCountByRes = {};
    const orientCountByRes = {};
    const testHoursByRes = {};
    const orientHoursByRes = {};
    const weeklyTestTotal = weeks.map(() => 0);

    const ensure = (obj, key) => {
      if (!obj[key]) obj[key] = weeks.map(() => 0);
      return obj[key];
    };

    for (const r of rows) {
      // Testing — only completed testings are counted.
      if (
        r.testing_date &&
        inRange(r.testing_date) &&
        isDone(r.testing_status)
      ) {
        const iso = String(r.testing_date).slice(0, 10);
        const wi = weekIndex[weekOf(iso)];
        const res = (r.testing_resource || "Unassigned").trim() || "Unassigned";
        testDaily[iso] = (testDaily[iso] || 0) + 1;
        if (wi != null) {
          ensure(testCountByRes, res)[wi] += 1;
          weeklyTestTotal[wi] += 1;
          if (r.testing_hours) {
            ensure(testHoursByRes, res)[wi] += Number(r.testing_hours);
            hoursDaily[iso] = (hoursDaily[iso] || 0) + Number(r.testing_hours);
          }
        }
      }
      // Orientation — only completed orientations are counted.
      if (
        r.orientation_date &&
        inRange(r.orientation_date) &&
        isDone(r.orientation_status)
      ) {
        const iso = String(r.orientation_date).slice(0, 10);
        const wi = weekIndex[weekOf(iso)];
        const res =
          (r.orientation_resource || "Unassigned").trim() || "Unassigned";
        orientDaily[iso] = (orientDaily[iso] || 0) + 1;
        if (wi != null) {
          ensure(orientCountByRes, res)[wi] += 1;
          if (r.orientation_hours) {
            ensure(orientHoursByRes, res)[wi] += Number(r.orientation_hours);
          }
        }
      }
    }

    const categories = weeks.map((w) => fmtDate(w).slice(0, 5));

    const toSeries = (obj) =>
      Object.keys(obj)
        .sort()
        .map((name) => ({ name, values: obj[name] }));

    const hoursPoints = Object.keys(hoursDaily)
      .sort()
      .map((iso) => ({ date: iso, value: hoursDaily[iso] }));

    return {
      testDaily,
      orientDaily,
      categories,
      testCountSeries: toSeries(testCountByRes),
      orientCountSeries: toSeries(orientCountByRes),
      testHoursSeries: toSeries(testHoursByRes),
      orientHoursSeries: toSeries(orientHoursByRes),
      weeklyTestTotal: weeks.map((w, i) => ({
        date: w,
        value: weeklyTestTotal[i],
      })),
      hoursPoints,
    };
  }, [rows, from, to]);

  if (loading) {
    return (
      <div className="content">
        <div className="stats">
          {Array.from({ length: 4 }).map((_, i) => (
            <div className="stat-card" key={i}>
              <span className="stat-icon" />
              <div className="stat-body" style={{ flex: 1 }}>
                <span className="skel" style={{ width: "45%", height: 16 }} />
                <span
                  className="skel"
                  style={{ width: "75%", marginTop: 7, height: 9 }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="chart-card">
          <span className="skel" style={{ width: "30%", height: 13 }} />
          <div className="chart-empty" style={{ marginTop: 14 }}>
            Loading reports…
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="content">
        <div className="error-banner">
          <IconAlert size={16} />
          {error}
        </div>
      </div>
    );
  }

  const rangeLabel = `${fmtDate(from)} → ${fmtDate(to)}`;

  const TILES = [
    { n: fixed.t7, l: "Testings Done · 7 days", tone: "", Icon: IconCheckCircle },
    { n: fixed.t30, l: "Testings Done · 30 days", tone: "", Icon: IconCheckCircle },
    { n: fixed.o7, l: "Orientations Done · 7 days", tone: "tone-violet", Icon: IconClock },
    { n: fixed.o30, l: "Orientations Done · 30 days", tone: "tone-violet", Icon: IconClock },
  ];

  return (
    <div className="content">
      {/* Fixed mandatory metrics */}
      <div className="stats">
        {TILES.map((t) => (
          <div className="stat-card" key={t.l}>
            <span className={"stat-icon " + t.tone}>
              <t.Icon size={19} />
            </span>
            <div className="stat-body">
              <div className="num">{t.n}</div>
              <div className="lbl">{t.l}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Mandatory heatmaps */}
      <div className="section-title">Last 30 Days</div>
      <div className="hm-row">
        <CalendarHeatmap
          title="Testings Done"
          subtitle="Completed testings per day"
          counts={fixed.test30}
          startISO={fixed.start30}
          endISO={toISO(today)}
          cellSize={18}
        />
        <CalendarHeatmap
          title="Orientations Done"
          subtitle="Completed orientations per day"
          counts={fixed.orient30}
          startISO={fixed.start30}
          endISO={toISO(today)}
          cellSize={18}
        />
      </div>

      {/* Date range picker */}
      <div className="section-title">Selected Range — {rangeLabel}</div>
      <div className="range-bar">
        <span className="range-label">Range</span>
        <label className="range-field">
          From
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              setFrom(e.target.value);
              setPreset(null);
            }}
          />
        </label>
        <label className="range-field">
          To
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => {
              setTo(e.target.value);
              setPreset(null);
            }}
          />
        </label>
        <div className="range-presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              className={"btn btn-sm" + (preset === p.label ? " active" : "")}
              onClick={() => applyPreset(p.days, p.label)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="hm-row">
        <CalendarHeatmap
          title="Testings Done"
          subtitle="Completed testings per day"
          counts={ranged.testDaily}
          startISO={from}
          endISO={to}
        />
        <CalendarHeatmap
          title="Orientations Done"
          subtitle="Completed orientations per day"
          counts={ranged.orientDaily}
          startISO={from}
          endISO={to}
        />
      </div>

      {/* Per-resource over time */}
      <div className="section-title">Per Resource — {rangeLabel}</div>
      <div className="chart-row">
        <MultiLineChart
          title="Testing Count per Resource"
          subtitle="Testings per week, by testing resource"
          categories={ranged.categories}
          series={ranged.testCountSeries}
        />
        <MultiLineChart
          title="Orientation Count per Resource"
          subtitle="Orientations per week, by orientation resource"
          categories={ranged.categories}
          series={ranged.orientCountSeries}
        />
        <MultiLineChart
          title="Testing Hours per Resource"
          subtitle="Testing hours per week, by testing resource"
          categories={ranged.categories}
          series={ranged.testHoursSeries}
          yLabel="hrs"
        />
        <MultiLineChart
          title="Orientation Hours per Resource"
          subtitle="Orientation hours per week, by orientation resource"
          categories={ranged.categories}
          series={ranged.orientHoursSeries}
          yLabel="hrs"
        />
      </div>

      {/* Totals over time */}
      <div className="section-title">Totals — {rangeLabel}</div>
      <div className="chart-row">
        <LineChart
          title="Testing Count — All Resources per Week"
          subtitle="Total testings per week"
          points={ranged.weeklyTestTotal}
        />
        <LineChart
          title="Testing Hours Over Time"
          subtitle="Total testing hours per testing date"
          points={ranged.hoursPoints}
          yLabel="hrs"
        />
      </div>
    </div>
  );
}
