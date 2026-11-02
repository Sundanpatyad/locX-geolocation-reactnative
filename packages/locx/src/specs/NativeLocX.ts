import type {TurboModule} from 'react-native';
import {TurboModuleRegistry} from 'react-native';

export interface Spec extends TurboModule {
  configure(configJson: string): Promise<string>;
  requestPermission(always: boolean): Promise<string>;
  start(): Promise<string>;
  stop(): Promise<string>;
  getState(): Promise<string>;
  getCurrentLocation(timeoutMs: number): Promise<string>;
  sync(): Promise<string>;
  getQueuedLocations(limit: number): Promise<string>;
  clearQueue(): Promise<void>;
  changePace(isMoving: boolean): Promise<string>;
  getOdometer(): Promise<number>;
  setOdometer(meters: number): Promise<number>;
  addGeofences(geofencesJson: string): Promise<void>;
  removeGeofences(identifiersJson: string): Promise<void>;
  getGeofences(): Promise<string>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('LocX');
