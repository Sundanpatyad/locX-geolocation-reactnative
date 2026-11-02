module.exports = {
  dependency: {
    platforms: {
      android: {
        sourceDir: './android',
        packageImportPath: 'import com.locx.LocXPackage;',
        packageInstance: 'new LocXPackage()',
      },
      ios: {
        podspecPath: require('path').join(__dirname, 'locx.podspec'),
      },
    },
  },
};
