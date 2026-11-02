import {
  AppRegistry,
  NativeEventEmitter,
  Platform,
  type EmitterSubscription,
} from 'react-native';
import NativeLocX from './specs/NativeLocX';
import type {
  Geofence,
  HeadlessEvent,
  LocXConfig,
  LocXEventMap,
  LocXEventName,
  LocXState,
  LocationPoint,
  PermissionStatus,
  Subscription,
} from './types';

export * from './types';

export const HEADLESS_TASK_NAME = 'LocXHeadlessTask';

const EVENT_NAMES: LocXEventName[] = [
  'location',
  'upload',
  'state',
  'permission',
  'error',
  'motionchange',
  'activitychange',
  'geofence',
];

const emitter = new NativeEventEmitter(NativeLocX);

function parse<T>(value: string): T {
  return JSON.parse(value) as T;
}

function assertConfig(config: LocXConfig): void {
  if (!config.endpoint || !/^https?:\/\//i.test(config.endpoint)) {
    throw new Error('LocX endpoint must be an http(s) URL');
  }
  if ((config.distanceFilterMeters ?? 25) < 0) {
    throw new Error('distanceFilterMeters cannot be negative');
  }
  if ((config.batchSize ?? 20) < 1) {
    throw new Error('batchSize must be at least 1');
  }
  const motion = config.motion ?? {};
  if ((motion.stationaryRadiusMeters ?? 50) <= 0) {
    throw new Error('motion.stationaryRadiusMeters must be positive');
  }
  if ((motion.stopTimeoutMinutes ?? 5) < 1) {
    throw new Error('motion.stopTimeoutMinutes must be at least 1');
  }
}

function assertGeofence(geofence: Geofence): void {
  if (!geofence.identifier) {
    throw new Error('Geofence identifier is required');
  }
  if (geofence.identifier.startsWith('locx:')) {
    throw new Error('Geofence identifiers starting with "locx:" are reserved');
  }
  if (Math.abs(geofence.latitude) > 90 || Math.abs(geofence.longitude) > 180) {
    throw new Error(`Geofence ${geofence.identifier} has invalid coordinates`);
  }
  if (!(geofence.radius > 0)) {
    throw new Error(`Geofence ${geofence.identifier} radius must be positive`);
  }
  if (
    geofence.notifyOnEntry === false &&
    geofence.notifyOnExit === false &&
    !geofence.notifyOnDwell
  ) {
    throw new Error(`Geofence ${geofence.identifier} has no transitions enabled`);
  }
}

const LocX = {
  async configure(config: LocXConfig): Promise<LocXState> {
    assertConfig(config);
    return parse(await NativeLocX.configure(JSON.stringify(config)));
  },

  async requestPermission(always = true): Promise<PermissionStatus> {
    return (await NativeLocX.requestPermission(always)) as PermissionStatus;
  },

  async start(): Promise<LocXState> {
    return parse(await NativeLocX.start());
  },

  async stop(): Promise<LocXState> {
    return parse(await NativeLocX.stop());
  },

  async getState(): Promise<LocXState> {
    return parse(await NativeLocX.getState());
  },

  async getCurrentLocation(timeoutMs = 15_000): Promise<LocationPoint> {
    return parse(await NativeLocX.getCurrentLocation(timeoutMs));
  },

  async sync(): Promise<number> {
    return Number(await NativeLocX.sync());
  },

  async getQueuedLocations(limit = 100): Promise<LocationPoint[]> {
    return parse(await NativeLocX.getQueuedLocations(limit));
  },

  clearQueue(): Promise<void> {
    return NativeLocX.clearQueue();
  },

  /** Force moving (GPS on) or stationary (GPS off) without waiting for detection. */
  async changePace(isMoving: boolean): Promise<LocXState> {
    return parse(await NativeLocX.changePace(isMoving));
  },

  getOdometer(): Promise<number> {
    return NativeLocX.getOdometer();
  },

  setOdometer(meters: number): Promise<number> {
    if (!(meters >= 0)) {
      return Promise.reject(new Error('Odometer cannot be negative'));
    }
    return NativeLocX.setOdometer(meters);
  },

  resetOdometer(): Promise<number> {
    return NativeLocX.setOdometer(0);
  },

  addGeofence(geofence: Geofence): Promise<void> {
    return LocX.addGeofences([geofence]);
  },

  async addGeofences(geofences: Geofence[]): Promise<void> {
    geofences.forEach(assertGeofence);
    const ids = new Set(geofences.map(g => g.identifier));
    if (ids.size !== geofences.length) {
      throw new Error('Geofence identifiers must be unique');
    }
    await NativeLocX.addGeofences(JSON.stringify(geofences));
  },

  removeGeofence(identifier: string): Promise<void> {
    return NativeLocX.removeGeofences(JSON.stringify([identifier]));
  },

  /** Removes the given geofences, or every geofence when called without arguments. */
  removeGeofences(identifiers?: string[]): Promise<void> {
    return NativeLocX.removeGeofences(JSON.stringify(identifiers ?? []));
  },

  async getGeofences(): Promise<Geofence[]> {
    return parse(await NativeLocX.getGeofences());
  },

  on<E extends LocXEventName>(
    event: E,
    listener: (payload: LocXEventMap[E]) => void,
  ): Subscription {
    const subscription: EmitterSubscription = emitter.addListener(event, listener);
    return {remove: () => subscription.remove()};
  },

  /**
   * Receives events while the app UI is not running. Call it once from the
   * app's entry file (`index.js`), outside any component.
   *
   * Android runs it as a headless JS task (requires `enableHeadless: true`).
   * iOS relaunches the app in the background for location and region events,
   * so the same handler is attached to the regular event stream there.
   */
  registerHeadlessTask(handler: (event: HeadlessEvent) => Promise<void> | void): void {
    if (Platform.OS === 'android') {
      AppRegistry.registerHeadlessTask(
        HEADLESS_TASK_NAME,
        () => async (data: {name: LocXEventName; params: string}) => {
          await handler({name: data.name, params: parse(data.params)} as HeadlessEvent);
        },
      );
      return;
    }
    for (const name of EVENT_NAMES) {
      emitter.addListener(name, params => {
        void handler({name, params} as HeadlessEvent);
      });
    }
  },
};

export default LocX;
