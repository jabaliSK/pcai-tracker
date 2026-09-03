import React, { useEffect, useState } from "react";
import hpeLogo from "./assets/HPE_logo_full-clr_rev_rgb.png";
import { IconMoon, IconSun } from "./Icons";
import { getOptions } from "./api";

/**
 * Username-only sign-in. There is no password. Access is limited to the people
 * configured as Resources (in Settings) plus the reserved "admin" user.
 */
export default function Login({ onLogin, theme, setTheme }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  // Canonical list of allowed names: configured resources + "admin".
  const [allowed, setAllowed] = useState(["admin"]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    getOptions()
      .then((data) => {
        if (!active) return;
        const resources = (data && data.testing_resource) || [];
        const names = ["admin", ...resources];
        // De-duplicate case-insensitively, keeping canonical casing.
        const seen = new Set();
        const unique = [];
        for (const n of names) {
          const key = String(n).trim().toLowerCase();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          unique.push(String(n).trim());
        }
        setAllowed(unique);
      })
      .catch(() => {
        /* fall back to admin-only if options can't be loaded */
      })
      .finally(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, []);

  function submit(e) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setError("Enter a username to continue.");
      return;
    }
    // Match case-insensitively but sign in with the canonical name.
    const match = allowed.find(
      (n) => n.toLowerCase() === clean.toLowerCase()
    );
    if (!match) {
      setError(
        "Unknown user. Only configured Resources and 'admin' can sign in."
      );
      return;
    }
    onLogin(match);
  }

  return (
    <div className="login">
      <div className="login-theme">
        <button
          className={"theme-opt" + (theme === "light" ? " active" : "")}
          onClick={() => setTheme("light")}
          aria-pressed={theme === "light"}
          type="button"
        >
          <IconSun size={14} />
          Light
        </button>
        <button
          className={"theme-opt" + (theme === "dark" ? " active" : "")}
          onClick={() => setTheme("dark")}
          aria-pressed={theme === "dark"}
          type="button"
        >
          <IconMoon size={14} />
          Dark
        </button>
      </div>

      <form className="login-card" onSubmit={submit}>
        <span className="login-plaque">
          <img
            className="brand-logo"
            src={hpeLogo}
            alt="Hewlett Packard Enterprise"
          />
        </span>

        <div className="login-head">
          <h1>PCAI Tracker</h1>
          <p>Sign in with your username to continue.</p>
        </div>

        <label className="login-field">
          <span>Username</span>
          <input
            autoFocus
            type="text"
            value={name}
            placeholder="e.g. jkaranam"
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError("");
            }}
            aria-invalid={error ? "true" : undefined}
          />
        </label>

        {error && <div className="login-error">{error}</div>}

        <button
          className="btn btn-primary login-submit"
          type="submit"
          disabled={!name.trim() || !ready}
        >
          {ready ? "Continue" : "Loading…"}
        </button>
      </form>
    </div>
  );
}
