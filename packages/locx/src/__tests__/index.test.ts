jest.mock('../specs/NativeLocX', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(async (value: string) =>
      JSON.stringify({
        configured: Boolean(JSON.parse(value).endpoint),
        tracking: false,
        permission: 'notDetermined',
        queueSize: 0,
        lastLocation: null,
        lastError: null,
      }),
    ),
    requestPermission: jest.fn(async () => 'always'),
    start: jest.fn(),
    stop: jest.fn(),
    getState: jest.fn(),
    getCurrentLocation: jest.fn(),
    sync: jest.fn(async () => '3'),
    getQueuedLocations: jest.fn(async () => '[]'),
    clearQueue: jest.fn(async () => undefined),
    changePace: jest.fn(async (moving: boolean) => JSON.stringify({isMoving: moving})),
    getOdometer: jest.fn(async () => 1234.5),
    setOdometer: jest.fn(async (meters: number) => meters),
    addGeofences: jest.fn(async () => undefined),
    removeGeofences: jest.fn(async () => undefined),
    getGeofences: jest.fn(async () => '[]'),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
}));

const mockAddListener = jest.fn((..._args: unknown[]) => ({remove: jest.fn()}));

jest.mock('react-native', () => ({
  NativeEventEmitter: class {
    addListener(...args: unknown[]) {
      return mockAddListener(...args);
    }
  },
  Platform: {OS: 'android'},
  AppRegistry: {registerHeadlessTask: jest.fn()},
}));

import {AppRegistry, Platform} from 'react-native';
import NativeLocX from '../specs/NativeLocX';
import LocX, {HEADLESS_TASK_NAME, type HeadlessEvent} from '../index';

const office = {
  identifier: 'office',
  latitude: 28.6139,
  longitude: 77.209,
  radius: 150,
};

describe('LocX JavaScript API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates endpoint URLs before crossing the bridge', async () => {
    await expect(LocX.configure({endpoint: 'not-a-url'})).rejects.toThrow(
      'http(s) URL',
    );
    expect(NativeLocX.configure).not.toHaveBeenCalled();
  });

  it('serializes configuration and parses state', async () => {
    const state = await LocX.configure({
      endpoint: 'https://example.test/locations',
      batchSize: 10,
    });
    expect(state.configured).toBe(true);
    expect(JSON.parse(String(jest.mocked(NativeLocX.configure).mock.calls[0][0]))).toMatchObject({
      batchSize: 10,
    });
  });

  it('normalizes native sync counts', async () => {
    await expect(LocX.sync()).resolves.toBe(3);
  });

  it('rejects a negative distance filter', async () => {
    await expect(
      LocX.configure({
        endpoint: 'https://example.test/locations',
        distanceFilterMeters: -1,
      }),
    ).rejects.toThrow('distanceFilterMeters');
  });

  it('exposes queue helpers', async () => {
    await expect(LocX.getQueuedLocations()).resolves.toEqual([]);
    await LocX.clearQueue();
    expect(NativeLocX.clearQueue).toHaveBeenCalled();
  });

  it('rejects motion settings that would never go stationary', async () => {
    await expect(
      LocX.configure({
        endpoint: 'https://example.test/locations',
        motion: {stopTimeoutMinutes: 0},
      }),
    ).rejects.toThrow('stopTimeoutMinutes');
    await expect(
      LocX.configure({
        endpoint: 'https://example.test/locations',
        motion: {stationaryRadiusMeters: 0},
      }),
    ).rejects.toThrow('stationaryRadiusMeters');
  });

  it('forwards changePace and parses the state', async () => {
    await expect(LocX.changePace(false)).resolves.toMatchObject({isMoving: false});
    expect(NativeLocX.changePace).toHaveBeenCalledWith(false);
  });

  it('reads, sets and resets the odometer', async () => {
    await expect(LocX.getOdometer()).resolves.toBe(1234.5);
    await expect(LocX.setOdometer(10)).resolves.toBe(10);
    await LocX.resetOdometer();
    expect(NativeLocX.setOdometer).toHaveBeenLastCalledWith(0);
    await expect(LocX.setOdometer(-1)).rejects.toThrow('negative');
  });

  it('serializes geofences and validates them first', async () => {
    await LocX.addGeofence({...office, notifyOnDwell: true, extras: {site: 7}});
    expect(JSON.parse(String(jest.mocked(NativeLocX.addGeofences).mock.calls[0][0]))).toEqual([
      {...office, notifyOnDwell: true, extras: {site: 7}},
    ]);

    await expect(LocX.addGeofence({...office, radius: 0})).rejects.toThrow('radius');
    await expect(LocX.addGeofence({...office, latitude: 91})).rejects.toThrow('coordinates');
    await expect(LocX.addGeofence({...office, identifier: 'locx:mine'})).rejects.toThrow('reserved');
    await expect(
      LocX.addGeofence({...office, notifyOnEntry: false, notifyOnExit: false}),
    ).rejects.toThrow('no transitions');
    await expect(LocX.addGeofences([office, office])).rejects.toThrow('unique');
    expect(NativeLocX.addGeofences).toHaveBeenCalledTimes(1);
  });

  it('removes one, several or all geofences', async () => {
    await LocX.removeGeofence('office');
    await LocX.removeGeofences(['a', 'b']);
    await LocX.removeGeofences();
    expect(jest.mocked(NativeLocX.removeGeofences).mock.calls.map(call => call[0])).toEqual([
      '["office"]',
      '["a","b"]',
      '[]',
    ]);
  });

  it('registers an Android headless task that parses native params', async () => {
    const handler = jest.fn<void, [HeadlessEvent]>();
    LocX.registerHeadlessTask(handler);
    const [name, provider] = jest.mocked(AppRegistry.registerHeadlessTask).mock.calls[0];
    expect(name).toBe(HEADLESS_TASK_NAME);
    const task = (provider as () => (data: unknown) => Promise<void>)();
    await task({name: 'geofence', params: '{"identifier":"office","action":"ENTER"}'});
    expect(handler).toHaveBeenCalledWith({
      name: 'geofence',
      params: {identifier: 'office', action: 'ENTER'},
    });
  });

  it('attaches the headless handler to every event on iOS', () => {
    (Platform as {OS: string}).OS = 'ios';
    try {
      LocX.registerHeadlessTask(jest.fn());
      const names = mockAddListener.mock.calls.map(call => (call as unknown[])[0]);
      expect(names).toEqual(
        expect.arrayContaining(['location', 'motionchange', 'geofence', 'activitychange']),
      );
      expect(AppRegistry.registerHeadlessTask).not.toHaveBeenCalled();
    } finally {
      (Platform as {OS: string}).OS = 'android';
    }
  });
});
