import 'react-native-gesture-handler';
import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { setAudioModeAsync } from 'expo-audio';
import {
  Fraunces_400Regular, Fraunces_400Regular_Italic, Fraunces_500Medium_Italic,
  Fraunces_600SemiBold, Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import { useFonts } from '@expo-google-fonts/fraunces';
import {
  Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
} from '@expo-google-fonts/inter';
import { AuthProvider } from '../lib/auth';
import { LanguageProvider } from '../lib/langContext';
import { AccentProvider } from '../lib/accent';
import { SplashReveal } from '../components/SplashReveal';
import { trackEvent } from '../lib/api';
import { C, F } from '../lib/theme';

export default function RootLayout() {
  const [splash, setSplash] = useState(true);
  const [fontsLoaded] = useFonts({
    Fraunces_400Regular, Fraunces_400Regular_Italic, Fraunces_500Medium_Italic,
    Fraunces_600SemiBold, Fraunces_700Bold,
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    trackEvent('app_opened');
  }, []);

  if (!fontsLoaded) return null; // keep the splash until the type is ready

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <LanguageProvider>
          <AccentProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="word/[id]"
              options={{
                headerShown: true,
                title: '',
                headerTintColor: C.forest,
                headerStyle: { backgroundColor: C.bg },
                headerShadowVisible: false,
                headerTitleStyle: { fontFamily: F.semibold },
              }}
            />
            <Stack.Screen
              name="keyboard"
              options={{
                headerShown: true,
                title: 'Keyboard',
                headerTintColor: C.forest,
                headerStyle: { backgroundColor: C.bg },
                headerShadowVisible: false,
                headerTitleStyle: { fontFamily: F.display, color: C.ink },
              }}
            />
            <Stack.Screen
              name="elder-studio"
              options={{
                headerShown: true,
                title: 'Record with an Elder',
                headerTintColor: C.forest,
                headerStyle: { backgroundColor: C.bg },
                headerShadowVisible: false,
                headerTitleStyle: { fontFamily: F.display, color: C.ink },
              }}
            />
          </Stack>
          </AccentProvider>
          </LanguageProvider>
        </AuthProvider>
      </SafeAreaProvider>
      {splash && <SplashReveal onDone={() => setSplash(false)} />}
    </GestureHandlerRootView>
  );
}
