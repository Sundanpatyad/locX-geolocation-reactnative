const {
  AndroidConfig,
  withAndroidManifest,
  withInfoPlist,
} = require('@expo/config-plugins');

const ANDROID_PERMISSIONS = [
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_LOCATION',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.WAKE_LOCK',
];

function ensureChild(collection, androidName) {
  return collection.some(item => item.$?.['android:name'] === androidName);
}

function withLocX(config, props = {}) {
  const alwaysMessage =
    props.alwaysPermission ??
    'Allow this app to use your location in the background.';
  const whenInUseMessage =
    props.whenInUsePermission ??
    'Allow this app to use your location while you use the app.';

  config = withInfoPlist(config, value => {
    value.modResults.NSLocationWhenInUseUsageDescription = whenInUseMessage;
    value.modResults.NSLocationAlwaysAndWhenInUseUsageDescription =
      alwaysMessage;
    if (props.motionPermission) {
      value.modResults.NSMotionUsageDescription = props.motionPermission;
    }
    const modes = new Set(value.modResults.UIBackgroundModes ?? []);
    modes.add('location');
    value.modResults.UIBackgroundModes = [...modes];
    return value;
  });

  config = withAndroidManifest(config, value => {
    for (const permission of ANDROID_PERMISSIONS) {
      AndroidConfig.Permissions.addPermission(value.modResults, permission);
    }
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      value.modResults,
    );
    application.service = application.service ?? [];
    if (props.activityRecognition) {
      AndroidConfig.Permissions.addPermission(
        value.modResults,
        'android.permission.ACTIVITY_RECOGNITION',
      );
      AndroidConfig.Permissions.addPermission(
        value.modResults,
        'com.google.android.gms.permission.ACTIVITY_RECOGNITION',
      );
    }
    if (!ensureChild(application.service, 'com.locx.LocXLocationService')) {
      application.service.push({
        $: {
          'android:name': 'com.locx.LocXLocationService',
          'android:exported': 'false',
          'android:foregroundServiceType': 'location',
        },
      });
    }
    application.receiver = application.receiver ?? [];
    if (!ensureChild(application.receiver, 'com.locx.LocXBootReceiver')) {
      application.receiver.push({
        $: {
          'android:name': 'com.locx.LocXBootReceiver',
          'android:enabled': 'true',
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              {$: {'android:name': 'android.intent.action.BOOT_COMPLETED'}},
              {$: {'android:name': 'android.intent.action.MY_PACKAGE_REPLACED'}},
            ],
          },
        ],
      });
    }
    return value;
  });

  return config;
}

module.exports = withLocX;
