export type ThemePreference = 'light' | 'dark' | 'system';

export function readThemePreference(): ThemePreference {
  try {
    const saved = localStorage.getItem('mt-theme');
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch { return 'system'; }
}

// Call in browser code, never during server rendering.
export function applyTheme(preference: ThemePreference, persist = true) {
  const dark = preference === 'dark' || (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.classList.toggle('light', !dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  if (persist) {
    try {
      if (preference === 'system') localStorage.removeItem('mt-theme');
      else localStorage.setItem('mt-theme', preference);
    } catch { /* The current tab still gets the selected appearance. */ }
  }
  window.dispatchEvent(new Event('mt-theme-change'));
  return dark;
}
