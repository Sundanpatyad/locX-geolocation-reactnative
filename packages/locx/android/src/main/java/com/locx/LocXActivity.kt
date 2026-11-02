package com.locx

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.DetectedActivity
import org.json.JSONObject

internal object LocXActivity {
  private const val REQUEST_CODE = 7621
  private val TYPES = listOf(
    DetectedActivity.STILL,
    DetectedActivity.WALKING,
    DetectedActivity.RUNNING,
    DetectedActivity.ON_BICYCLE,
    DetectedActivity.IN_VEHICLE,
  )

  fun hasPermission(context: Context): Boolean {
    val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      Manifest.permission.ACTIVITY_RECOGNITION
    } else {
      "com.google.android.gms.permission.ACTIVITY_RECOGNITION"
    }
    return ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
  }

  @SuppressLint("MissingPermission")
  fun start(context: Context) {
    if (!hasPermission(context)) {
      LocXRuntime.recordError(context, "Activity recognition permission is not granted")
      return
    }
    val request = ActivityTransitionRequest(TYPES.map {
      ActivityTransition.Builder()
        .setActivityType(it)
        .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER)
        .build()
    })
    ActivityRecognition.getClient(context)
      .requestActivityTransitionUpdates(request, pendingIntent(context))
      .addOnFailureListener {
        LocXRuntime.recordError(context, "Activity recognition failed: ${it.message}")
      }
  }

  @SuppressLint("MissingPermission")
  fun stop(context: Context) {
    if (!hasPermission(context)) return
    ActivityRecognition.getClient(context).removeActivityTransitionUpdates(pendingIntent(context))
  }

  fun name(type: Int): String = when (type) {
    DetectedActivity.STILL -> "still"
    DetectedActivity.WALKING -> "walking"
    DetectedActivity.RUNNING -> "running"
    DetectedActivity.ON_FOOT -> "on_foot"
    DetectedActivity.ON_BICYCLE -> "on_bicycle"
    DetectedActivity.IN_VEHICLE -> "in_vehicle"
    else -> "unknown"
  }

  private fun pendingIntent(context: Context): PendingIntent {
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
    return PendingIntent.getBroadcast(
      context.applicationContext,
      REQUEST_CODE,
      Intent(context.applicationContext, LocXActivityReceiver::class.java),
      flags,
    )
  }
}

class LocXActivityReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!ActivityTransitionResult.hasResult(intent)) return
    val latest = ActivityTransitionResult.extractResult(intent)
      ?.transitionEvents
      ?.lastOrNull { it.transitionType == ActivityTransition.ACTIVITY_TRANSITION_ENTER }
      ?: return
    val activity = LocXActivity.name(latest.activityType)
    LocXRuntime.setActivity(context, activity)
    LocXRuntime.emit(
      "activitychange",
      JSONObject().put("activity", activity).put("confidence", 100),
      context,
    )
    if (activity != "still" && activity != "unknown") LocXLocationService.wake(context, null)
  }
}
