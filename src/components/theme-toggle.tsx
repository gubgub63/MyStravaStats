'use client';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem('mystats-theme');
    const value = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme = value ? 'dark' : 'light';
  }, []);
  function toggle() {
    const value = document.documentElement.dataset.theme !== 'dark';
    document.documentElement.dataset.theme = value ? 'dark' : 'light';
    localStorage.setItem('mystats-theme', value ? 'dark' : 'light');
    setDark(value);
  }
  return (
    <button
      className="icon-button"
      onClick={toggle}
      aria-label="Changer le thème clair ou sombre"
      title="Changer le thème"
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
