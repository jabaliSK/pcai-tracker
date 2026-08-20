import React, { useEffect, useMemo, useState } from "react";
import { IconAlert, IconClose } from "./Icons";

const TYPE_OPTIONS = ["VPN", "Screen Share"];
const METHOD_OPTIONS = ["Manual", "Automated"];
const DEFAULT_STATUS = ["Pending", "In Progress", "Paused", "Blocked", "Done"];

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

const EMPTY = {
  customer: "",
  pm: "",
  type: "",
  testing_method: "",
  testing_date: "",
  orientation_date: "",
  testing_resource: "",
  orientation_resource: "",
  screen_share_resource: "",
  vpn_app_ip: "",
  vpn_user: "",
  vpn_pass: "",
  vpn_details: "",
  testing_status: "",
  orientation_status: "",
  testing_hours: "",
  orientation_hours: "",
  orientation_feedback: "",
  comments: "",
  tickets: "",
};

function toForm(initial) {
  if (!initial) {
    return {
      ...EMPTY,
      testing_date: todayISO(),
      testing_status: "Pending",
      testing_hours: "0",
    };
  }
  const out = { ...EMPTY };
  for (const k of Object.keys(EMPTY)) {
    out[k] = initial[k] ?? "";
  }
  return out;
}

const ORIENTATION_FIELDS = new Set([
  "orientation_date",
  "orientation_resource",
  "orientation_status",
  "orientation_hours",
  "orientation_feedback",
]);

const CONNECTION_FIELDS = new Set([
  "screen_share_resource",
  "vpn_app_ip",
  "vpn_user",
  "vpn_pass",
  "vpn_details",
]);

const TABS = [
  { key: "testing", label: "Testing" },
  { key: "connection", label: "Connection" },
  { key: "orientation", label: "Orientation" },
];

export default function EngagementForm({ initial, options, onCancel, onSave }) {
  const [form, setForm] = useState(() => toForm(initial));
  const [activeTab, setActiveTab] = useState("testing");
  const isEdit = Boolean(initial && initial.uid);
  const isVpn = form.type === "VPN";
  const isScreenShare = form.type === "Screen Share";

  const opts = options || {};
  const resourceOptions = opts.testing_resource || [];
  const testingStatusOptions = opts.testing_status || DEFAULT_STATUS;
  const orientationStatusOptions = opts.orientation_status || DEFAULT_STATUS;

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const errors = useMemo(() => {
    const e = {};
    const required = [
      ["customer", "Customer"],
      ["pm", "PM"],
      ["type", "Type"],
      ["testing_date", "Testing Date"],
      ["testing_resource", "Testing Resource"],
      ["testing_status", "Testing Status"],
    ];
    for (const [key, label] of required) {
      if (String(form[key]).trim() === "") e[key] = `${label} is required`;
    }
    if (isVpn) {
      const vpnReq = [
        ["vpn_app_ip", "VPN App / IP"],
        ["vpn_user", "VPN Username"],
        ["vpn_pass", "VPN Password"],
        ["vpn_details", "VPN Details"],
      ];
      for (const [key, label] of vpnReq) {
        if (String(form[key]).trim() === "") e[key] = `${label} is required`;
      }
    }
    // Orientation cross-field rules
    const has = (k) => String(form[k]).trim() !== "";
    const oResource = has("orientation_resource");
    const oDate = has("orientation_date");
    const oFeedback = has("orientation_feedback");
    const oHours = has("orientation_hours");
    if (oResource) {
      if (!oDate) e.orientation_date = "Orientation Date is required";
      if (!oFeedback)
        e.orientation_feedback = "Orientation Feedback is required";
    }
    if (oDate) {
      if (!oResource)
        e.orientation_resource = "Orientation Resource is required";
      if (!oFeedback)
        e.orientation_feedback = "Orientation Feedback is required";
    }
    if (oFeedback) {
      if (!oHours) e.orientation_hours = "Orientation Hrs is required";
      if (!oResource)
        e.orientation_resource = "Orientation Resource is required";
      if (!oDate) e.orientation_date = "Orientation Date is required";
    }
    return e;
  }, [form, isVpn]);

  // Which fields are mandatory given the current state.
  const mandatory = useMemo(() => {
    const m = new Set([
      "customer",
      "pm",
      "type",
      "testing_date",
      "testing_resource",
      "testing_status",
    ]);
    if (isVpn) {
      m.add("vpn_app_ip");
      m.add("vpn_user");
      m.add("vpn_pass");
      m.add("vpn_details");
    }
    const has = (k) => String(form[k]).trim() !== "";
    if (has("orientation_resource") || has("orientation_date") || has("orientation_feedback")) {
      m.add("orientation_resource");
      m.add("orientation_date");
      m.add("orientation_feedback");
    }
    if (has("orientation_feedback")) m.add("orientation_hours");
    return m;
  }, [form, isVpn]);

  // Class for a form control: mark mandatory, and flag when empty/invalid.
  function ctlCls(key) {
    let c = "";
    if (mandatory.has(key)) c += " req-field";
    if (errors[key]) c += " field-missing";
    return c.trim();
  }

  // Label text, with a dot when the field is currently mandatory.
  function Lbl({ name, children }) {
    return (
      <span className="lbl-text">
        {children}
        {mandatory.has(name) && <span className="req-dot" />}
      </span>
    );
  }

  function submit(e) {
    e.preventDefault();
    if (Object.keys(errors).length > 0) {
      // Jump to the tab containing the first missing field so the user sees it.
      const firstBadKey = Object.keys(errors)[0];
      const targetTab = ORIENTATION_FIELDS.has(firstBadKey)
        ? "orientation"
        : CONNECTION_FIELDS.has(firstBadKey)
        ? "connection"
        : "testing";
      if (activeTab !== targetTab) setActiveTab(targetTab);
      alert(
        "Please fill in all required fields:\n\n" +
          Object.values(errors).join("\n")
      );
      return;
    }
    const payload = {};
    for (const [k, v] of Object.entries(form)) {
      if (k === "testing_hours" || k === "orientation_hours") {
        payload[k] = v === "" ? null : Number(v);
      } else {
        payload[k] = v === "" ? null : v;
      }
    }
    // Clear connection fields that don't apply to the chosen type
    if (isScreenShare) {
      payload.vpn_app_ip = null;
      payload.vpn_user = null;
      payload.vpn_pass = null;
      payload.vpn_details = null;
    } else if (isVpn) {
      payload.screen_share_resource = null;
    }
    onSave(payload);
  }

  const tabErrors = {
    testing: Object.keys(errors).some(
      (k) => !ORIENTATION_FIELDS.has(k) && !CONNECTION_FIELDS.has(k)
    ),
    connection: Object.keys(errors).some((k) => CONNECTION_FIELDS.has(k)),
    orientation: Object.keys(errors).some((k) => ORIENTATION_FIELDS.has(k)),
  };

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{isEdit ? "Edit Engagement" : "New Engagement"}</h3>
          <button className="close" onClick={onCancel} aria-label="Close">
            <IconClose size={17} />
          </button>
        </div>

        <form onSubmit={submit} className="modal-form">
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
                  {tabErrors[t.key] && (
                    <span className="tab-warn" aria-label="Missing fields">
                      !
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div
              className="grid"
              style={{ display: activeTab === "testing" ? "grid" : "none" }}
            >
              <div className="section-divider">Engagement</div>
              <label>
                <Lbl name="customer">Customer</Lbl>
                <input
                  className={ctlCls("customer")}
                  value={form.customer}
                  placeholder="Customer name"
                  onChange={(e) => set("customer", e.target.value)}
                />
              </label>
              <label>
                <Lbl name="pm">PM</Lbl>
                <input
                  className={ctlCls("pm")}
                  value={form.pm}
                  placeholder="Project manager"
                  onChange={(e) => set("pm", e.target.value)}
                />
              </label>
              <label>
                <Lbl name="type">Type</Lbl>
                <select
                  className={ctlCls("type")}
                  value={form.type}
                  onChange={(e) => set("type", e.target.value)}
                >
                  <option value="">— Select —</option>
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Lbl name="tickets">Tickets</Lbl>
                <input
                  value={form.tickets}
                  placeholder="Ticket reference"
                  onChange={(e) => set("tickets", e.target.value)}
                />
              </label>

              <div className="section-divider">Testing</div>
              <label>
                <Lbl name="testing_date">Testing Date</Lbl>
                <input
                  className={ctlCls("testing_date")}
                  type="date"
                  value={form.testing_date}
                  onChange={(e) => set("testing_date", e.target.value)}
                />
              </label>
              <label>
                <Lbl name="testing_method">Testing Method</Lbl>
                <select
                  value={form.testing_method}
                  onChange={(e) => set("testing_method", e.target.value)}
                >
                  <option value="">— Select —</option>
                  {METHOD_OPTIONS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <Lbl name="testing_resource">Testing Resource</Lbl>
                <select
                  className={ctlCls("testing_resource")}
                  value={form.testing_resource}
                  onChange={(e) => set("testing_resource", e.target.value)}
                >
                  <option value="">— Select —</option>
                  {resourceOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                  {form.testing_resource &&
                    !resourceOptions.includes(form.testing_resource) && (
                      <option value={form.testing_resource}>
                        {form.testing_resource}
                      </option>
                    )}
                </select>
              </label>
              <label>
                <Lbl name="testing_status">Testing Status</Lbl>
                <select
                  className={ctlCls("testing_status")}
                  value={form.testing_status}
                  onChange={(e) => set("testing_status", e.target.value)}
                >
                  <option value="">— Select —</option>
                  {testingStatusOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                  {form.testing_status &&
                    !testingStatusOptions.includes(form.testing_status) && (
                      <option value={form.testing_status}>
                        {form.testing_status}
                      </option>
                    )}
                </select>
              </label>
              <label>
                <Lbl name="testing_hours">Test Hrs (auto)</Lbl>
                <input
                  type="number"
                  value={form.testing_hours}
                  readOnly
                  disabled
                  title="Auto-calculated from time spent in 'In Progress' status"
                />
              </label>

              <div className="section-divider">Notes</div>
              <label className="full">
                <Lbl name="comments">Comments</Lbl>
                <textarea
                  rows={3}
                  value={form.comments}
                  placeholder="Anything worth remembering about this engagement…"
                  onChange={(e) => set("comments", e.target.value)}
                />
              </label>
            </div>

            <div
              className="grid"
              style={{
                display: activeTab === "connection" ? "grid" : "none",
              }}
            >
              <div className="section-divider">Connection</div>
              {!form.type && (
                <div className="hint">
                  <IconAlert size={15} />
                  Select a Type on the Testing tab to enable the relevant
                  connection fields.
                </div>
              )}
              {isScreenShare && (
                <label className="full">
                  <Lbl name="screen_share_resource">Screen Share Resource</Lbl>
                  <input
                    value={form.screen_share_resource}
                    onChange={(e) =>
                      set("screen_share_resource", e.target.value)
                    }
                  />
                </label>
              )}
              <label>
                <Lbl name="vpn_app_ip">VPN App / IP</Lbl>
                <input
                  className={ctlCls("vpn_app_ip")}
                  value={form.vpn_app_ip}
                  disabled={!isVpn}
                  onChange={(e) => set("vpn_app_ip", e.target.value)}
                />
              </label>
              <label>
                <Lbl name="vpn_user">VPN Username</Lbl>
                <input
                  className={ctlCls("vpn_user")}
                  value={form.vpn_user}
                  disabled={!isVpn}
                  onChange={(e) => set("vpn_user", e.target.value)}
                />
              </label>
              <label>
                <Lbl name="vpn_pass">VPN Password</Lbl>
                <input
                  className={ctlCls("vpn_pass")}
                  value={form.vpn_pass}
                  disabled={!isVpn}
                  onChange={(e) => set("vpn_pass", e.target.value)}
                />
              </label>
              <label className="full">
                <Lbl name="vpn_details">VPN Details</Lbl>
                <textarea
                  className={ctlCls("vpn_details")}
                  rows={4}
                  value={form.vpn_details}
                  disabled={!isVpn}
                  placeholder="Long-form VPN connection notes, host entries, etc."
                  onChange={(e) => set("vpn_details", e.target.value)}
                />
              </label>
            </div>

            <div
              className="grid"
              style={{
                display: activeTab === "orientation" ? "grid" : "none",
              }}
            >
              <div className="section-divider">Orientation</div>
              <label>
                <Lbl name="orientation_date">Orientation Date</Lbl>
                <input
                  className={ctlCls("orientation_date")}
                  type="date"
                  value={form.orientation_date}
                  onChange={(e) => set("orientation_date", e.target.value)}
                />
              </label>
              <label>
                <Lbl name="orientation_resource">Orientation Resource</Lbl>
                <input
                  className={ctlCls("orientation_resource")}
                  value={form.orientation_resource}
                  onChange={(e) => set("orientation_resource", e.target.value)}
                />
              </label>
              <label>
                <Lbl name="orientation_status">Orientation Status</Lbl>
                <select
                  value={form.orientation_status}
                  onChange={(e) => set("orientation_status", e.target.value)}
                >
                  <option value="">— Select —</option>
                  {orientationStatusOptions.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                  {form.orientation_status &&
                    !orientationStatusOptions.includes(
                      form.orientation_status
                    ) && (
                      <option value={form.orientation_status}>
                        {form.orientation_status}
                      </option>
                    )}
                </select>
              </label>
              <label>
                <Lbl name="orientation_hours">Orientation Hrs</Lbl>
                <input
                  className={ctlCls("orientation_hours")}
                  type="number"
                  min="0"
                  value={form.orientation_hours}
                  onChange={(e) => set("orientation_hours", e.target.value)}
                />
              </label>
              <label className="full">
                <Lbl name="orientation_feedback">Orientation Feedback</Lbl>
                <textarea
                  className={ctlCls("orientation_feedback")}
                  rows={4}
                  value={form.orientation_feedback}
                  placeholder="Long-form orientation feedback / notes."
                  onChange={(e) =>
                    set("orientation_feedback", e.target.value)
                  }
                />
              </label>
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {isEdit ? "Save Changes" : "Create Engagement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
