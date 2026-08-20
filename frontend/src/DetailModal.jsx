import React, { useEffect, useState } from "react";
import { fmtDate } from "./format";
import { getStatusEvents } from "./api";
import { Avatar, Badge, fmtDuration } from "./ui";
import { IconAlert, IconClose, IconEdit, IconTrash } from "./Icons";

function Item({ label, value, full, missing, children }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div
      className={
        "detail-item" + (full ? " full" : "") + (missing ? " missing" : "")
      }
    >
      <div className="k">
        {missing && <IconAlert size={12} />}
        {label}
      </div>
      <div className={"v" + (empty && !children ? " empty" : "")}>
        {children || (empty ? "—" : value)}
      </div>
    </div>
  );
}

function filled(v) {
  return v !== null && v !== undefined && String(v).trim() !== "";
}

function isDone(s) {
  return String(s || "").toLowerCase() === "done";
}

// Set of mandatory fields that are missing / inconsistent for this record.
function missingFields(r) {
  const m = new Set();
  const need = (k) => {
    if (!filled(r[k])) m.add(k);
  };
  ["customer", "pm", "type", "testing_date", "testing_resource", "testing_status"].forEach(need);
  if (isDone(r.orientation_status) && !filled(r.orientation_hours))
    m.add("orientation_hours");
  if (String(r.type).toLowerCase() === "vpn") {
    ["vpn_app_ip", "vpn_user", "vpn_pass", "vpn_details"].forEach(need);
  }
  const oR = filled(r.orientation_resource);
  const oD = filled(r.orientation_date);
  const oF = filled(r.orientation_feedback);
  if (oR || oD || oF) {
    if (!oR) m.add("orientation_resource");
    if (!oD) m.add("orientation_date");
    if (!oF) m.add("orientation_feedback");
  }
  if (oF && !filled(r.orientation_hours)) m.add("orientation_hours");
  return m;
}

const TABS = [
  { key: "testing", label: "Testing" },
  { key: "connection", label: "Connection" },
  { key: "orientation", label: "Orientation" },
];

export default function DetailModal({ record, onClose, onEdit, onDelete }) {
  const isVpn = String(record.type).toLowerCase() === "vpn";
  const miss = missingFields(record);
  const mi = (k) => miss.has(k);
  const [activeTab, setActiveTab] = useState("testing");

  const [events, setEvents] = useState([]);
  useEffect(() => {
    let active = true;
    getStatusEvents(record.uid)
      .then((data) => active && setEvents(data))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [record.uid]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function fmtTs(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{record.customer}</h3>
          <div className="detail-head-meta">
            <Badge status={record.testing_status} fallback="" />
            {record.type && <span className="badge badge-other">{record.type}</span>}
          </div>
          <button className="close" onClick={onClose} aria-label="Close">
            <IconClose size={17} />
          </button>
        </div>

        <div className="modal-body">
          <div className="form-tabs" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={activeTab === t.key}
                className={"form-tab" + (activeTab === t.key ? " active" : "")}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div style={{ display: activeTab === "testing" ? "block" : "none" }}>
            <div className="detail-grid">
              <div className="detail-section-title">Engagement</div>
              <Item label="Customer" value={record.customer} missing={mi("customer")} />
              <Item label="PM" value={record.pm} missing={mi("pm")} />
              <Item label="Type" value={record.type} missing={mi("type")} />
              <Item label="Tickets" value={record.tickets} />

              <div className="detail-section-title">Testing</div>
              <Item
                label="Testing Date"
                value={fmtDate(record.testing_date)}
                missing={mi("testing_date")}
              />
              <Item label="Testing Method" value={record.testing_method} />
              <Item
                label="Testing Resource"
                value={record.testing_resource}
                missing={mi("testing_resource")}
              >
                {record.testing_resource ? (
                  <span className="res-cell">
                    <Avatar name={record.testing_resource} />
                    <span>{record.testing_resource}</span>
                  </span>
                ) : null}
              </Item>
              <Item
                label="Testing Status"
                value={record.testing_status}
                missing={mi("testing_status")}
              >
                {record.testing_status ? (
                  <Badge status={record.testing_status} />
                ) : null}
              </Item>
              <Item
                label="Testing Hours"
                value={
                  record.testing_hours != null
                    ? `${fmtDuration(record.testing_hours)} (auto)`
                    : record.testing_hours
                }
                missing={mi("testing_hours")}
              />

              <div className="detail-section-title">Notes</div>
              <Item label="Comments" value={record.comments} full />
            </div>

            <div className="detail-section-title">Testing Status History</div>
            {events.length === 0 ? (
              <div className="muted" style={{ padding: "6px 0", fontSize: 13 }}>
                No status changes recorded yet.
              </div>
            ) : (
              <ul className="status-timeline">
                {events.map((e) => (
                  <li key={e.id} className="status-entry">
                    <span className="status-dot" />
                    <span className="status-name">{e.status || "—"}</span>
                    <span className="status-time">{fmtTs(e.changed_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div
            style={{ display: activeTab === "connection" ? "block" : "none" }}
          >
            <div className="detail-grid">
              <div className="detail-section-title">Connection</div>
              {isVpn ? (
                <>
                  <Item
                    label="VPN App / IP"
                    value={record.vpn_app_ip}
                    missing={mi("vpn_app_ip")}
                  />
                  <Item
                    label="VPN User"
                    value={record.vpn_user}
                    missing={mi("vpn_user")}
                  />
                  <Item
                    label="VPN Password"
                    value={record.vpn_pass}
                    missing={mi("vpn_pass")}
                  />
                  <Item
                    label="VPN Details"
                    value={record.vpn_details}
                    missing={mi("vpn_details")}
                    full
                  />
                </>
              ) : (
                <Item
                  label="Screen Share Resource"
                  value={record.screen_share_resource}
                />
              )}
            </div>
          </div>

          <div
            style={{ display: activeTab === "orientation" ? "block" : "none" }}
          >
            <div className="detail-grid">
              <div className="detail-section-title">Orientation</div>
              <Item
                label="Orientation Date"
                value={fmtDate(record.orientation_date)}
                missing={mi("orientation_date")}
              />
              <Item
                label="Orientation Resource"
                value={record.orientation_resource}
                missing={mi("orientation_resource")}
              />
              <Item
                label="Orientation Status"
                value={record.orientation_status}
              >
                {record.orientation_status ? (
                  <Badge status={record.orientation_status} />
                ) : null}
              </Item>
              <Item
                label="Orientation Hours"
                value={record.orientation_hours}
                missing={mi("orientation_hours")}
              />
              <Item
                label="Orientation Feedback"
                value={record.orientation_feedback}
                missing={mi("orientation_feedback")}
                full
              />
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-danger" onClick={() => onDelete(record)}>
            <IconTrash size={15} />
            Delete
          </button>
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary" onClick={() => onEdit(record)}>
            <IconEdit size={15} />
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}
