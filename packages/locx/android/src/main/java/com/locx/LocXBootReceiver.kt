package com.locx

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class LocXBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
      intent.action != Intent.ACTION_MY_PACKAGE_REPLACED
    ) return
    LocXGeofences.restore(context)
    val config = LocXConfig.load(context) ?: return
    if (!config.startOnBoot || !LocXRuntime.isTracking(context) || !LocXRuntime.hasLocationPermission(context)) {
      if (config.autoSync) LocXUploadWorker.enqueue(context, config)
      return
    }
    try {
      ContextCompat.startForegroundService(
        context,
        Intent(context, LocXLocationService::class.java)
          .setAction(LocXLocationService.ACTION_START),
      )
    } catch (error: Exception) {
      LocXRuntime.error(
        context,
        "BOOT_START_FAILED",
        error.message ?: "Android did not allow background service startup",
        true,
      )
      LocXUploadWorker.enqueue(context, config)
    }
  }
}
