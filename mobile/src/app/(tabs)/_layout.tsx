import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '../../lib/theme';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.ochre,
        tabBarInactiveTintColor: C.faint,
        // Add the system navigation-bar inset so the bar clears the home gesture pill.
        tabBarStyle: {
          height: 58 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 8,
          backgroundColor: C.surface,
          borderTopColor: C.hair,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontFamily: F.semibold, fontSize: 11.5 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Translate', tabBarIcon: ({ color, size }) => <Ionicons name="swap-horizontal" size={size} color={color} /> }} />
      <Tabs.Screen name="dictionary" options={{ title: 'Words', tabBarIcon: ({ color, size }) => <Ionicons name="book-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="record" options={{ title: 'Record', tabBarIcon: ({ color, size }) => <Ionicons name="mic-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="keyboard" options={{ title: 'Keyboard', tabBarIcon: ({ color, size }) => <Ionicons name="keypad-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" size={size} color={color} /> }} />
    </Tabs>
  );
}
