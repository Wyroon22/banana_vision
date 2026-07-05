import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { TouchableOpacity, Alert, StyleSheet } from "react-native";
import { router } from "expo-router";

import { supabase } from "../../lib/supabase";

import HomeScreen from "./HomeScreen";
import ManageUsersScreen from "./manage-users";
import ExportDataScreen from "./export-data";

const Tab = createBottomTabNavigator();

export default function DashboardTabs() {
  const handleLogout = () => {
    Alert.alert(
      "ยืนยันการออกจากระบบ",
      "ต้องการออกจากระบบ Admin หรือไม่?",
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "ออกจากระบบ",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase.auth.signOut();

            if (error) {
              Alert.alert("Logout ไม่สำเร็จ", error.message);
              return;
            }

            router.replace("/login");
          },
        },
      ]
    );
  };

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: "#ca8a04",
        tabBarInactiveTintColor: "#94a3b8",
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        headerStyle: styles.header,
        headerTitleStyle: styles.headerTitle,
        headerShadowVisible: false,
        headerShown: true,
        headerRight: () => (
          <TouchableOpacity
            onPress={handleLogout}
            style={styles.logoutButton}
            activeOpacity={0.7}
          >
            <Ionicons name="log-out" size={20} color="#ef4444" />
          </TouchableOpacity>
        ),
      }}
    >
      <Tab.Screen
        name="AdminHome"
        component={HomeScreen}
        options={{
          title: "หน้าแรก",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "analytics" : "analytics-outline"}
              size={20}
              color={color}
            />
          ),
        }}
      />

      <Tab.Screen
        name="ManageUsers"
        component={ManageUsersScreen}
        options={{
          title: "สมาชิก",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "people" : "people-outline"}
              size={20}
              color={color}
            />
          ),
        }}
      />

      <Tab.Screen
        name="ExportData"
        component={ExportDataScreen}
        options={{
          title: "ส่งออกข้อมูล",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "cloud-download" : "cloud-download-outline"}
              size={20}
              color={color}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    height: 60,
    paddingBottom: 8,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: "600",
  },
  header: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  headerTitle: {
    fontWeight: "700",
    fontSize: 15,
    color: "#0f172a",
  },
  logoutButton: {
    marginRight: 16,
    padding: 8,
    backgroundColor: "#fef2f2",
    borderRadius: 10,
  },
});
