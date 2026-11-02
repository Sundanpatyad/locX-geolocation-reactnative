# locX real-device test matrix

Unit tests cannot prove background survival. Run these cases on physical
devices before each release and record OS, manufacturer, result, and battery
mode.

## Automated checks

```sh
npm install
npm run typecheck
npm test
```

Kotlin config/payload tests live in
`packages/locx/android/src/test/java/com/locx/`. Run them from the demo app:

```sh
cd apps/demo/android
./gradlew :locx_react-native:testDebugUnitTest
```

The iOS queue, backoff, motion, geofence, and region-relaunch paths are in
`packages/locx/ios/LocX.swift`. They are verified on device because they depend
on Core Location, Core Motion, SQLite, and UIApplication background tasks.

## Core scenarios

1. Grant foreground, notification, then background/Always location permission.
2. Start tracking, lock the screen, move at least 200 m, and verify delivery.
3. Remove the app from Recents, move again, and verify Android continues with
   a visible notification.
4. Disable network for 15 minutes, collect points, restore network, and confirm
   the queue drains without duplicate backend rows (`id` uniqueness).
5. Force the mock server to `401`, `429`, and `500` (`FORCE_STATUS=401 npm run mock-server`);
   confirm records remain and retry backs off.
6. Reboot while tracking. Verify Android restores when `startOnBoot` is true
   and iOS resumes only if Core Location relaunches the app.
7. Revoke location permission and disable system Location Services while
   tracking; verify an error event and no crash.
8. Enable battery saver/low-power mode and repeat locked-screen movement.
9. Send mock locations on Android; confirm `mocked: true`.
10. Force Stop Android from Settings; confirm tracking stops and only resumes
    after the user opens the app. If tracking was left enabled, locX tries to
    restore the service on next process start. This is expected OS behavior.
11. Swipe away iOS; confirm the documented device/OS behavior without assuming
    an immediate relaunch. Reopen and confirm the durable queue remains valid.
12. On Xiaomi/Oppo/Vivo/Realme, repeat steps 2-3 with autostart off, then on.

## Motion, odometer, geofence, and headless scenarios

13. Start tracking, then leave the phone on a table for `stopTimeoutMinutes`
    plus one minute. Expect `motionchange` with `isMoving: false`, no new
    `location` events, and the GPS icon gone (Android) or the blue pill gone
    (iOS, unless another app uses location).
14. Walk or drive away from that spot. Expect `motionchange` with
    `isMoving: true` within about 3 minutes on Android and on region exit
    (100-200 m) on iOS, then regular points again.
15. Call `changePace(false)` and `changePace(true)` from the UI; confirm both
    transitions without waiting for detection.
16. Drive a known route; compare `getOdometer()` with the map distance.
    Expect it within a few percent; poor-GPS areas undercount by design
    because points worse than 100 m are skipped.
17. Kill the app mid-trip and reopen it; confirm the odometer continued.
18. Add a geofence of at least 150 m around a nearby place with entry, exit,
    and dwell. Walk in, wait the loitering delay, walk out. Expect ENTER,
    DWELL, EXIT with the `extras` you set.
19. Reboot inside and outside the geofence; confirm `getGeofences()` still
    lists it and the next transition still fires (Android re-registers after
    boot).
20. Android with `enableHeadless: true`: register the task in `index.js`,
    remove the app from Recents, and trigger a location and a geofence event.
    Confirm the task ran (log, local notification, or HTTP call).
21. iOS: swipe the app away with Always permission, cross a geofence, and
    confirm the handler passed to `registerHeadlessTask` received the event
    after the background relaunch.

## Required devices

| Family | Minimum coverage |
| --- | --- |
| Google Pixel | Current Android and one previous major |
| Samsung Galaxy | Current One UI, optimized and unrestricted battery modes |
| Xiaomi/Redmi | MIUI/HyperOS autostart on and off |
| Oppo/Realme | Background activity and auto-launch on and off |
| Vivo | High background power consumption setting on and off |
| iPhone | Current iOS and one previous major, standard and Low Power Mode |

## Release gates

- No point is deleted before a `2xx` response.
- Backend uniqueness on `id` prevents retry duplicates.
- Queue retention and maximum size are enforced.
- Foreground notification remains visible while Android tracking is active.
- iOS location indicator remains visible while background updates are allowed.
- A visible in-app stop action works from foreground after process recreation.
- Permission denial, reduced accuracy, provider loss, and malformed endpoint do
  not crash either native module.
- `getState().restrictions` reports OEM/battery notes on Android instead of
  pretending every manufacturer behaves like Pixel.
