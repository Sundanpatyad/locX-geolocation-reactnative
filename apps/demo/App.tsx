import React, {useCallback, useEffect, useMemo, useState} from 'react';
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
  type Geofence,
  type LocationPoint,
  type LocXState,
} from 'react-native-locx';
import {SERVER_URL} from './server';

const emptyState: LocXState = {
  configured: false,
  tracking: false,
  permission: 'notDetermined',
  queueSize: 0,
  lastLocation: null,
  lastError: null,
};

const defaultEndpoint = `${SERVER_URL}/locations`;
const MAX_LOG = 30;

function time(): string {
  return new Date().toLocaleTimeString();
}

export default function App(): React.JSX.Element {
  const [endpoint, setEndpoint] = useState(defaultEndpoint);
  const [state, setState] = useState(emptyState);
  const [latest, setLatest] = useState<LocationPoint | null>(null);
  const [queue, setQueue] = useState<LocationPoint[]>([]);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [odometer, setOdometer] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [message, setMessage] = useState('Not configured');

  const addLog = useCallback((line: string) => {
    setLog(current => [`${time()}  ${line}`, ...current].slice(0, MAX_LOG));
  }, []);

  useEffect(() => {
    const subs = [
      LocX.on('state', next => {
        setState(next);
        if (next.odometer != null) setOdometer(next.odometer);
      }),
      LocX.on('location', point => {
        setLatest(point);
        if (point.odometer != null) setOdometer(point.odometer);
      }),
      LocX.on('upload', event => {
        setMessage(`Uploaded ${event.accepted}; ${event.remaining} queued`);
        addLog(`upload ${event.accepted} -> HTTP ${event.status}`);
      }),
      LocX.on('permission', event => setMessage(`Permission: ${event.status}`)),
      LocX.on('error', error => {
        setMessage(error.message);
        addLog(`error ${error.code}: ${error.message}`);
      }),
      LocX.on('motionchange', event =>
        addLog(event.isMoving ? 'MOVING (GPS on)' : 'STATIONARY (GPS off)'),
      ),
      LocX.on('activitychange', event =>
        addLog(`activity ${event.activity} (${event.confidence}%)`),
      ),
      LocX.on('geofence', event => addLog(`geofence ${event.action} ${event.identifier}`)),
    ];
    LocX.getState().then(next => {
      setState(next);
      if (next.odometer != null) setOdometer(next.odometer);
    }).catch(() => undefined);
    LocX.getGeofences().then(setGeofences).catch(() => undefined);
    return () => subs.forEach(sub => sub.remove());
  }, [addLog]);

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
      enableHeadless: true,
      motion: {
        stationaryRadiusMeters: 50,
        stopTimeoutMinutes: 2,
        activityRecognition: true,
      },
      notification: {
        title: 'locX tracking active',
        text: 'Location sharing is running in the background',
      },
    });
    setState(next);
  };

  const run = async (operation: () => Promise<unknown>, success: string) => {
    try {
      await operation();
      const next = await LocX.getState();
      setState(next);
      if (next.odometer != null) setOdometer(next.odometer);
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const geofenceHere = async () => {
    const here = await LocX.getCurrentLocation();
    await LocX.addGeofence({
      identifier: `here-${geofences.length + 1}`,
      latitude: here.latitude,
      longitude: here.longitude,
      radius: 150,
      notifyOnEntry: true,
      notifyOnExit: true,
      notifyOnDwell: true,
      loiteringDelayMs: 60_000,
      extras: {createdAt: new Date().toISOString()},
    });
    setGeofences(await LocX.getGeofences());
    addLog(`geofence added at ${here.latitude.toFixed(5)}, ${here.longitude.toFixed(5)}`);
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
          running on the computer while you test.
        </Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setEndpoint}
          style={styles.input}
          value={endpoint}
        />
        <Button title="1. Configure" onPress={() => run(configure, 'Configured')} />
        <View style={styles.row}>
          <Button
            title="2. Allow location"
            onPress={() =>
              run(() => LocX.requestPermission(true), 'Permission requested')
            }
          />
          <Button
            title={state.tracking ? 'Stop' : '3. Start'}
            onPress={() =>
              run(
                state.tracking ? LocX.stop : LocX.start,
                state.tracking ? 'Stopped' : 'Started',
              )
            }
          />
        </View>

        <Text style={styles.section}>Motion</Text>
        <Text style={styles.big}>
          {state.tracking ? (state.isMoving ? 'MOVING' : 'STATIONARY') : 'not tracking'}
          {state.activity ? `  ·  ${state.activity}` : ''}
        </Text>
        <View style={styles.row}>
          <Button
            title="Force moving"
            onPress={() => run(() => LocX.changePace(true), 'Moving')}
          />
          <Button
            title="Force stationary"
            onPress={() => run(() => LocX.changePace(false), 'Stationary')}
          />
        </View>

        <Text style={styles.section}>Odometer</Text>
        <Text style={styles.big}>{(odometer / 1000).toFixed(3)} km</Text>
        <Button
          title="Reset odometer"
          onPress={() => run(async () => setOdometer(await LocX.resetOdometer()), 'Odometer reset')}
        />

        <Text style={styles.section}>Geofences ({geofences.length})</Text>
        <View style={styles.row}>
          <Button
            title="Geofence here (150 m)"
            onPress={() => run(geofenceHere, 'Geofence added')}
          />
          <Button
            title="Remove all"
            onPress={() =>
              run(async () => {
                await LocX.removeGeofences();
                setGeofences([]);
              }, 'Geofences removed')
            }
          />
        </View>
        {geofences.map(g => (
          <Text key={g.identifier} style={styles.meta}>
            {g.identifier}: {g.latitude.toFixed(5)}, {g.longitude.toFixed(5)} r={g.radius}m
          </Text>
        ))}

        <Text style={styles.section}>Queue</Text>
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

        <Text style={styles.section}>Events</Text>
        <Text selectable style={styles.json}>
          {log.length ? log.join('\n') : 'No events yet'}
        </Text>

        <Text style={styles.section}>Raw</Text>
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
  section: {fontSize: 18, fontWeight: '700', marginTop: 8},
  big: {fontSize: 22, fontWeight: '600'},
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
