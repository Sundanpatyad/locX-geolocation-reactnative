import {Link} from 'react-router-dom';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div className="footer-brand">
          <Link className="brand" to="/" aria-label="locX home">
            <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
              <circle cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
              <circle cx="16" cy="16" r="4" fill="currentColor" />
            </svg>
            locX
          </Link>
          <p>Background location for React Native. Native queue, batched upload, MIT licensed.</p>
        </div>
        <nav aria-label="Product">
          <h2>Product</h2>
          <Link to="/docs">Documentation</Link>
          <Link to="/docs/api-methods">API reference</Link>
          <Link to="/docs/install">Install</Link>
        </nav>
        <nav aria-label="Source">
          <h2>Source</h2>
          <a href="https://www.npmjs.com/package/react-native-locx">npm</a>
          <a href="https://github.com/Sundanpatyad/locX-geolocation-reactnative">GitHub</a>
          <a href="https://github.com/Sundanpatyad/locX-geolocation-reactnative/issues">Issues</a>
        </nav>
        <nav aria-label="License">
          <h2>License</h2>
          <span>MIT</span>
          <span>No license key</span>
          <span>Sundan Sharma</span>
        </nav>
      </div>
    </footer>
  );
}
