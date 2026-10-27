export const themeStorageKey = "enicharet.theme";
export type ThemePreference = "light" | "dark" | "system";
// Static first-paint setup: no user text or environment values are interpolated.
export const themeInitScript = `(function(){try{var p=localStorage.getItem('enicharet.theme');document.documentElement.dataset.theme=p==='light'||p==='dark'?p:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch(e){}})();`;
