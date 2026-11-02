package com.locx

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class LocXPackage : BaseReactPackage() {
  override fun getModule(
    name: String,
    reactContext: ReactApplicationContext,
  ): NativeModule? = if (name == LocXModule.NAME) LocXModule(reactContext) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider =
    ReactModuleInfoProvider {
      mapOf(
        LocXModule.NAME to ReactModuleInfo(
          LocXModule.NAME,
          LocXModule.NAME,
          false,
          false,
          false,
          true,
        )
      )
    }
}
