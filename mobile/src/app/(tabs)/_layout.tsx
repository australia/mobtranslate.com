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
        tabBarActiveBackgroundColor: C.sageSoft,
        tabBarHideOnKeyboard: true,
        // Add the system navigation-bar inset so the bar clears the home gesture pill.
        tabBarStyle: {
          height: 70 + insets.bottom,
          paddingBottom: insets.bottom + 8,
          paddingTop: 8,
          backgroundColor: C.surface,
          borderTopColor: C.hair,
          borderTopWidth: 1,
        },
        tabBarItemStyle: { borderRadius: 18, marginHorizontal: 2, marginVertical: 2 },
        tabBarLabelStyle: { fontFamily: F.semibold, fontSize: 11, marginTop: 1 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} /> }} />
      <Tabs.Screen name="dictionary" options={{ title: 'Words', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'book' : 'book-outline'} size={size} color={color} /> }} />
      <Tabs.Screen name="learn" options={{ title: 'Learn', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'leaf' : 'leaf-outline'} size={size} color={color} /> }} />
      <Tabs.Screen name="map" options={{ title: 'Country', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'map' : 'map-outline'} size={size} color={color} /> }} />
      <Tabs.Screen name="record" options={{ href: null }} />
      <Tabs.Screen name="account" options={{ title: 'You', tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={size} color={color} /> }} />
    </Tabs>
  );
}
