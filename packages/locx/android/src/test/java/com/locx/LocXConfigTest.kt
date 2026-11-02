package com.locx

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LocXConfigTest {
  @Test
  fun parseRequiresHttpEndpoint() {
    try {
      LocXConfig.parse("""{"endpoint":"ftp://example.test"}""")
      throw AssertionError("expected parse to fail")
    } catch (error: IllegalArgumentException) {
      assertTrue(error.message!!.contains("http"))
    }
  }

  @Test
  fun parseAppliesDefaultsAndBounds() {
    val config = LocXConfig.parse(
      """{"endpoint":"https://api.example.test/locations","distanceFilterMeters":-4,"batchSize":0}""",
    )
    assertEquals("https://api.example.test/locations", config.endpoint)
    assertEquals(0f, config.distanceFilterMeters)
    assertEquals(1, config.batchSize)
    assertTrue(config.autoSync)
    assertFalse(config.stopOnTerminate)
    assertEquals("POST", config.method)
  }

  @Test
  fun roundTripPreservesAuthHeaders() {
    val config = LocXConfig.parse(
      JSONObject()
        .put("endpoint", "https://api.example.test/locations")
        .put("headers", JSONObject().put("Authorization", "Bearer secret"))
        .put("method", "put")
        .put("wifiOnly", true)
        .toString(),
    )
    val restored = LocXConfig.parse(config.toJson())
    assertEquals("PUT", restored.method)
    assertEquals("Bearer secret", restored.headers["Authorization"])
    assertTrue(restored.wifiOnly)
  }

  @Test
  fun motionDefaultsTurnStationaryModeOn() {
    val config = LocXConfig.parse("""{"endpoint":"https://api.example.test/locations"}""")
    assertTrue(config.motionEnabled)
    assertEquals(50f, config.stationaryRadiusMeters)
    assertEquals(5L, config.stopTimeoutMinutes)
    assertFalse(config.activityRecognition)
    assertFalse(config.enableHeadless)
  }

  @Test
  fun motionAndHeadlessSurviveRoundTrip() {
    val config = LocXConfig.parse(
      JSONObject()
        .put("endpoint", "https://api.example.test/locations")
        .put("enableHeadless", true)
        .put("motion", JSONObject()
          .put("enabled", false)
          .put("stationaryRadiusMeters", 2)
          .put("stopTimeoutMinutes", 0)
          .put("activityRecognition", true))
        .toString(),
    )
    val restored = LocXConfig.parse(config.toJson())
    assertFalse(restored.motionEnabled)
    assertEquals(10f, restored.stationaryRadiusMeters)
    assertEquals(1L, restored.stopTimeoutMinutes)
    assertTrue(restored.activityRecognition)
    assertTrue(restored.enableHeadless)
  }
}
