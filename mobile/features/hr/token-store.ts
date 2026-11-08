import * as SecureStore from "expo-secure-store";

export interface HrTokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}

const HR_TOKEN_KEY = "nehgz.hr.employee_token.v1";

/** The HR bearer token identifies an employee and phone, so it never enters AsyncStorage. */
export const secureHrTokenStore: HrTokenStore = {
  get: () => SecureStore.getItemAsync(HR_TOKEN_KEY),
  set: (token) => SecureStore.setItemAsync(HR_TOKEN_KEY, token),
  clear: () => SecureStore.deleteItemAsync(HR_TOKEN_KEY),
};

