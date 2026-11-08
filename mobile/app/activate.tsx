import { Redirect, useLocalSearchParams } from "expo-router";

/** Invitation entry for the existing scheme; the native nehgz scheme comes with HR integration. */
export default function ActivateInvitation() {
  const { code } = useLocalSearchParams<{ code?: string | string[] }>();
  const value = Array.isArray(code) ? code[0] : code;
  return <Redirect href={{ pathname: "/(hub)/(tabs)/hr/activate", params: value ? { code: value } : {} }} />;
}
