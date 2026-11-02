package com.locx

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.locx.db.LocXDatabase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

class LocXUploadWorker(
  context: Context,
  parameters: WorkerParameters,
) : CoroutineWorker(context, parameters) {
  override suspend fun doWork(): Result {
    val config = LocXConfig.load(applicationContext) ?: return Result.failure()
    val dao = LocXDatabase.get(applicationContext).locations()
    val batch = dao.oldest(config.batchSize)
    if (batch.isEmpty()) return Result.success()
    val ids = batch.map { it.id }

    return try {
      val body = if (config.payload == "path") {
        JSONObject().put("location", JSONArray().apply {
          batch.forEach { put(LocXRuntime.pathPointJson(it)) }
        })
      } else {
        JSONObject().put("locations", JSONArray().apply {
          batch.forEach { put(LocXRuntime.locationJson(it)) }
        })
      }
      val status = upload(config, body)
      if (status in 200..299) {
        dao.delete(ids)
        val remaining = dao.count()
        LocXRuntime.emit("upload", JSONObject()
          .put("accepted", batch.size)
          .put("status", status)
          .put("remaining", remaining), applicationContext)
        if (remaining > 0) enqueue(applicationContext, config, append = true)
        Result.success()
      } else {
        dao.incrementAttempts(ids)
        LocXRuntime.error(applicationContext, "HTTP_$status", "Upload returned HTTP $status", true)
        if (status == 408 || status == 429 || status >= 500) Result.retry() else Result.failure()
      }
    } catch (error: Exception) {
      dao.incrementAttempts(ids)
      LocXRuntime.error(applicationContext, "UPLOAD_FAILED", error.message ?: "Upload failed", true)
      Result.retry()
    }
  }

  private suspend fun upload(config: LocXConfig, body: JSONObject): Int =
    withContext(Dispatchers.IO) {
      val connection = (URL(config.endpoint).openConnection() as HttpURLConnection).apply {
        requestMethod = config.method
        connectTimeout = 15_000
        readTimeout = 30_000
        doOutput = true
        setRequestProperty("Content-Type", "application/json")
        config.headers.forEach { (key, value) -> setRequestProperty(key, value) }
      }
      try {
        connection.outputStream.bufferedWriter(Charsets.UTF_8).use {
          it.write(body.toString())
        }
        connection.responseCode
      } finally {
        connection.disconnect()
      }
    }

  companion object {
    private const val UNIQUE_WORK = "locx-upload"

    internal fun enqueue(
      context: Context,
      config: LocXConfig,
      replace: Boolean = false,
      append: Boolean = false,
    ) {
      val constraints = Constraints.Builder()
        .setRequiredNetworkType(
          if (config.wifiOnly) NetworkType.UNMETERED else NetworkType.CONNECTED
        )
        .build()
      val request = OneTimeWorkRequestBuilder<LocXUploadWorker>()
        .setConstraints(constraints)
        .setBackoffCriteria(
          BackoffPolicy.EXPONENTIAL,
          config.retryBaseSeconds.coerceIn(10, 18_000),
          TimeUnit.SECONDS,
        )
        .build()
      WorkManager.getInstance(context).enqueueUniqueWork(
        UNIQUE_WORK,
        when {
          append -> ExistingWorkPolicy.APPEND_OR_REPLACE
          replace -> ExistingWorkPolicy.REPLACE
          else -> ExistingWorkPolicy.KEEP
        },
        request,
      )
    }

    fun cancel(context: Context) {
      WorkManager.getInstance(context).cancelUniqueWork(UNIQUE_WORK)
    }
  }
}
