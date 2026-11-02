export type Accuracy = 'best' | 'high' | 'balanced' | 'low';
export type PermissionStatus =
  | 'notDetermined'
  | 'whenInUse'
  | 'always'
  | 'denied'
  | 'restricted';

export type ActivityType =
  | 'still'
  | 'walking'
  | 'running'
  | 'on_foot'
  | 'on_bicycle'
  | 'in_vehicle'
  | 'unknown';

export interface MotionConfig {
  /** Turn GPS off while the device is stationary. Default `true`. */
  enabled?: boolean;
  /** Movement inside this radius counts as stationary. Default `50`. */
  stationaryRadiusMeters?: number;
  /** Minutes without leaving the stationary radius before GPS turns off. Default `5`. */
  stopTimeoutMinutes?: number;
  /**
   * Use the OS activity classifier to wake up faster. Needs the Android
   * `ACTIVITY_RECOGNITION` permission and iOS `NSMotionUsageDescription`.
   * Default `false`.
   */
  activityRecognition?: boolean;
}

export interface LocXConfig {
  endpoint: string;
  headers?: Record<string, string>;
  method?: 'POST' | 'PUT';
  /** `path` posts the technician path body. Default keeps the locX `locations` envelope. */
  payload?: 'locations' | 'path';
  accuracy?: Accuracy;
  distanceFilterMeters?: number;
  intervalMs?: number;
  fastestIntervalMs?: number;
  batchSize?: number;
  autoSync?: boolean;
  wifiOnly?: boolean;
  stopOnTerminate?: boolean;
  startOnBoot?: boolean;
  maxQueueSize?: number;
  maxAgeDays?: number;
  retryBaseSeconds?: number;
  retryMaxSeconds?: number;
  motion?: MotionConfig;
  /** Android: deliver events to the headless task when no JS listener is running. */
  enableHeadless?: boolean;
  notification?: {
    title?: string;
    text?: string;
    channelName?: string;
  };
}

export interface LocationPoint {
  id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  speed: number | null;
  heading: number | null;
  recordedAt: string;
  receivedAt: string;
  mocked: boolean;
  provider: string;
  attempts: number;
  activity?: ActivityType | null;
  /** Total distance in metres at the time of this point. */
  odometer?: number;
  isMoving?: boolean;
}

export interface LocXState {
  configured: boolean;
  tracking: boolean;
  permission: PermissionStatus;
  queueSize: number;
  lastLocation: LocationPoint | null;
  lastError: string | null;
  isMoving?: boolean;
  odometer?: number;
  activity?: ActivityType | null;
  batteryOptimizationIgnored?: boolean;
  serviceRunning?: boolean;
  restrictions?: string[];
}

export interface Geofence {
  identifier: string;
  latitude: number;
  longitude: number;
  /** Metres. The OS is unreliable below about 100 m. */
  radius: number;
  notifyOnEntry?: boolean;
  notifyOnExit?: boolean;
  notifyOnDwell?: boolean;
  /** Time inside the region before a `DWELL` event. Default `300000`. */
  loiteringDelayMs?: number;
  extras?: Record<string, unknown>;
}

export type GeofenceAction = 'ENTER' | 'EXIT' | 'DWELL';

export interface GeofenceEvent {
  identifier: string;
  action: GeofenceAction;
  location: LocationPoint | null;
  extras: Record<string, unknown>;
  timestamp: string;
}

export interface MotionChangeEvent {
  isMoving: boolean;
  location: LocationPoint | null;
}

export interface ActivityChangeEvent {
  activity: ActivityType;
  /** 0-100. */
  confidence: number;
}

export interface UploadEvent {
  accepted: number;
  status: number;
  remaining: number;
}

export interface LocXError {
  code: string;
  message: string;
  recoverable: boolean;
}

export type LocXEventMap = {
  location: LocationPoint;
  upload: UploadEvent;
  state: LocXState;
  permission: {status: PermissionStatus};
  error: LocXError;
  motionchange: MotionChangeEvent;
  activitychange: ActivityChangeEvent;
  geofence: GeofenceEvent;
};

export type LocXEventName = keyof LocXEventMap;

export type HeadlessEvent = {
  [E in LocXEventName]: {name: E; params: LocXEventMap[E]};
}[LocXEventName];

export interface Subscription {
  remove(): void;
}
