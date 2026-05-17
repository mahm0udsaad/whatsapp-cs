import {
  ActivityIndicator as RNActivityIndicator,
  FlatList as RNFlatList,
  Image as RNImage,
  ImageBackground as RNImageBackground,
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Pressable as RNPressable,
  ScrollView as RNScrollView,
  Switch as RNSwitch,
  Text as RNText,
  TextInput as RNTextInput,
  View as RNView,
  VirtualizedList as RNVirtualizedList,
} from "react-native";
import { SafeAreaView as RNSafeAreaView } from "react-native-safe-area-context";
import { cssInterop, remapProps } from "nativewind";

export const View = cssInterop(RNView, { className: "style" });
export const Text = cssInterop(RNText, { className: "style" });
export const Pressable = cssInterop(RNPressable, { className: "style" });
export const Image = cssInterop(RNImage, { className: "style" });
export const Switch = cssInterop(RNSwitch, { className: "style" });
export const ActivityIndicator = cssInterop(RNActivityIndicator, {
  className: { target: "style", nativeStyleToProp: { color: true } },
});
export const ScrollView = cssInterop(RNScrollView, {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
});
export const TextInput = cssInterop(RNTextInput, {
  className: { target: "style", nativeStyleToProp: { textAlign: true } },
});
export const SafeAreaView = cssInterop(RNSafeAreaView, {
  className: "style",
});

export const FlatList = remapProps(RNFlatList, {
  className: "style",
  ListFooterComponentClassName: "ListFooterComponentStyle",
  ListHeaderComponentClassName: "ListHeaderComponentStyle",
  columnWrapperClassName: "columnWrapperStyle",
  contentContainerClassName: "contentContainerStyle",
});

export const KeyboardAvoidingView = remapProps(RNKeyboardAvoidingView, {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
});

export const ImageBackground = remapProps(RNImageBackground, {
  className: "style",
  imageClassName: "imageStyle",
});

export const VirtualizedList = remapProps(RNVirtualizedList, {
  className: "style",
  ListFooterComponentClassName: "ListFooterComponentStyle",
  ListHeaderComponentClassName: "ListHeaderComponentStyle",
  contentContainerClassName: "contentContainerStyle",
});
