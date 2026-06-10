import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { useColorScheme } from "@/hooks/use-color-scheme";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <Stack>
        {/* หน้า Tabs หลัก */}
        <Stack.Screen
          name="(tabs)"
          options={{
            headerShown: false,
          }}
        />

        {/* [AUTH] ปิด header ดำของหน้า Login */}
        <Stack.Screen
          name="login"
          options={{
            headerShown: false,
          }}
        />

        {/* [AUTH] ปิด header ดำของหน้า Register */}
        <Stack.Screen
          name="register"
          options={{
            headerShown: false,
          }}
        />

        {/* [AUTH] ปิด header ดำของหน้า Forgot Password */}
        <Stack.Screen
          name="forgot-password"
          options={{
            headerShown: false,
          }}
        />

        {/* หน้า Video Detect */}
        <Stack.Screen
          name="video-detect"
          options={{
            headerShown: false,
          }}
        />

        <Stack.Screen
          name="modal"
          options={{
            presentation: "modal",
            title: "Modal",
          }}
        />

        <Stack.Screen
          name="reset-password"
          options={{
            headerShown: false,
          }}
        />
      </Stack>

      <StatusBar style="light" />
    </ThemeProvider>
  );
}
