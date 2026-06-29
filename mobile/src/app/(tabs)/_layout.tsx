import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../../lib/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.ochre,
        tabBarInactiveTintColor: C.muted,
        tabBarStyle: {
          height: 66, paddingBottom: 8, paddingTop: 6,
          backgroundColor: C.surface, borderTopColor: C.border,
        },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Translate', tabBarIcon: ({ color, size }) => <Ionicons name="language" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="dictionary"
        options={{ title: 'Words', tabBarIcon: ({ color, size }) => <Ionicons name="book" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="record"
        options={{ title: 'Record', tabBarIcon: ({ color, size }) => <Ionicons name="mic" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="keyboard"
        options={{ title: 'Keyboard', tabBarIcon: ({ color, size }) => <Ionicons name="keypad" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: 'Account', tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> }}
      />
    </Tabs>
  );
}
