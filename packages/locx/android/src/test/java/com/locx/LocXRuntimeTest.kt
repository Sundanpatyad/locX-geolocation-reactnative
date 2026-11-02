package com.locx

import com.locx.db.LocationEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LocXRuntimeTest {
  @Test
  fun locationJsonContainsStableContractKeys() {
    val json = LocXRuntime.locationJson(
      LocationEntity(
        id = "11111111-1111-1111-1111-111111111111",
        latitude = 28.6139,
        longitude = 77.209,
        accuracy = 12.5f,
        altitude = 214.0,
        altitudeAccuracy = 5.0f,
        speed = 2.1f,
        heading = 182.0f,
        recordedAt = "2026-10-01T12:00:00.000Z",
        receivedAt = "2026-10-01T12:00:01.000Z",
        mocked = false,
        provider = "fused",
        attempts = 3,
      ),
    )
    assertEquals("11111111-1111-1111-1111-111111111111", json.getString("id"))
    assertEquals(28.6139, json.getDouble("latitude"), 0.0001)
    assertEquals("fused", json.getString("provider"))
    assertFalse(json.getBoolean("mocked"))
    assertEquals(3, json.getInt("attempts"))
    assertTrue(json.has("activity"))
    assertTrue(json.has("recordedAt"))
    assertTrue(json.has("receivedAt"))
  }

  @Test
  fun beforeDaysIsIsoUtc() {
    val stamp = LocXRuntime.beforeDays(1)
    assertTrue(stamp.endsWith("Z"))
    assertTrue(stamp.contains("T"))
  }
}
