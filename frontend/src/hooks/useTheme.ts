import { useCallback, useEffect, useState } from "react";

const THEME_KEY = "lyftr-theme";

/** Light/dark theme. The choice is a per-browser convenience (guarded storage access). */
export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("theme-transition");
    root.classList.toggle("dark", dark);
    const t = window.setTimeout(() => root.classList.remove("theme-transition"), 350);
    return () => window.clearTimeout(t);
  }, [dark]);

  const toggle = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(THEME_KEY, next ? "dark" : "light");
      } catch {
        /* storage unavailable — theme just won't persist */
      }
      return next;
    });
  }, []);

  return { dark, toggle };
}
