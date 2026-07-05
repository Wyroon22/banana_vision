import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { supabase } from "../../lib/supabase";

function formatDate(value) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "-";
  }
}

export default function AdminUsersScreen() {
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState([]);

  const handleBack = () => {
    if (router.canGoBack && router.canGoBack()) {
      router.back();
    } else {
      router.replace("/admin");
    }
  };

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, display_name, role, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      Alert.alert(
        "โหลดข้อมูลสมาชิกไม่สำเร็จ",
        error?.message || "กรุณาลองใหม่"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          activeOpacity={0.75}
        >
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
          <Text style={styles.backText}>กลับ</Text>
        </TouchableOpacity>

        <View style={styles.header}>
          <Text style={styles.title}>สมาชิกทั้งหมด</Text>
          <Text style={styles.subtitle}>
            ดึงข้อมูลจากตาราง profiles ของ Supabase
          </Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>จำนวนสมาชิกทั้งหมด</Text>
          <Text style={styles.summaryValue}>{users.length} คน</Text>
        </View>

        {loading && users.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#ca8a04" />
            <Text style={styles.loadingText}>กำลังโหลดข้อมูล...</Text>
          </View>
        ) : (
          <FlatList
            data={users}
            keyExtractor={(item) => String(item.id)}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={loadUsers} />
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>ยังไม่มีข้อมูลสมาชิก</Text>
              </View>
            }
            renderItem={({ item }) => {
              const displayName =
                item.display_name || item.email?.split("@")?.[0] || "Member";
              const role = item.role || "member";
              const isAdmin = role === "admin";

              return (
                <View style={styles.card}>
                  <View
                    style={[
                      styles.avatar,
                      { backgroundColor: isAdmin ? "#fef9c3" : "#eff6ff" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.avatarText,
                        { color: isAdmin ? "#ca8a04" : "#3b82f6" },
                      ]}
                    >
                      {displayName.charAt(0).toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.userInfo}>
                    <Text style={styles.name}>{displayName}</Text>
                    <Text style={styles.email}>{item.email}</Text>

                    <View
                      style={[
                        styles.roleBadge,
                        { backgroundColor: isAdmin ? "#fef9c3" : "#e6f4ea" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.roleText,
                          { color: isAdmin ? "#a16207" : "#137333" },
                        ]}
                      >
                        {role}
                      </Text>
                    </View>

                    <Text style={styles.dateText}>
                      สมัครเมื่อ: {formatDate(item.created_at)}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.iconBox,
                      { backgroundColor: isAdmin ? "#fef2f2" : "#f1f5f9" },
                    ]}
                  >
                    <Ionicons
                      name={isAdmin ? "shield-checkmark" : "person"}
                      size={18}
                      color={isAdmin ? "#ef4444" : "#475569"}
                    />
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },

  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? 24 : 8,
  },

  backButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 22,
  },

  backText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f172a",
  },

  header: {
    marginBottom: 16,
  },

  title: {
    fontSize: 26,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#64748b",
    lineHeight: 24,
  },

  summaryCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    marginBottom: 14,
  },

  summaryLabel: {
    fontSize: 13,
    fontWeight: "800",
    color: "#64748b",
  },

  summaryValue: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 4,
  },

  loadingBox: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 18,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },

  loadingText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748b",
  },

  listContent: {
    paddingBottom: 36,
  },

  card: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    marginBottom: 12,
    alignItems: "center",
    gap: 12,
  },

  avatar: {
    width: 54,
    height: 54,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },

  avatarText: {
    fontSize: 20,
    fontWeight: "900",
  },

  userInfo: {
    flex: 1,
  },

  name: {
    fontSize: 17,
    fontWeight: "900",
    color: "#0f172a",
  },

  email: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
    marginTop: 2,
  },

  roleBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
  },

  roleText: {
    fontSize: 12,
    fontWeight: "900",
  },

  dateText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94a3b8",
    marginTop: 8,
  },

  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },

  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 18,
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
  },
});