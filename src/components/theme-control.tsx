"use client";

import { useEffect, useSyncExternalStore } from "react";
import { themeStorageKey as storageKey, type ThemePreference as Preference } from "@/lib/theme";

let currentChoice: Preference | null = null;
function preference(): Preference {
  if (currentChoice) return currentChoice;
  try { const value = localStorage.getItem(storageKey); return value === "light" || value === "dark" ? value : "system"; }
  catch { return "system"; }
}
function subscribe(callback: () => void) {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const storage = (event: StorageEvent) => { if (event.key === storageKey || event.key === null) { currentChoice = null; callback(); } };
  window.addEventListener("storage", storage); window.addEventListener("enicharet:theme", callback); media.addEventListener("change", callback);
  return () => { window.removeEventListener("storage", storage); window.removeEventListener("enicharet:theme", callback); media.removeEventListener("change", callback); };
}
function applyTheme(value: Preference) {
  document.documentElement.dataset.theme = value === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : value;
}

export function ThemeControl() {
  const selected = useSyncExternalStore(subscribe, preference, () => "system" as const);
  useEffect(() => {
    applyTheme(selected);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const change = () => applyTheme(selected);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, [selected]);
  return <label className="theme-control"><span className="sr-only">Appearance</span><select aria-label="Appearance" value={selected} onChange={event => {
    const value = event.target.value as Preference;
    currentChoice = value;
    applyTheme(value);
    try { localStorage.setItem(storageKey, value); } catch { /* The current-page choice still works without storage. */ }
    window.dispatchEvent(new Event("enicharet:theme"));
  }}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>;
}
