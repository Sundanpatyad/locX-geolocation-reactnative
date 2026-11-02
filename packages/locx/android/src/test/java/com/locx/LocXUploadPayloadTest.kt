package com.locx

import com.locx.db.LocationEntity
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test

class LocXUploadPayloadTest {
  @Test
  fun batchEnvelopeUsesLocationsArray() {
    val point = LocXRuntime.locationJson(
      LocationEntity(
        id = "abc",
        latitude = 1.0,
        longitude = 2.0,
        accuracy = 5f,
        altitude = null,
        altitudeAccuracy = null,
        speed = null,
        heading = null,
        recordedAt = "2026-10-01T00:00:00.000Z",
        receivedAt = "2026-10-01T00:00:01.000Z",
        mocked = true,
        provider = "fused",
        attempts = 1,
      ),
    )
    val body = JSONObject().put("locations", JSONArray().put(point))
    assertEquals(1, body.getJSONArray("locations").length())
    assertEquals("abc", body.getJSONArray("locations").getJSONObject(0).getString("id"))
    assertEquals(true, body.getJSONArray("locations").getJSONObject(0).getBoolean("mocked"))
  }
}
