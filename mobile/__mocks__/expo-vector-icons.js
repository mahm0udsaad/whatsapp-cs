// Stub for @expo/vector-icons. Real icons require expo-font init which isn't
// available under react-test-renderer. Each named export returns a no-op
// component so component trees render without throwing.
const React = require("react");
const { Text } = require("react-native");

function StubIcon(props) {
  return React.createElement(Text, null, props.name || "");
}

module.exports = new Proxy(
  { __esModule: true, default: StubIcon },
  {
    get: () => StubIcon,
  }
);
