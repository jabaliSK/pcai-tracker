import React, { useState } from "react";
import hpeLogo from "./assets/HPE_logo_full-clr_rev_rgb.png";
import { IconMoon, IconSun } from "./Icons";

/**
 * Username-only sign-in. There is no password. Access to the app is blocked
 * until a non-empty username is provided.
 */
export default function Login({ onLogin, theme, setTheme }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  function submit(e) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) {
      setError("Enter a username to continue.");
      return;
    }
    onLogin(clean);
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
          disabled={!name.trim()}
        >
          Continue
        </button>
      </form>
    </div>
  );
}
