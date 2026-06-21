const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, {
  input: "./global.css",
  // css-interop 0.2.3's dev-only "virtual module" path monkey-patches Metro
  // internals (graph._haste / _fileSystem / bundler.transformFile) that changed
  // in Metro 0.83 (Expo SDK 54). The patch fails silently, so in dev the
  // compiled stylesheet is empty and every className renders unstyled (prod
  // export was fine because it writes the CSS to disk). forceWriteFileSystem
  // skips that path and writes the real compiled CSS in dev too. Trade-off:
  // CSS edits need a manual reload instead of fast-refresh.
  forceWriteFileSystem: true,
});
