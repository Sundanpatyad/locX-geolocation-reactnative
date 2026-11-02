# locX

`locX` is a React Native background-location engine for Android and iOS. It is
free, MIT licensed, and needs no license key for debug or release builds.

Website: https://sundanpatyad.github.io/locX-geolocation-reactnative/

- Background tracking with a durable SQLite queue and automatic HTTP upload
- Motion detection: GPS turns off while the device is stationary
- Odometer: total distance travelled, stored on every point
- Geofencing: enter, exit, and dwell events
- Headless events while the app UI is not running
- Restart after reboot and after the app is removed from Recents (Android)

Locations are committed to a native SQLite queue before upload. A point is
deleted only after the server returns HTTP `200`-`299`. Retries reuse the same
`id`, so the backend can stay idempotent.

## Platform guarantees

Android uses a visible foreground location service. It can continue after the
app is removed from Recents and can restore after reboot when
`startOnBoot: true` and the OS still allows the app to run. Android Force Stop
disables every component until the user opens the app again. Xiaomi, Oppo,
Vivo, Realme, and similar OEM battery managers can still kill the service
unless the user allows autostart/background activity.

iOS uses Core Location standard updates, significant-change updates, and a
relaunch region. Delivery happens only while iOS grants background execution.
If the user swipes the app away, iOS may prevent relaunch until the app is
opened. No compliant SDK can bypass that rule.

Do not hide the Android notification or the iOS status-bar location indicator.

## Workspace

- `packages/locx`: reusable React Native package and native engines
- `apps/demo`: diagnostic UI
- `tools/mock-server`: local HTTP receiver with duplicate-id logging

## Install

```sh
npm install react-native-locx
cd ios && pod install
```

### Expo prebuild

```json
{
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
}
```

`motionPermission` and `activityRecognition` are only needed when
`motion.activityRecognition` is enabled.

### Bare iOS

Add `location` to `UIBackgroundModes` and provide both
`NSLocationWhenInUseUsageDescription` and
`NSLocationAlwaysAndWhenInUseUsageDescription`. Always permission is required
for kill-state relaunch and background geofences. Add
`NSMotionUsageDescription` if you enable `motion.activityRecognition`.

### Bare Android

The library manifest already declares location, background location, foreground
service, notifications, wake lock, boot receiver, geofence receiver, and the
headless service. Android 10+ needs the separate background-location prompt
after fine location is granted. Android 13+ needs notification permission so the
foreground service can display its notice.

To use `motion.activityRecognition`, add to `android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />
<uses-permission android:name="com.google.android.gms.permission.ACTIVITY_RECOGNITION" />
```

`requestPermission()` then asks for it together with location.

## Usage

```ts
import LocX from 'react-native-locx';

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
});

await LocX.requestPermission(true);
await LocX.start();

LocX.on('location', point => console.log(point.id, point.latitude, point.odometer));
LocX.on('motionchange', event => console.log('moving?', event.isMoving));
LocX.on('upload', event => console.log(event.accepted, event.remaining));
```

Refresh expiring tokens in the foreground, then call `configure` again with the
new `Authorization` header. Config and headers are stored in encrypted
preferences on Android when the platform crypto provider is available.

### Configuration

| Option | Default | Notes |
| --- | --- | --- |
| `endpoint` | required | `http(s)` URL that receives batches |
| `headers` | `{}` | Sent with every upload |
| `method` | `POST` | `POST` or `PUT` |
| `payload` | `locations` | `path` sends `{location: [{location: {coords, timestamp, accuracy, speed, heading}}]}` |
| `accuracy` | `high` | `best`, `high`, `balanced`, `low` |
| `distanceFilterMeters` | `25` | Minimum movement between points |
| `intervalMs` / `fastestIntervalMs` | `10000` / `5000` | Android update rate |
| `batchSize` | `20` | Points per upload |
| `autoSync` / `wifiOnly` | `true` / `false` | Upload policy |
| `stopOnTerminate` / `startOnBoot` | `false` / `false` | Lifecycle |
| `maxQueueSize` / `maxAgeDays` | `10000` / `30` | Queue limits |
| `retryBaseSeconds` / `retryMaxSeconds` | `30` / `3600` | Exponential backoff |
| `motion.enabled` | `true` | Turn GPS off while stationary |
| `motion.stationaryRadiusMeters` | `50` | Movement inside this radius counts as stationary |
| `motion.stopTimeoutMinutes` | `5` | Idle time before GPS turns off |
| `motion.activityRecognition` | `false` | Use the OS activity classifier to wake faster |
| `enableHeadless` | `false` | Android: run the headless task when JS is not running |
| `notification` | | Android foreground-service `title`, `text`, `channelName` |

## Motion detection

While moving, locX records points at the configured accuracy. When the device
stays inside `stationaryRadiusMeters` for `stopTimeoutMinutes`, it switches to
stationary mode and emits `motionchange` with `isMoving: false`:

- Android stops GPS, keeps the foreground service, checks a Wi-Fi/cell location
  every 3 minutes, and places an exit geofence around the stop.
- iOS stops standard updates and keeps significant-change updates plus an exit
  region (at least 100 m) around the stop.

Leaving that area, an activity change to walking/running/cycling/driving (if
`activityRecognition` is on), or `changePace(true)` switches back to moving and
emits `motionchange` with `isMoving: true`. Stationary points are not queued.

```ts
await LocX.changePace(true);  // force GPS on, e.g. when a trip starts
await LocX.changePace(false); // force stationary mode
const {isMoving} = await LocX.getState();
```

Set `motion: {enabled: false}` to keep GPS on all the time.

## Odometer

Every queued point carries `odometer`: the total metres travelled so far.
Points with an accuracy worse than 100 m are skipped so GPS jumps do not inflate
the total. The value survives app restarts.

```ts
const meters = await LocX.getOdometer();
await LocX.resetOdometer();      // start of a new trip
await LocX.setOdometer(12_500);  // restore a known value
```

## Geofencing

Geofences are monitored by the OS, independently of `start()`. They are stored
and re-registered after reboot and app updates.

```ts
await LocX.addGeofence({
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
  console.log(event.identifier, event.action, event.extras); // ENTER | EXIT | DWELL
});

await LocX.getGeofences();
await LocX.removeGeofence('warehouse-7');
await LocX.removeGeofences(); // all
```

- Use a radius of at least 100-150 m; the OS is unreliable below that.
- Limits: 99 geofences on Android, 19 on iOS.
- Background delivery needs background (Android) / Always (iOS) location permission.
- Android reports `DWELL` natively. iOS emits it from a timer after `ENTER`, so
  it fires only if iOS keeps the app running for the loitering delay.
- Identifiers starting with `locx:` are reserved.

## Headless events

Register the handler once in `index.js`, outside any component:

```js
import {AppRegistry} from 'react-native';
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

AppRegistry.registerComponent('MyApp', () => App);
```

- Android: set `enableHeadless: true`. When no JS listener is running (app
  killed, or started in the background by boot, geofence, or the service),
  `location`, `motionchange`, `geofence`, `activitychange`, `upload`, and
  `error` events start a headless JS task with a 60 s budget.
- iOS has no headless JS. When iOS relaunches the app in the background for a
  location or region event, `index.js` runs and the same handler receives the
  events. Events raised before JS subscribes are buffered (up to 200).

Uploads do not depend on the headless task: points are queued and sent natively.

## Backend contract

`POST` or `PUT` JSON:

```json
{
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
}
```

Treat `id` as a unique key. Any `2xx` acknowledges the whole batch. `408`,
`429`, and `5xx` retry with exponential backoff. Other errors keep the records
and wait for the next connectivity or `sync()` trigger.

## Migrating from react-native-background-geolocation

| react-native-background-geolocation | locX |
| --- | --- |
| `BackgroundGeolocation.ready({...})` | `LocX.configure({...})` |
| `url`, `headers`, `autoSync`, `batchSync` | `endpoint`, `headers`, `autoSync`, `batchSize` |
| `desiredAccuracy`, `distanceFilter` | `accuracy`, `distanceFilterMeters` |
| `stationaryRadius`, `stopTimeout` | `motion.stationaryRadiusMeters`, `motion.stopTimeoutMinutes` |
| `stopOnTerminate`, `startOnBoot` | same names |
| `enableHeadless` + `registerHeadlessTask` | same names |
| `start()`, `stop()`, `changePace()` | same names |
| `getCurrentPosition()` | `getCurrentLocation()` |
| `getOdometer()`, `setOdometer()`, `resetOdometer()` | same names |
| `addGeofence()`, `removeGeofence()`, `getGeofences()` | same names |
| `onLocation`, `onMotionChange`, `onGeofence`, `onActivityChange`, `onHttp` | `on('location')`, `on('motionchange')`, `on('geofence')`, `on('activitychange')`, `on('upload')` |
| `location.coords.latitude` | `point.latitude` |
| `extras` on geofences | same |
| License key | not needed |

The upload body differs: locX sends a flat `locations` array (or the `path`
shape above). Update the server or use `payload: 'path'`.

## Local development

```sh
npm install
npm run typecheck
npm test
npm run mock-server
```

Android emulator: `http://10.0.2.2:8787/locations`  
iOS simulator: `http://127.0.0.1:8787/locations`  
Physical devices: computer LAN address plus HTTPS or a cleartext exception.

See [`apps/demo/README.md`](apps/demo/README.md) and [`TESTING.md`](TESTING.md).

## Store and privacy

Explain tracking before the permission prompt. Provide a privacy policy. Collect
only what the product needs. Keep a visible in-app stop control. Google Play
requires a background-location declaration and often a review video. Apple
requires a purpose tied to user-visible functionality. OEM autostart screens
are a deployment step, not something the library can silently override.

## Production hardening

- Persist-then-upload is mandatory. Never POST from JavaScript after a kill.
- Cap `maxQueueSize` and `maxAgeDays`.
- Honor `mocked: true` on the server if fake GPS should be rejected.
- Do not request battery-optimization exemption unless Play policy for the
  category allows it. `getState().batteryOptimizationIgnored` and
  `restrictions` report the current device situation.
- Test Recents swipe, reboot, offline drain, 401/429/500, permission revoke,
  stationary/moving transitions, geofences, and OEM battery modes on real
  devices before release.

## License

MIT © Sundan Sharma. See [`LICENSE`](LICENSE).
