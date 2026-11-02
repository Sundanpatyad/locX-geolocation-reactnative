import {Moon, Sun} from '@phosphor-icons/react';
import {useEffect, useState} from 'react';
import {applyTheme, readTheme, type Theme} from '../lib/theme';

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(readTheme());
  }, []);

  return (
    <button
      className="icon-btn"
      type="button"
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => {
        const next = theme === 'dark' ? 'light' : 'dark';
        setTheme(next);
        applyTheme(next);
      }}
    >
      {theme === 'dark' ? <Sun size={18} weight="bold" /> : <Moon size={18} weight="bold" />}
    </button>
  );
}
