package com.locx

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import com.google.android.gms.tasks.Tasks
import org.json.JSONArray
import org.json.JSONObject

internal object LocXGeofences {
  const val STATIONARY_ID = "locx:stationary"
  /** Android allows 100 active geofences per app; one is kept for the stationary fence. */
  const val MAX_USER_GEOFENCES = 99
  private const val STORE = "geofences"
  private const val DEFAULT_LOITERING_MS = 300_000

  fun list(context: Context): JSONArray =
    LocXStore.prefs(context).getString(STORE, null)
      ?.let { runCatching { JSONArray(it) }.getOrNull() }
      ?: JSONArray()

  fun find(context: Context, identifier: String): JSONObject? {
    val stored = list(context)
    for (index in 0 until stored.length()) {
      val item = stored.getJSONObject(index)
      if (item.getString("identifier") == identifier) return item
    }
    return null
  }

  /** Blocking: call from a background thread. */
  fun add(context: Context, incoming: JSONArray) {
    val byId = linkedMapOf<String, JSONObject>()
    val stored = list(context)
    for (index in 0 until stored.length()) {
      val item = stored.getJSONObject(index)
      byId[item.getString("identifier")] = item
    }
    val added = (0 until incoming.length()).map { normalize(incoming.getJSONObject(it)) }
    added.forEach { byId[it.getString("identifier")] = it }
    require(byId.size <= MAX_USER_GEOFENCES) {
      "Android supports at most $MAX_USER_GEOFENCES geofences (requested ${byId.size})"
    }
    register(context, added)
    save(context, byId.values)
  }

  /** Blocking: call from a background thread. An empty list removes every user geofence. */
  fun remove(context: Context, identifiers: List<String>) {
    val stored = list(context)
    val keep = mutableListOf<JSONObject>()
    val removed = mutableListOf<String>()
    for (index in 0 until stored.length()) {
      val item = stored.getJSONObject(index)
      val id = item.getString("identifier")
      if (identifiers.isEmpty() || id in identifiers) removed += id else keep += item
    }
    if (removed.isNotEmpty()) {
      Tasks.await(LocationServices.getGeofencingClient(context).removeGeofences(removed))
    }
    save(context, keep)
  }

  /** Re-registers stored geofences; Android drops them on reboot, app update and location toggle. */
  fun restore(context: Context) {
    val stored = list(context)
    if (stored.length() == 0 || !LocXRuntime.hasLocationPermission(context)) return
    try {
      register(context, (0 until stored.length()).map { stored.getJSONObject(it) }, blocking = false)
    } catch (error: Exception) {
      LocXRuntime.recordError(context, "Geofence restore failed: ${error.message}")
    }
  }

  @SuppressLint("MissingPermission")
  fun setStationary(context: Context, latitude: Double, longitude: Double, radius: Float) {
    if (!LocXRuntime.hasLocationPermission(context)) return
    val fence = Geofence.Builder()
      .setRequestId(STATIONARY_ID)
      .setCircularRegion(latitude, longitude, radius)
      .setExpirationDuration(Geofence.NEVER_EXPIRE)
      .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_EXIT)
      .build()
    val request = GeofencingRequest.Builder().setInitialTrigger(0).addGeofence(fence).build()
    try {
      LocationServices.getGeofencingClient(context)
        .addGeofences(request, pendingIntent(context))
        .addOnFailureListener {
          LocXRuntime.recordError(context, "Stationary geofence failed: ${it.message}")
        }
    } catch (error: SecurityException) {
      LocXRuntime.recordError(context, "Stationary geofence failed: ${error.message}")
    }
  }

  fun clearStationary(context: Context) {
    LocationServices.getGeofencingClient(context).removeGeofences(listOf(STATIONARY_ID))
  }

  fun pendingIntent(context: Context): PendingIntent {
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
    return PendingIntent.getBroadcast(
      context.applicationContext,
      REQUEST_CODE,
      Intent(context.applicationContext, LocXGeofenceReceiver::class.java),
      flags,
    )
  }

  @SuppressLint("MissingPermission")
  private fun register(context: Context, geofences: List<JSONObject>, blocking: Boolean = true) {
    if (geofences.isEmpty()) return
    require(LocXRuntime.hasLocationPermission(context)) { "Location permission is not granted" }
    var initialTrigger = 0
    val fences = geofences.map { item ->
      var transitions = 0
      if (item.optBoolean("notifyOnEntry", true)) {
        transitions = transitions or Geofence.GEOFENCE_TRANSITION_ENTER
        initialTrigger = initialTrigger or GeofencingRequest.INITIAL_TRIGGER_ENTER
      }
      if (item.optBoolean("notifyOnExit", true)) {
        transitions = transitions or Geofence.GEOFENCE_TRANSITION_EXIT
      }
      if (item.optBoolean("notifyOnDwell", false)) {
        transitions = transitions or Geofence.GEOFENCE_TRANSITION_DWELL
        initialTrigger = initialTrigger or GeofencingRequest.INITIAL_TRIGGER_DWELL
      }
      Geofence.Builder()
        .setRequestId(item.getString("identifier"))
        .setCircularRegion(
          item.getDouble("latitude"),
          item.getDouble("longitude"),
          item.getDouble("radius").toFloat(),
        )
        .setExpirationDuration(Geofence.NEVER_EXPIRE)
        .setTransitionTypes(transitions)
        .setLoiteringDelay(item.optInt("loiteringDelayMs", DEFAULT_LOITERING_MS))
        .build()
    }
    val request = GeofencingRequest.Builder()
      .setInitialTrigger(initialTrigger)
      .addGeofences(fences)
      .build()
    val task = LocationServices.getGeofencingClient(context).addGeofences(request, pendingIntent(context))
    if (blocking) Tasks.await(task)
  }

  private fun normalize(raw: JSONObject): JSONObject {
    val identifier = raw.optString("identifier").trim()
    require(identifier.isNotEmpty()) { "Geofence identifier is required" }
    require(!identifier.startsWith("locx:")) { "Geofence identifiers starting with locx: are reserved" }
    val latitude = raw.getDouble("latitude")
    val longitude = raw.getDouble("longitude")
    val radius = raw.getDouble("radius")
    require(latitude in -90.0..90.0 && longitude in -180.0..180.0) {
      "Geofence $identifier has invalid coordinates"
    }
    require(radius > 0) { "Geofence $identifier radius must be positive" }
    val entry = raw.optBoolean("notifyOnEntry", true)
    val exit = raw.optBoolean("notifyOnExit", true)
    val dwell = raw.optBoolean("notifyOnDwell", false)
    require(entry || exit || dwell) { "Geofence $identifier has no transitions enabled" }
    return JSONObject()
      .put("identifier", identifier)
      .put("latitude", latitude)
      .put("longitude", longitude)
      .put("radius", radius)
      .put("notifyOnEntry", entry)
      .put("notifyOnExit", exit)
      .put("notifyOnDwell", dwell)
      .put("loiteringDelayMs", raw.optInt("loiteringDelayMs", DEFAULT_LOITERING_MS).coerceAtLeast(0))
      .put("extras", raw.optJSONObject("extras") ?: JSONObject())
  }

  private fun save(context: Context, items: Collection<JSONObject>) {
    LocXStore.prefs(context).edit()
      .putString(STORE, JSONArray().apply { items.forEach { put(it) } }.toString())
      .apply()
  }

  private const val REQUEST_CODE = 7620
}
