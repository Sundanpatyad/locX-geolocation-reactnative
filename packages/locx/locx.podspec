require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "locx"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://github.com/Sundanpatyad/locX-geolocation-reactnative"
  s.license      = package["license"]
  s.authors      = { "Sundan Sharma" => "https://github.com/Sundanpatyad" }
  s.platforms    = { :ios => "14.0" }
  s.source       = { :git => "https://github.com/Sundanpatyad/locX-geolocation-reactnative.git", :tag => "#{s.version}" }

  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.resource_bundles = {
    "LocXPrivacy" => ["ios/PrivacyInfo.xcprivacy"]
  }
  s.frameworks = "CoreLocation", "CoreMotion", "Network", "UIKit"
  s.libraries = "sqlite3"
  s.swift_version = "5.0"
  s.pod_target_xcconfig = {
    "CLANG_CXX_LANGUAGE_STANDARD" => "c++17",
    "DEFINES_MODULE" => "YES"
  }

  install_modules_dependencies(s)
end
