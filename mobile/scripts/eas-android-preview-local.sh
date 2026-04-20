#!/usr/bin/env sh
set -eu

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"

case " ${JAVA_TOOL_OPTIONS:-} " in
  *" -Djava.net.preferIPv4Stack=true "*) ;;
  *) export JAVA_TOOL_OPTIONS="${JAVA_TOOL_OPTIONS:-} -Djava.net.preferIPv4Stack=true" ;;
esac

case " ${GRADLE_OPTS:-} " in
  *" -Dorg.gradle.internal.http.connectionTimeout="*) ;;
  *) export GRADLE_OPTS="${GRADLE_OPTS:-} -Dorg.gradle.internal.http.connectionTimeout=120000" ;;
esac

case " ${GRADLE_OPTS:-} " in
  *" -Dorg.gradle.internal.http.socketTimeout="*) ;;
  *) export GRADLE_OPTS="${GRADLE_OPTS:-} -Dorg.gradle.internal.http.socketTimeout=120000" ;;
esac

exec eas build --platform android --profile preview --local "$@"
