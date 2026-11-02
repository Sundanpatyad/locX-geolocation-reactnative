import {Link} from 'react-router-dom';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <span>MIT © Sundan Sharma</span>
        <nav aria-label="Footer">
          <Link to="/">Home</Link>
          <Link to="/docs">Docs</Link>
          <a href="https://www.npmjs.com/package/react-native-locx">npm</a>
          <a href="https://github.com/Sundanpatyad/locX-geolocation-reactnative">GitHub</a>
        </nav>
      </div>
    </footer>
  );
}
