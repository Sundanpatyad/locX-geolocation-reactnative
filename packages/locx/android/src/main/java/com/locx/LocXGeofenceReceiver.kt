package com.locx

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofenceStatusCodes
import com.google.android.gms.location.GeofencingEvent
import org.json.JSONObject

class LocXGeofenceReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val event = GeofencingEvent.fromIntent(intent) ?: return
    if (event.hasError()) {
      LocXRuntime.error(
        context,
        "GEOFENCE_${event.errorCode}",
        GeofenceStatusCodes.getStatusCodeString(event.errorCode),
        true,
      )
      return
    }
    val action = when (event.geofenceTransition) {
      Geofence.GEOFENCE_TRANSITION_ENTER -> "ENTER"
      Geofence.GEOFENCE_TRANSITION_EXIT -> "EXIT"
      Geofence.GEOFENCE_TRANSITION_DWELL -> "DWELL"
      else -> return
    }
    val trigger = event.triggeringLocation
    val location = trigger?.let { LocXRuntime.locationJson(LocXRuntime.entity(context, it)) }
    event.triggeringGeofences.orEmpty().forEach { fence ->
      if (fence.requestId == LocXGeofences.STATIONARY_ID) {
        if (action == "EXIT") LocXLocationService.wake(context, trigger)
        return@forEach
      }
      val stored = LocXGeofences.find(context, fence.requestId)
      LocXRuntime.emit(
        "geofence",
        JSONObject()
          .put("identifier", fence.requestId)
          .put("action", action)
          .put("location", location ?: JSONObject.NULL)
          .put("extras", stored?.optJSONObject("extras") ?: JSONObject())
          .put("timestamp", LocXRuntime.now()),
        context,
      )
    }
  }
}
