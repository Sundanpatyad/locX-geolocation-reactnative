package com.locx

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.location.GeofenceStatusCodes
import com.google.android.gms.location.LocationServices
import com.google.android.gms.tasks.CancellationTokenSource
import com.locx.db.LocXDatabase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ExecutionException
import java.util.concurrent.atomic.AtomicBoolean

class LocXModule(
  private val context: ReactApplicationContext,
) : NativeLocXSpec(context), PermissionListener {
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private var permissionPromise: Promise? = null
  private var wantsAlways = false

  init {
    LocXRuntime.reactContext = context
    LocXRuntime.jsListeners.set(0)
    LocXNetwork.register(context)
    LocXGeofences.restore(context)
    restoreTrackingIfNeeded()
  }

  private fun restoreTrackingIfNeeded() {
    val config = LocXConfig.load(context) ?: return
    if (!LocXRuntime.isTracking(context) || !LocXRuntime.hasLocationPermission(context)) return
    try {
      ContextCompat.startForegroundService(
        context,
        Intent(context, LocXLocationService::class.java)
          .setAction(LocXLocationService.ACTION_START),
      )
    } catch (error: Exception) {
      LocXRuntime.error(
        context,
        "RESTORE_FAILED",
        error.message ?: "Could not restore the location service",
        true,
      )
      if (config.autoSync) LocXUploadWorker.enqueue(context, config)
    }
  }

  override fun getName(): String = NAME

  @ReactMethod
  override fun configure(configJson: String, promise: Promise) {
    try {
      val config = LocXConfig.parse(configJson)
      LocXConfig.save(context, config)
      scope.launch {
        prune(config)
        resolveState(promise)
      }
    } catch (error: Exception) {
      promise.reject("INVALID_CONFIG", error.message, error)
    }
  }

  @ReactMethod
  override fun requestPermission(always: Boolean, promise: Promise) {
    val activity = context.currentActivity as? PermissionAwareActivity
    if (activity == null) {
      promise.reject("NO_ACTIVITY", "A foreground Activity is required to request permission")
      return
    }
    if (permissionPromise != null) {
      promise.reject("REQUEST_IN_PROGRESS", "A permission request is already active")
      return
    }
    val current = LocXRuntime.permission(context)
    if (current == "always" || (current == "whenInUse" && !always)) {
      promise.resolve(current)
      return
    }
    permissionPromise = promise
    wantsAlways = always
    LocXRuntime.markPermissionRequested(context)
    val permissions = mutableListOf(
      Manifest.permission.ACCESS_FINE_LOCATION,
      Manifest.permission.ACCESS_COARSE_LOCATION,
    )
    if (Build.VERSION.SDK_INT >= 33) permissions += Manifest.permission.POST_NOTIFICATIONS
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
      LocXConfig.load(context)?.activityRecognition == true
    ) {
      permissions += Manifest.permission.ACTIVITY_RECOGNITION
    }
    activity.requestPermissions(permissions.toTypedArray(), REQUEST_FOREGROUND, this)
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<String>,
    grantResults: IntArray,
  ): Boolean {
    if (requestCode != REQUEST_FOREGROUND && requestCode != REQUEST_BACKGROUND) return false
    val promise = permissionPromise ?: return true
    if (requestCode == REQUEST_FOREGROUND &&
      wantsAlways &&
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
      LocXRuntime.permission(context) != "denied"
    ) {
      val activity = context.currentActivity as? PermissionAwareActivity
      if (activity != null) {
        activity.requestPermissions(
          arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION),
          REQUEST_BACKGROUND,
          this,
        )
        return true
      }
    }
    permissionPromise = null
    val status = LocXRuntime.permission(context)
    LocXRuntime.emit("permission", JSONObject().put("status", status))
    promise.resolve(status)
    return true
  }

  @ReactMethod
  override fun start(promise: Promise) {
    if (LocXConfig.load(context) == null) {
      promise.reject("NOT_CONFIGURED", "LocX must be configured before starting")
      return
    }
    if (!LocXRuntime.hasLocationPermission(context)) {
      promise.reject("PERMISSION_DENIED", "Location permission is not granted")
      return
    }
    try {
      ContextCompat.startForegroundService(
        context,
        Intent(context, LocXLocationService::class.java)
          .setAction(LocXLocationService.ACTION_START),
      )
      LocXRuntime.setTracking(context, true)
      scope.launch { resolveState(promise, emit = true) }
    } catch (error: Exception) {
      promise.reject("START_FAILED", error.message, error)
    }
  }

  @ReactMethod
  override fun stop(promise: Promise) {
    LocXRuntime.setTracking(context, false)
    context.stopService(Intent(context, LocXLocationService::class.java))
    scope.launch { resolveState(promise, emit = true) }
  }

  @ReactMethod
  override fun getState(promise: Promise) {
    scope.launch { resolveState(promise) }
  }

  @ReactMethod
  override fun getCurrentLocation(timeoutMs: Double, promise: Promise) {
    if (!LocXRuntime.hasLocationPermission(context)) {
      promise.reject("PERMISSION_DENIED", "Location permission is not granted")
      return
    }
    val config = LocXConfig.load(context)
    val token = CancellationTokenSource()
    val settled = AtomicBoolean(false)
    val timeout = timeoutMs.toLong().coerceAtLeast(1_000)
    val handler = Handler(Looper.getMainLooper())
    val timeoutAction = Runnable {
      if (settled.compareAndSet(false, true)) {
        token.cancel()
        promise.reject("LOCATION_TIMEOUT", "No location received within ${timeout}ms")
      }
    }
    handler.postDelayed(timeoutAction, timeout)
    try {
      LocationServices.getFusedLocationProviderClient(context)
        .getCurrentLocation(config?.priority ?: com.google.android.gms.location.Priority.PRIORITY_HIGH_ACCURACY, token.token)
        .addOnSuccessListener { location ->
          if (!settled.compareAndSet(false, true)) return@addOnSuccessListener
          handler.removeCallbacks(timeoutAction)
          if (location == null) {
            promise.reject("LOCATION_UNAVAILABLE", "The location provider returned no location")
          } else {
            promise.resolve(LocXRuntime.locationJson(LocXRuntime.entity(context, location)).toString())
          }
        }
        .addOnFailureListener { error ->
          if (settled.compareAndSet(false, true)) {
            handler.removeCallbacks(timeoutAction)
            promise.reject("LOCATION_FAILED", error.message, error)
          }
        }
    } catch (error: SecurityException) {
      handler.removeCallbacks(timeoutAction)
      promise.reject("PERMISSION_DENIED", error.message, error)
    }
  }

  @ReactMethod
  override fun sync(promise: Promise) {
    val config = LocXConfig.load(context)
    if (config == null) {
      promise.reject("NOT_CONFIGURED", "LocX must be configured before syncing")
      return
    }
    scope.launch {
      val count = LocXDatabase.get(context).locations().count()
      if (count > 0) LocXUploadWorker.enqueue(context, config, replace = true)
      promise.resolve(count.toString())
    }
  }

  @ReactMethod
  override fun getQueuedLocations(limit: Double, promise: Promise) {
    scope.launch {
      val rows = LocXDatabase.get(context).locations().oldest(limit.toInt().coerceIn(1, 1_000))
      promise.resolve(LocXRuntime.locationsJson(rows))
    }
  }

  @ReactMethod
  override fun clearQueue(promise: Promise) {
    scope.launch {
      LocXDatabase.get(context).locations().clear()
      LocXUploadWorker.cancel(context)
      promise.resolve(null)
    }
  }

  @ReactMethod
  override fun changePace(isMoving: Boolean, promise: Promise) {
    val service = LocXLocationService.instance
    if (service == null || !LocXRuntime.isTracking(context)) {
      promise.reject("NOT_TRACKING", "Call start before changePace")
      return
    }
    Handler(Looper.getMainLooper()).post {
      service.changePace(isMoving)
      scope.launch { resolveState(promise, emit = true) }
    }
  }

  @ReactMethod
  override fun getOdometer(promise: Promise) {
    promise.resolve(LocXRuntime.odometer(context))
  }

  @ReactMethod
  override fun setOdometer(meters: Double, promise: Promise) {
    LocXRuntime.setOdometer(context, meters)
    promise.resolve(LocXRuntime.odometer(context))
  }

  @ReactMethod
  override fun addGeofences(geofencesJson: String, promise: Promise) {
    scope.launch {
      try {
        LocXGeofences.add(context, JSONArray(geofencesJson))
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("GEOFENCE_FAILED", geofenceMessage(error), error)
      }
    }
  }

  @ReactMethod
  override fun removeGeofences(identifiersJson: String, promise: Promise) {
    scope.launch {
      try {
        val ids = JSONArray(identifiersJson)
        LocXGeofences.remove(context, (0 until ids.length()).map { ids.getString(it) })
        promise.resolve(null)
      } catch (error: Exception) {
        promise.reject("GEOFENCE_FAILED", geofenceMessage(error), error)
      }
    }
  }

  @ReactMethod
  override fun getGeofences(promise: Promise) {
    promise.resolve(LocXGeofences.list(context).toString())
  }

  private fun geofenceMessage(error: Exception): String {
    val cause = (error as? ExecutionException)?.cause ?: error
    val status = (cause as? ApiException)?.statusCode
    return when (status) {
      GeofenceStatusCodes.GEOFENCE_NOT_AVAILABLE ->
        "Geofencing is unavailable; turn on device location and grant background location"
      GeofenceStatusCodes.GEOFENCE_TOO_MANY_GEOFENCES -> "Too many geofences registered"
      else -> cause.message ?: "Geofence request failed"
    }
  }

  @ReactMethod
  override fun addListener(eventName: String) {
    LocXRuntime.jsListeners.incrementAndGet()
  }

  @ReactMethod
  override fun removeListeners(count: Double) {
    LocXRuntime.jsListeners.updateAndGet { (it - count.toInt()).coerceAtLeast(0) }
  }

  private suspend fun resolveState(promise: Promise, emit: Boolean = false) {
    val dao = LocXDatabase.get(context).locations()
    val state = JSONObject()
      .put("configured", LocXConfig.load(context) != null)
      .put("tracking", LocXRuntime.isTracking(context))
      .put("permission", LocXRuntime.permission(context))
      .put("queueSize", dao.count())
      .put("lastLocation", dao.latest()?.let(LocXRuntime::locationJson) ?: JSONObject.NULL)
      .put("lastError", LocXRuntime.lastError(context) ?: JSONObject.NULL)
      .put("isMoving", LocXRuntime.isMoving(context))
      .put("odometer", LocXRuntime.odometer(context))
      .put("activity", LocXRuntime.activity(context) ?: JSONObject.NULL)
      .put("batteryOptimizationIgnored", LocXRuntime.batteryOptimizationIgnored(context))
      .put("serviceRunning", LocXRuntime.isServiceRunning(context))
      .put("restrictions", LocXRuntime.restrictionNotes(context))
    if (emit) LocXRuntime.emit("state", state)
    promise.resolve(state.toString())
  }

  private suspend fun prune(config: LocXConfig) {
    val dao = LocXDatabase.get(context).locations()
    dao.deleteBefore(LocXRuntime.beforeDays(config.maxAgeDays))
    val overflow = dao.count() - config.maxQueueSize
    if (overflow > 0) dao.trimOldest(overflow)
  }

  override fun invalidate() {
    permissionPromise?.reject("MODULE_DESTROYED", "LocX module was destroyed")
    permissionPromise = null
    scope.cancel()
    if (LocXRuntime.reactContext === context) {
      LocXRuntime.reactContext = null
      LocXRuntime.jsListeners.set(0)
    }
    super.invalidate()
  }

  companion object {
    const val NAME = "LocX"
    private const val REQUEST_FOREGROUND = 7610
    private const val REQUEST_BACKGROUND = 7611
  }
}
