import {
  AndroidLogo,
  AppleLogo,
  ArrowRight,
  BatteryCharging,
  CircleDashed,
  Database,
  Lightning,
  Path,
  Power,
  PuzzlePiece,
} from '@phosphor-icons/react';
import {useEffect} from 'react';
import {Link} from 'react-router-dom';
import {CodeBlock, InstallCopy} from '../components/CodeBlock';
import {Footer} from '../components/Footer';
import {Header} from '../components/Header';
import {TrackField} from '../components/TrackField';

const QUICKSTART = `import LocX from 'react-native-locx';

await LocX.configure({
  endpoint: 'https://api.example.com/v1/locations',
  headers: {Authorization: 'Bearer token'},
  accuracy: 'high',
  distanceFilterMeters: 20,
  stopOnTerminate: false,
  startOnBoot: true,
  motion: {stationaryRadiusMeters: 50, stopTimeoutMinutes: 5},
});

await LocX.requestPermission(true);
await LocX.start();

LocX.on('location', point => console.log(point.odometer));
LocX.on('upload', event => console.log(event.remaining));`;

const SAMPLE_BODY = `{
  "locations": [
    {
      "id": "1f82d19d-3fb4-4327-b9ab-a4ccd437c092",
      "latitude": 28.6139,
      "longitude": 77.209,
      "odometer": 15230.4,
      "isMoving": true
    }
  ]
}`;

export function Home() {
  useEffect(() => {
    document.title = 'locX: background location for React Native';
  }, []);

  return (
    <>
      <Header />
      <main id="main">
        <section className="hero">
          <div className="wrap hero-copy">
            <InstallCopy command="npm install react-native-locx" />
            <h1>Background location that survives offline.</h1>
            <p className="hero-sub">
              A React Native engine that writes each fix to native SQLite, then uploads in retried batches.
            </p>
            <Link className="btn btn-primary" to="/docs">
              Read the docs <ArrowRight size={16} weight="bold" />
            </Link>
          </div>
          <TrackField />
        </section>

        <section className="proof" aria-label="Product facts">
          <div className="wrap proof-row">
            <span>MIT licensed</span>
            <span>
              <AndroidLogo size={16} weight="regular" /> Android
            </span>
            <span>
              <AppleLogo size={16} weight="regular" /> iOS
            </span>
            <span>No license key</span>
            <span>
              <Lightning size={16} weight="regular" /> TurboModule
            </span>
          </div>
        </section>

        <section className="section" id="features">
          <div className="wrap">
            <h2>Native tracking, a durable queue, and the OS still in charge.</h2>
            <div className="bento">
              <article className="cell c-track">
                <div className="cell-media">
                  <img
                    src={`${import.meta.env.BASE_URL}media/instrument-sm.jpg`}
                    alt=""
                    width={700}
                    height={394}
                  />
                </div>
                <h3>Background tracking with a foreground service</h3>
                <p>
                  Android runs a visible location service after Recents swipe. iOS uses standard updates,
                  significant-change updates, and a relaunch region.
                </p>
              </article>
              <article className="cell c-queue">
                <Database className="cell-icon" size={22} weight="regular" />
                <h3>Offline Room/SQLite queue</h3>
                <p>
                  Points land in SQLite (Room on Android) before any network call. Batches retry with exponential
                  backoff and reuse the same <code>id</code>.
                </p>
                <div className="queue-log">
                  <div>
                    <span>HTTP 2xx</span>
                    <span>delete batch</span>
                  </div>
                  <div>
                    <span>408, 429, 5xx</span>
                    <span>backoff</span>
                  </div>
                  <div>
                    <span>other 4xx</span>
                    <span>keep, wait</span>
                  </div>
                  <div>
                    <span>offline</span>
                    <span>keep queued</span>
                  </div>
                </div>
              </article>
              <article className="cell c-motion">
                <BatteryCharging className="cell-icon" size={22} weight="regular" />
                <h3>GPS off when stationary</h3>
                <p>
                  Stay inside a 50 m radius for 5 minutes and GPS turns off. Leaving the area, activity recognition, or{' '}
                  <code>changePace(true)</code> turns it back on.
                </p>
              </article>
              <article className="cell c-odo">
                <Path className="cell-icon" size={22} weight="regular" />
                <h3>Odometer on every point</h3>
                <p>Total metres travelled, persisted across restarts. Fixes worse than 100 m are skipped.</p>
                <div className="odo-value">
                  15230.4<small>m</small>
                </div>
              </article>
              <article className="cell c-geo">
                <CircleDashed className="cell-icon" size={22} weight="regular" />
                <h3>Geofencing enter, exit, dwell</h3>
                <p>OS-monitored regions with custom extras, stored and re-registered after reboot and app updates.</p>
                <div className="geo-actions">
                  <code>ENTER</code>
                  <code>EXIT</code>
                  <code>DWELL</code>
                </div>
              </article>
              <article className="cell c-headless">
                <Power className="cell-icon" size={22} weight="regular" />
                <h3>Headless when killed, start on boot</h3>
                <p>
                  Handle events while the UI is gone. Register <code>registerHeadlessTask</code> in <code>index.js</code>
                  . With <code>startOnBoot</code>, Android restores tracking after a reboot.
                </p>
              </article>
              <article className="cell c-platform">
                <h3>Built for current React Native</h3>
                <p>Kotlin and Swift engines, codegen TurboModule, Expo prebuild plugin.</p>
                <ul className="plat-list">
                  <li>
                    <AndroidLogo size={16} weight="regular" /> Android, Kotlin
                  </li>
                  <li>
                    <AppleLogo size={16} weight="regular" /> iOS 14+, Swift
                  </li>
                  <li>
                    <Lightning size={16} weight="regular" /> TurboModule, RN 0.76+
                  </li>
                  <li>
                    <PuzzlePiece size={16} weight="regular" /> Expo config plugin
                  </li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section className="section" id="delivery">
          <div className="wrap">
            <h2>How a point reaches your server</h2>
            <p className="lede">Persist first, upload second. JavaScript does not need to be alive for delivery.</p>
            <ol className="flow">
              <li className="flow-step">
                <h3>Record</h3>
                <p>The native engine receives a fix that passes the distance filter.</p>
              </li>
              <li className="flow-step">
                <h3>Commit</h3>
                <p>It is written to the on-device queue with a UUID, odometer, and motion state.</p>
              </li>
              <li className="flow-step">
                <h3>Upload</h3>
                <p>
                  Up to <code>batchSize</code> points are sent as one JSON body when the network allows.
                </p>
              </li>
              <li className="flow-step">
                <h3>Acknowledge</h3>
                <p>
                  Only a <code>2xx</code> response deletes the batch. Anything else keeps it.
                </p>
              </li>
            </ol>
            <div className="flow-note">
              <div>
                <p>
                  <strong>Retries reuse the same id.</strong> Treat it as a unique key and your backend stays
                  idempotent, even when a response is lost after the server already stored the batch.
                </p>
                <p>
                  Need a nested coords body? Set <code>payload: 'path'</code>. Both formats are in the{' '}
                  <Link to="/docs/backend">backend contract</Link>.
                </p>
              </div>
              <CodeBlock code={SAMPLE_BODY} lang="json" label="POST /v1/locations" />
            </div>
          </div>
        </section>

        <section className="section section-code">
          <div className="wrap">
            <h2>Configure, request permission, start.</h2>
            <p className="lede">That order is required. Config is stored natively so background restarts reuse it.</p>
            <div className="code-stage">
              <CodeBlock code={QUICKSTART} lang="ts" label="App.tsx" />
            </div>
          </div>
        </section>

        <section className="section">
          <div className="wrap limits">
            <article className="limit">
              <h3>Android</h3>
              <p>
                Visible foreground service, Allow all the time for background work, OEM battery managers, 99 user
                geofences. Force Stop disables every component until the user opens the app.
              </p>
            </article>
            <article className="limit">
              <h3>iOS</h3>
              <p>
                Always permission for kill-state relaunch and background geofences. 20 monitored regions, one kept by
                locX, so 19 user geofences. Swiping away may prevent relaunch.
              </p>
            </article>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
