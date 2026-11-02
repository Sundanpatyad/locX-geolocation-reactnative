package com.locx

import android.content.Context
import com.google.android.gms.location.Priority
import org.json.JSONObject

internal data class LocXConfig(
  val endpoint: String,
  val headers: Map<String, String> = emptyMap(),
  val method: String = "POST",
  /** `locations` is the locX envelope. `path` matches the technician path API. */
  val payload: String = "locations",
  val accuracy: String = "high",
  val distanceFilterMeters: Float = 25f,
  val intervalMs: Long = 10_000,
  val fastestIntervalMs: Long = 5_000,
  val batchSize: Int = 20,
  val autoSync: Boolean = true,
  val wifiOnly: Boolean = false,
  val stopOnTerminate: Boolean = false,
  val startOnBoot: Boolean = false,
  val maxQueueSize: Int = 10_000,
  val maxAgeDays: Int = 30,
  val retryBaseSeconds: Long = 30,
  val retryMaxSeconds: Long = 3_600,
  val motionEnabled: Boolean = true,
  val stationaryRadiusMeters: Float = 50f,
  val stopTimeoutMinutes: Long = 5,
  val activityRecognition: Boolean = false,
  val enableHeadless: Boolean = false,
  val notificationTitle: String = "Location active",
  val notificationText: String = "LocX is recording your location",
  val notificationChannelName: String = "Location tracking",
) {
  val priority: Int
    get() = when (accuracy) {
      "best", "high" -> Priority.PRIORITY_HIGH_ACCURACY
      "low" -> Priority.PRIORITY_LOW_POWER
      else -> Priority.PRIORITY_BALANCED_POWER_ACCURACY
    }

  fun toJson(): String {
    val json = JSONObject()
      .put("endpoint", endpoint)
      .put("headers", JSONObject(headers))
      .put("method", method)
      .put("payload", payload)
      .put("accuracy", accuracy)
      .put("distanceFilterMeters", distanceFilterMeters)
      .put("intervalMs", intervalMs)
      .put("fastestIntervalMs", fastestIntervalMs)
      .put("batchSize", batchSize)
      .put("autoSync", autoSync)
      .put("wifiOnly", wifiOnly)
      .put("stopOnTerminate", stopOnTerminate)
      .put("startOnBoot", startOnBoot)
      .put("maxQueueSize", maxQueueSize)
      .put("maxAgeDays", maxAgeDays)
      .put("retryBaseSeconds", retryBaseSeconds)
      .put("retryMaxSeconds", retryMaxSeconds)
      .put("enableHeadless", enableHeadless)
    json.put("motion", JSONObject()
      .put("enabled", motionEnabled)
      .put("stationaryRadiusMeters", stationaryRadiusMeters)
      .put("stopTimeoutMinutes", stopTimeoutMinutes)
      .put("activityRecognition", activityRecognition))
    json.put("notification", JSONObject()
      .put("title", notificationTitle)
      .put("text", notificationText)
      .put("channelName", notificationChannelName))
    return json.toString()
  }

  companion object {
    private const val CONFIG = "config"

    fun parse(raw: String): LocXConfig {
      val json = JSONObject(raw)
      val endpoint = json.optString("endpoint").trim()
      require(endpoint.startsWith("https://") || endpoint.startsWith("http://")) {
        "endpoint must be an http(s) URL"
      }
      val method = json.optString("method", "POST").uppercase()
      require(method == "POST" || method == "PUT") { "method must be POST or PUT" }
      val payload = json.optString("payload", "locations")
      require(payload == "locations" || payload == "path") {
        "payload must be locations or path"
      }
      val headersJson = json.optJSONObject("headers") ?: JSONObject()
      val headers = headersJson.keys().asSequence().associateWith { headersJson.getString(it) }
      val notification = json.optJSONObject("notification") ?: JSONObject()
      val motion = json.optJSONObject("motion") ?: JSONObject()
      return LocXConfig(
        endpoint = endpoint,
        headers = headers,
        method = method,
        payload = payload,
        accuracy = json.optString("accuracy", "high"),
        distanceFilterMeters = json.optDouble("distanceFilterMeters", 25.0).toFloat().coerceAtLeast(0f),
        intervalMs = json.optLong("intervalMs", 10_000).coerceAtLeast(1_000),
        fastestIntervalMs = json.optLong("fastestIntervalMs", 5_000).coerceAtLeast(500),
        batchSize = json.optInt("batchSize", 20).coerceIn(1, 500),
        autoSync = json.optBoolean("autoSync", true),
        wifiOnly = json.optBoolean("wifiOnly", false),
        stopOnTerminate = json.optBoolean("stopOnTerminate", false),
        startOnBoot = json.optBoolean("startOnBoot", false),
        maxQueueSize = json.optInt("maxQueueSize", 10_000).coerceAtLeast(1),
        maxAgeDays = json.optInt("maxAgeDays", 30).coerceAtLeast(1),
        retryBaseSeconds = json.optLong("retryBaseSeconds", 30).coerceAtLeast(10),
        retryMaxSeconds = json.optLong("retryMaxSeconds", 3_600).coerceAtLeast(10),
        motionEnabled = motion.optBoolean("enabled", true),
        stationaryRadiusMeters = motion.optDouble("stationaryRadiusMeters", 50.0).toFloat().coerceAtLeast(10f),
        stopTimeoutMinutes = motion.optLong("stopTimeoutMinutes", 5).coerceAtLeast(1),
        activityRecognition = motion.optBoolean("activityRecognition", false),
        enableHeadless = json.optBoolean("enableHeadless", false),
        notificationTitle = notification.optString("title", "Location active"),
        notificationText = notification.optString("text", "LocX is recording your location"),
        notificationChannelName = notification.optString("channelName", "Location tracking"),
      )
    }

    fun save(context: Context, config: LocXConfig) {
      LocXStore.prefs(context).edit().putString(CONFIG, config.toJson()).apply()
    }

    fun load(context: Context): LocXConfig? =
      LocXStore.prefs(context)
        .getString(CONFIG, null)?.let { runCatching { parse(it) }.getOrNull() }
  }
}
