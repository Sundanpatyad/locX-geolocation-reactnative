package com.locx

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

internal object LocXStore {
  private const val SECURE_PREFS = "locx-secure"
  private const val FALLBACK_PREFS = "locx"

  @Volatile private var cached: SharedPreferences? = null

  fun prefs(context: Context): SharedPreferences {
    cached?.let { return it }
    synchronized(this) {
      cached?.let { return it }
      val app = context.applicationContext
      val created = try {
        val masterKey = MasterKey.Builder(app)
          .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
          .build()
        EncryptedSharedPreferences.create(
          app,
          SECURE_PREFS,
          masterKey,
          EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
          EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
      } catch (_: Exception) {
        app.getSharedPreferences(FALLBACK_PREFS, Context.MODE_PRIVATE)
      }
      cached = created
      return created
    }
  }
}
