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

function toThaiRipeness(value) {
  if (value === "green" || value === "ดิบ") return "ดิบ";
  if (value === "breaker" || value === "ห่าม") return "ห่าม";
  if (value === "ripe" || value === "สุก") return "สุก";
  if (value === "overripe" || value === "งอม") return "งอม";
  return value || "-";
}

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

function getBadgeStyle(label) {
  switch (label) {
    case "ดิบ":
      return { bg: "#e6f4ea", text: "#137333" };
    case "ห่าม":
      return { bg: "#fff7ed", text: "#c2410c" };
    case "สุก":
      return { bg: "#fef9c3", text: "#ca8a04" };
    case "งอม":
      return { bg: "#fef2f2", text: "#991b1b" };
    default:
      return { bg: "#f1f5f9", text: "#475569" };
  }
}

export default function AdminCorrectionsScreen() {
  const [loading, setLoading] = useState(false);
  const [corrections, setCorrections] = useState([]);

  const handleBack = () => {
    if (router.canGoBack && router.canGoBack()) {
      router.back();
    } else {
      router.replace("/admin");
    }
  };

  const loadCorrections = useCallback(async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("scan_details")
        .select(
          "id, scan_id, banana_index, ripeness_label, ripeness_th, confidence, user_selected_ripeness, user_selected_color_level, feedback_updated_at, created_at"
        )
        .not("user_selected_ripeness", "is", null)
        .order("feedback_updated_at", { ascending: false });

      if (error) {
        throw error;
      }

      setCorrections(Array.isArray(data) ? data : []);
    } catch (error) {
      Alert.alert(
        "โหลดผลแก้ไขไม่สำเร็จ",
        error?.message || "กรุณาลองใหม่"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCorrections();
  }, [loadCorrections]);

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
          <Text style={styles.title}>ผลแก้ไขจากผู้ใช้</Text>
          <Text style={styles.subtitle}>
            ดึงจาก scan_details เฉพาะรายการที่มี user_selected_ripeness
          </Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>จำนวนผลแก้ไขทั้งหมด</Text>
          <Text style={styles.summaryValue}>{corrections.length} รายการ</Text>
        </View>

        {loading && corrections.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#ca8a04" />
            <Text style={styles.loadingText}>กำลังโหลดข้อมูล...</Text>
          </View>
        ) : (
          <FlatList
            data={corrections}
            keyExtractor={(item) => String(item.id)}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={loadCorrections}
              />
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>ยังไม่มีผลแก้ไขจากผู้ใช้</Text>
                <Text style={styles.emptyText}>
                  เมื่อผู้ใช้เลือก ดิบ/ห่าม/สุก/งอม และกดบันทึก ข้อมูลจะมาแสดงที่นี่
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const aiLabel = toThaiRipeness(
                item.ripeness_th || item.ripeness_label
              );
              const userLabel = toThaiRipeness(item.user_selected_ripeness);
              const badgeStyle = getBadgeStyle(userLabel);

              return (
                <View style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle}>
                      Scan {String(item.scan_id || "").slice(0, 8)} • ลูกที่{" "}
                      {item.banana_index ?? "-"}
                    </Text>

                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: badgeStyle.bg },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          { color: badgeStyle.text },
                        ]}
                      >
                        {userLabel}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.infoText}>
                    AI ทำนาย: <Text style={styles.aiLabel}>{aiLabel}</Text>
                  </Text>

                  <Text style={styles.infoText}>
                    ผู้ใช้แก้เป็น:{" "}
                    <Text style={styles.userLabel}>{userLabel}</Text>
                  </Text>

                  <Text style={styles.infoText}>
                    ระดับสี:{" "}
                    <Text style={styles.bold}>
                      {item.user_selected_color_level || "-"}
                    </Text>
                  </Text>

                  <Text style={styles.dateText}>
                    อัปเดตล่าสุด:{" "}
                    {formatDate(item.feedback_updated_at || item.created_at)}
                  </Text>
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
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    marginBottom: 12,
  },

  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },

  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
    color: "#0f172a",
  },

  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  badgeText: {
    fontSize: 11,
    fontWeight: "900",
  },

  infoText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 5,
  },

  aiLabel: {
    fontWeight: "900",
    color: "#ef4444",
  },

  userLabel: {
    fontWeight: "900",
    color: "#16a34a",
  },

  bold: {
    fontWeight: "900",
    color: "#0f172a",
  },

  dateText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94a3b8",
    marginTop: 8,
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

  emptyText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748b",
    marginTop: 6,
    lineHeight: 22,
  },
});