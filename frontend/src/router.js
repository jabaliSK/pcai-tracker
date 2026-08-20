import { useCallback, useEffect, useState } from "react";

export const VIEWS = ["recent", "all", "reports", "settings"];

// Map a URL pathname to a known view key. "/" defaults to "recent".
export function pathToView(path) {
  const key = String(path || "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  return VIEWS.includes(key) ? key : "recent";
}

// Map a view key to its URL pathname.
export function viewToPath(view) {
  return "/" + view;
}

/**
 * Tiny history-based router. Real pathnames mean each page has its own URL that
 * can be opened in a new tab, bookmarked or shared, while in-tab navigation
 * stays a single-page transition (no full reload).
 */
export function useRoute() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    function onPop() {
      setPath(window.location.pathname);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to) => {
    if (to !== window.location.pathname) {
      window.history.pushState({}, "", to);
    }
    setPath(to);
  }, []);

  return { view: pathToView(path), navigate };
}
