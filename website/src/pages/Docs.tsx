import {List, Warning, DeviceMobile, ArrowsClockwise, CloudArrowUp} from '@phosphor-icons/react';
import {useEffect, useState, type ReactNode} from 'react';
import {NavLink, useParams} from 'react-router-dom';
import {CodeBlock} from '../components/CodeBlock';
import {Footer} from '../components/Footer';
import {Header} from '../components/Header';

const NAV = [
  {
    title: 'Getting started',
    items: [
      ['introduction', 'Introduction'],
      ['install', 'Install'],
      ['ios-setup', 'iOS setup'],
      ['android-setup', 'Android setup'],
      ['expo', 'Expo config plugin'],
      ['first-run', 'Configure and start'],
      ['events', 'Listening to events'],
    ],
  },
  {
    title: 'API reference',
    items: [
      ['api-methods', 'Methods'],
      ['api-config', 'Configuration'],
      ['api-events', 'Events'],
      ['api-types', 'Types'],
    ],
  },
  {
    title: 'Guides',
    items: [
      ['motion', 'Motion detection'],
      ['odometer', 'Odometer'],
      ['geofencing', 'Geofencing'],
      ['headless', 'Headless events'],
      ['backend', 'Backend contract'],
    ],
  },
  {
    title: 'Reference',
    items: [
      ['platform-notes', 'Platform notes and limits'],
      ['production', 'Production checklist'],
      ['migration', 'Migration'],
      ['faq', 'FAQ'],
    ],
  },
] as const;

function Method({name, ret, children}: {name: string; ret: string; children: ReactNode}) {
  return (
    <div className="method">
      <h3>
        {name} <span className="ret">: {ret}</span>
      </h3>
      <p>{children}</p>
    </div>
  );
}

function Heading({id, children}: {id: string; children: ReactNode}) {
  return (
    <h2 id={id}>
      {children}{' '}
      <a className="anchor" href={`#/docs/${id}`} aria-label={`Link to ${id}`}>
        #
      </a>
    </h2>
  );
}

export function Docs() {
  const {section} = useParams();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.title = 'Documentation | locX for React Native';
    setMenuOpen(false);
    const timer = window.setTimeout(() => {
      if (!section) {
        window.scrollTo(0, 0);
        return;
      }
      document.getElementById(section)?.scrollIntoView({behavior: 'auto', block: 'start'});
    }, 40);
    return () => window.clearTimeout(timer);
  }, [section]);

  return (
    <>
      <Header docs />
      <div className={`wrap docs-shell${menuOpen ? ' menu-open' : ''}`}>
        <button
          className="btn btn-ghost docs-menu-btn"
          type="button"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <List size={16} weight="regular" /> Contents
        </button>
        <aside className="sidebar" aria-label="Documentation">
          {NAV.map((group) => (
            <div key={group.title}>
              <h4>{group.title}</h4>
              <ul>
                {group.items.map(([id, label]) => (
                  <li key={id}>
                    <NavLink
                      to={`/docs/${id}`}
                      className={({isActive}) =>
                        isActive || (!section && id === 'introduction') ? 'active' : undefined
                      }
                    >
                      {label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        <main className="doc" id="main">
          <section id="introduction">
            <h1>locX documentation</h1>
            <p className="lead">
              <code>react-native-locx</code> is a background-location engine for React Native on Android and iOS. It
              records locations natively, stores them in an on-device SQLite queue, and uploads them to your HTTP
              endpoint in batches. It is MIT licensed and needs no license key for debug or release builds.
            </p>
            <ul>
              <li>Background tracking with a visible Android foreground service and iOS background location updates.</li>
              <li>
                A durable queue: a point is deleted only after your server answers <code>2xx</code>. Retries reuse the
                same <code>id</code>.
              </li>
              <li>Motion detection that turns GPS off while the device is stationary.</li>
              <li>An odometer stored on every point.</li>
              <li>
                Geofences with <code>ENTER</code>, <code>EXIT</code> and <code>DWELL</code> events.
              </li>
              <li>Headless events while the app UI is not running, and restart after reboot on Android.</li>
              <li>An Expo config plugin and a new-architecture TurboModule.</li>
            </ul>
            <div className="callout">
              <DeviceMobile size={22} weight="bold" />
              <p>
                Requirements: React Native 0.76 or newer, iOS 14 or newer. <code>@expo/config-plugins</code> 8+ is an
                optional peer dependency, needed only for Expo prebuild.
              </p>
            </div>
          </section>

          <section>
            <Heading id="install">Install</Heading>
            <CodeBlock
              label="terminal"
              lang="sh"
              code={`npm install react-native-locx
cd ios && pod install`}
            />
            <p>
              The package autolinks. The native module is a TurboModule generated by codegen (<code>LocXSpec</code>), so
              there is nothing to register by hand. Expo users should read the Expo config plugin instead of editing
              native files.
            </p>
          </section>

          <section>
            <Heading id="ios-setup">iOS setup</Heading>
            <p>
              In a bare React Native app, add the <code>location</code> background mode and the two location usage
              strings to <code>ios/YourApp/Info.plist</code>. Always permission is required for kill-state relaunch and
              background geofences.
            </p>
            <CodeBlock
              label="Info.plist"
              lang="xml"
              code={`<key>UIBackgroundModes</key>
<array>
  <string>location</string>
</array>
<key>NSLocationWhenInUseUsageDescription</key>
<string>Location is used to show your trip.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Location is used to record your trip in the background.</string>
<!-- only if motion.activityRecognition is enabled -->
<key>NSMotionUsageDescription</key>
<string>Motion data is used to save battery while you are not moving.</string>`}
            />
            <p>
              The pod links CoreLocation, CoreMotion, Network, UIKit and sqlite3, and ships its own privacy manifest.
            </p>
          </section>

          <section>
            <Heading id="android-setup">Android setup</Heading>
            <p>
              The library manifest already declares location, background location, foreground service, notifications,
              wake lock, the boot receiver, the geofence receiver and the headless service. Nothing else is needed for
              basic tracking.
            </p>
            <ul>
              <li>
                Android 10+ shows background location ("Allow all the time") as a separate prompt after fine location is
                granted. <code>requestPermission(true)</code> asks for it in sequence.
              </li>
              <li>
                Android 13+ needs notification permission so the foreground service can show its notice.{' '}
                <code>requestPermission()</code> asks for it too.
              </li>
            </ul>
            <p>
              To use <code>motion.activityRecognition</code>, add both activity permissions to{' '}
              <code>android/app/src/main/AndroidManifest.xml</code>:
            </p>
            <CodeBlock
              label="AndroidManifest.xml"
              lang="xml"
              code={`<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />
<uses-permission android:name="com.google.android.gms.permission.ACTIVITY_RECOGNITION" />`}
            />
            <p>
              <code>requestPermission()</code> then requests it together with location, as long as{' '}
              <code>configure()</code> ran first with <code>activityRecognition: true</code>.
            </p>
          </section>

          <section>
            <Heading id="expo">Expo config plugin</Heading>
            <p>
              For Expo prebuild (development builds, not Expo Go), add the plugin to <code>app.json</code>. It writes
              the iOS Info.plist keys and <code>UIBackgroundModes</code>, adds the Android permissions, and registers
              the location service and boot receiver.
            </p>
            <CodeBlock
              label="app.json"
              lang="json"
              code={`{
  "expo": {
    "plugins": [
      [
        "react-native-locx",
        {
          "whenInUsePermission": "Location is used to show your trip.",
          "alwaysPermission": "Location is used to record your trip in the background.",
          "motionPermission": "Motion data is used to save battery while you are not moving.",
          "activityRecognition": true
        }
      ]
    ]
  }
}`}
            />
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Plugin option</th>
                    <th>Default</th>
                    <th>Effect</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>whenInUsePermission</code>
                    </td>
                    <td>"Allow this app to use your location while you use the app."</td>
                    <td>
                      iOS <code>NSLocationWhenInUseUsageDescription</code>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>alwaysPermission</code>
                    </td>
                    <td>"Allow this app to use your location in the background."</td>
                    <td>
                      iOS <code>NSLocationAlwaysAndWhenInUseUsageDescription</code>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>motionPermission</code>
                    </td>
                    <td>not set</td>
                    <td>
                      iOS <code>NSMotionUsageDescription</code>. Only written when provided.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>activityRecognition</code>
                    </td>
                    <td>
                      <code>false</code>
                    </td>
                    <td>
                      Adds both Android <code>ACTIVITY_RECOGNITION</code> permissions
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              <code>motionPermission</code> and <code>activityRecognition</code> are only needed when{' '}
              <code>motion.activityRecognition</code> is enabled. Run <code>npx expo prebuild</code> after changing
              plugin options.
            </p>
          </section>

          <section>
            <Heading id="first-run">Configure and start</Heading>
            <p>
              The order matters: <code>configure</code>, then <code>requestPermission</code>, then <code>start</code>.{' '}
              <code>start()</code> rejects if the engine is not configured or permission is missing.
            </p>
            <h3 id="step-configure">Configure the engine</h3>
            <p>Pass your upload endpoint and tracking options. The config is persisted natively, so background restarts reuse it.</p>
            <CodeBlock
              label="tracking.ts"
              lang="ts"
              code={`import LocX from 'react-native-locx';

await LocX.configure({
  endpoint: 'https://api.example.com/v1/locations',
  headers: {Authorization: 'Bearer token'},
  accuracy: 'high',
  distanceFilterMeters: 20,
  intervalMs: 15_000,
  autoSync: true,
  stopOnTerminate: false,
  startOnBoot: true,
  motion: {stationaryRadiusMeters: 50, stopTimeoutMinutes: 5},
});`}
            />
            <h3 id="step-permission">Request permission</h3>
            <p>
              Explain why you track before showing the system prompt. Pass <code>true</code> to also ask for background
              ("Always" on iOS, "Allow all the time" on Android).
            </p>
            <CodeBlock
              label="tracking.ts"
              lang="ts"
              code={`const status = await LocX.requestPermission(true);
// 'notDetermined' | 'whenInUse' | 'always' | 'denied' | 'restricted'`}
            />
            <h3 id="step-start">Start tracking</h3>
            <CodeBlock
              label="tracking.ts"
              lang="ts"
              code={`const state = await LocX.start();
console.log(state.tracking, state.permission, state.queueSize);

// Keep a visible stop control in your UI
await LocX.stop();`}
            />
            <div className="callout">
              <ArrowsClockwise size={22} weight="bold" />
              <p>
                Refreshing tokens: refresh an expiring token in the foreground, then call <code>configure</code> again
                with the new <code>Authorization</code> header. On Android, config and headers are stored in encrypted
                preferences when the platform crypto provider is available.
              </p>
            </div>
          </section>

          <section>
            <Heading id="events">Listening to events</Heading>
            <p>
              <code>LocX.on(name, listener)</code> returns a <code>Subscription</code>. Listener payloads are fully
              typed through <code>LocXEventMap</code>. Remove subscriptions when a screen unmounts.
            </p>
            <CodeBlock
              label="useTracking.ts"
              lang="ts"
              code={`import {useEffect} from 'react';
import LocX from 'react-native-locx';

export function useTracking() {
  useEffect(() => {
    const subs = [
      LocX.on('location', point => console.log(point.id, point.latitude, point.odometer)),
      LocX.on('motionchange', event => console.log('moving?', event.isMoving)),
      LocX.on('upload', event => console.log(event.accepted, event.remaining)),
      LocX.on('error', error => console.warn(error.code, error.message)),
    ];
    return () => subs.forEach(sub => sub.remove());
  }, []);
}`}
            />
            <p>
              To receive events while your UI is not running, see Headless events. The handler must live in{' '}
              <code>index.js</code>.
            </p>
          </section>

          <section>
            <Heading id="api-methods">Methods</Heading>
            <p>
              Import the default export: <code>import LocX from 'react-native-locx'</code>. Every method returns a
              promise except <code>on</code> and <code>registerHeadlessTask</code>. All types are also exported from the
              package.
            </p>
            <h3 id="m-lifecycle">Lifecycle</h3>
            <Method name="configure(config: LocXConfig)" ret="Promise<LocXState>">
              Validates and stores the configuration. Throws if <code>endpoint</code> is not an <code>http(s)</code>{' '}
              URL, <code>distanceFilterMeters</code> is negative, <code>batchSize</code> is below 1,{' '}
              <code>motion.stationaryRadiusMeters</code> is not positive, or <code>motion.stopTimeoutMinutes</code> is
              below 1. Can be called again at any time, for example to rotate headers.
            </Method>
            <Method name="requestPermission(always = true)" ret="Promise<PermissionStatus>">
              Asks for foreground location and, when <code>always</code> is true, background location as a follow-up
              prompt. On Android it also asks for notifications (13+) and activity recognition when enabled in the
              config. Emits a <code>permission</code> event with the resulting status.
            </Method>
            <Method name="start()" ret="Promise<LocXState>">
              Starts tracking. Rejects when not configured, when permission is missing, or (iOS) when Location Services
              are disabled.
            </Method>
            <Method name="stop()" ret="Promise<LocXState>">
              Stops tracking. Queued points stay in the queue.
            </Method>
            <Method name="getState()" ret="Promise<LocXState>">
              Returns configuration, tracking, permission and queue status plus <code>isMoving</code>,{' '}
              <code>odometer</code>, <code>activity</code> and, on Android, <code>batteryOptimizationIgnored</code>,{' '}
              <code>serviceRunning</code> and <code>restrictions</code>.
            </Method>
            <Method name="changePace(isMoving: boolean)" ret="Promise<LocXState>">
              Forces moving (GPS on) or stationary (GPS off) without waiting for detection. Requires tracking to be
              started.
            </Method>
            <h3 id="m-location">Location and queue</h3>
            <Method name="getCurrentLocation(timeoutMs = 15000)" ret="Promise<LocationPoint>">
              One-shot location request. Rejects with a timeout error if no fix arrives in time.
            </Method>
            <Method name="sync()" ret="Promise<number>">
              Triggers an upload of the queue now. Requires <code>configure</code>. On Android the upload is scheduled
              in the background and the number is the count of queued points at that moment. On iOS it uploads
              immediately and resolves with the number of points the server accepted.
            </Method>
            <Method name="getQueuedLocations(limit = 100)" ret="Promise<LocationPoint[]>">
              Reads points that are still waiting for upload, oldest first.
            </Method>
            <Method name="clearQueue()" ret="Promise<void>">
              Deletes every queued point without uploading it.
            </Method>
            <h3 id="m-odometer">Odometer</h3>
            <Method name="getOdometer()" ret="Promise<number>">
              Total metres travelled.
            </Method>
            <Method name="setOdometer(meters: number)" ret="Promise<number>">
              Restores a known value. Rejects when <code>meters</code> is negative.
            </Method>
            <Method name="resetOdometer()" ret="Promise<number>">
              Same as <code>setOdometer(0)</code>.
            </Method>
            <h3 id="m-geofences">Geofences</h3>
            <Method name="addGeofence(geofence: Geofence)" ret="Promise<void>">
              Adds or replaces one geofence (matched by <code>identifier</code>).
            </Method>
            <Method name="addGeofences(geofences: Geofence[])" ret="Promise<void>">
              Adds several at once. Throws if an identifier is missing, duplicated, or starts with <code>locx:</code>,
              if coordinates are out of range, if <code>radius</code> is not positive, or if no transition is enabled.
              Rejects when the platform limit is exceeded.
            </Method>
            <Method name="removeGeofence(identifier: string)" ret="Promise<void>">
              Removes one geofence.
            </Method>
            <Method name="removeGeofences(identifiers?: string[])" ret="Promise<void>">
              Removes the given geofences, or every geofence when called without arguments.
            </Method>
            <Method name="getGeofences()" ret="Promise<Geofence[]>">
              Lists stored geofences.
            </Method>
            <h3 id="m-events">Events and headless</h3>
            <Method name="on<E extends LocXEventName>(event: E, listener)" ret="Subscription">
              Subscribes to an event. The listener receives <code>LocXEventMap[E]</code>. Call{' '}
              <code>subscription.remove()</code> to unsubscribe.
            </Method>
            <Method name="registerHeadlessTask(handler)" ret="void">
              Receives <code>{'{name, params}'}</code> events while the UI is not running. Call it once in{' '}
              <code>index.js</code>, outside any component.
            </Method>
            <Method name="HEADLESS_TASK_NAME" ret="'LocXHeadlessTask'">
              Named export. The Android headless JS task key used by <code>registerHeadlessTask</code>.
            </Method>
          </section>

          <section>
            <Heading id="api-config">Configuration</Heading>
            <p>
              Options accepted by <code>configure()</code> (<code>LocXConfig</code>). Only <code>endpoint</code> is
              required. Defaults below match the native engines.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Option</th>
                    <th>Default</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="group-row">
                    <td colSpan={3}>Upload</td>
                  </tr>
                  <tr>
                    <td>
                      <code>endpoint</code>
                    </td>
                    <td>required</td>
                    <td>
                      <code>http(s)</code> URL that receives batches
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>headers</code>
                    </td>
                    <td>
                      <code>{'{}'}</code>
                    </td>
                    <td>Sent with every upload</td>
                  </tr>
                  <tr>
                    <td>
                      <code>method</code>
                    </td>
                    <td>
                      <code>'POST'</code>
                    </td>
                    <td>
                      <code>'POST'</code> or <code>'PUT'</code>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>payload</code>
                    </td>
                    <td>
                      <code>'locations'</code>
                    </td>
                    <td>
                      <code>'locations'</code> or <code>'path'</code>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>batchSize</code>
                    </td>
                    <td>
                      <code>20</code>
                    </td>
                    <td>Points per upload, at least 1</td>
                  </tr>
                  <tr>
                    <td>
                      <code>autoSync</code>
                    </td>
                    <td>
                      <code>true</code>
                    </td>
                    <td>Upload automatically as points are queued</td>
                  </tr>
                  <tr>
                    <td>
                      <code>wifiOnly</code>
                    </td>
                    <td>
                      <code>false</code>
                    </td>
                    <td>Upload only on Wi-Fi</td>
                  </tr>
                  <tr>
                    <td>
                      <code>retryBaseSeconds</code>
                    </td>
                    <td>
                      <code>30</code>
                    </td>
                    <td>Initial exponential backoff delay</td>
                  </tr>
                  <tr>
                    <td>
                      <code>retryMaxSeconds</code>
                    </td>
                    <td>
                      <code>3600</code>
                    </td>
                    <td>Maximum backoff delay</td>
                  </tr>
                  <tr className="group-row">
                    <td colSpan={3}>Location</td>
                  </tr>
                  <tr>
                    <td>
                      <code>accuracy</code>
                    </td>
                    <td>
                      <code>'high'</code>
                    </td>
                    <td>
                      <code>'best'</code>, <code>'high'</code>, <code>'balanced'</code>, <code>'low'</code>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>distanceFilterMeters</code>
                    </td>
                    <td>
                      <code>25</code>
                    </td>
                    <td>Minimum movement between points, not negative</td>
                  </tr>
                  <tr>
                    <td>
                      <code>intervalMs</code>
                    </td>
                    <td>
                      <code>10000</code>
                    </td>
                    <td>Android update interval</td>
                  </tr>
                  <tr>
                    <td>
                      <code>fastestIntervalMs</code>
                    </td>
                    <td>
                      <code>5000</code>
                    </td>
                    <td>Android fastest update interval</td>
                  </tr>
                  <tr className="group-row">
                    <td colSpan={3}>Lifecycle and queue</td>
                  </tr>
                  <tr>
                    <td>
                      <code>stopOnTerminate</code>
                    </td>
                    <td>
                      <code>false</code>
                    </td>
                    <td>Stop tracking when the app is terminated</td>
                  </tr>
                  <tr>
                    <td>
                      <code>startOnBoot</code>
                    </td>
                    <td>
                      <code>false</code>
                    </td>
                    <td>Restore tracking after reboot (Android)</td>
                  </tr>
                  <tr>
                    <td>
                      <code>maxQueueSize</code>
                    </td>
                    <td>
                      <code>10000</code>
                    </td>
                    <td>Oldest points are trimmed beyond this</td>
                  </tr>
                  <tr>
                    <td>
                      <code>maxAgeDays</code>
                    </td>
                    <td>
                      <code>30</code>
                    </td>
                    <td>Points older than this are dropped</td>
                  </tr>
                  <tr>
                    <td>
                      <code>enableHeadless</code>
                    </td>
                    <td>
                      <code>false</code>
                    </td>
                    <td>Android: run the headless task when no JS listener is running</td>
                  </tr>
                  <tr className="group-row">
                    <td colSpan={3}>Motion (motion: {'{...}'})</td>
                  </tr>
                  <tr>
                    <td>
                      <code>motion.enabled</code>
                    </td>
                    <td>
                      <code>true</code>
                    </td>
                    <td>Turn GPS off while stationary</td>
                  </tr>
                  <tr>
                    <td>
                      <code>motion.stationaryRadiusMeters</code>
                    </td>
                    <td>
                      <code>50</code>
                    </td>
                    <td>Movement inside this radius counts as stationary</td>
                  </tr>
                  <tr>
                    <td>
                      <code>motion.stopTimeoutMinutes</code>
                    </td>
                    <td>
                      <code>5</code>
                    </td>
                    <td>Idle time before GPS turns off, at least 1</td>
                  </tr>
                  <tr>
                    <td>
                      <code>motion.activityRecognition</code>
                    </td>
                    <td>
                      <code>false</code>
                    </td>
                    <td>Use the OS activity classifier to wake faster. Needs extra permissions.</td>
                  </tr>
                  <tr className="group-row">
                    <td colSpan={3}>Android notification (notification: {'{...}'})</td>
                  </tr>
                  <tr>
                    <td>
                      <code>notification.title</code>
                    </td>
                    <td>"Location active"</td>
                    <td>Foreground service title</td>
                  </tr>
                  <tr>
                    <td>
                      <code>notification.text</code>
                    </td>
                    <td>"LocX is recording your location"</td>
                    <td>Foreground service text</td>
                  </tr>
                  <tr>
                    <td>
                      <code>notification.channelName</code>
                    </td>
                    <td>"Location tracking"</td>
                    <td>Notification channel name in system settings</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <Heading id="api-events">Events</Heading>
            <p>
              Event names accepted by <code>on()</code> and delivered to the headless task (<code>LocXEventName</code>
              ).
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Payload</th>
                    <th>Fires when</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>'location'</code>
                    </td>
                    <td>
                      <code>LocationPoint</code>
                    </td>
                    <td>A point is recorded and queued</td>
                  </tr>
                  <tr>
                    <td>
                      <code>'motionchange'</code>
                    </td>
                    <td>
                      <code>MotionChangeEvent</code>
                    </td>
                    <td>The engine switches between moving and stationary</td>
                  </tr>
                  <tr>
                    <td>
                      <code>'activitychange'</code>
                    </td>
                    <td>
                      <code>ActivityChangeEvent</code>
                    </td>
                    <td>The OS activity classifier reports a new activity</td>
                  </tr>
                  <tr>
                    <td>
                      <code>'geofence'</code>
                    </td>
                    <td>
                      <code>GeofenceEvent</code>
                    </td>
                    <td>
                      A geofence <code>ENTER</code>, <code>EXIT</code> or <code>DWELL</code>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>'upload'</code>
                    </td>
                    <td>
                      <code>UploadEvent</code>
                    </td>
                    <td>A batch upload completes</td>
                  </tr>
                  <tr>
                    <td>
                      <code>'state'</code>
                    </td>
                    <td>
                      <code>LocXState</code>
                    </td>
                    <td>Engine state changes</td>
                  </tr>
                  <tr>
                    <td>
                      <code>'permission'</code>
                    </td>
                    <td>
                      <code>{'{status: PermissionStatus}'}</code>
                    </td>
                    <td>After a permission request resolves</td>
                  </tr>
                  <tr>
                    <td>
                      <code>'error'</code>
                    </td>
                    <td>
                      <code>LocXError</code>
                    </td>
                    <td>
                      A native error, with a <code>recoverable</code> flag
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <Heading id="api-types">Types</Heading>
            <p>
              Exported from <code>react-native-locx</code>. Copied from <code>src/types.ts</code>.
            </p>
            <h3 id="t-point">LocationPoint</h3>
            <CodeBlock
              label="types.ts"
              lang="ts"
              code={`interface LocationPoint {
  id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  speed: number | null;
  heading: number | null;
  recordedAt: string;
  receivedAt: string;
  mocked: boolean;
  provider: string;
  attempts: number;
  activity?: ActivityType | null;
  odometer?: number;
  isMoving?: boolean;
}`}
            />
            <h3 id="t-state">LocXState</h3>
            <CodeBlock
              label="types.ts"
              lang="ts"
              code={`interface LocXState {
  configured: boolean;
  tracking: boolean;
  permission: PermissionStatus;
  queueSize: number;
  lastLocation: LocationPoint | null;
  lastError: string | null;
  isMoving?: boolean;
  odometer?: number;
  activity?: ActivityType | null;
  batteryOptimizationIgnored?: boolean;
  serviceRunning?: boolean;
  restrictions?: string[];
}`}
            />
            <h3 id="t-geofence">Geofence and GeofenceEvent</h3>
            <CodeBlock
              label="types.ts"
              lang="ts"
              code={`interface Geofence {
  identifier: string;
  latitude: number;
  longitude: number;
  radius: number;
  notifyOnEntry?: boolean;   // default true
  notifyOnExit?: boolean;    // default true
  notifyOnDwell?: boolean;   // default false
  loiteringDelayMs?: number; // default 300000
  extras?: Record<string, unknown>;
}

type GeofenceAction = 'ENTER' | 'EXIT' | 'DWELL';

interface GeofenceEvent {
  identifier: string;
  action: GeofenceAction;
  location: LocationPoint | null;
  extras: Record<string, unknown>;
  timestamp: string;
}`}
            />
            <h3 id="t-events">Event payloads</h3>
            <CodeBlock
              label="types.ts"
              lang="ts"
              code={`interface MotionChangeEvent {
  isMoving: boolean;
  location: LocationPoint | null;
}

interface ActivityChangeEvent {
  activity: ActivityType;
  confidence: number;
}

interface UploadEvent {
  accepted: number;
  status: number;
  remaining: number;
}

interface LocXError {
  code: string;
  message: string;
  recoverable: boolean;
}

type LocXEventMap = {
  location: LocationPoint;
  upload: UploadEvent;
  state: LocXState;
  permission: {status: PermissionStatus};
  error: LocXError;
  motionchange: MotionChangeEvent;
  activitychange: ActivityChangeEvent;
  geofence: GeofenceEvent;
};

type LocXEventName = keyof LocXEventMap;

type HeadlessEvent = {
  [E in LocXEventName]: {name: E; params: LocXEventMap[E]};
}[LocXEventName];

interface Subscription {
  remove(): void;
}`}
            />
            <h3 id="t-unions">Unions</h3>
            <CodeBlock
              label="types.ts"
              lang="ts"
              code={`type Accuracy = 'best' | 'high' | 'balanced' | 'low';

type PermissionStatus =
  | 'notDetermined'
  | 'whenInUse'
  | 'always'
  | 'denied'
  | 'restricted';

type ActivityType =
  | 'still'
  | 'walking'
  | 'running'
  | 'on_foot'
  | 'on_bicycle'
  | 'in_vehicle'
  | 'unknown';`}
            />
          </section>

          <section>
            <Heading id="motion">Motion detection</Heading>
            <p>
              While moving, locX records points at the configured accuracy. When the device stays inside{' '}
              <code>motion.stationaryRadiusMeters</code> for <code>motion.stopTimeoutMinutes</code>, it switches to
              stationary mode and emits <code>motionchange</code> with <code>isMoving: false</code>.
            </p>
            <h3 id="motion-stationary">While stationary</h3>
            <ul>
              <li>
                <strong>Android</strong> stops GPS, keeps the foreground service, checks a Wi-Fi/cell location every 3
                minutes, and places an exit geofence around the stop.
              </li>
              <li>
                <strong>iOS</strong> stops standard updates and keeps significant-change updates plus an exit region (at
                least 100 m) around the stop.
              </li>
            </ul>
            <p>Stationary points are not queued.</p>
            <h3 id="motion-wake">Waking up</h3>
            <p>
              Any of these switches back to moving and emits <code>motionchange</code> with <code>isMoving: true</code>:
            </p>
            <ul>
              <li>leaving the stationary area,</li>
              <li>
                an activity change to walking, running, cycling or driving (when <code>activityRecognition</code> is
                on),
              </li>
              <li>
                calling <code>changePace(true)</code>.
              </li>
            </ul>
            <CodeBlock
              label="motion.ts"
              lang="ts"
              code={`await LocX.changePace(true);  // force GPS on, e.g. when a trip starts
await LocX.changePace(false); // force stationary mode
const {isMoving} = await LocX.getState();

await LocX.configure({endpoint, motion: {enabled: false}});`}
            />
            <h3 id="motion-ar">Activity recognition</h3>
            <p>
              Set <code>motion.activityRecognition: true</code> to let the OS activity classifier wake the engine faster
              and emit <code>activitychange</code>. It needs the Android <code>ACTIVITY_RECOGNITION</code> permissions
              and the iOS <code>NSMotionUsageDescription</code> key.
            </p>
          </section>

          <section>
            <Heading id="odometer">Odometer</Heading>
            <p>
              Every queued point carries <code>odometer</code>: the total metres travelled so far. Points with an
              accuracy worse than 100 m are skipped so GPS jumps do not inflate the total. The value survives app
              restarts. In areas with poor GPS the total undercounts by design.
            </p>
            <CodeBlock
              label="odometer.ts"
              lang="ts"
              code={`const meters = await LocX.getOdometer();
await LocX.resetOdometer();
await LocX.setOdometer(12_500);`}
            />
          </section>

          <section>
            <Heading id="geofencing">Geofencing</Heading>
            <p>
              Geofences are monitored by the OS, independently of <code>start()</code>. They are stored and
              re-registered after reboot and app updates.
            </p>
            <CodeBlock
              label="geofences.ts"
              lang="ts"
              code={`await LocX.addGeofence({
  identifier: 'warehouse-7',
  latitude: 28.6139,
  longitude: 77.209,
  radius: 200,
  notifyOnEntry: true,
  notifyOnExit: true,
  notifyOnDwell: true,
  loiteringDelayMs: 5 * 60_000,
  extras: {siteId: 7},
});

LocX.on('geofence', event => {
  console.log(event.identifier, event.action, event.extras);
});

await LocX.getGeofences();
await LocX.removeGeofence('warehouse-7');
await LocX.removeGeofences();`}
            />
            <h3 id="geo-rules">Rules and limits</h3>
            <ul>
              <li>Use a radius of at least 100-150 m. The OS is unreliable below that.</li>
              <li>
                Limits: 99 geofences on Android, 19 on iOS. iOS allows 20 monitored regions per app and locX keeps one
                for its relaunch/stationary region. Android allows 100 and locX keeps one for the stationary fence.
              </li>
              <li>
                Background delivery needs background location on Android and Always permission on iOS. On iOS with only
                When In Use, locX emits a recoverable <code>geofence_needs_always</code> error.
              </li>
              <li>
                Android reports <code>DWELL</code> natively. iOS emits it from a timer after <code>ENTER</code>, so it
                fires only if iOS keeps the app running for the loitering delay.
              </li>
              <li>
                Identifiers starting with <code>locx:</code> are reserved.
              </li>
            </ul>
          </section>

          <section>
            <Heading id="headless">Headless events</Heading>
            <p>
              Register the handler once in <code>index.js</code>, outside any component. If you register it inside a
              component, it will not exist when the OS starts your app in the background.
            </p>
            <CodeBlock
              label="index.js"
              lang="js"
              code={`import {AppRegistry} from 'react-native';
import LocX from 'react-native-locx';
import App from './App';

LocX.registerHeadlessTask(async ({name, params}) => {
  if (name === 'geofence') {
    await fetch('https://api.example.com/v1/geofence-events', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(params),
    });
  }
});

AppRegistry.registerComponent('MyApp', () => App);`}
            />
            <h3 id="headless-android">Android</h3>
            <p>
              Set <code>enableHeadless: true</code> in <code>configure()</code>. When no JS listener is running (the app
              was killed, or started in the background by boot, a geofence, or the service), <code>location</code>,{' '}
              <code>motionchange</code>, <code>geofence</code>, <code>activitychange</code>, <code>upload</code> and{' '}
              <code>error</code> events start a headless JS task with a 60 second budget.
            </p>
            <h3 id="headless-ios">iOS</h3>
            <p>
              iOS has no headless JS. When iOS relaunches the app in the background for a location or region event,{' '}
              <code>index.js</code> runs and the same handler receives the events. Events raised before JS subscribes
              are buffered (up to 200).
            </p>
            <div className="callout">
              <CloudArrowUp size={22} weight="bold" />
              <p>
                Uploads do not depend on the headless task. Points are queued and sent natively. Never POST locations
                from JavaScript after a kill.
              </p>
            </div>
          </section>

          <section>
            <Heading id="backend">Backend contract</Heading>
            <p>
              locX sends JSON with the configured <code>method</code> (<code>POST</code> by default) and{' '}
              <code>headers</code> to your <code>endpoint</code>. Each request carries up to <code>batchSize</code>{' '}
              points.
            </p>
            <h3 id="payload-locations">
              Default body: <code>payload: 'locations'</code>
            </h3>
            <CodeBlock
              label="request body"
              lang="json"
              code={`{
  "locations": [
    {
      "id": "1f82d19d-3fb4-4327-b9ab-a4ccd437c092",
      "latitude": 28.6139,
      "longitude": 77.209,
      "accuracy": 12.5,
      "altitude": 214.0,
      "altitudeAccuracy": 5.0,
      "speed": 2.1,
      "heading": 182.0,
      "recordedAt": "2026-10-01T12:00:00.000Z",
      "receivedAt": "2026-10-01T12:00:01.000Z",
      "mocked": false,
      "provider": "fused",
      "attempts": 0,
      "activity": "in_vehicle",
      "odometer": 15230.4,
      "isMoving": true
    }
  ]
}`}
            />
            <h3 id="payload-path">
              Alternative body: <code>payload: 'path'</code>
            </h3>
            <p>
              For backends that expect a nested <code>coords</code> object. Negative or missing <code>speed</code> is
              sent as <code>0</code>, and a missing or out-of-range <code>heading</code> as <code>-1</code>.
            </p>
            <CodeBlock
              label="request body"
              lang="json"
              code={`{
  "location": [
    {
      "location": {
        "coords": {"latitude": 28.6139, "longitude": 77.209},
        "timestamp": "2026-10-01T12:00:00.000Z",
        "accuracy": 12.5,
        "speed": 2.1,
        "heading": 182.0
      }
    }
  ]
}`}
            />
            <h3 id="responses">Responses and retries</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Response</th>
                    <th>What locX does</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      Any <code>2xx</code>
                    </td>
                    <td>Acknowledges the whole batch and deletes it from the queue</td>
                  </tr>
                  <tr>
                    <td>
                      <code>408</code>, <code>429</code>, <code>5xx</code>
                    </td>
                    <td>
                      Keeps the batch and retries with exponential backoff (<code>retryBaseSeconds</code> up to{' '}
                      <code>retryMaxSeconds</code>)
                    </td>
                  </tr>
                  <tr>
                    <td>Other errors</td>
                    <td>
                      Keeps the records and waits for the next connectivity change or <code>sync()</code>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              Treat <code>id</code> as a unique key. Retries reuse it, so an upsert or unique index keeps your data free
              of duplicates. Honor <code>mocked: true</code> on the server if fake GPS should be rejected.
            </p>
            <h3 id="local-server">Local test server</h3>
            <p>
              The repository includes a mock receiver that logs duplicate ids. Use{' '}
              <code>FORCE_STATUS=401 npm run mock-server</code> to test error handling.
            </p>
            <CodeBlock
              label="terminal"
              lang="sh"
              code={`npm install
npm run mock-server
# Android emulator: http://10.0.2.2:8787/locations
# iOS simulator:    http://127.0.0.1:8787/locations`}
            />
            <p>Physical devices need your computer's LAN address plus HTTPS or a cleartext exception.</p>
          </section>

          <section>
            <Heading id="platform-notes">Platform notes and limits</Heading>
            <h3 id="pn-android">Android</h3>
            <ul>
              <li>
                Tracking runs in a visible foreground location service. It continues after the app is removed from
                Recents and can restore after reboot when <code>startOnBoot: true</code> and the OS still allows the app
                to run.
              </li>
              <li>
                Ask users to choose <strong>Allow all the time</strong> in the background-location prompt. Background
                geofences and restarts from the background (for example after a reboot) depend on it.
              </li>
              <li>
                Force Stop from Settings disables every component until the user opens the app again. This is OS
                behavior.
              </li>
              <li>
                Xiaomi, Oppo, Vivo, Realme and similar OEM battery managers can still kill the service unless the user
                allows autostart or background activity. That is a deployment step, not something the library can
                override.
              </li>
              <li>
                <code>getState().batteryOptimizationIgnored</code> and <code>getState().restrictions</code> report the
                device situation. Do not request a battery-optimization exemption unless Play policy for your app
                category allows it.
              </li>
              <li>Up to 99 user geofences.</li>
            </ul>
            <h3 id="pn-ios">iOS</h3>
            <ul>
              <li>
                locX uses Core Location standard updates, significant-change updates and a relaunch region. Delivery
                happens only while iOS grants background execution.
              </li>
              <li>
                If the user swipes the app away, iOS may prevent relaunch until the app is opened. No compliant SDK can
                bypass this rule.
              </li>
              <li>Kill-state relaunch and background geofences need Always permission.</li>
              <li>
                iOS monitors at most 20 regions per app. One is kept for the relaunch/stationary region, so you get 19
                user geofences.
              </li>
            </ul>
            <div className="callout">
              <Warning size={22} weight="bold" />
              <p>
                Do not hide the Android notification or the iOS location indicator. Both are part of how the OS lets you
                run in the background.
              </p>
            </div>
          </section>

          <section>
            <Heading id="production">Production checklist</Heading>
            <h3 id="prod-privacy">Store and privacy</h3>
            <ul>
              <li>
                Explain tracking before the permission prompt, provide a privacy policy, and collect only what the
                product needs.
              </li>
              <li>Keep a visible in-app stop control.</li>
              <li>
                Google Play requires a background-location declaration and often a review video. Apple requires a
                purpose tied to user-visible functionality.
              </li>
            </ul>
            <h3 id="prod-hardening">Hardening</h3>
            <ul>
              <li>
                Cap <code>maxQueueSize</code> and <code>maxAgeDays</code> for your use case.
              </li>
              <li>
                Make the backend idempotent on <code>id</code>.
              </li>
              <li>
                Test Recents swipe, reboot, offline drain, <code>401</code>/<code>429</code>/<code>500</code>,
                permission revoke, stationary and moving transitions, geofences, and OEM battery modes on real devices
                before release. See{' '}
                <a href="https://github.com/Sundanpatyad/locX-geolocation-reactnative/blob/main/TESTING.md">
                  TESTING.md
                </a>
                .
              </li>
            </ul>
          </section>

          <section>
            <Heading id="migration">Migrating from react-native-background-geolocation</Heading>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>react-native-background-geolocation</th>
                    <th>locX</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>BackgroundGeolocation.ready({'{...}'})</code>
                    </td>
                    <td>
                      <code>LocX.configure({'{...}'})</code>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>url</code>, <code>headers</code>, <code>autoSync</code>, <code>batchSync</code>
                    </td>
                    <td>
                      <code>endpoint</code>, <code>headers</code>, <code>autoSync</code>, <code>batchSize</code>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>desiredAccuracy</code>, <code>distanceFilter</code>
                    </td>
                    <td>
                      <code>accuracy</code>, <code>distanceFilterMeters</code>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>stationaryRadius</code>, <code>stopTimeout</code>
                    </td>
                    <td>
                      <code>motion.stationaryRadiusMeters</code>, <code>motion.stopTimeoutMinutes</code>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>stopOnTerminate</code>, <code>startOnBoot</code>
                    </td>
                    <td>same names</td>
                  </tr>
                  <tr>
                    <td>
                      <code>enableHeadless</code> + <code>registerHeadlessTask</code>
                    </td>
                    <td>same names</td>
                  </tr>
                  <tr>
                    <td>
                      <code>start()</code>, <code>stop()</code>, <code>changePace()</code>
                    </td>
                    <td>same names</td>
                  </tr>
                  <tr>
                    <td>
                      <code>getCurrentPosition()</code>
                    </td>
                    <td>
                      <code>getCurrentLocation()</code>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>getOdometer()</code>, <code>setOdometer()</code>, <code>resetOdometer()</code>
                    </td>
                    <td>same names</td>
                  </tr>
                  <tr>
                    <td>
                      <code>addGeofence()</code>, <code>removeGeofence()</code>, <code>getGeofences()</code>
                    </td>
                    <td>same names</td>
                  </tr>
                  <tr>
                    <td>
                      <code>onLocation</code>, <code>onMotionChange</code>, <code>onGeofence</code>,{' '}
                      <code>onActivityChange</code>, <code>onHttp</code>
                    </td>
                    <td>
                      <code>on('location')</code>, <code>on('motionchange')</code>, <code>on('geofence')</code>,{' '}
                      <code>on('activitychange')</code>, <code>on('upload')</code>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>location.coords.latitude</code>
                    </td>
                    <td>
                      <code>point.latitude</code>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>extras</code> on geofences
                    </td>
                    <td>same</td>
                  </tr>
                  <tr>
                    <td>License key</td>
                    <td>not needed</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              The upload body differs: locX sends a flat <code>locations</code> array. Update the server, or use{' '}
              <code>payload: 'path'</code> for the nested <code>coords</code> shape shown in the backend contract.
            </p>
          </section>

          <section>
            <Heading id="faq">FAQ</Heading>
            <details className="faq">
              <summary>Do I need a license key?</summary>
              <p>No. locX is MIT licensed and behaves the same in debug and release builds.</p>
            </details>
            <details className="faq">
              <summary>Does it work with Expo?</summary>
              <p>
                Yes, with prebuild or a development build. Add the config plugin to <code>app.json</code>. It does not
                run in Expo Go because it contains native code.
              </p>
            </details>
            <details className="faq">
              <summary>Does it require the new architecture?</summary>
              <p>
                The native module is a TurboModule built with codegen and the package targets React Native 0.76 and
                newer, where the new architecture is the default.
              </p>
            </details>
            <details className="faq">
              <summary>Will tracking continue after the user swipes the app away?</summary>
              <p>
                On Android, yes: the foreground service keeps running with its notification, unless the user uses Force
                Stop or an OEM battery manager kills it. On iOS, the system may not relaunch the app until the user
                opens it again.
              </p>
            </details>
            <details className="faq">
              <summary>What happens when the device is offline?</summary>
              <p>
                Points keep going into the on-device queue, up to <code>maxQueueSize</code> and <code>maxAgeDays</code>.
                When connectivity returns, the queue drains in batches of <code>batchSize</code>.
              </p>
            </details>
            <details className="faq">
              <summary>Why do I see duplicate rows on my server?</summary>
              <p>
                A retry after a lost response resends the same batch. Every point has a stable <code>id</code>; make it
                a unique key and upsert on it.
              </p>
            </details>
            <details className="faq">
              <summary>Why are no points recorded while I am sitting still?</summary>
              <p>
                That is motion detection. After <code>stopTimeoutMinutes</code> inside <code>stationaryRadiusMeters</code>
                , GPS turns off and stationary points are not queued. Call <code>changePace(true)</code> or set{' '}
                <code>motion: {'{enabled: false}'}</code> if you need continuous points.
              </p>
            </details>
            <details className="faq">
              <summary>How many geofences can I add?</summary>
              <p>
                99 on Android and 19 on iOS. <code>addGeofences</code> rejects when the total would exceed the limit.
              </p>
            </details>
            <details className="faq">
              <summary>How do I update an expiring auth token?</summary>
              <p>
                Refresh it while the app is in the foreground and call <code>configure()</code> again with the new
                header. Native uploads use the stored config.
              </p>
            </details>
            <details className="faq">
              <summary>Where do I report a bug?</summary>
              <p>
                Open an issue on{' '}
                <a href="https://github.com/Sundanpatyad/locX-geolocation-reactnative/issues">GitHub</a> with the OS
                version, device manufacturer and battery mode.
              </p>
            </details>
          </section>
        </main>
      </div>
      <Footer />
    </>
  );
}
