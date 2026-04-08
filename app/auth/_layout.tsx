import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ gestureEnabled: false }} />
      <Stack.Screen name="email" options={{ gestureEnabled: true, animation: "slide_from_right" }} />
    </Stack>
  );
}
