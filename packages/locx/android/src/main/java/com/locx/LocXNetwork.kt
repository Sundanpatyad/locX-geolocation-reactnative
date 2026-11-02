package com.locx

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import java.util.concurrent.atomic.AtomicBoolean

internal object LocXNetwork {
  private val registered = AtomicBoolean(false)
  private var callback: ConnectivityManager.NetworkCallback? = null

  fun register(context: Context) {
    if (!registered.compareAndSet(false, true)) return
    val app = context.applicationContext
    val manager = app.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: run {
      registered.set(false)
      return
    }
    val networkCallback = object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) {
        val config = LocXConfig.load(app) ?: return
        if (config.autoSync) LocXUploadWorker.enqueue(app, config)
      }
    }
    callback = networkCallback
    val request = NetworkRequest.Builder()
      .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
      .build()
    try {
      manager.registerNetworkCallback(request, networkCallback)
    } catch (_: Exception) {
      registered.set(false)
      callback = null
    }
  }
}
