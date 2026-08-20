import { useCallback, useEffect, useState } from "react";

const KEY = "pcai-user";

export function getStoredUser() {
  try {
    return localStorage.getItem(KEY) || "";
  } catch (e) {
    return "";
  }
}

/**
 * Minimal username-only session. The username is persisted in localStorage so
 * it is shared across tabs of the same origin (open a page in a new tab and it
 * stays signed in). There is no password — an empty username means no access.
 */
export function useUser() {
  const [user, setUser] = useState(getStoredUser);

  // Keep tabs in sync: signing in / out in one tab updates the others.
  useEffect(() => {
    function onStorage(e) {
      if (e.key === KEY) setUser(e.newValue || "");
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const login = useCallback((name) => {
    const clean = String(name || "").trim();
    if (!clean) return false;
    try {
      localStorage.setItem(KEY, clean);
    } catch (e) {
      /* storage unavailable — session just won't persist */
    }
    setUser(clean);
    return true;
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch (e) {
      /* ignore */
    }
    setUser("");
  }, []);

  return { user, login, logout };
}
