# locX Demo

Test app for `@locx/react-native`. Keep the mock server running, then install
this app on an emulator or phone.

## 1. Mock server (separate terminal)

```sh
cd locX
npm run mock-server
```

Leave that terminal open. It listens on `http://0.0.0.0:8787/locations`.

## 2. Install and run

```sh
cd locX
npm install
cd apps/demo
npx react-native run-android
```

iOS (Mac):

```sh
cd ios
pod install
cd ..
npx react-native run-ios
```

An Android emulator or iOS simulator must already be running.

## 3. In the app

1. Endpoint:
   - Android emulator: `http://10.0.2.2:8787/locations`
   - iOS simulator: `http://127.0.0.1:8787/locations`
   - Physical phone: `http://YOUR_LAN_IP:8787/locations` (same Wi-Fi as the computer)
2. **Configure**
3. **Allow location** (Android: location + notifications + Allow all the time; iOS: Always)
4. **Start**
5. **Current fix**, or move the emulator location

**Pass:** the mock-server terminal prints JSON with `count` and `ids`.
