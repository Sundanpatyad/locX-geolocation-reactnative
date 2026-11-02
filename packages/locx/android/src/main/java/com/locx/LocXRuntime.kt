package com.locx

import android.Manifest
import android.app.ActivityManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.locx.db.LocationEntity
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.atomic.AtomicInteger

internal object LocXRuntime {
  private const val TRACKING = "tracking"
  private const val PERMISSION_REQUESTED = "permissionRequested"
  private const val LAST_ERROR = "lastError"
  private const val IS_MOVING = "isMoving"
  private const val ODOMETER = "odometer"
  private const val ODOMETER_LAT = "odometerLat"
  private const val ODOMETER_LNG = "odometerLng"
  private const val ACTIVITY = "activity"
  private val HEADLESS_EVENTS = setOf(
    "location", "upload", "error", "motionchange", "activitychange", "geofence",
  )
  @Volatile var reactContext: ReactApplicationContext? = null
  val jsListeners = AtomicInteger(0)

  fun setTracking(context: Context, tracking: Boolean) {
    LocXStore.prefs(context).edit().putBoolean(TRACKING, tracking).apply()
  }

  fun isTracking(context: Context): Boolean =
    LocXStore.prefs(context).getBoolean(TRACKING, false)

  fun setMoving(context: Context, moving: Boolean) {
    LocXStore.prefs(context).edit().putBoolean(IS_MOVING, moving).apply()
  }

  fun isMoving(context: Context): Boolean =
    LocXStore.prefs(context).getBoolean(IS_MOVING, true)

  fun setActivity(context: Context, activity: String?) {
    LocXStore.prefs(context).edit().putString(ACTIVITY, activity).apply()
  }

  fun activity(context: Context): String? =
    LocXStore.prefs(context).getString(ACTIVITY, null)

  fun odometer(context: Context): Double =
    java.lang.Double.longBitsToDouble(LocXStore.prefs(context).getLong(ODOMETER, 0L))

  @Synchronized
  fun setOdometer(context: Context, meters: Double) {
    LocXStore.prefs(context).edit()
      .putLong(ODOMETER, java.lang.Double.doubleToRawLongBits(meters.coerceAtLeast(0.0)))
      .remove(ODOMETER_LAT)
      .remove(ODOMETER_LNG)
      .apply()
  }

  /** Adds the distance from the previous accurate point and returns the new total. */
  @Synchronized
  fun advanceOdometer(context: Context, location: android.location.Location): Double {
    val prefs = LocXStore.prefs(context)
    val total = odometer(context)
    if (!location.hasAccuracy() || location.accuracy > ODOMETER_MAX_ACCURACY) return total
    val next = if (prefs.contains(ODOMETER_LAT)) {
      val previous = FloatArray(1)
      android.location.Location.distanceBetween(
        java.lang.Double.longBitsToDouble(prefs.getLong(ODOMETER_LAT, 0L)),
        java.lang.Double.longBitsToDouble(prefs.getLong(ODOMETER_LNG, 0L)),
        location.latitude,
        location.longitude,
        previous,
      )
      total + previous[0]
    } else total
    prefs.edit()
      .putLong(ODOMETER, java.lang.Double.doubleToRawLongBits(next))
      .putLong(ODOMETER_LAT, java.lang.Double.doubleToRawLongBits(location.latitude))
      .putLong(ODOMETER_LNG, java.lang.Double.doubleToRawLongBits(location.longitude))
      .apply()
    return next
  }

  private const val ODOMETER_MAX_ACCURACY = 100f

  fun permission(context: Context): String {
    val fine = ContextCompat.checkSelfPermission(
      context, Manifest.permission.ACCESS_FINE_LOCATION
    ) == PackageManager.PERMISSION_GRANTED
    val coarse = ContextCompat.checkSelfPermission(
      context, Manifest.permission.ACCESS_COARSE_LOCATION
    ) == PackageManager.PERMISSION_GRANTED
    if (!fine && !coarse) {
      val requested = LocXStore.prefs(context).getBoolean(PERMISSION_REQUESTED, false)
      return if (requested) "denied" else "notDetermined"
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return "always"
    val background = ContextCompat.checkSelfPermission(
      context, Manifest.permission.ACCESS_BACKGROUND_LOCATION
    ) == PackageManager.PERMISSION_GRANTED
    return if (background) "always" else "whenInUse"
  }

  fun markPermissionRequested(context: Context) {
    LocXStore.prefs(context).edit().putBoolean(PERMISSION_REQUESTED, true).apply()
  }

  fun batteryOptimizationIgnored(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
    val manager = context.getSystemService(PowerManager::class.java) ?: return true
    return manager.isIgnoringBatteryOptimizations(context.packageName)
  }

  fun isServiceRunning(context: Context): Boolean {
    val manager = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return false
    @Suppress("DEPRECATION")
    return manager.getRunningServices(Integer.MAX_VALUE).any {
      it.service.className == LocXLocationService::class.java.name
    }
  }

  fun restrictionNotes(context: Context): org.json.JSONArray {
    val notes = org.json.JSONArray()
    if (!batteryOptimizationIgnored(context)) {
      notes.put("battery_optimization")
    }
    val manufacturer = Build.MANUFACTURER.lowercase()
    if (manufacturer.contains("xiaomi") || manufacturer.contains("redmi") ||
      manufacturer.contains("oppo") || manufacturer.contains("realme") ||
      manufacturer.contains("vivo") || manufacturer.contains("huawei") ||
      manufacturer.contains("honor")
    ) {
      notes.put("oem_autostart")
    }
    return notes
  }

  fun hasLocationPermission(context: Context): Boolean =
    permission(context) == "whenInUse" || permission(context) == "always"

  fun emit(name: String, payload: JSONObject, context: Context? = null) {
    val react = reactContext
    if (react != null && react.hasActiveReactInstance() && jsListeners.get() > 0) {
      react.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        ?.emit(name, payload.toWritableMap())
      return
    }
    if (name !in HEADLESS_EVENTS) return
    val target = context ?: react ?: return
    if (LocXConfig.load(target)?.enableHeadless == true) {
      LocXHeadlessTaskService.dispatch(target, name, payload)
    }
  }

  /** Stores the message for `getState().lastError` without emitting an event. */
  fun recordError(context: Context, message: String) {
    LocXStore.prefs(context).edit().putString(LAST_ERROR, message).apply()
  }

  fun error(context: Context?, code: String, message: String, recoverable: Boolean) {
    val target = context ?: reactContext
    if (target != null) recordError(target, message)
    emit(
      "error",
      JSONObject()
        .put("code", code)
        .put("message", message)
        .put("recoverable", recoverable),
      target,
    )
  }

  fun lastError(context: Context): String? =
    LocXStore.prefs(context).getString(LAST_ERROR, null)

  fun locationJson(location: LocationEntity): JSONObject = JSONObject()
    .put("id", location.id)
    .put("latitude", location.latitude)
    .put("longitude", location.longitude)
    .put("accuracy", location.accuracy)
    .put("altitude", location.altitude ?: JSONObject.NULL)
    .put("altitudeAccuracy", location.altitudeAccuracy ?: JSONObject.NULL)
    .put("speed", location.speed ?: JSONObject.NULL)
    .put("heading", location.heading ?: JSONObject.NULL)
    .put("recordedAt", location.recordedAt)
    .put("receivedAt", location.receivedAt)
    .put("mocked", location.mocked)
    .put("provider", location.provider)
    .put("attempts", location.attempts)
    .put("activity", location.activity ?: JSONObject.NULL)
    .put("odometer", location.odometer)
    .put("isMoving", location.isMoving)

  fun entity(
    context: Context,
    location: android.location.Location,
    odometer: Double = odometer(context),
    isMoving: Boolean = isMoving(context),
  ): LocationEntity = LocationEntity(
    id = UUID.randomUUID().toString(),
    latitude = location.latitude,
    longitude = location.longitude,
    accuracy = location.accuracy,
    altitude = if (location.hasAltitude()) location.altitude else null,
    altitudeAccuracy = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      location.hasVerticalAccuracy()) location.verticalAccuracyMeters else null,
    speed = if (location.hasSpeed()) location.speed else null,
    heading = if (location.hasBearing()) location.bearing else null,
    recordedAt = timestamp(location.time),
    receivedAt = now(),
    mocked = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      location.isMock
    } else {
      @Suppress("DEPRECATION") location.isFromMockProvider
    },
    provider = location.provider ?: "fused",
    odometer = odometer,
    isMoving = isMoving,
    activity = activity(context),
  )

  fun locationsJson(locations: List<LocationEntity>): String =
    JSONArray().apply { locations.forEach { put(locationJson(it)) } }.toString()

  /** Technician path API row: `{ location: { coords, timestamp, accuracy, speed, heading } }`. */
  fun pathPointJson(location: LocationEntity): JSONObject {
    val speed = location.speed?.toDouble()?.takeIf { it >= 0 } ?: 0.0
    val heading = location.heading?.toDouble()?.takeIf { it in 0.0..360.0 } ?: -1.0
    return JSONObject().put(
      "location",
      JSONObject()
        .put("coords", JSONObject()
          .put("latitude", location.latitude)
          .put("longitude", location.longitude))
        .put("timestamp", location.recordedAt)
        .put("accuracy", location.accuracy.toDouble())
        .put("speed", speed)
        .put("heading", heading),
    )
  }

  fun timestamp(epochMillis: Long = System.currentTimeMillis()): String =
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }.format(Date(epochMillis))

  fun beforeDays(days: Int): String = timestamp(
    System.currentTimeMillis() - days * 86_400_000L
  )

  fun now(): String = timestamp()

  private fun JSONObject.toWritableMap(): WritableMap = Arguments.createMap().also { map ->
    keys().forEach { key ->
      when (val value = opt(key)) {
        null, JSONObject.NULL -> map.putNull(key)
        is Boolean -> map.putBoolean(key, value)
        is Int -> map.putInt(key, value)
        is Number -> map.putDouble(key, value.toDouble())
        is JSONObject -> map.putMap(key, value.toWritableMap())
        is JSONArray -> map.putArray(key, value.toWritableArray())
        else -> map.putString(key, value.toString())
      }
    }
  }

  private fun JSONArray.toWritableArray(): WritableArray = Arguments.createArray().also { array ->
    for (index in 0 until length()) {
      when (val value = opt(index)) {
        null, JSONObject.NULL -> array.pushNull()
        is Boolean -> array.pushBoolean(value)
        is Int -> array.pushInt(value)
        is Number -> array.pushDouble(value.toDouble())
        is JSONObject -> array.pushMap(value.toWritableMap())
        is JSONArray -> array.pushArray(value.toWritableArray())
        else -> array.pushString(value.toString())
      }
    }
  }
}
