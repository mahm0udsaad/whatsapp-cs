import { Component, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { captureException } from "../lib/observability";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    captureException(error, { componentStack: info.componentStack ?? null });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
          backgroundColor: "#fff",
        }}
      >
        <Text
          style={{
            fontSize: 18,
            fontWeight: "600",
            marginBottom: 8,
            textAlign: "center",
          }}
        >
          حدث خطأ غير متوقع
        </Text>
        <Text
          style={{
            color: "#6b7280",
            textAlign: "center",
            marginBottom: 24,
          }}
        >
          {this.state.error.message}
        </Text>
        <Pressable
          onPress={this.reset}
          style={{
            backgroundColor: "#1e3a8a",
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>
            إعادة المحاولة
          </Text>
        </Pressable>
      </View>
    );
  }
}
