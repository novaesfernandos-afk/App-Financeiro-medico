import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light' | 'system';

function apply(t: Theme) {
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c0f11' : '#f5f7f8');
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try { return (localStorage.getItem('mf-theme') as Theme) || 'dark'; } catch { return 'dark'; }
  });
  useEffect(() => {
    apply(theme);
    try { localStorage.setItem('mf-theme', theme); } catch { /* armazenamento indisponível */ }
  }, [theme]);
  return { theme, setTheme };
}
