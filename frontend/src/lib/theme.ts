export type Theme = 'light' | 'dark' | 'system'
const KEY = 'vernon-theme'

export function getStoredTheme(): Theme {
  const t = localStorage.getItem(KEY)
  return t === 'light' || t === 'dark' || t === 'system' ? t : 'system'
}

export function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolvedDark(theme: Theme): boolean {
  return theme === 'dark' || (theme === 'system' && systemPrefersDark())
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', resolvedDark(theme))
}

export function setTheme(theme: Theme): void {
  localStorage.setItem(KEY, theme)
  applyTheme(theme)
}

// Apply stored theme on boot + keep 'system' in sync with OS changes.
export function initTheme(): void {
  applyTheme(getStoredTheme())
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getStoredTheme() === 'system') applyTheme('system')
  })
}
