import {AppRegistry} from 'react-native';
import LocX from 'react-native-locx';
import App from './App';
import {name as appName} from './app.json';
import {SERVER_URL} from './server';

LocX.registerHeadlessTask(async ({name, params}) => {
  if (name === 'upload') return;
  try {
    await fetch(`${SERVER_URL}/events`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({source: 'headless', name, params}),
    });
  } catch {
    // The mock server may be offline; the location itself is still queued natively.
  }
});

AppRegistry.registerComponent(appName, () => App);
