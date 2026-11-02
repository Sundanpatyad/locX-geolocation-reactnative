import {GithubLogo} from '@phosphor-icons/react';
import {Link, NavLink} from 'react-router-dom';
import {ThemeToggle} from './ThemeToggle';

export function Header({docs}: {docs?: boolean}) {
  return (
    <header className="site-header">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="wrap">
        <Link className="brand" to="/" aria-label="locX home">
          <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
            <circle cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" strokeWidth="3" />
            <circle cx="16" cy="16" r="5" fill="currentColor" />
          </svg>
          locX{docs ? <small>docs</small> : null}
        </Link>
        <nav className="nav" aria-label="Primary">
          <NavLink to="/docs">Docs</NavLink>
          <NavLink className="hide-sm" to="/docs/api-methods">
            API
          </NavLink>
          <a href="https://github.com/Sundanpatyad/locX-geolocation-reactnative" aria-label="GitHub repository">
            <GithubLogo size={18} weight="bold" />
            <span className="hide-sm"> GitHub</span>
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
