import Foundation
import CoreLocation
import CoreMotion
import Network
import SQLite3
import UIKit
import React

private let sqliteTransient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

private struct LocXNotificationConfig: Codable {
  let title: String?
  let text: String?
  let channelName: String?
}

private struct LocXMotionConfig: Codable {
  let enabled: Bool?
  let stationaryRadiusMeters: Double?
  let stopTimeoutMinutes: Double?
  let activityRecognition: Bool?
}

private struct LocXConfig: Codable {
  let endpoint: String
  let headers: [String: String]?
  let method: String?
  let payload: String?
  let accuracy: String?
  let distanceFilterMeters: Double?
  let intervalMs: Double?
  let fastestIntervalMs: Double?
  let batchSize: Int?
  let autoSync: Bool?
  let wifiOnly: Bool?
  let stopOnTerminate: Bool?
  let startOnBoot: Bool?
  let maxQueueSize: Int?
  let maxAgeDays: Int?
  let retryBaseSeconds: Double?
  let retryMaxSeconds: Double?
  let motion: LocXMotionConfig?
  let enableHeadless: Bool?
  let notification: LocXNotificationConfig?

  var uploadMethod: String { method?.uppercased() == "PUT" ? "PUT" : "POST" }
  var usesPathPayload: Bool { payload == "path" }
  var motionEnabled: Bool { motion?.enabled ?? true }
  var stationaryRadius: CLLocationDistance { max(10, motion?.stationaryRadiusMeters ?? 50) }
  var stopTimeout: TimeInterval { max(1, motion?.stopTimeoutMinutes ?? 5) * 60 }
  var usesActivityRecognition: Bool { motion?.activityRecognition ?? false }
  var desiredAccuracy: CLLocationAccuracy {
    switch accuracy {
    case "best": return kCLLocationAccuracyBest
    case "high": return kCLLocationAccuracyNearestTenMeters
    case "low": return kCLLocationAccuracyKilometer
    default: return kCLLocationAccuracyHundredMeters
    }
  }
  var distanceFilter: CLLocationDistance { max(0, distanceFilterMeters ?? 25) }
  var uploadBatchSize: Int { max(1, batchSize ?? 20) }
  var shouldAutoSync: Bool { autoSync ?? true }
  var queueLimit: Int { max(1, maxQueueSize ?? 10_000) }
  var queueAgeDays: Int { max(1, maxAgeDays ?? 30) }
  var retryBase: Double { max(1, retryBaseSeconds ?? 5) }
  var retryMaximum: Double { max(retryBase, retryMaxSeconds ?? 3_600) }
}

private struct LocationPoint: Codable {
  let id: String
  let latitude: Double
  let longitude: Double
  let accuracy: Double
  let altitude: Double?
  let altitudeAccuracy: Double?
  let speed: Double?
  let heading: Double?
  let recordedAt: String
  let receivedAt: String
  let mocked: Bool
  let provider: String
  let attempts: Int
  let activity: String?
  let odometer: Double
  let isMoving: Bool

  func dictionary() -> [String: Any] {
    var value: [String: Any] = [
      "id": id,
      "latitude": latitude,
      "longitude": longitude,
      "accuracy": accuracy,
      "recordedAt": recordedAt,
      "receivedAt": receivedAt,
      "mocked": mocked,
      "provider": provider,
      "attempts": attempts,
      "odometer": odometer,
      "isMoving": isMoving,
    ]
    value["altitude"] = altitude ?? NSNull()
    value["altitudeAccuracy"] = altitudeAccuracy ?? NSNull()
    value["speed"] = speed ?? NSNull()
    value["heading"] = heading ?? NSNull()
    value["activity"] = activity ?? NSNull()
    return value
  }

  /** Technician path API row: `{ location: { coords, timestamp, accuracy, speed, heading } }`. */
  func pathDictionary() -> [String: Any] {
    let pathSpeed = speed.flatMap { $0 >= 0 ? $0 : nil } ?? 0
    let pathHeading = heading.flatMap { (0...360).contains($0) ? $0 : nil } ?? -1
    return ["location": [
      "coords": ["latitude": latitude, "longitude": longitude],
      "timestamp": recordedAt,
      "accuracy": accuracy,
      "speed": pathSpeed,
      "heading": pathHeading,
    ]]
  }
}

private final class LocationQueue {
  private let queue = DispatchQueue(label: "dev.locx.sqlite")
  private var database: OpaquePointer?

  init() {
    queue.sync {
      do {
        let manager = FileManager.default
        let base = try manager.url(
          for: .applicationSupportDirectory,
          in: .userDomainMask,
          appropriateFor: nil,
          create: true
        )
        let directory = base.appendingPathComponent("LocX", isDirectory: true)
        try manager.createDirectory(at: directory, withIntermediateDirectories: true)
        let path = directory.appendingPathComponent("locations.sqlite3").path
        guard sqlite3_open_v2(
          path,
          &database,
          SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX,
          nil
        ) == SQLITE_OK else {
          database = nil
          return
        }
        sqlite3_busy_timeout(database, 5_000)
        execute("PRAGMA journal_mode=WAL")
        execute("PRAGMA synchronous=NORMAL")
        execute("""
          CREATE TABLE IF NOT EXISTS locations (
            id TEXT PRIMARY KEY,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            accuracy REAL NOT NULL,
            altitude REAL,
            altitude_accuracy REAL,
            speed REAL,
            heading REAL,
            recorded_at TEXT NOT NULL,
            received_at TEXT NOT NULL,
            mocked INTEGER NOT NULL DEFAULT 0,
            provider TEXT NOT NULL,
            attempts INTEGER NOT NULL DEFAULT 0,
            next_attempt_at REAL NOT NULL DEFAULT 0,
            created_at REAL NOT NULL
          )
          """)
        execute("CREATE INDEX IF NOT EXISTS idx_locations_delivery ON locations(next_attempt_at, created_at)")
        addColumnIfMissing("odometer", definition: "REAL NOT NULL DEFAULT 0")
        addColumnIfMissing("is_moving", definition: "INTEGER NOT NULL DEFAULT 1")
        addColumnIfMissing("activity", definition: "TEXT")
      } catch {
        database = nil
      }
    }
  }

  deinit {
    if let database {
      sqlite3_close(database)
    }
  }

  var isAvailable: Bool {
    queue.sync { database != nil }
  }

  private func execute(_ sql: String) {
    sqlite3_exec(database, sql, nil, nil, nil)
  }

  private func addColumnIfMissing(_ name: String, definition: String) {
    var statement: OpaquePointer?
    guard sqlite3_prepare_v2(database, "PRAGMA table_info(locations)", -1, &statement, nil) == SQLITE_OK else {
      return
    }
    var exists = false
    while sqlite3_step(statement) == SQLITE_ROW {
      if text(statement, 1) == name { exists = true }
    }
    sqlite3_finalize(statement)
    if !exists {
      execute("ALTER TABLE locations ADD COLUMN \(name) \(definition)")
    }
  }

  func enqueue(_ point: LocationPoint, maxSize: Int, maxAgeDays: Int) -> Bool {
    queue.sync {
      guard let database else { return false }
      let sql = """
        INSERT OR REPLACE INTO locations
        (id, latitude, longitude, accuracy, altitude, altitude_accuracy, speed, heading,
         recorded_at, received_at, mocked, provider, attempts, next_attempt_at, created_at,
         odometer, is_moving, activity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
        """
      var statement: OpaquePointer?
      guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK else {
        return false
      }
      defer { sqlite3_finalize(statement) }
      bind(point.id, at: 1, to: statement)
      sqlite3_bind_double(statement, 2, point.latitude)
      sqlite3_bind_double(statement, 3, point.longitude)
      sqlite3_bind_double(statement, 4, point.accuracy)
      bind(point.altitude, at: 5, to: statement)
      bind(point.altitudeAccuracy, at: 6, to: statement)
      bind(point.speed, at: 7, to: statement)
      bind(point.heading, at: 8, to: statement)
      bind(point.recordedAt, at: 9, to: statement)
      bind(point.receivedAt, at: 10, to: statement)
      sqlite3_bind_int(statement, 11, point.mocked ? 1 : 0)
      bind(point.provider, at: 12, to: statement)
      sqlite3_bind_int(statement, 13, Int32(point.attempts))
      sqlite3_bind_double(statement, 14, Date().timeIntervalSince1970)
      sqlite3_bind_double(statement, 15, point.odometer)
      sqlite3_bind_int(statement, 16, point.isMoving ? 1 : 0)
      if let activity = point.activity {
        bind(activity, at: 17, to: statement)
      } else {
        sqlite3_bind_null(statement, 17)
      }
      guard sqlite3_step(statement) == SQLITE_DONE else { return false }

      let oldestAllowed = Date().addingTimeInterval(-Double(maxAgeDays) * 86_400).timeIntervalSince1970
      execute("DELETE FROM locations WHERE created_at < \(oldestAllowed)")
      execute("""
        DELETE FROM locations WHERE id IN (
          SELECT id FROM locations ORDER BY created_at ASC
          LIMIT MAX(0, (SELECT COUNT(*) FROM locations) - \(maxSize))
        )
        """)
      return true
    }
  }

  func fetch(limit: Int, readyOnly: Bool = true) -> [LocationPoint] {
    queue.sync {
      guard let database else { return [] }
      let readyClause = readyOnly ? "WHERE next_attempt_at <= ?" : ""
      let sql = """
        SELECT id, latitude, longitude, accuracy, altitude, altitude_accuracy, speed,
               heading, recorded_at, received_at, mocked, provider, attempts,
               odometer, is_moving, activity
        FROM locations \(readyClause) ORDER BY created_at ASC LIMIT ?
        """
      var statement: OpaquePointer?
      guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK else {
        return []
      }
      defer { sqlite3_finalize(statement) }
      var index: Int32 = 1
      if readyOnly {
        sqlite3_bind_double(statement, index, Date().timeIntervalSince1970)
        index += 1
      }
      sqlite3_bind_int(statement, index, Int32(max(0, limit)))

      var result: [LocationPoint] = []
      while sqlite3_step(statement) == SQLITE_ROW {
        result.append(LocationPoint(
          id: text(statement, 0),
          latitude: sqlite3_column_double(statement, 1),
          longitude: sqlite3_column_double(statement, 2),
          accuracy: sqlite3_column_double(statement, 3),
          altitude: optionalDouble(statement, 4),
          altitudeAccuracy: optionalDouble(statement, 5),
          speed: optionalDouble(statement, 6),
          heading: optionalDouble(statement, 7),
          recordedAt: text(statement, 8),
          receivedAt: text(statement, 9),
          mocked: sqlite3_column_int(statement, 10) != 0,
          provider: text(statement, 11),
          attempts: Int(sqlite3_column_int(statement, 12)),
          activity: sqlite3_column_type(statement, 15) == SQLITE_NULL ? nil : text(statement, 15),
          odometer: sqlite3_column_double(statement, 13),
          isMoving: sqlite3_column_int(statement, 14) != 0
        ))
      }
      return result
    }
  }

  func remove(ids: [String]) {
    guard !ids.isEmpty else { return }
    queue.sync {
      guard let database else { return }
      var statement: OpaquePointer?
      guard sqlite3_prepare_v2(database, "DELETE FROM locations WHERE id = ?", -1, &statement, nil) == SQLITE_OK else {
        return
      }
      defer { sqlite3_finalize(statement) }
      for id in ids {
        sqlite3_reset(statement)
        sqlite3_clear_bindings(statement)
        bind(id, at: 1, to: statement)
        sqlite3_step(statement)
      }
    }
  }

  func markFailed(_ points: [LocationPoint], base: Double, maximum: Double) {
    guard !points.isEmpty else { return }
    queue.sync {
      guard let database else { return }
      var statement: OpaquePointer?
      let sql = "UPDATE locations SET attempts = attempts + 1, next_attempt_at = ? WHERE id = ?"
      guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK else {
        return
      }
      defer { sqlite3_finalize(statement) }
      for point in points {
        let exponent = min(point.attempts, 30)
        let delay = min(maximum, base * pow(2, Double(exponent)))
        sqlite3_reset(statement)
        sqlite3_clear_bindings(statement)
        sqlite3_bind_double(statement, 1, Date().addingTimeInterval(delay).timeIntervalSince1970)
        bind(point.id, at: 2, to: statement)
        sqlite3_step(statement)
      }
    }
  }

  func count() -> Int {
    queue.sync {
      guard let database else { return 0 }
      var statement: OpaquePointer?
      guard sqlite3_prepare_v2(database, "SELECT COUNT(*) FROM locations", -1, &statement, nil) == SQLITE_OK else {
        return 0
      }
      defer { sqlite3_finalize(statement) }
      return sqlite3_step(statement) == SQLITE_ROW ? Int(sqlite3_column_int64(statement, 0)) : 0
    }
  }

  func clear() {
    queue.sync { execute("DELETE FROM locations") }
  }

  private func bind(_ value: String, at index: Int32, to statement: OpaquePointer?) {
    sqlite3_bind_text(statement, index, value, -1, sqliteTransient)
  }

  private func bind(_ value: Double?, at index: Int32, to statement: OpaquePointer?) {
    if let value {
      sqlite3_bind_double(statement, index, value)
    } else {
      sqlite3_bind_null(statement, index)
    }
  }

  private func text(_ statement: OpaquePointer?, _ index: Int32) -> String {
    guard let value = sqlite3_column_text(statement, index) else { return "" }
    return String(cString: value)
  }

  private func optionalDouble(_ statement: OpaquePointer?, _ index: Int32) -> Double? {
    sqlite3_column_type(statement, index) == SQLITE_NULL ? nil : sqlite3_column_double(statement, index)
  }
}

@objc(LocX)
final class LocX: RCTEventEmitter, CLLocationManagerDelegate {
  private static let configDefaultsKey = "dev.locx.config"
  private static let trackingDefaultsKey = "dev.locx.tracking"
  private static let movingDefaultsKey = "dev.locx.isMoving"
  private static let odometerDefaultsKey = "dev.locx.odometer"
  private static let odometerAnchorDefaultsKey = "dev.locx.odometerAnchor"
  private static let geofencesDefaultsKey = "dev.locx.geofences"
  /** iOS monitors at most 20 regions per app; one is kept for the relaunch/stationary region. */
  private static let maxUserGeofences = 19
  private static let odometerMaxAccuracy: CLLocationAccuracy = 100
  private static let minStationaryFence: CLLocationDistance = 100
  private static let relaunchFence: CLLocationDistance = 150
  private static let maxBufferedEvents = 200
  private static let motionCheckInterval: TimeInterval = 30
  private static let defaultLoiteringMs: Double = 300_000

  private let manager = CLLocationManager()
  private let locationQueue = LocationQueue()
  private let defaults = UserDefaults.standard
  private var config: LocXConfig?
  private var tracking = false
  private var hasEventListeners = false
  private var bufferedEvents: [(name: String, body: Any)] = []
  private var uploadInFlight = false
  private var lastLocation: LocationPoint?
  private var lastError: String?
  private var currentResolve: RCTPromiseResolveBlock?
  private var currentReject: RCTPromiseRejectBlock?
  private var currentTimeout: DispatchWorkItem?
  private var permissionResolve: RCTPromiseResolveBlock?
  private var retryWork: DispatchWorkItem?
  private var backgroundTask = UIBackgroundTaskIdentifier.invalid
  private let pathMonitor = NWPathMonitor()
  private var pathUsesWifi = true
  private let relaunchRegionId = "dev.locx.relaunch"

  private var anchor: CLLocation?
  private var lastFix: CLLocation?
  private var lastMovementAt = Date()
  private var motionTimer: Timer?
  private lazy var activityManager = CMMotionActivityManager()
  private var activityRunning = false
  private var currentActivity: String?
  private var dwellWork: [String: DispatchWorkItem] = [:]
  private var pendingInitialState = Set<String>()

  private var isMoving: Bool {
    get { defaults.object(forKey: Self.movingDefaultsKey) as? Bool ?? true }
    set { defaults.set(newValue, forKey: Self.movingDefaultsKey) }
  }

  private var odometer: Double {
    get { defaults.double(forKey: Self.odometerDefaultsKey) }
    set { defaults.set(max(0, newValue), forKey: Self.odometerDefaultsKey) }
  }

  override init() {
    super.init()
    manager.delegate = self
    manager.activityType = .otherNavigation
    manager.pausesLocationUpdatesAutomatically = false
    pathMonitor.pathUpdateHandler = { [weak self] path in
      self?.pathUsesWifi = path.usesInterfaceType(.wifi)
      if path.status == .satisfied {
        DispatchQueue.main.async { self?.performSync { _, _ in } }
      }
    }
    pathMonitor.start(queue: DispatchQueue.global(qos: .utility))
    restoreConfiguration()
    if UserDefaults.standard.bool(forKey: Self.trackingDefaultsKey),
       config?.startOnBoot == true || config?.stopOnTerminate == false {
      DispatchQueue.main.async { [weak self] in self?.beginTracking() }
    }
  }

  @objc override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    ["location", "upload", "state", "permission", "error", "motionchange", "activitychange", "geofence"]
  }

  override func startObserving() {
    hasEventListeners = true
    // JS attaches one native listener per event name in separate bridge calls, so
    // flushing immediately would hand buffered events to names not subscribed yet.
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
      guard let self, self.hasEventListeners else { return }
      let pending = self.bufferedEvents
      self.bufferedEvents.removeAll()
      pending.forEach { self.sendEvent(withName: $0.name, body: $0.body) }
    }
  }

  override func stopObserving() {
    hasEventListeners = false
  }

  @objc(configure:resolve:reject:)
  func configure(
    _ configJSON: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    onMain {
      do {
        guard let data = configJSON.data(using: .utf8) else {
          throw LocXNativeError.invalidConfig("Configuration is not valid UTF-8")
        }
        let value = try JSONDecoder().decode(LocXConfig.self, from: data)
        guard let url = URL(string: value.endpoint),
              let scheme = url.scheme?.lowercased(),
              ["http", "https"].contains(scheme) else {
          throw LocXNativeError.invalidConfig("endpoint must be an HTTP(S) URL")
        }
        self.config = value
        UserDefaults.standard.set(data, forKey: Self.configDefaultsKey)
        self.applyConfiguration()
        resolve(self.stateJSON())
        self.emitState()
      } catch {
        self.reject(reject, code: "invalid_config", error: error)
      }
    }
  }

  @objc(requestPermission:resolve:reject:)
  func requestPermission(
    _ always: Bool,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    onMain {
      guard CLLocationManager.locationServicesEnabled() else {
        self.reject(reject, code: "location_services_disabled", message: "Location Services are disabled")
        return
      }
      let status = self.manager.authorizationStatus
      if status == .denied || status == .restricted || status == .authorizedAlways ||
          (!always && status == .authorizedWhenInUse) {
        resolve(self.permissionStatus())
        return
      }
      if let previous = self.permissionResolve {
        previous(self.permissionStatus())
      }
      self.permissionResolve = resolve
      if always {
        self.manager.requestAlwaysAuthorization()
      } else {
        self.manager.requestWhenInUseAuthorization()
      }
    }
  }

  @objc(start:reject:)
  func start(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    onMain {
      guard self.config != nil else {
        self.reject(reject, code: "not_configured", message: "Call configure before start")
        return
      }
      guard CLLocationManager.locationServicesEnabled() else {
        self.reject(reject, code: "location_services_disabled", message: "Location Services are disabled")
        return
      }
      let authorization = self.manager.authorizationStatus
      guard authorization != .notDetermined else {
        self.reject(reject, code: "permission_not_determined", message: "Request location permission before start")
        return
      }
      guard authorization != .denied && authorization != .restricted else {
        self.reject(reject, code: "permission_denied", message: "Location permission is not available")
        return
      }
      self.beginTracking()
      resolve(self.stateJSON())
    }
  }

  @objc(stop:reject:)
  func stop(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    onMain {
      self.endTracking()
      resolve(self.stateJSON())
      self.emitState()
    }
  }

  @objc(getState:reject:)
  func getState(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    onMain { resolve(self.stateJSON()) }
  }

  @objc(getCurrentLocation:resolve:reject:)
  func getCurrentLocation(
    _ timeoutMs: Double,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    onMain {
      guard CLLocationManager.locationServicesEnabled() else {
        self.reject(reject, code: "location_services_disabled", message: "Location Services are disabled")
        return
      }
      guard self.manager.authorizationStatus != .denied && self.manager.authorizationStatus != .restricted else {
        self.reject(reject, code: "permission_denied", message: "Location permission is not available")
        return
      }
      guard self.manager.authorizationStatus != .notDetermined else {
        self.reject(reject, code: "permission_not_determined", message: "Request location permission first")
        return
      }
      if let oldReject = self.currentReject {
        oldReject("location_cancelled", "Superseded by another current-location request", nil)
      }
      self.currentTimeout?.cancel()
      self.currentResolve = resolve
      self.currentReject = reject
      let timeout = DispatchWorkItem { [weak self] in
        guard let self, let pendingReject = self.currentReject else { return }
        self.clearCurrentRequest()
        pendingReject("location_timeout", "Timed out waiting for a location", nil)
      }
      self.currentTimeout = timeout
      DispatchQueue.main.asyncAfter(deadline: .now() + max(0.1, timeoutMs / 1_000), execute: timeout)
      self.manager.requestLocation()
    }
  }

  @objc(sync:reject:)
  func sync(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    onMain {
      self.performSync { accepted, error in
        if let error {
          reject("upload_failed", error.localizedDescription, error)
        } else {
          resolve(String(accepted))
        }
      }
    }
  }

  @objc(getQueuedLocations:resolve:reject:)
  func getQueuedLocations(
    _ limit: Double,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      let points = self.locationQueue.fetch(limit: min(max(Int(limit), 0), 10_000), readyOnly: false)
      let json = self.encodeJSON(points.map { $0.dictionary() }) ?? "[]"
      DispatchQueue.main.async { resolve(json) }
    }
  }

  @objc(clearQueue:reject:)
  func clearQueue(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      self.locationQueue.clear()
      DispatchQueue.main.async {
        resolve(nil)
        self.emitState()
      }
    }
  }

  @objc(changePace:resolve:reject:)
  func changePace(
    _ moving: Bool,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    onMain {
      guard self.tracking else {
        self.reject(reject, code: "not_tracking", message: "Call start before changePace")
        return
      }
      let reference = self.lastFix ?? self.manager.location
      if moving {
        if !self.isMoving { self.startMoving(trigger: reference, announce: true) }
      } else {
        self.enterStationary(at: reference)
      }
      resolve(self.stateJSON())
      self.emitState()
    }
  }

  @objc(getOdometer:reject:)
  func getOdometer(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    onMain { resolve(NSNumber(value: self.odometer)) }
  }

  @objc(setOdometer:resolve:reject:)
  func setOdometer(
    _ meters: Double,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    onMain {
      self.odometer = meters
      self.defaults.removeObject(forKey: Self.odometerAnchorDefaultsKey)
      resolve(NSNumber(value: self.odometer))
    }
  }

  @objc(addGeofences:resolve:reject:)
  func addGeofences(
    _ geofencesJSON: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    onMain {
      do {
        guard CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else {
          throw LocXNativeError.geofence("Region monitoring is not available on this device")
        }
        let status = self.manager.authorizationStatus
        guard status == .authorizedAlways || status == .authorizedWhenInUse else {
          throw LocXNativeError.geofence("Location permission is required for geofences")
        }
        guard let data = geofencesJSON.data(using: .utf8),
              let raw = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
          throw LocXNativeError.geofence("Geofences must be a JSON array")
        }
        let incoming = try raw.map { try self.normalizeGeofence($0) }
        var stored = self.storedGeofences()
        for geofence in incoming {
          let id = geofence["identifier"] as? String
          if let index = stored.firstIndex(where: { $0["identifier"] as? String == id }) {
            stored[index] = geofence
          } else {
            stored.append(geofence)
          }
        }
        guard stored.count <= Self.maxUserGeofences else {
          throw LocXNativeError.geofence(
            "iOS supports at most \(Self.maxUserGeofences) geofences (requested \(stored.count))"
          )
        }
        incoming.forEach(self.monitor)
        self.saveGeofences(stored)
        if status == .authorizedWhenInUse {
          self.emitError(
            code: "geofence_needs_always",
            message: "Geofences fire in the background only with Always location permission",
            recoverable: true
          )
        }
        resolve(nil)
      } catch {
        self.reject(reject, code: "geofence_failed", error: error)
      }
    }
  }

  @objc(removeGeofences:resolve:reject:)
  func removeGeofences(
    _ identifiersJSON: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    onMain {
      let requested = identifiersJSON.data(using: .utf8)
        .flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String] } ?? []
      let stored = self.storedGeofences()
      let targets = Set(requested.isEmpty
        ? stored.compactMap { $0["identifier"] as? String }
        : requested)
      self.manager.monitoredRegions
        .filter { targets.contains($0.identifier) && $0.identifier != self.relaunchRegionId }
        .forEach { self.manager.stopMonitoring(for: $0) }
      targets.forEach { self.dwellWork.removeValue(forKey: $0)?.cancel() }
      self.saveGeofences(stored.filter { !targets.contains($0["identifier"] as? String ?? "") })
      resolve(nil)
    }
  }

  @objc(getGeofences:reject:)
  func getGeofences(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    onMain { resolve(self.encodeJSON(self.storedGeofences()) ?? "[]") }
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let location = locations.last else { return }

    if let resolve = currentResolve {
      let point = makePoint(location, odometer: odometer, isMoving: isMoving)
      lastLocation = point
      clearCurrentRequest()
      resolve(encodeJSON(point.dictionary()) ?? "{}")
    }

    guard tracking, let config, location.horizontalAccuracy >= 0 else {
      emitState()
      return
    }
    lastFix = location

    if !isMoving {
      guard let reference = anchor else {
        anchor = location
        refreshRelaunchRegion(around: location, radius: stationaryFence(config))
        return
      }
      guard location.distance(from: reference) > movementThreshold(location, config) else { return }
      startMoving(trigger: location, announce: true)
    } else if anchor.map({ location.distance(from: $0) > movementThreshold(location, config) }) ?? true {
      anchor = location
      lastMovementAt = Date()
    }

    let point = makePoint(location, odometer: advanceOdometer(location), isMoving: true)
    lastLocation = point
    guard locationQueue.enqueue(point, maxSize: config.queueLimit, maxAgeDays: config.queueAgeDays) else {
      emitError(code: "queue_unavailable", message: "Could not persist location", recoverable: true)
      return
    }
    sendEventIfObserved(name: "location", body: point.dictionary())
    emitState()
    refreshRelaunchRegion(around: location)
    if config.shouldAutoSync {
      performSync { _, _ in }
    }
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    if let reject = currentReject {
      clearCurrentRequest()
      reject("location_failed", error.localizedDescription, error)
    }
    let clError = error as? CLError
    let recoverable = clError?.code == .locationUnknown || clError?.code == .network
    emitError(code: "location_failed", message: error.localizedDescription, recoverable: recoverable)
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    let status = permissionStatus()
    if manager.authorizationStatus != .notDetermined, let resolve = permissionResolve {
      permissionResolve = nil
      resolve(status)
    }
    sendEventIfObserved(name: "permission", body: ["status": status])
    if #available(iOS 14.0, *), manager.accuracyAuthorization == .reducedAccuracy {
      emitError(
        code: "reduced_accuracy",
        message: "Precise Location is disabled; locations may be approximate",
        recoverable: true
      )
    }
    emitState()
    if tracking && (manager.authorizationStatus == .denied || manager.authorizationStatus == .restricted) {
      endTracking()
      emitError(code: "permission_denied", message: "Location permission was revoked", recoverable: false)
      emitState()
    }
  }

  func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
    guard let geofence = storedGeofence(region.identifier) else { return }
    handleEnter(geofence)
  }

  func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
    if region.identifier == relaunchRegionId {
      guard tracking else { return }
      if isMoving {
        manager.startUpdatingLocation()
        if let location = manager.location {
          refreshRelaunchRegion(around: location)
        }
      } else {
        startMoving(trigger: manager.location, announce: true)
      }
      return
    }
    guard let geofence = storedGeofence(region.identifier) else { return }
    dwellWork.removeValue(forKey: region.identifier)?.cancel()
    if geofence["notifyOnExit"] as? Bool ?? true {
      emitGeofence(geofence, action: "EXIT")
    }
  }

  func locationManager(_ manager: CLLocationManager, didDetermineState state: CLRegionState, for region: CLRegion) {
    guard pendingInitialState.remove(region.identifier) != nil,
          state == .inside,
          let geofence = storedGeofence(region.identifier) else { return }
    handleEnter(geofence)
  }

  func locationManager(_ manager: CLLocationManager, monitoringDidFailFor region: CLRegion?, withError error: Error) {
    emitError(
      code: "geofence_failed",
      message: "\(region?.identifier ?? "region"): \(error.localizedDescription)",
      recoverable: true
    )
  }

  private func restoreConfiguration() {
    guard let data = UserDefaults.standard.data(forKey: Self.configDefaultsKey) else { return }
    config = try? JSONDecoder().decode(LocXConfig.self, from: data)
    applyConfiguration()
  }

  private func applyConfiguration() {
    guard let config else { return }
    manager.desiredAccuracy = config.desiredAccuracy
    manager.distanceFilter = config.distanceFilter
    guard tracking else { return }
    if config.usesActivityRecognition { startActivityUpdatesIfNeeded() } else { stopActivityUpdates() }
    if isMoving {
      manager.stopUpdatingLocation()
      manager.startUpdatingLocation()
      startMotionTimer()
    } else if !config.motionEnabled {
      startMoving(trigger: manager.location, announce: true)
    }
  }

  private func beginTracking() {
    applyConfiguration()
    if (Bundle.main.object(forInfoDictionaryKey: "UIBackgroundModes") as? [String])?.contains("location") == true {
      manager.allowsBackgroundLocationUpdates = true
      manager.showsBackgroundLocationIndicator = true
    }
    if CLLocationManager.significantLocationChangeMonitoringAvailable() {
      manager.startMonitoringSignificantLocationChanges()
    }
    tracking = true
    UserDefaults.standard.set(true, forKey: Self.trackingDefaultsKey)
    if config?.motionEnabled ?? true, !isMoving {
      enterStationary(at: manager.location, announce: false)
    } else {
      startMoving(trigger: nil, announce: false)
    }
    startActivityUpdatesIfNeeded()
    emitState()
  }

  private func endTracking() {
    stopMotionTimer()
    stopActivityUpdates()
    manager.stopUpdatingLocation()
    manager.stopMonitoringSignificantLocationChanges()
    stopRelaunchRegion()
    retryWork?.cancel()
    tracking = false
    isMoving = true
    anchor = nil
    UserDefaults.standard.set(false, forKey: Self.trackingDefaultsKey)
  }

  private func startMoving(trigger: CLLocation?, announce: Bool) {
    isMoving = true
    anchor = trigger
    lastMovementAt = Date()
    manager.startUpdatingLocation()
    if let location = trigger ?? manager.location {
      refreshRelaunchRegion(around: location)
    }
    startMotionTimer()
    if announce { emitMotion(true, location: trigger) }
  }

  private func enterStationary(at location: CLLocation?, announce: Bool = true) {
    stopMotionTimer()
    manager.stopUpdatingLocation()
    isMoving = false
    anchor = location
    if let location, let config {
      refreshRelaunchRegion(around: location, radius: stationaryFence(config))
    }
    if announce { emitMotion(false, location: location) }
  }

  private func startMotionTimer() {
    stopMotionTimer()
    guard config?.motionEnabled ?? true else { return }
    motionTimer = Timer.scheduledTimer(withTimeInterval: Self.motionCheckInterval, repeats: true) { [weak self] _ in
      self?.checkStationary()
    }
  }

  private func stopMotionTimer() {
    motionTimer?.invalidate()
    motionTimer = nil
  }

  private func checkStationary() {
    guard tracking, isMoving, let config, config.motionEnabled else { return }
    if Date().timeIntervalSince(lastMovementAt) >= config.stopTimeout {
      enterStationary(at: lastFix ?? anchor)
    }
  }

  private func movementThreshold(_ location: CLLocation, _ config: LocXConfig) -> CLLocationDistance {
    max(config.stationaryRadius, max(0, location.horizontalAccuracy))
  }

  private func stationaryFence(_ config: LocXConfig) -> CLLocationDistance {
    max(config.stationaryRadius, Self.minStationaryFence)
  }

  private func emitMotion(_ moving: Bool, location: CLLocation?) {
    let body: [String: Any] = [
      "isMoving": moving,
      "location": location.map { makePoint($0, odometer: odometer, isMoving: moving).dictionary() } ?? NSNull(),
    ]
    sendEventIfObserved(name: "motionchange", body: body)
    emitState()
  }

  private func advanceOdometer(_ location: CLLocation) -> Double {
    guard location.horizontalAccuracy >= 0, location.horizontalAccuracy <= Self.odometerMaxAccuracy else {
      return odometer
    }
    var total = odometer
    if let previous = defaults.array(forKey: Self.odometerAnchorDefaultsKey) as? [Double], previous.count == 2 {
      total += location.distance(from: CLLocation(latitude: previous[0], longitude: previous[1]))
    }
    odometer = total
    defaults.set([location.coordinate.latitude, location.coordinate.longitude], forKey: Self.odometerAnchorDefaultsKey)
    return total
  }

  private func startActivityUpdatesIfNeeded() {
    guard let config, config.usesActivityRecognition, !activityRunning,
          Bundle.main.object(forInfoDictionaryKey: "NSMotionUsageDescription") != nil,
          CMMotionActivityManager.isActivityAvailable() else { return }
    activityRunning = true
    activityManager.startActivityUpdates(to: .main) { [weak self] activity in
      guard let self, let activity else { return }
      self.handleActivity(activity)
    }
  }

  private func stopActivityUpdates() {
    guard activityRunning else { return }
    activityManager.stopActivityUpdates()
    activityRunning = false
  }

  private func handleActivity(_ activity: CMMotionActivity) {
    let name: String
    if activity.automotive {
      name = "in_vehicle"
    } else if activity.cycling {
      name = "on_bicycle"
    } else if activity.running {
      name = "running"
    } else if activity.walking {
      name = "walking"
    } else if activity.stationary {
      name = "still"
    } else {
      name = "unknown"
    }
    guard name != currentActivity else { return }
    currentActivity = name
    let confidence: Int
    switch activity.confidence {
    case .high: confidence = 100
    case .medium: confidence = 66
    default: confidence = 33
    }
    sendEventIfObserved(name: "activitychange", body: ["activity": name, "confidence": confidence])
    if tracking, !isMoving, name != "still", name != "unknown", activity.confidence != .low {
      startMoving(trigger: manager.location, announce: true)
    }
  }

  private func normalizeGeofence(_ raw: [String: Any]) throws -> [String: Any] {
    let identifier = (raw["identifier"] as? String ?? "").trimmingCharacters(in: .whitespaces)
    guard !identifier.isEmpty else { throw LocXNativeError.geofence("Geofence identifier is required") }
    guard !identifier.hasPrefix("locx:"), identifier != relaunchRegionId else {
      throw LocXNativeError.geofence("Geofence identifier \(identifier) is reserved")
    }
    guard let latitude = (raw["latitude"] as? NSNumber)?.doubleValue,
          let longitude = (raw["longitude"] as? NSNumber)?.doubleValue,
          (-90...90).contains(latitude), (-180...180).contains(longitude) else {
      throw LocXNativeError.geofence("Geofence \(identifier) has invalid coordinates")
    }
    guard let radius = (raw["radius"] as? NSNumber)?.doubleValue, radius > 0 else {
      throw LocXNativeError.geofence("Geofence \(identifier) radius must be positive")
    }
    let entry = raw["notifyOnEntry"] as? Bool ?? true
    let exit = raw["notifyOnExit"] as? Bool ?? true
    let dwell = raw["notifyOnDwell"] as? Bool ?? false
    guard entry || exit || dwell else {
      throw LocXNativeError.geofence("Geofence \(identifier) has no transitions enabled")
    }
    return [
      "identifier": identifier,
      "latitude": latitude,
      "longitude": longitude,
      "radius": radius,
      "notifyOnEntry": entry,
      "notifyOnExit": exit,
      "notifyOnDwell": dwell,
      "loiteringDelayMs": max(0, (raw["loiteringDelayMs"] as? NSNumber)?.doubleValue ?? Self.defaultLoiteringMs),
      "extras": raw["extras"] as? [String: Any] ?? [:],
    ]
  }

  private func monitor(_ geofence: [String: Any]) {
    guard let identifier = geofence["identifier"] as? String,
          let latitude = geofence["latitude"] as? Double,
          let longitude = geofence["longitude"] as? Double,
          let radius = geofence["radius"] as? Double else { return }
    let entry = geofence["notifyOnEntry"] as? Bool ?? true
    let exit = geofence["notifyOnExit"] as? Bool ?? true
    let dwell = geofence["notifyOnDwell"] as? Bool ?? false
    let region = CLCircularRegion(
      center: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
      radius: min(radius, manager.maximumRegionMonitoringDistance),
      identifier: identifier
    )
    region.notifyOnEntry = entry || dwell
    region.notifyOnExit = exit || dwell
    manager.startMonitoring(for: region)
    if entry || dwell {
      pendingInitialState.insert(identifier)
      manager.requestState(for: region)
    }
  }

  private func handleEnter(_ geofence: [String: Any]) {
    guard let identifier = geofence["identifier"] as? String else { return }
    if geofence["notifyOnEntry"] as? Bool ?? true {
      emitGeofence(geofence, action: "ENTER")
    }
    guard geofence["notifyOnDwell"] as? Bool ?? false else { return }
    dwellWork.removeValue(forKey: identifier)?.cancel()
    let delay = (geofence["loiteringDelayMs"] as? Double ?? Self.defaultLoiteringMs) / 1_000
    let work = DispatchWorkItem { [weak self] in
      guard let self else { return }
      self.dwellWork.removeValue(forKey: identifier)
      self.emitGeofence(geofence, action: "DWELL")
    }
    dwellWork[identifier] = work
    DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
  }

  private func emitGeofence(_ geofence: [String: Any], action: String) {
    let identifier: String = geofence["identifier"] as? String ?? ""
    let extras: [String: Any] = geofence["extras"] as? [String: Any] ?? [:]
    sendEventIfObserved(name: "geofence", body: [
      "identifier": identifier,
      "action": action,
      "location": manager.location.map { makePoint($0, odometer: odometer, isMoving: isMoving).dictionary() }
        ?? NSNull(),
      "extras": extras,
      "timestamp": iso8601(Date()),
    ])
  }

  private func storedGeofences() -> [[String: Any]] {
    guard let data = defaults.data(forKey: Self.geofencesDefaultsKey),
          let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
      return []
    }
    return list
  }

  private func storedGeofence(_ identifier: String) -> [String: Any]? {
    storedGeofences().first { $0["identifier"] as? String == identifier }
  }

  private func saveGeofences(_ geofences: [[String: Any]]) {
    if let data = try? JSONSerialization.data(withJSONObject: geofences) {
      defaults.set(data, forKey: Self.geofencesDefaultsKey)
    }
  }

  private func performSync(completion: @escaping (Int, Error?) -> Void) {
    dispatchPrecondition(condition: .onQueue(.main))
    guard !uploadInFlight else {
      completion(0, nil)
      return
    }
    guard let config else {
      completion(0, LocXNativeError.notConfigured)
      return
    }
    if config.wifiOnly.orFalse && !pathUsesWifi {
      scheduleRetry(after: config.retryBase)
      completion(0, LocXNativeError.wifiRequired)
      return
    }
    let points = locationQueue.fetch(limit: config.uploadBatchSize)
    guard !points.isEmpty else {
      completion(0, nil)
      return
    }
    guard let url = URL(string: config.endpoint) else {
      completion(0, LocXNativeError.invalidConfig("Invalid endpoint"))
      return
    }
    let envelope: [String: Any] = config.usesPathPayload
      ? ["location": points.map { $0.pathDictionary() }]
      : ["locations": points.map { $0.dictionary() }]
    guard let body = try? JSONSerialization.data(withJSONObject: envelope, options: []) else {
      completion(0, LocXNativeError.serialization)
      return
    }

    var request = URLRequest(url: url)
    request.httpMethod = config.uploadMethod
    request.httpBody = body
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    config.headers?.forEach { request.setValue($1, forHTTPHeaderField: $0) }

    let sessionConfiguration = URLSessionConfiguration.default
    sessionConfiguration.waitsForConnectivity = true
    sessionConfiguration.allowsCellularAccess = !config.wifiOnly.orFalse
    let session = URLSession(configuration: sessionConfiguration)
    uploadInFlight = true
    beginUploadTask()
    session.dataTask(with: request) { [weak self] _, response, error in
      DispatchQueue.main.async {
        guard let self else { return }
        self.uploadInFlight = false
        self.endUploadTask()
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if error == nil, (200...299).contains(status) {
          self.locationQueue.remove(ids: points.map(\.id))
          let remaining = self.locationQueue.count()
          self.sendEventIfObserved(name: "upload", body: [
            "accepted": points.count,
            "status": status,
            "remaining": remaining,
          ])
          self.emitState()
          if remaining > 0 {
            self.performSync { more, moreError in
              completion(points.count + more, moreError)
            }
          } else {
            completion(points.count, nil)
          }
        } else {
          self.locationQueue.markFailed(points, base: config.retryBase, maximum: config.retryMaximum)
          let uploadError = error ?? LocXNativeError.httpStatus(status)
          self.emitError(code: "upload_failed", message: uploadError.localizedDescription, recoverable: true)
          self.scheduleRetry(after: min(config.retryMaximum, config.retryBase))
          completion(0, uploadError)
        }
        session.finishTasksAndInvalidate()
      }
    }.resume()
  }

  private func scheduleRetry(after seconds: Double) {
    retryWork?.cancel()
    let work = DispatchWorkItem { [weak self] in
      self?.performSync { _, _ in }
    }
    retryWork = work
    DispatchQueue.main.asyncAfter(deadline: .now() + max(1, seconds), execute: work)
  }

  private func beginUploadTask() {
    endUploadTask()
    backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "locx-upload") { [weak self] in
      self?.endUploadTask()
    }
  }

  private func endUploadTask() {
    if backgroundTask != .invalid {
      UIApplication.shared.endBackgroundTask(backgroundTask)
      backgroundTask = .invalid
    }
  }

  private func refreshRelaunchRegion(around location: CLLocation, radius: CLLocationDistance = LocX.relaunchFence) {
    guard manager.authorizationStatus == .authorizedAlways,
          CLLocationManager.isMonitoringAvailable(for: CLCircularRegion.self) else {
      return
    }
    stopRelaunchRegion()
    let region = CLCircularRegion(
      center: location.coordinate,
      radius: min(radius, manager.maximumRegionMonitoringDistance),
      identifier: relaunchRegionId
    )
    region.notifyOnEntry = false
    region.notifyOnExit = true
    manager.startMonitoring(for: region)
  }

  private func stopRelaunchRegion() {
    manager.monitoredRegions
      .filter { $0.identifier == relaunchRegionId }
      .forEach { manager.stopMonitoring(for: $0) }
  }

  private func makePoint(_ location: CLLocation, odometer: Double, isMoving: Bool) -> LocationPoint {
    let reduced: Bool
    if #available(iOS 14.0, *) {
      reduced = manager.accuracyAuthorization == .reducedAccuracy
    } else {
      reduced = false
    }
    let mocked: Bool
    if #available(iOS 15.0, *) {
      mocked = location.sourceInformation?.isSimulatedBySoftware ?? false
    } else {
      mocked = false
    }
    return LocationPoint(
      id: UUID().uuidString.lowercased(),
      latitude: location.coordinate.latitude,
      longitude: location.coordinate.longitude,
      accuracy: location.horizontalAccuracy,
      altitude: location.verticalAccuracy >= 0 ? location.altitude : nil,
      altitudeAccuracy: location.verticalAccuracy >= 0 ? location.verticalAccuracy : nil,
      speed: location.speed >= 0 ? location.speed : nil,
      heading: location.course >= 0 ? location.course : nil,
      recordedAt: iso8601(location.timestamp),
      receivedAt: iso8601(Date()),
      mocked: mocked,
      provider: reduced ? "ios-reduced" : "ios-corelocation",
      attempts: 0,
      activity: currentActivity,
      odometer: odometer,
      isMoving: isMoving
    )
  }

  private func permissionStatus() -> String {
    switch manager.authorizationStatus {
    case .notDetermined: return "notDetermined"
    case .restricted: return "restricted"
    case .denied: return "denied"
    case .authorizedAlways: return "always"
    case .authorizedWhenInUse: return "whenInUse"
    @unknown default: return "notDetermined"
    }
  }

  private func stateDictionary() -> [String: Any] {
    [
      "configured": config != nil,
      "tracking": tracking,
      "permission": permissionStatus(),
      "queueSize": locationQueue.count(),
      "lastLocation": lastLocation?.dictionary() ?? NSNull(),
      "lastError": lastError ?? NSNull(),
      "isMoving": isMoving,
      "odometer": odometer,
      "activity": currentActivity ?? NSNull(),
      "batteryOptimizationIgnored": NSNull(),
      "serviceRunning": tracking,
      "restrictions": [] as [String],
    ]
  }

  private func stateJSON() -> String {
    encodeJSON(stateDictionary()) ?? "{}"
  }

  private func emitState() {
    sendEventIfObserved(name: "state", body: stateDictionary())
  }

  private func emitError(code: String, message: String, recoverable: Bool) {
    lastError = message
    sendEventIfObserved(name: "error", body: [
      "code": code,
      "message": message,
      "recoverable": recoverable,
    ])
  }

  private func sendEventIfObserved(name: String, body: Any) {
    guard hasEventListeners else {
      guard name != "state" else { return }
      bufferedEvents.append((name: name, body: body))
      if bufferedEvents.count > Self.maxBufferedEvents {
        bufferedEvents.removeFirst(bufferedEvents.count - Self.maxBufferedEvents)
      }
      return
    }
    sendEvent(withName: name, body: body)
  }

  private func clearCurrentRequest() {
    currentTimeout?.cancel()
    currentTimeout = nil
    currentResolve = nil
    currentReject = nil
  }

  private func reject(
    _ reject: RCTPromiseRejectBlock,
    code: String,
    message: String
  ) {
    lastError = message
    emitError(code: code, message: message, recoverable: false)
    reject(code, message, nil)
  }

  private func reject(_ reject: RCTPromiseRejectBlock, code: String, error: Error) {
    lastError = error.localizedDescription
    emitError(code: code, message: error.localizedDescription, recoverable: false)
    reject(code, error.localizedDescription, error)
  }

  private func encodeJSON(_ value: Any) -> String? {
    guard JSONSerialization.isValidJSONObject(value),
          let data = try? JSONSerialization.data(withJSONObject: value),
          let string = String(data: data, encoding: .utf8) else {
      return nil
    }
    return string
  }

  private func iso8601(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.string(from: date)
  }

  private func onMain(_ work: @escaping () -> Void) {
    if Thread.isMainThread {
      work()
    } else {
      DispatchQueue.main.async(execute: work)
    }
  }
}

private enum LocXNativeError: LocalizedError {
  case invalidConfig(String)
  case notConfigured
  case serialization
  case httpStatus(Int)
  case wifiRequired
  case geofence(String)

  var errorDescription: String? {
    switch self {
    case .invalidConfig(let message): return message
    case .notConfigured: return "LocX is not configured"
    case .serialization: return "Could not serialize queued locations"
    case .httpStatus(let status): return "Upload failed with HTTP status \(status)"
    case .wifiRequired: return "Upload deferred until Wi-Fi is available"
    case .geofence(let message): return message
    }
  }
}

private extension Optional where Wrapped == Bool {
  var orFalse: Bool { self ?? false }
}
