import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";

export const unstable_settings = {
  anchor: "index",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="history" />
        <Stack.Screen name="scan-detail" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="video-detect" />
        <Stack.Screen name="CommentScreen" />
        <Stack.Screen name="modal" options={{ presentation: "modal", title: "Modal" }} />
        <Stack.Screen name="admin/index" />
        <Stack.Screen name="admin/users" />
        <Stack.Screen name="admin/scans" />
        <Stack.Screen name="admin/bananas" />
        <Stack.Screen name="admin/corrections" />
      </Stack>
      <StatusBar style="light" />
    </ThemeProvider>
  );
}
