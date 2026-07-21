import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../../lib/theme';
import { useAccent } from '../../lib/accent';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const accent = useAccent();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: accent.accent,
        tabBarInactiveTintColor: C.faint,
        // Add the system navigation-bar inset so the bar clears the home gesture pill.
        tabBarStyle: {
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 8,
          backgroundColor: C.surface,
          borderTopColor: C.hair,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontFamily: F.semibold, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="dictionary" options={{ title: 'Dictionary', tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="map" options={{ title: 'Map', tabBarIcon: ({ color, size }) => <Ionicons name="map-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="record" options={{ title: 'Record', tabBarIcon: ({ color, size }) => <Ionicons name="mic-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" size={size} color={color} /> }} />
    </Tabs>
  );
}
