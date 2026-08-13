import React, { useEffect, useMemo, useState } from "react";
import {
  listEngagements,
  createEngagement,
  updateEngagement,
  deleteEngagement,
  getOptions,
} from "./api";
import EngagementForm from "./EngagementForm";
import DetailModal from "./DetailModal";
import Reports from "./Reports";
import Settings from "./Settings";
import { fmtDate } from "./format";
import hpeLogo from "./assets/HPE_logo_full-clr_rev_rgb.png";
import playIcon from "./assets/HPE_Play_RightArrow.svg";
import pauseIcon from "./assets/HPE_Stop_Error_Pause.svg";
import doneIcon from "./assets/HPE_Tick_check.svg";

function statusBadge(status) {
  if (!status) return "—";
  const s = String(status).toLowerCase();
  let cls = "badge-other";
  if (s === "done") cls = "badge-done";
  else if (s === "in progress") cls = "badge-progress";
  else if (s === "pending") cls = "badge-pending";
  else if (s === "paused") cls = "badge-paused";
  return <span className={"badge " + cls}>{status}</span>;
}

function isDone(status) {
  return String(status || "").toLowerCase() === "done";
}

function filled(v) {
  return v !== null && v !== undefined && String(v).trim() !== "";
}

function fmtDuration(hours) {
  const totalMin = Math.max(0, Math.round((Number(hours) || 0) * 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function findProblems(r) {
  const p = [];
  if (!filled(r.customer)) p.push("Customer is missing");
  if (!filled(r.pm)) p.push("PM is missing");
  if (!filled(r.type)) p.push("Type is missing");
  if (!filled(r.testing_date)) p.push("Testing Date is missing");
  if (!filled(r.testing_resource)) p.push("Testing Resource is missing");
  if (!filled(r.testing_status)) p.push("Testing Status is missing");
  if (isDone(r.orientation_status) && !filled(r.orientation_hours))
    p.push("Orientation is Done but Orientation Hours is empty");
  if (String(r.type) === "VPN") {
    if (!filled(r.vpn_app_ip)) p.push("VPN App / IP is missing");
    if (!filled(r.vpn_user)) p.push("VPN Username is missing");
    if (!filled(r.vpn_pass)) p.push("VPN Password is missing");
    if (!filled(r.vpn_details)) p.push("VPN Details is missing");
  }
  const oR = filled(r.orientation_resource);
  const oD = filled(r.orientation_date);
  const oF = filled(r.orientation_feedback);
  const oH = filled(r.orientation_hours);
  if (oR && (!oD || !oF))
    p.push("Orientation Resource set but Date/Feedback missing");
  if (oD && (!oR || !oF))
    p.push("Orientation Date set but Resource/Feedback missing");
  if (oF && (!oR || !oD || !oH))
    p.push("Orientation Feedback set but Resource/Date/Hours missing");
  return p;
}

function rowEval(r, today) {
  const problems = findProblems(r);
  if (problems.length) return { cls: "row-invalid", problems };
  const t = isDone(r.testing_status);
  const o = isDone(r.orientation_status);
  if (t && o) return { cls: "row-ok", problems };
  if (t && !o) {
    let age = 0;
    if (r.testing_date) {
      const d = new Date(String(r.testing_date).slice(0, 10) + "T00:00:00");
      age = Math.floor((today - d) / 86400000);
    }
    if (age > 30) return { cls: "row-overdue", problems };
    return { cls: "row-warn", problems };
  }
  return { cls: "", problems };
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("recent"); // "recent" | "all"

  const [options, setOptions] = useState({
    testing_resource: [],
    testing_status: [],
    orientation_status: [],
  });

  const [sortKey, setSortKey] = useState("testing_date");
  const [sortDir, setSortDir] = useState("desc");
  const [fltCustomer, setFltCustomer] = useState("");
  const [fltResource, setFltResource] = useState("");
  const [fltStatus, setFltStatus] = useState("");

  const [selected, setSelected] = useState(null); // record for detail view
  const [editing, setEditing] = useState(undefined); // record | null(new) for form
  const [showForm, setShowForm] = useState(false);

  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const [nowTick, setNowTick] = useState(() => Date.now());

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await listEngagements(
        search.trim(),
        view === "recent" ? 30 : undefined
      );
      setRows(data);
      setLoadedAt(Date.now());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, view]);

  // Tick every second so "In Progress" testing timers advance live.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function loadOptions() {
    try {
      const data = await getOptions();
      setOptions(data);
    } catch (e) {
      /* keep previous options on failure */
    }
  }

  useEffect(() => {
    loadOptions();
  }, []);

  function openNew() {
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(row) {
    setSelected(null);
    setEditing(row);
    setShowForm(true);
  }

  async function handleSave(data) {
    try {
      if (editing && editing.uid) {
        await updateEngagement(editing.uid, data);
      } else {
        await createEngagement(data);
      }
      setShowForm(false);
      setEditing(undefined);
      await load();
    } catch (e) {
      alert("Save failed: " + e.message);
    }
  }

  async function handleDelete(row) {
    if (!window.confirm(`Delete engagement for "${row.customer}"?`)) return;
    try {
      await deleteEngagement(row.uid);
      setSelected(null);
      await load();
    } catch (e) {
      alert("Delete failed: " + e.message);
    }
  }

  async function handleStatus(row, status, e) {
    if (e) e.stopPropagation();
    if (String(row.testing_status) === status) return;
    try {
      await updateEngagement(row.uid, { testing_status: status });
      await load();
    } catch (err) {
      alert("Status update failed: " + err.message);
    }
  }

  const doneRows = useMemo(
    () => rows.filter((r) => isDone(r.testing_status)),
    [rows]
  );

  const totalHours = useMemo(
    () =>
      doneRows.reduce(
        (sum, r) => sum + (r.testing_hours || 0) + (r.orientation_hours || 0),
        0
      ),
    [doneRows]
  );

  const doneCount = doneRows.length;

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const resourceOptions = useMemo(() => {
    const s = new Set();
    rows.forEach((r) => {
      if (filled(r.testing_resource)) s.add(r.testing_resource);
    });
    return Array.from(s).sort();
  }, [rows]);

  const displayRows = useMemo(() => {
    let out = rows.filter((r) => {
      if (
        fltCustomer &&
        !String(r.customer || "")
          .toLowerCase()
          .includes(fltCustomer.toLowerCase())
      )
        return false;
      if (fltResource && String(r.testing_resource || "") !== fltResource)
        return false;
      if (fltStatus && String(r.testing_status || "") !== fltStatus)
        return false;
      return true;
    });
    const dir = sortDir === "asc" ? 1 : -1;
    out = [...out].sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (sortKey === "testing_date") {
        av = av ? String(av) : "";
        bv = bv ? String(bv) : "";
      } else if (sortKey === "testing_hours") {
        av = Number(av) || 0;
        bv = Number(bv) || 0;
      } else {
        av = String(av || "").toLowerCase();
        bv = String(bv || "").toLowerCase();
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return out;
  }, [rows, fltCustomer, fltResource, fltStatus, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function sortArrow(key) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " \u25b2" : " \u25bc";
  }

  // Live testing hours: base value from backend, plus elapsed time since the
  // rows were loaded for anything currently "In Progress".
  function liveHours(row) {
    const base = Number(row.testing_hours) || 0;
    if (String(row.testing_status) === "In Progress") {
      return base + (nowTick - loadedAt) / 3600000;
    }
    return base;
  }

  return (
    <div className="app">
      <div className="brandbar">
        <img className="brand-logo" src={hpeLogo} alt="Hewlett Packard Enterprise" />
        <h1>
          PCAI Tracker
        </h1>
        <nav className="brand-nav">
          <button
            className={"nav-tab" + (view === "recent" ? " active" : "")}
            onClick={() => setView("recent")}
          >
            Recent
          </button>
          <button
            className={"nav-tab" + (view === "all" ? " active" : "")}
            onClick={() => setView("all")}
          >
            All Engagements
          </button>
          <button
            className={"nav-tab" + (view === "reports" ? " active" : "")}
            onClick={() => setView("reports")}
          >
            Reports
          </button>
          <button
            className={"nav-tab" + (view === "settings" ? " active" : "")}
            onClick={() => setView("settings")}
          >
            Settings
          </button>
        </nav>
      </div>

      {view === "reports" ? (
        <Reports />
      ) : view === "settings" ? (
        <Settings onChanged={loadOptions} />
      ) : (
        <div className="content">
        <div className="page-head">
          <div>
            <h2>
              {view === "recent" ? "Recent Engagements" : "All Engagements"}
            </h2>
            <p className="subtitle">
              {view === "recent"
                ? "Testing activity from the last 30 days · latest first"
                : "Complete list · latest first"}
            </p>
          </div>
          <button className="btn btn-primary" onClick={openNew}>
            + New Engagement
          </button>
        </div>

        <div className="stats">
          <div className="stat-card">
            <div className="num">{doneCount}</div>
            <div className="lbl">Testing Done</div>
          </div>
          <div className="stat-card">
            <div className="num">{fmtDuration(totalHours)}</div>
            <div className="lbl">Total Hours (Done)</div>
          </div>
        </div>

        <div className="toolbar">
          <input
            className="search"
            placeholder="Search customer, PM, resource, tickets, comments…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="btn" onClick={load}>
            Refresh
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="table-card">
          <table>
            <colgroup>
              <col style={{ width: "24%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "16%" }} />
            </colgroup>
            <thead>
              <tr>
                <th
                  className="sortable"
                  onClick={() => toggleSort("customer")}
                >
                  Customer{sortArrow("customer")}
                </th>
                <th
                  className="sortable"
                  onClick={() => toggleSort("testing_date")}
                >
                  Testing Date{sortArrow("testing_date")}
                </th>
                <th
                  className="sortable"
                  onClick={() => toggleSort("testing_resource")}
                >
                  Testing Resource{sortArrow("testing_resource")}
                </th>
                <th
                  className="sortable"
                  onClick={() => toggleSort("testing_status")}
                >
                  Testing Status{sortArrow("testing_status")}
                </th>
                <th
                  className="sortable"
                  onClick={() => toggleSort("testing_hours")}
                >
                  Testing Hours{sortArrow("testing_hours")}
                </th>
                <th>Actions</th>
              </tr>
              <tr className="filter-row">
                <th>
                  <input
                    className="col-filter"
                    placeholder="Filter customer…"
                    value={fltCustomer}
                    onChange={(e) => setFltCustomer(e.target.value)}
                  />
                </th>
                <th />
                <th>
                  <select
                    className="col-filter"
                    value={fltResource}
                    onChange={(e) => setFltResource(e.target.value)}
                  >
                    <option value="">All resources</option>
                    {resourceOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </th>
                <th>
                  <select
                    className="col-filter"
                    value={fltStatus}
                    onChange={(e) => setFltStatus(e.target.value)}
                  >
                    <option value="">All statuses</option>
                    <option value="Pending">Pending</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Paused">Paused</option>
                    <option value="Done">Done</option>
                  </select>
                </th>
                <th />
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="muted">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && displayRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    {view === "recent"
                      ? "No testings in the last 30 days."
                      : "No engagements found."}
                  </td>
                </tr>
              )}
              {!loading &&
                displayRows.map((row) => {
                  const ev = rowEval(row, today);
                  return (
                    <tr
                      key={row.uid}
                      className={ev.cls}
                      onClick={() => setSelected(row)}
                    >
                      <td
                        className="cust-cell"
                        title={
                          ev.problems.length
                            ? ev.problems.join("\n")
                            : row.customer
                        }
                      >
                        {ev.cls === "row-invalid" && (
                          <span
                            className="warn-mark"
                            title={ev.problems.join("\n")}
                          >
                            !
                          </span>
                        )}
                        {row.customer}
                      </td>
                      <td>{fmtDate(row.testing_date) || "—"}</td>
                      <td title={row.testing_resource || ""}>
                        {row.testing_resource || "—"}
                      </td>
                      <td>{statusBadge(row.testing_status)}</td>
                      <td>
                        <span
                          className={
                            "timer" +
                            (row.testing_status === "In Progress"
                              ? " timer-live"
                              : "")
                          }
                          title="Total time in 'In Progress'"
                        >
                          {row.testing_status === "In Progress" && (
                            <span className="timer-pulse" />
                          )}
                          {fmtDuration(liveHours(row))}
                        </span>
                      </td>
                      <td className="actions-cell">
                        <button
                          className={
                            "icon-btn" +
                            (row.testing_status === "In Progress"
                              ? " active"
                              : "")
                          }
                          title="Set In Progress (Play)"
                          onClick={(e) => handleStatus(row, "In Progress", e)}
                        >
                          <img src={playIcon} alt="Play" />
                        </button>
                        <button
                          className={
                            "icon-btn" +
                            (row.testing_status === "Blocked"
                              ? " active"
                              : "")
                          }
                          title="Set Blocked (Pause)"
                          onClick={(e) => handleStatus(row, "Blocked", e)}
                        >
                          <img src={pauseIcon} alt="Pause" />
                        </button>
                        <button
                          className={
                            "icon-btn" +
                            (row.testing_status === "Done" ? " active" : "")
                          }
                          title="Set Done"
                          onClick={(e) => handleStatus(row, "Done", e)}
                        >
                          <img src={doneIcon} alt="Done" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {selected && (
        <DetailModal
          record={selected}
          onClose={() => setSelected(null)}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      )}

      {showForm && (
        <EngagementForm
          initial={editing}
          options={options}
          onCancel={() => {
            setShowForm(false);
            setEditing(undefined);
          }}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
