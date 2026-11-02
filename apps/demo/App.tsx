import React, {useEffect, useMemo, useState} from 'react';
import {
  Button,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import LocX, {
  type LocationPoint,
  type LocXState,
} from '@locx/react-native';

const emptyState: LocXState = {
  configured: false,
  tracking: false,
  permission: 'notDetermined',
  queueSize: 0,
  lastLocation: null,
  lastError: null,
};

const defaultEndpoint =
  'https://retired-core-reprint-technologies.trycloudflare.com/locations';

export default function App(): React.JSX.Element {
  const [endpoint, setEndpoint] = useState(defaultEndpoint);
  const [state, setState] = useState(emptyState);
  const [latest, setLatest] = useState<LocationPoint | null>(null);
  const [queue, setQueue] = useState<LocationPoint[]>([]);
  const [message, setMessage] = useState('Not configured');

  useEffect(() => {
    const stateSub = LocX.on('state', setState);
    const locationSub = LocX.on('location', setLatest);
    const uploadSub = LocX.on('upload', event =>
      setMessage(`Uploaded ${event.accepted}; ${event.remaining} queued`),
    );
    const permissionSub = LocX.on('permission', event =>
      setMessage(`Permission: ${event.status}`),
    );
    const errorSub = LocX.on('error', error => setMessage(error.message));
    LocX.getState().then(setState).catch(() => undefined);
    return () => {
      stateSub.remove();
      locationSub.remove();
      uploadSub.remove();
      permissionSub.remove();
      errorSub.remove();
    };
  }, []);

  const configure = async () => {
    const next = await LocX.configure({
      endpoint,
      accuracy: 'high',
      distanceFilterMeters: 20,
      intervalMs: 15_000,
      fastestIntervalMs: 10_000,
      batchSize: 20,
      autoSync: true,
      stopOnTerminate: false,
      startOnBoot: true,
      maxQueueSize: 10_000,
      maxAgeDays: 7,
      notification: {
        title: 'locX tracking active',
        text: 'Location sharing is running in the background',
      },
    });
    setState(next);
    setMessage('Configured');
  };

  const run = async (operation: () => Promise<unknown>, success: string) => {
    try {
      await operation();
      setState(await LocX.getState());
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const restrictions = useMemo(
    () => (state.restrictions ?? []).join(', ') || 'none reported',
    [state.restrictions],
  );

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>locX diagnostics</Text>
        <Text style={styles.hint}>
          Cloudflare tunnel is prefilled. Keep mock-server and cloudflared
          running on this computer while you test.
        </Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setEndpoint}
          style={styles.input}
          value={endpoint}
        />
        <Button title="Configure" onPress={() => run(configure, 'Configured')} />
        <View style={styles.row}>
          <Button
            title="Allow location"
            onPress={() =>
              run(() => LocX.requestPermission(true), 'Permission requested')
            }
          />
          <Button
            title={state.tracking ? 'Stop' : 'Start'}
            onPress={() =>
              run(
                state.tracking ? LocX.stop : LocX.start,
                state.tracking ? 'Stopped' : 'Started',
              )
            }
          />
        </View>
        <View style={styles.row}>
          <Button
            title="Current fix"
            onPress={() =>
              run(async () => {
                setLatest(await LocX.getCurrentLocation());
              }, 'Location received')
            }
          />
          <Button title="Sync queue" onPress={() => run(LocX.sync, 'Synced')} />
        </View>
        <View style={styles.row}>
          <Button
            title="Inspect queue"
            onPress={() =>
              run(async () => {
                setQueue(await LocX.getQueuedLocations(20));
              }, 'Queue loaded')
            }
          />
          <Button
            title="Clear queue"
            onPress={() =>
              run(async () => {
                await LocX.clearQueue();
                setQueue([]);
              }, 'Queue cleared')
            }
          />
        </View>
        <Text style={styles.message}>{message}</Text>
        <Text style={styles.meta}>
          permission={state.permission} tracking={String(state.tracking)}{' '}
          queue={state.queueSize} batteryIgnored=
          {String(state.batteryOptimizationIgnored ?? 'n/a')} restrictions=
          {restrictions}
        </Text>
        <Text selectable style={styles.json}>
          {JSON.stringify({state, latest, queue}, null, 2)}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#f6f7f9'},
  content: {gap: 16, padding: 20},
  title: {fontSize: 26, fontWeight: '700'},
  hint: {color: '#4b5563'},
  input: {
    backgroundColor: 'white',
    borderColor: '#ccd1d8',
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  row: {flexDirection: 'row', gap: 12, justifyContent: 'space-between'},
  message: {fontWeight: '600'},
  meta: {color: '#374151'},
  json: {
    backgroundColor: '#111827',
    borderRadius: 8,
    color: '#d1fae5',
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
    padding: 12,
  },
});
