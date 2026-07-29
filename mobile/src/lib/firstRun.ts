import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const FIRST_RUN_KEY = 'mt_first_run_source_contract_v1';

export async function hasCompletedFirstRun(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      return globalThis.localStorage?.getItem(FIRST_RUN_KEY) === 'complete';
    }
    return (await SecureStore.getItemAsync(FIRST_RUN_KEY)) === 'complete';
  } catch {
    return false;
  }
}

export async function completeFirstRun(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(FIRST_RUN_KEY, 'complete');
      return;
    }
    await SecureStore.setItemAsync(FIRST_RUN_KEY, 'complete');
  } catch {
    // Orientation must never block access when local storage is unavailable.
  }
}
