import React, { useEffect, useState } from "react";
import { getOptions, updateOptions, getSettings, updateSettings } from "./api";
import {
  IconAlert,
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconClose,
  IconPlus,
} from "./Icons";

// Only this user may edit settings, and only after entering the password.
const ADMIN_USER = "admin";
const ADMIN_PASSWORD = "admin.12345";

const CATEGORIES = [
  {
    key: "testing_resource",
    title: "Resources",
    sub: "People available to be assigned to engagements.",
  },
  {
    key: "testing_status",
    title: "Testing Status",
    sub: "Status values available for testing.",
  },
  {
    key: "orientation_status",
    title: "Orientation Status",
    sub: "Status values available for orientation.",
  },
];

function OptionEditor({ meta, values, onSave, readOnly }) {
  const [list, setList] = useState(values);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    setList(values);
  }, [values]);

  function add() {
    if (readOnly) return;
    const v = draft.trim();
    if (!v || list.includes(v)) {
      setDraft("");
      return;
    }
    setList([...list, v]);
    setDraft("");
  }

  function remove(i) {
    setList(list.filter((_, idx) => idx !== i));
  }

  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  }

  function edit(i, value) {
    const next = [...list];
    next[i] = value;
    setList(next);
  }

  async function save() {
    if (readOnly) return;
    setSaving(true);
    try {
      const cleaned = list.map((v) => v.trim()).filter((v) => v !== "");
      const saved = await onSave(meta.key, cleaned);
      setList(saved);
      setSavedAt(Date.now());
    } catch (e) {
      alert("Save failed: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="chart-card">
      <div className="chart-head">
        <h4>{meta.title}</h4>
        <span className="chart-total">{list.length}</span>
        <span className="chart-sub">{meta.sub}</span>
      </div>

      <ul className="opt-list">
        {list.map((v, i) => (
          <li key={i} className="opt-row">
            <input
              className="opt-input"
              value={v}
              disabled={readOnly}
              onChange={(e) => edit(i, e.target.value)}
            />
            <div className="opt-actions">
              <button
                type="button"
                className="btn"
                onClick={() => move(i, -1)}
                disabled={readOnly || i === 0}
                title="Move up"
                aria-label="Move up"
              >
                <IconArrowUp />
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => move(i, 1)}
                disabled={readOnly || i === list.length - 1}
                title="Move down"
                aria-label="Move down"
              >
                <IconArrowDown />
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => remove(i)}
                disabled={readOnly}
                title="Remove"
                aria-label="Remove"
              >
                <IconClose />
              </button>
            </div>
          </li>
        ))}
        {list.length === 0 && (
          <li className="opt-empty">No values yet — add one below.</li>
        )}
      </ul>

      <div className="opt-add">
        <input
          className="opt-input"
          placeholder="Add a new value…"
          value={draft}
          disabled={readOnly}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn" onClick={add} disabled={readOnly}>
          <IconPlus size={15} />
          Add
        </button>
      </div>

      <div className="opt-save">
        {savedAt && (
          <span className="opt-saved">
            <IconCheck size={14} />
            Saved
          </span>
        )}
        <button
          type="button"
          className="btn btn-primary"
          onClick={save}
          disabled={readOnly || saving}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

function PasswordGate({ onUnlock }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");

  function submit(e) {
    e.preventDefault();
    if (pw === ADMIN_PASSWORD) {
      onUnlock();
    } else {
      setError("Incorrect password.");
    }
  }

  return (
    <div className="modal-overlay">
      <form
        className="modal pw-modal"
        role="dialog"
        aria-modal="true"
        onSubmit={submit}
      >
        <div className="modal-head">
          <h3>Admin access</h3>
        </div>
        <div className="modal-body">
          <p className="pw-note">
            Enter the admin password to edit settings.
          </p>
          <label className="login-field">
            <span>Password</span>
            <input
              autoFocus
              type="password"
              value={pw}
              onChange={(e) => {
                setPw(e.target.value);
                if (error) setError("");
              }}
              aria-invalid={error ? "true" : undefined}
            />
          </label>
          {error && <div className="login-error">{error}</div>}
        </div>
        <div className="modal-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!pw}
          >
            Unlock
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Settings({ user, onChanged, onSettingsChanged }) {
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isAdmin = user === ADMIN_USER;
  // Admins must enter the password before editing; everyone else is read-only.
  const [unlocked, setUnlocked] = useState(false);
  const canEdit = isAdmin && unlocked;

  const [allowHoursEdit, setAllowHoursEdit] = useState(false);
  const [savingHours, setSavingHours] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([getOptions(), getSettings()])
      .then(([opts, settings]) => {
        if (!active) return;
        setOptions(opts);
        setAllowHoursEdit(Boolean(settings && settings.allow_hours_edit));
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  async function handleSave(category, values) {
    const res = await updateOptions(category, values);
    const saved = res[category] || [];
    setOptions((prev) => ({ ...prev, [category]: saved }));
    if (onChanged) onChanged();
    return saved;
  }

  async function toggleHoursEdit(next) {
    setSavingHours(true);
    const prev = allowHoursEdit;
    setAllowHoursEdit(next);
    try {
      const res = await updateSettings({ allow_hours_edit: next });
      setAllowHoursEdit(Boolean(res && res.allow_hours_edit));
      if (onSettingsChanged) onSettingsChanged();
    } catch (e) {
      setAllowHoursEdit(prev);
      alert("Save failed: " + e.message);
    } finally {
      setSavingHours(false);
    }
  }

  if (loading)
    return (
      <div className="content">
        <div className="settings-grid">
          {CATEGORIES.map((c) => (
            <div className="chart-card" key={c.key}>
              <span className="skel" style={{ width: "40%", height: 13 }} />
              <div className="chart-empty" style={{ marginTop: 14 }}>
                Loading settings…
              </div>
            </div>
          ))}
        </div>
      </div>
    );

  if (error)
    return (
      <div className="content">
        <div className="error-banner">
          <IconAlert size={16} />
          {error}
        </div>
      </div>
    );

  return (
    <div className="content">
      {isAdmin && !unlocked && (
        <PasswordGate onUnlock={() => setUnlocked(true)} />
      )}

      {!isAdmin && (
        <div className="settings-notice">
          <IconAlert size={16} />
          You are signed in as “{user}”. Only the admin can change settings, so
          they are shown in read-only mode.
        </div>
      )}

      <div className="chart-card settings-toggle-card">
        <div className="chart-head">
          <h4>Hours Editing</h4>
          <span className="chart-sub">
            Control whether testing &amp; orientation hours can be edited on a
            record.
          </span>
        </div>
        <label className="settings-check">
          <input
            type="checkbox"
            checked={allowHoursEdit}
            disabled={!canEdit || savingHours}
            onChange={(e) => toggleHoursEdit(e.target.checked)}
          />
          <span>
            Enable editing of testing and orientation hours when editing a
            record
          </span>
        </label>
      </div>

      <div className="settings-grid">
        {CATEGORIES.map((meta) => (
          <OptionEditor
            key={meta.key}
            meta={meta}
            values={
              meta.key === "testing_resource"
                ? (options[meta.key] || []).filter(
                    (v) => v.toLowerCase() !== "admin"
                  )
                : options[meta.key] || []
            }
            onSave={handleSave}
            readOnly={!canEdit}
          />
        ))}
      </div>
    </div>
  );
}
