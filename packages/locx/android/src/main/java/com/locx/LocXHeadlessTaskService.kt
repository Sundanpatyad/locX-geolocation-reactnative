package com.locx

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import org.json.JSONObject

class LocXHeadlessTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = intent?.extras ?: return null
    val name = extras.getString(EXTRA_NAME) ?: return null
    val data = Arguments.createMap().apply {
      putString("name", name)
      putString("params", extras.getString(EXTRA_PARAMS) ?: "{}")
    }
    return HeadlessJsTaskConfig(TASK_NAME, data, TASK_TIMEOUT_MS, true)
  }

  companion object {
    const val TASK_NAME = "LocXHeadlessTask"
    private const val EXTRA_NAME = "name"
    private const val EXTRA_PARAMS = "params"
    private const val TASK_TIMEOUT_MS = 60_000L

    fun dispatch(context: Context, name: String, payload: JSONObject) {
      val app = context.applicationContext
      val intent = Intent(app, LocXHeadlessTaskService::class.java).putExtras(Bundle().apply {
        putString(EXTRA_NAME, name)
        putString(EXTRA_PARAMS, payload.toString())
      })
      Handler(Looper.getMainLooper()).post {
        try {
          acquireWakeLockNow(app)
          app.startService(intent)
        } catch (error: Exception) {
          // Android 8+ refuses background service starts unless the app is in a
          // temporary allowlist (geofence/activity broadcasts) or runs a foreground service.
          LocXRuntime.recordError(app, "Headless task not started: ${error.message}")
        }
      }
    }
  }
}
