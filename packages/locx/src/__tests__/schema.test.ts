jest.mock('../specs/NativeLocX', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    requestPermission: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    getState: jest.fn(),
    getCurrentLocation: jest.fn(),
    sync: jest.fn(),
    getQueuedLocations: jest.fn(),
    clearQueue: jest.fn(),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  },
}));

jest.mock('react-native', () => ({
  NativeEventEmitter: class {
    addListener() {
      return {remove: jest.fn()};
    }
  },
}));

import LocX from '../index';

const POINT_KEYS = [
  'id',
  'latitude',
  'longitude',
  'accuracy',
  'altitude',
  'altitudeAccuracy',
  'speed',
  'heading',
  'recordedAt',
  'receivedAt',
  'mocked',
  'provider',
  'attempts',
  'odometer',
  'isMoving',
];

describe('LocX payload contract', () => {
  it('documents the stable location keys the native engines emit', () => {
    const sample = {
      id: '1f82d19d-3fb4-4327-b9ab-a4ccd437c092',
      latitude: 28.6139,
      longitude: 77.209,
      accuracy: 12.5,
      altitude: 214,
      altitudeAccuracy: 5,
      speed: 2.1,
      heading: 182,
      recordedAt: '2026-10-01T12:00:00.000Z',
      receivedAt: '2026-10-01T12:00:01.000Z',
      mocked: false,
      provider: 'fused',
      attempts: 0,
      activity: null,
      odometer: 0,
      isMoving: true,
    };
    for (const key of POINT_KEYS) {
      expect(sample).toHaveProperty(key);
    }
  });

  it('rejects empty batches at the JS boundary', async () => {
    await expect(
      LocX.configure({
        endpoint: 'https://example.test/locations',
        batchSize: 0,
      }),
    ).rejects.toThrow('batchSize');
  });
});
