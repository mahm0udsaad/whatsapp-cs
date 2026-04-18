module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo", "nativewind/babel"],
    // react-native-reanimated/plugin must be the LAST plugin per RN docs.
    plugins: ["react-native-reanimated/plugin"],
  };
};
