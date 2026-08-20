import React, { useEffect, useState } from "react";
import { getOptions, updateOptions } from "./api";
import {
  IconAlert,
  IconArrowDown,
  IconArrowUp,
  IconCheck,
  IconClose,
  IconPlus,
} from "./Icons";

const CATEGORIES = [
  {
    key: "testing_resource",
    title: "Testing Resource",
    sub: "People available to be assigned as testing resources.",
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

function OptionEditor({ meta, values, onSave }) {
  const [list, setList] = useState(values);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    setList(values);
  }, [values]);

  function add() {
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
              onChange={(e) => edit(i, e.target.value)}
            />
            <div className="opt-actions">
              <button
                type="button"
                className="btn"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                title="Move up"
                aria-label="Move up"
              >
                <IconArrowUp />
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => move(i, 1)}
                disabled={i === list.length - 1}
                title="Move down"
                aria-label="Move down"
              >
                <IconArrowDown />
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => remove(i)}
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
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn" onClick={add}>
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
          disabled={saving}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>
    </div>
  );
}

export default function Settings({ onChanged }) {
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getOptions()
      .then((data) => active && setOptions(data))
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
      <div className="settings-grid">
        {CATEGORIES.map((meta) => (
          <OptionEditor
            key={meta.key}
            meta={meta}
            values={options[meta.key] || []}
            onSave={handleSave}
          />
        ))}
      </div>
    </div>
  );
}
