module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo (SDK 54) auto-adds react-native-worklets/plugin (Reanimated 4)
    // exactly once and last — do NOT add it manually or it runs multiple times and
    // breaks the NativeWind JSX transform.
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
  };
};
