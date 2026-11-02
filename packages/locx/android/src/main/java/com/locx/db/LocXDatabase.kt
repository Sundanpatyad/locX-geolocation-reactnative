package com.locx.db

import android.content.Context
import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Entity(tableName = "locations", primaryKeys = ["id"])
data class LocationEntity(
  val id: String,
  val latitude: Double,
  val longitude: Double,
  val accuracy: Float,
  val altitude: Double?,
  val altitudeAccuracy: Float?,
  val speed: Float?,
  val heading: Float?,
  val recordedAt: String,
  val receivedAt: String,
  val mocked: Boolean,
  val provider: String,
  val attempts: Int = 0,
  @ColumnInfo(defaultValue = "0") val odometer: Double = 0.0,
  @ColumnInfo(defaultValue = "1") val isMoving: Boolean = true,
  val activity: String? = null,
)

@Dao
interface LocationDao {
  @Insert(onConflict = OnConflictStrategy.REPLACE)
  suspend fun insert(location: LocationEntity)

  @Query("SELECT * FROM locations ORDER BY recordedAt ASC LIMIT :limit")
  suspend fun oldest(limit: Int): List<LocationEntity>

  @Query("SELECT * FROM locations ORDER BY recordedAt DESC LIMIT 1")
  suspend fun latest(): LocationEntity?

  @Query("SELECT COUNT(*) FROM locations")
  suspend fun count(): Int

  @Query("DELETE FROM locations WHERE id IN (:ids)")
  suspend fun delete(ids: List<String>)

  @Query("DELETE FROM locations")
  suspend fun clear()

  @Query("UPDATE locations SET attempts = attempts + 1 WHERE id IN (:ids)")
  suspend fun incrementAttempts(ids: List<String>)

  @Query("DELETE FROM locations WHERE recordedAt < :before")
  suspend fun deleteBefore(before: String)

  @Query(
    "DELETE FROM locations WHERE id IN " +
      "(SELECT id FROM locations ORDER BY recordedAt ASC LIMIT :amount)"
  )
  suspend fun trimOldest(amount: Int)
}

@Database(entities = [LocationEntity::class], version = 2, exportSchema = false)
abstract class LocXDatabase : RoomDatabase() {
  abstract fun locations(): LocationDao

  companion object {
    @Volatile private var instance: LocXDatabase? = null

    private val MIGRATION_1_2 = object : Migration(1, 2) {
      override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL("ALTER TABLE locations ADD COLUMN odometer REAL NOT NULL DEFAULT 0")
        db.execSQL("ALTER TABLE locations ADD COLUMN isMoving INTEGER NOT NULL DEFAULT 1")
        db.execSQL("ALTER TABLE locations ADD COLUMN activity TEXT")
      }
    }

    fun get(context: Context): LocXDatabase =
      instance ?: synchronized(this) {
        instance ?: Room.databaseBuilder(
          context.applicationContext,
          LocXDatabase::class.java,
          "locx-locations.db",
        ).addMigrations(MIGRATION_1_2).build().also { instance = it }
      }
  }
}
