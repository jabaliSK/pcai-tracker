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
import Login from "./Login";
import { useUser } from "./auth";
import { useRoute, viewToPath } from "./router";
import { fmtDate } from "./format";
import hpeLogo from "./assets/HPE_logo_full-clr_rev_rgb.png";
import {
  IconAlert,
  IconChart,
  IconCheck,
  IconCheckCircle,
  IconChevron,
  IconClock,
  IconClose,
  IconInbox,
  IconLayers,
  IconMoon,
  IconPause,
  IconPlay,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconSun,
  IconTimer,
} from "./Icons";
import { Avatar, Badge, fmtDuration } from "./ui";

const PAGES = {
  recent: {
    title: "Recent Engagements",
    subtitle: "Testing activity from the last 30 days · latest first",
  },
  all: {
    title: "All Engagements",
    subtitle: "Complete list · latest first",
  },
  reports: {
    title: "Reports & Metrics",
    subtitle: "Testing & orientation activity overview",
  },
  settings: {
    title: "Settings",
    subtitle: "Manage the dropdown values used across engagements",
  },
};

const NAV = [
  { key: "recent", label: "Recent", Icon: IconClock },
  { key: "all", label: "All", Icon: IconLayers },
  { key: "reports", label: "Reports", Icon: IconChart },
  { key: "settings", label: "Settings", Icon: IconSettings },
];

function isDone(status) {
  return String(status || "").toLowerCase() === "done";
}

function filled(v) {
  return v !== null && v !== undefined && String(v).trim() !== "";
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

/* ---------- Theme ---------- */
function useTheme() {
  const [theme, setTheme] = useState(
    () => document.documentElement.getAttribute("data-theme") || "light"
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("pcai-theme", theme);
    } catch (e) {
      /* storage unavailable — theme just won't persist */
    }
  }, [theme]);

  return [theme, setTheme];
}

/* ---------- Sidebar ---------- */
function Sidebar({ view, navigate, theme, setTheme, user, onLogout }) {
  return (
    <aside className="sidebar">
      <div className="side-brand">
        <span className="brand-plaque">
          <img
            className="brand-logo"
            src={hpeLogo}
            alt="Hewlett Packard Enterprise"
          />
        </span>
        <span className="brand-text">
          <span className="brand-name">PCAI Tracker</span>
          <span className="brand-sub">Engagements</span>
        </span>
      </div>

      <div className="side-label">Workspace</div>
      <nav className="side-nav">
        {NAV.map(({ key, label, Icon }) => (
          <a
            key={key}
            href={viewToPath(key)}
            className={"side-item" + (view === key ? " active" : "")}
            onClick={(e) => {
              // Let the browser handle new-tab / new-window gestures.
              if (
                e.metaKey ||
                e.ctrlKey ||
                e.shiftKey ||
                e.altKey ||
                e.button !== 0
              )
                return;
              e.preventDefault();
              navigate(viewToPath(key));
            }}
            aria-current={view === key ? "page" : undefined}
          >
            <Icon size={17} />
            {label}
          </a>
        ))}
      </nav>

      <div className="side-foot">
        <div className="side-label side-foot-label">Appearance</div>
        <div className="theme-switch" role="group" aria-label="Colour theme">
          <button
            className={"theme-opt" + (theme === "light" ? " active" : "")}
            onClick={() => setTheme("light")}
            aria-pressed={theme === "light"}
          >
            <IconSun size={14} />
            Light
          </button>
          <button
            className={"theme-opt" + (theme === "dark" ? " active" : "")}
            onClick={() => setTheme("dark")}
            aria-pressed={theme === "dark"}
          >
            <IconMoon size={14} />
            Dark
          </button>
        </div>

        <div className="side-user">
          <span className="side-user-id">
            <Avatar name={user} />
            <span className="side-user-name" title={user}>
              {user}
            </span>
          </span>
          <button
            className="side-signout"
            onClick={onLogout}
            title="Sign out"
            aria-label="Sign out"
          >
            <IconClose size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { user, login, logout } = useUser();
  const { view, navigate } = useRoute(); // "recent" | "all" | "reports" | "settings"

  const [theme, setTheme] = useTheme();

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
    if (!user) return;
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
  }, [search, view, user]);

  // Tick every second so "In Progress" testing timers advance live.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function loadOptions() {
    if (!user) return;
    try {
      const data = await getOptions();
      setOptions(data);
    } catch (e) {
      /* keep previous options on failure */
    }
  }

  useEffect(() => {
    loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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

  // Sortable header cell.
  function Th({ colKey, children }) {
    const active = sortKey === colKey;
    return (
      <th
        className={"sortable" + (active ? " sorted" : "")}
        onClick={() => toggleSort(colKey)}
      >
        <span className="th-inner">
          {children}
          <IconChevron
            size={13}
            className={
              "icon sort-ind" + (active && sortDir === "asc" ? " asc" : "")
            }
          />
        </span>
      </th>
    );
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

  const isList = view === "recent" || view === "all";
  const page = PAGES[view];

  // Gate: no username, no access. Placed after all hooks so hook order is stable.
  if (!user) {
    return <Login onLogin={login} theme={theme} setTheme={setTheme} />;
  }

  return (
    <div className="app">
      <Sidebar
        view={view}
        navigate={navigate}
        theme={theme}
        setTheme={setTheme}
        user={user}
        onLogout={logout}
      />

      <div className="main">
        <header className="topbar">
          <div className="topbar-title">
            <h1>{page.title}</h1>
            <p>{page.subtitle}</p>
          </div>

          <div className="topbar-actions">
            {isList && (
              <>
                <div className="search-wrap">
                  <IconSearch size={15} />
                  <input
                    className="search"
                    placeholder="Search customer, PM, resource, tickets…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <button
                  className="btn btn-icon"
                  onClick={load}
                  title="Refresh"
                  aria-label="Refresh"
                >
                  <IconRefresh size={16} />
                </button>
                <button className="btn btn-primary" onClick={openNew}>
                  <IconPlus size={16} />
                  New Engagement
                </button>
              </>
            )}
          </div>
        </header>

        {view === "reports" ? (
          <Reports />
        ) : view === "settings" ? (
          <Settings onChanged={loadOptions} />
        ) : (
          <div className="content">
            <div className="stats">
              <div className="stat-card">
                <span className="stat-icon">
                  <IconCheckCircle size={19} />
                </span>
                <div className="stat-body">
                  <div className="num">{doneCount}</div>
                  <div className="lbl">Testing Done</div>
                </div>
              </div>
              <div className="stat-card">
                <span className="stat-icon tone-info">
                  <IconTimer size={19} />
                </span>
                <div className="stat-body">
                  <div className="num">{fmtDuration(totalHours)}</div>
                  <div className="lbl">Total Hours (Done)</div>
                </div>
              </div>
            </div>

            {error && (
              <div className="error-banner">
                <IconAlert size={16} />
                {error}
              </div>
            )}

            <div className="toolbar">
              <div className="search-wrap flt">
                <IconSearch size={14} />
                <input
                  placeholder="Filter customer…"
                  value={fltCustomer}
                  onChange={(e) => setFltCustomer(e.target.value)}
                />
              </div>
              <select
                className="flt"
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
              <select
                className="flt"
                value={fltStatus}
                onChange={(e) => setFltStatus(e.target.value)}
              >
                <option value="">All statuses</option>
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Paused">Paused</option>
                <option value="Done">Done</option>
              </select>
              {!loading && (
                <span className="result-count">
                  {displayRows.length}
                  {displayRows.length === 1 ? " engagement" : " engagements"}
                </span>
              )}
            </div>

            <div className="table-card">
              <div className="table-scroll">
                <table>
                  <colgroup>
                    <col style={{ width: "26%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "19%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "13%" }} />
                    <col style={{ width: "14%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <Th colKey="customer">Customer</Th>
                      <Th colKey="testing_date">Testing Date</Th>
                      <Th colKey="testing_resource">Testing Resource</Th>
                      <Th colKey="testing_status">Testing Status</Th>
                      <Th colKey="testing_hours">Testing Hours</Th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading &&
                      Array.from({ length: 6 }).map((_, i) => (
                        <tr key={"s" + i}>
                          {Array.from({ length: 6 }).map((__, j) => (
                            <td key={j}>
                              <span
                                className="skel"
                                style={{
                                  width: `${[70, 55, 65, 50, 45, 60][j]}%`,
                                  opacity: 1 - i * 0.13,
                                }}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}

                    {!loading && displayRows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="table-msg">
                          <div className="empty">
                            <IconInbox />
                            <span className="empty-title">
                              {view === "recent"
                                ? "No testings in the last 30 days"
                                : "No engagements found"}
                            </span>
                            <span className="empty-sub">
                              Try clearing the filters or adding a new
                              engagement.
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}

                    {!loading &&
                      displayRows.map((row) => {
                        const ev = rowEval(row, today);
                        const live = row.testing_status === "In Progress";
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
                              <span className="cust-inner">
                                {ev.cls === "row-invalid" && (
                                  <span
                                    className="warn-mark"
                                    title={ev.problems.join("\n")}
                                  >
                                    <IconAlert />
                                  </span>
                                )}
                                <span className="cust-name">
                                  {row.customer}
                                </span>
                              </span>
                            </td>
                            <td>
                              {fmtDate(row.testing_date) || (
                                <span className="cell-empty">—</span>
                              )}
                            </td>
                            <td title={row.testing_resource || ""}>
                              {row.testing_resource ? (
                                <span className="res-cell">
                                  <Avatar name={row.testing_resource} />
                                  <span>{row.testing_resource}</span>
                                </span>
                              ) : (
                                <span className="cell-empty">—</span>
                              )}
                            </td>
                            <td>
                              <Badge status={row.testing_status} />
                            </td>
                            <td>
                              <span
                                className={"timer" + (live ? " timer-live" : "")}
                                title="Total time in 'In Progress'"
                              >
                                {live && <span className="timer-pulse" />}
                                {fmtDuration(liveHours(row))}
                              </span>
                            </td>
                            <td className="actions-cell">
                              <span className="seg">
                                <button
                                  className={
                                    "icon-btn" + (live ? " active" : "")
                                  }
                                  title="Set In Progress (Play)"
                                  aria-label="Set In Progress"
                                  onClick={(e) =>
                                    handleStatus(row, "In Progress", e)
                                  }
                                >
                                  <IconPlay />
                                </button>
                                <button
                                  className={
                                    "icon-btn tone-violet" +
                                    (row.testing_status === "Blocked"
                                      ? " active"
                                      : "")
                                  }
                                  title="Set Blocked (Pause)"
                                  aria-label="Set Blocked"
                                  onClick={(e) =>
                                    handleStatus(row, "Blocked", e)
                                  }
                                >
                                  <IconPause />
                                </button>
                                <button
                                  className={
                                    "icon-btn tone-ok" +
                                    (row.testing_status === "Done"
                                      ? " active"
                                      : "")
                                  }
                                  title="Set Done"
                                  aria-label="Set Done"
                                  onClick={(e) => handleStatus(row, "Done", e)}
                                >
                                  <IconCheck />
                                </button>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

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
