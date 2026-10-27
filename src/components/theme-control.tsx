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

function setPreference(value: Preference) {
  currentChoice = value;
  applyTheme(value);
  try { localStorage.setItem(storageKey, value); } catch { /* Keep the current-page choice without storage. */ }
  window.dispatchEvent(new Event("enicharet:theme"));
}

function systemIsDark() { return matchMedia("(prefers-color-scheme: dark)").matches; }

export function ThemeControl() {
  const selected = useSyncExternalStore(subscribe, preference, () => "system" as const);
  const darkSystem = useSyncExternalStore(subscribe, systemIsDark, () => false);
  const dark = selected === "system" ? darkSystem : selected === "dark";
  useEffect(() => {
    applyTheme(selected);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const change = () => applyTheme(selected);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, [selected]);
  return <div className="theme-control" role="group" aria-label="Appearance">
    <button type="button" className="theme-toggle" role="switch" aria-checked={dark}
      aria-label="Dark mode" title={`${selected === "system" ? "Following system. " : ""}Switch to ${dark ? "light" : "dark"} mode`}
      onClick={() => setPreference(dark ? "light" : "dark")}>
      <svg className="theme-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></svg>
      <svg className="theme-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20.5 14.3A8.8 8.8 0 0 1 9.7 3.5a8.8 8.8 0 1 0 10.8 10.8Z" /></svg>
    </button>
    <button type="button" className="theme-system" aria-label="Use system appearance" aria-pressed={selected === "system"}
      title={selected === "system" ? "Following system appearance" : "Follow system appearance"} onClick={() => setPreference("system")}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></svg><span>System</span></button>
  </div>;
}
