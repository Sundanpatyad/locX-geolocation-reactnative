import {GithubLogo, List, X} from '@phosphor-icons/react';
import {useEffect, useId, useState} from 'react';
import {Link, NavLink} from 'react-router-dom';
import {ThemeToggle} from './ThemeToggle';

const LINKS = [
  {to: '/docs', label: 'Docs'},
  {to: '/docs/api-methods', label: 'API'},
  {to: '/docs/install', label: 'Install'},
] as const;

export function Header({docs}: {docs?: boolean}) {
  const [open, setOpen] = useState(false);
  const drawerId = useId();

  useEffect(() => {
    document.body.classList.toggle('drawer-open', open);
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('drawer-open');
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <header className={`site-header${docs ? ' is-docs' : ''}`}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="wrap header-bar">
        <Link className="brand" to="/" aria-label="locX home" onClick={() => setOpen(false)}>
          <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
            <circle cx="16" cy="16" r="4" fill="currentColor" />
          </svg>
          locX{docs ? <small>docs</small> : null}
        </Link>

        <nav className="nav-pill" aria-label="Primary">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="header-actions">
          <a
            className="nav-icon"
            href="https://github.com/Sundanpatyad/locX-geolocation-reactnative"
            aria-label="GitHub repository"
          >
            <GithubLogo size={18} weight="regular" />
            <span className="hide-sm">GitHub</span>
          </a>
          <ThemeToggle />
          <button
            className="icon-btn menu-btn"
            type="button"
            aria-expanded={open}
            aria-controls={drawerId}
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={18} weight="bold" /> : <List size={18} weight="bold" />}
          </button>
        </div>
      </div>

      <div
        className={`drawer-backdrop${open ? ' open' : ''}`}
        onClick={() => setOpen(false)}
        hidden={!open}
      />
      <nav id={drawerId} className={`drawer${open ? ' open' : ''}`} aria-label="Mobile" hidden={!open}>
        {LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} onClick={() => setOpen(false)}>
            {link.label}
          </NavLink>
        ))}
        <a href="https://github.com/Sundanpatyad/locX-geolocation-reactnative" onClick={() => setOpen(false)}>
          GitHub
        </a>
        <a href="https://www.npmjs.com/package/react-native-locx" onClick={() => setOpen(false)}>
          npm
        </a>
      </nav>
    </header>
  );
}
