package com.locx

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.locx.db.LocXDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONObject

class LocXLocationService : Service() {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val handler = Handler(Looper.getMainLooper())
  private lateinit var client: FusedLocationProviderClient
  private var movingCallback: LocationCallback? = null
  private var stationaryCallback: LocationCallback? = null
  private var config: LocXConfig? = null

  private var anchor: Location? = null
  private var lastLocation: Location? = null
  private var lastMovementAt = 0L

  private val motionCheck = object : Runnable {
    override fun run() {
      val current = config ?: return
      if (!current.motionEnabled || !LocXRuntime.isMoving(this@LocXLocationService)) return
      val idleMs = SystemClock.elapsedRealtime() - lastMovementAt
      if (idleMs >= current.stopTimeoutMinutes * 60_000L) {
        enterStationary(lastLocation ?: anchor)
      } else {
        handler.postDelayed(this, MOTION_CHECK_MS)
      }
    }
  }

  override fun onCreate() {
    super.onCreate()
    client = LocationServices.getFusedLocationProviderClient(this)
    instance = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      LocXRuntime.setTracking(this, false)
      stopTracking()
      stopSelf()
      return START_NOT_STICKY
    }
    val loaded = LocXConfig.load(this)
    if (loaded == null) {
      LocXRuntime.error(this, "NOT_CONFIGURED", "LocX must be configured before starting", false)
      LocXRuntime.setTracking(this, false)
      stopSelf()
      return START_NOT_STICKY
    }
    config = loaded
    startForegroundCompat(notification(loaded))
    LocXNetwork.register(this)
    if (!startTracking(loaded)) return START_NOT_STICKY
    LocXRuntime.setTracking(this, true)
    return if (loaded.stopOnTerminate) START_NOT_STICKY else START_STICKY
  }

  private fun hasPermission(): Boolean =
    ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) ==
      PackageManager.PERMISSION_GRANTED ||
      ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) ==
      PackageManager.PERMISSION_GRANTED

  private fun startTracking(config: LocXConfig): Boolean {
    if (!hasPermission()) {
      LocXRuntime.error(this, "PERMISSION_DENIED", "Location permission is not granted", false)
      LocXRuntime.setTracking(this, false)
      stopSelf()
      return false
    }
    if (config.activityRecognition) LocXActivity.start(this) else LocXActivity.stop(this)
    if (!config.motionEnabled || LocXRuntime.isMoving(this)) {
      startMoving(trigger = null, announce = false)
    } else {
      restoreStationary()
    }
    if (!isLocationEnabled()) {
      LocXRuntime.error(this, "PROVIDER_DISABLED", "System location services are disabled", true)
    }
    return true
  }

  @SuppressLint("MissingPermission")
  private fun restoreStationary() {
    client.lastLocation
      .addOnSuccessListener { location ->
        if (location == null) startMoving(trigger = null, announce = true)
        else enterStationary(location, announce = false)
      }
      .addOnFailureListener { startMoving(trigger = null, announce = true) }
  }

  @SuppressLint("MissingPermission")
  private fun startMoving(trigger: Location?, announce: Boolean) {
    val current = config ?: return
    if (!hasPermission()) return
    stationaryCallback?.let { client.removeLocationUpdates(it) }
    stationaryCallback = null
    LocXGeofences.clearStationary(this)
    LocXRuntime.setMoving(this, true)
    anchor = trigger
    lastMovementAt = SystemClock.elapsedRealtime()

    movingCallback?.let { client.removeLocationUpdates(it) }
    val request = LocationRequest.Builder(current.priority, current.intervalMs)
      .setMinUpdateIntervalMillis(current.fastestIntervalMs)
      .setMinUpdateDistanceMeters(current.distanceFilterMeters)
      .build()
    movingCallback = object : LocationCallback() {
      override fun onLocationResult(result: LocationResult) {
        result.locations.forEach(::onMovingLocation)
      }
    }.also { client.requestLocationUpdates(request, it, mainLooper) }

    handler.removeCallbacks(motionCheck)
    if (current.motionEnabled) handler.postDelayed(motionCheck, MOTION_CHECK_MS)
    if (announce) announceMotion(true, trigger)
  }

  @SuppressLint("MissingPermission")
  private fun enterStationary(at: Location?, announce: Boolean = true) {
    val current = config ?: return
    if (!hasPermission()) return
    handler.removeCallbacks(motionCheck)
    movingCallback?.let { client.removeLocationUpdates(it) }
    movingCallback = null
    LocXRuntime.setMoving(this, false)
    anchor = at
    if (at != null) placeStationaryFence(at, current)

    stationaryCallback?.let { client.removeLocationUpdates(it) }
    val request = LocationRequest.Builder(Priority.PRIORITY_BALANCED_POWER_ACCURACY, STATIONARY_INTERVAL_MS)
      .setMinUpdateIntervalMillis(STATIONARY_INTERVAL_MS / 3)
      .build()
    stationaryCallback = object : LocationCallback() {
      override fun onLocationResult(result: LocationResult) {
        result.lastLocation?.let(::onStationaryLocation)
      }
    }.also { client.requestLocationUpdates(request, it, mainLooper) }
    if (announce) announceMotion(false, at)
  }

  private fun placeStationaryFence(at: Location, config: LocXConfig) {
    LocXGeofences.setStationary(
      this,
      at.latitude,
      at.longitude,
      maxOf(config.stationaryRadiusMeters, MIN_STATIONARY_FENCE_METERS),
    )
  }

  private fun onMovingLocation(location: Location) {
    val current = config ?: return
    lastLocation = location
    val reference = anchor
    if (reference == null || reference.distanceTo(location) > movementThreshold(location, current)) {
      anchor = location
      lastMovementAt = SystemClock.elapsedRealtime()
    }
    val odometer = LocXRuntime.advanceOdometer(this, location)
    persist(location, odometer, current)
  }

  private fun onStationaryLocation(location: Location) {
    val current = config ?: return
    val reference = anchor
    if (reference == null) {
      anchor = location
      placeStationaryFence(location, current)
      return
    }
    if (reference.distanceTo(location) > movementThreshold(location, current)) {
      startMoving(location, announce = true)
    }
  }

  private fun movementThreshold(location: Location, config: LocXConfig): Float =
    maxOf(config.stationaryRadiusMeters, if (location.hasAccuracy()) location.accuracy else 0f)

  fun changePace(moving: Boolean) {
    if (moving) {
      if (!LocXRuntime.isMoving(this) || movingCallback == null) startMoving(lastLocation, announce = true)
    } else {
      enterStationary(lastLocation ?: anchor)
    }
  }

  private fun wake(trigger: Location?) {
    if (!LocXRuntime.isMoving(this)) startMoving(trigger, announce = true)
  }

  private fun announceMotion(moving: Boolean, location: Location?) {
    val payload = JSONObject()
      .put("isMoving", moving)
      .put(
        "location",
        location?.let { LocXRuntime.locationJson(LocXRuntime.entity(this, it, isMoving = moving)) }
          ?: JSONObject.NULL,
      )
    LocXRuntime.emit("motionchange", payload, this)
  }

  private fun isLocationEnabled(): Boolean {
    val manager = getSystemService(LOCATION_SERVICE) as? LocationManager ?: return true
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      manager.isLocationEnabled
    } else {
      @Suppress("DEPRECATION")
      manager.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
        manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    }
  }

  private fun startForegroundCompat(notification: Notification) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  private fun persist(location: Location, odometer: Double, config: LocXConfig) {
    val entity = LocXRuntime.entity(this, location, odometer = odometer, isMoving = true)
    scope.launch {
      val dao = LocXDatabase.get(applicationContext).locations()
      dao.insert(entity)
      dao.deleteBefore(LocXRuntime.beforeDays(config.maxAgeDays))
      val overflow = dao.count() - config.maxQueueSize
      if (overflow > 0) dao.trimOldest(overflow)
      LocXRuntime.emit("location", LocXRuntime.locationJson(entity), applicationContext)
      if (config.autoSync) LocXUploadWorker.enqueue(applicationContext, config)
    }
  }

  private fun notification(config: LocXConfig): Notification {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(NotificationManager::class.java)
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, config.notificationChannelName, NotificationManager.IMPORTANCE_LOW)
      )
    }
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentTitle(config.notificationTitle)
      .setContentText(config.notificationText)
      .setOngoing(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build()
  }

  private fun stopTracking() {
    handler.removeCallbacks(motionCheck)
    movingCallback?.let { client.removeLocationUpdates(it) }
    movingCallback = null
    stationaryCallback?.let { client.removeLocationUpdates(it) }
    stationaryCallback = null
    LocXGeofences.clearStationary(this)
    LocXActivity.stop(this)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      stopForeground(STOP_FOREGROUND_REMOVE)
    } else {
      @Suppress("DEPRECATION")
      stopForeground(true)
    }
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    val config = LocXConfig.load(this)
    if (config?.stopOnTerminate == true) {
      LocXRuntime.setTracking(this, false)
      stopSelf()
      super.onTaskRemoved(rootIntent)
      return
    }
    // Recent-apps swipe removes the task. Restart the foreground service so GPS
    // and the path upload keep running without the JS runtime.
    try {
      ContextCompat.startForegroundService(
        applicationContext,
        Intent(applicationContext, LocXLocationService::class.java)
          .setAction(ACTION_START),
      )
    } catch (error: Exception) {
      LocXRuntime.error(
        applicationContext,
        "TASK_REMOVED_RESTART_FAILED",
        error.message ?: "Could not keep location running after the app was removed",
        true,
      )
      if (config?.autoSync == true) LocXUploadWorker.enqueue(applicationContext, config)
    }
    super.onTaskRemoved(rootIntent)
  }

  override fun onDestroy() {
    stopTracking()
    if (!LocXRuntime.isTracking(this)) LocXRuntime.setMoving(this, true)
    if (instance === this) instance = null
    scope.cancel()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  companion object {
    const val ACTION_START = "com.locx.action.START"
    const val ACTION_STOP = "com.locx.action.STOP"
    private const val CHANNEL_ID = "locx-location"
    private const val NOTIFICATION_ID = 7619
    private const val MOTION_CHECK_MS = 30_000L
    private const val STATIONARY_INTERVAL_MS = 180_000L
    private const val MIN_STATIONARY_FENCE_METERS = 100f

    @Volatile internal var instance: LocXLocationService? = null

    /** Switches a stationary tracker back to moving, starting the service if Android killed it. */
    internal fun wake(context: Context, trigger: Location?) {
      val running = instance
      if (running != null) {
        running.handler.post { running.wake(trigger) }
        return
      }
      if (!LocXRuntime.isTracking(context)) return
      LocXRuntime.setMoving(context, true)
      try {
        ContextCompat.startForegroundService(
          context,
          Intent(context, LocXLocationService::class.java).setAction(ACTION_START),
        )
      } catch (error: Exception) {
        LocXRuntime.error(context, "WAKE_FAILED", error.message ?: "Could not resume tracking", true)
      }
    }
  }
}
