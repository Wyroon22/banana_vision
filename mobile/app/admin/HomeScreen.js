import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

import { supabase } from "../../lib/supabase";

const THEME = {
  bg: "#f8fafc",
  surface: "#ffffff",
  border: "#e2e8f0",
  textMain: "#0f172a",
  textMuted: "#64748b",
  accent: "#ca8a04",
  accentLight: "#fef9c3",
  green: "#10b981",
  red: "#ef4444",
};

function normalizeRipeness(value) {
  const v = String(value || "").toLowerCase();

  if (v === "green" || v === "ดิบ") return "green";
  if (v === "breaker" || v === "ห่าม") return "breaker";
  if (v === "ripe" || v === "สุก") return "ripe";
  if (v === "overripe" || v === "งอม") return "overripe";

  return "";
}

function toThaiRipeness(value) {
  if (value === "green" || value === "ดิบ") return "ดิบ";
  if (value === "breaker" || value === "ห่าม") return "ห่าม";
  if (value === "ripe" || value === "สุก") return "สุก";
  if (value === "overripe" || value === "งอม") return "งอม";
  return value || "-";
}

function getRipenessStyle(status) {
  switch (status) {
    case "ดิบ":
      return { bg: "#e6f4ea", text: "#137333", fill: "#16a34a" };
    case "ห่าม":
      return { bg: "#fff7ed", text: "#c2410c", fill: "#f97316" };
    case "สุก":
      return { bg: THEME.accentLight, text: THEME.accent, fill: "#ca8a04" };
    case "งอม":
      return { bg: "#fef2f2", text: "#991b1b", fill: "#ef4444" };
    default:
      return { bg: "#f1f5f9", text: "#475569", fill: THEME.accent };
  }
}

export default function HomeScreen() {
  const [loading, setLoading] = useState(false);

  const [stats, setStats] = useState({
    users: 0,
    scans: 0,
    bananas: 0,
    corrections: 0,
  });

  const [recentCorrections, setRecentCorrections] = useState([]);

  const [ripenessChart, setRipenessChart] = useState([
    { key: "green", label: "ดิบ", count: 0 },
    { key: "breaker", label: "ห่าม", count: 0 },
    { key: "ripe", label: "สุก", count: 0 },
    { key: "overripe", label: "งอม", count: 0 },
  ]);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);

      const [
        profilesResult,
        scanHistoryResult,
        scanDetailsResult,
        correctionCountResult,
        recentResult,
        chartResult,
      ] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),

        supabase
          .from("scan_history")
          .select("id", { count: "exact", head: true }),

        supabase
          .from("scan_details")
          .select("id", { count: "exact", head: true }),

        supabase
          .from("scan_details")
          .select("id", { count: "exact", head: true })
          .not("user_selected_ripeness", "is", null),

        supabase
          .from("scan_details")
          .select(
            "id, banana_index, ripeness_th, ripeness_label, confidence, user_selected_ripeness, user_selected_color_level, feedback_updated_at, scan_id"
          )
          .not("user_selected_ripeness", "is", null)
          .order("feedback_updated_at", { ascending: false })
          .limit(5),

        supabase
          .from("scan_details")
          .select("user_selected_ripeness")
          .not("user_selected_ripeness", "is", null),
      ]);

      const firstError =
        profilesResult.error ||
        scanHistoryResult.error ||
        scanDetailsResult.error ||
        correctionCountResult.error ||
        recentResult.error ||
        chartResult.error;

      if (firstError) {
        throw firstError;
      }

      setStats({
        users: profilesResult.count ?? 0,
        scans: scanHistoryResult.count ?? 0,
        bananas: scanDetailsResult.count ?? 0,
        corrections: correctionCountResult.count ?? 0,
      });

      setRecentCorrections(
        Array.isArray(recentResult.data) ? recentResult.data : []
      );

      const chartCounts = {
        green: 0,
        breaker: 0,
        ripe: 0,
        overripe: 0,
      };

      (chartResult.data || []).forEach((row) => {
        const key = normalizeRipeness(row.user_selected_ripeness);

        if (key && chartCounts[key] !== undefined) {
          chartCounts[key] += 1;
        }
      });

      setRipenessChart([
        { key: "green", label: "ดิบ", count: chartCounts.green },
        { key: "breaker", label: "ห่าม", count: chartCounts.breaker },
        { key: "ripe", label: "สุก", count: chartCounts.ripe },
        { key: "overripe", label: "งอม", count: chartCounts.overripe },
      ]);
    } catch (error) {
      Alert.alert(
        "โหลด Dashboard ไม่สำเร็จ",
        error?.message || "กรุณาลองใหม่"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const totalChartCount = ripenessChart.reduce(
    (sum, item) => sum + item.count,
    0
  );

  const maxChartCount = Math.max(
    ...ripenessChart.map((item) => item.count),
    1
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={loadDashboard} />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.appTitle}>BANANA VISION</Text>
          <Text style={styles.appSubtitle}>
            Admin Dashboard จากฐานข้อมูล Supabase
          </Text>
        </View>

        <View style={styles.statusIndicator}>
          <View style={styles.greenDot} />
          <Text style={styles.statusIndicatorText}>ระบบออนไลน์</Text>
        </View>
      </View>

      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={THEME.accent} />
          <Text style={styles.loadingText}>กำลังโหลดข้อมูล...</Text>
        </View>
      )}

      <View style={styles.grid}>
        <TouchableOpacity
          style={styles.statCard}
          activeOpacity={0.82}
          onPress={() => router.push("/admin/users")}
        >
      <View style={styles.statIcon}>
        <Ionicons name="people" size={18} color="#3b82f6" />
      </View>

        <Text style={styles.statLabel}>ผู้ใช้งานทั้งหมด</Text>
        <Text style={styles.statValue}>{stats.users}</Text>
        <Text style={styles.detailHint}>แตะเพื่อดูรายละเอียด</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.statCard}
        activeOpacity={0.82}
        onPress={() => router.push("/admin/scans")}
      >
      <View View style={styles.statIcon}>
        <Ionicons name="camera" size={18} color="#16a34a" />
      </View>

      <Text style={styles.statLabel}>จำนวนครั้งที่ตรวจ</Text>
      <Text style={styles.statValue}>{stats.scans}</Text>
      <Text style={styles.detailHint}>แตะเพื่อดูรายละเอียด</Text>
    </TouchableOpacity>

    <TouchableOpacity
      style={styles.statCard}
      activeOpacity={0.82}
      onPress={() => router.push("/admin/bananas")}
    >
      <View style={styles.statIcon}>
        <Ionicons name="nutrition" size={18} color="#ca8a04" />
      </View>

      <Text style={styles.statLabel}>กล้วยที่ตรวจทั้งหมด</Text>
      <Text style={styles.statValue}>{stats.bananas}</Text>
      <Text style={styles.detailHint}>แตะเพื่อดูรายละเอียด</Text>
    </TouchableOpacity>

    <TouchableOpacity
      style={styles.statCard}
      activeOpacity={0.82}
      onPress={() => router.push("/admin/corrections")}
    >
      <View style={styles.statIcon}>
        <Ionicons name="create" size={18} color="#ef4444" />
      </View>

      <Text style={styles.statLabel}>ผลแก้ไขจากผู้ใช้</Text>
      <Text style={styles.statValue}>{stats.corrections}</Text>
      <Text style={styles.detailHint}>แตะเพื่อดูรายละเอียด</Text>
      </TouchableOpacity>
    </View>

      <View style={styles.chartCard}>
        <View style={styles.chartHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionHeading}>กราฟผลแก้ไขจากผู้ใช้</Text>
            <Text style={styles.sectionSubheading}>
              จำนวน Label Correction แยกตามระดับความสุก
            </Text>
          </View>

          <View style={styles.chartTotalBadge}>
            <Text style={styles.chartTotalText}>รวม {totalChartCount}</Text>
          </View>
        </View>

        {ripenessChart.map((item) => {
          const config = getRipenessStyle(item.label);
          const widthPercent = (item.count / maxChartCount) * 100;

          return (
            <View key={item.key} style={styles.barRow}>
              <Text style={styles.barLabel}>{item.label}</Text>

              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${widthPercent}%`,
                      backgroundColor: config.fill,
                    },
                  ]}
                />
              </View>

              <Text style={styles.barValue}>{item.count}</Text>
            </View>
          );
        })}

        {totalChartCount === 0 && (
          <Text style={styles.chartHint}>
            ยังไม่มีข้อมูลกราฟ ให้ผู้ใช้บันทึก Label Correction ก่อน
          </Text>
        )}
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeading}>ผลแก้ไขล่าสุดจากผู้ใช้</Text>
        <Text style={styles.sectionSubheading}>
          แสดง Label Correction ที่ใช้แทนคอมเมนต์/ดาว
        </Text>
      </View>

      <View style={styles.logContainer}>
        {recentCorrections.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>ยังไม่มีผลแก้ไขจากผู้ใช้</Text>
            <Text style={styles.emptyText}>
              เมื่อผู้ใช้เลือก ดิบ/ห่าม/สุก/งอม และระดับสี ข้อมูลจะมาแสดงตรงนี้
            </Text>
          </View>
        ) : (
          recentCorrections.map((item) => {
            const aiLabel = toThaiRipeness(
              item.ripeness_th || item.ripeness_label
            );
            const userLabel = toThaiRipeness(item.user_selected_ripeness);
            const badgeStyle = getRipenessStyle(userLabel);

            return (
              <View key={item.id} style={styles.logCard}>
                <View style={styles.logMeta}>
                  <Text style={styles.logUser}>
                    Scan {String(item.scan_id || "").slice(0, 8)} • ลูกที่{" "}
                    {item.banana_index ?? "-"}
                  </Text>

                  <View
                    style={[
                      styles.miniBadge,
                      { backgroundColor: badgeStyle.bg },
                    ]}
                  >
                    <Text
                      style={[
                        styles.miniBadgeText,
                        { color: badgeStyle.text },
                      ]}
                    >
                      {userLabel}
                    </Text>
                  </View>
                </View>

                <Text style={styles.logText}>
                  AI: {aiLabel} → ผู้ใช้แก้เป็น: {userLabel}
                </Text>

                <Text style={styles.logTime}>
                  ระดับสี: {item.user_selected_color_level || "-"}
                </Text>
              </View>
            );
          })
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: THEME.bg,
  },

  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    borderBottomWidth: 1,
    borderColor: THEME.border,
    paddingBottom: 14,
    gap: 12,
  },

  appTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: THEME.textMain,
    letterSpacing: 1.2,
  },

  appSubtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: THEME.textMuted,
    marginTop: 2,
  },

  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: THEME.surface,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: THEME.border,
  },

  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.green,
  },

  statusIndicatorText: {
    fontSize: 11,
    fontWeight: "700",
    color: THEME.textMain,
  },

  loadingBox: {
    backgroundColor: THEME.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 14,
    marginBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  loadingText: {
    color: THEME.textMuted,
    fontWeight: "700",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 22,
  },

  statCard: {
    width: "48%",
    backgroundColor: THEME.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 14,
  },

  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },

  statLabel: {
    color: THEME.textMuted,
    fontWeight: "800",
    fontSize: 12,
  },

  statValue: {
    color: THEME.textMain,
    fontWeight: "900",
    fontSize: 28,
    marginTop: 4,
  },

  detailHint: {
    marginTop: 8,
    fontSize: 10,
    fontWeight: "700",
    color: THEME.textMuted,
  },

  chartCard: {
    backgroundColor: THEME.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 16,
    marginBottom: 22,
  },

  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 16,
  },

  chartTotalBadge: {
    backgroundColor: THEME.accentLight,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },

  chartTotalText: {
    color: THEME.accent,
    fontWeight: "900",
    fontSize: 12,
  },

  barRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 10,
  },

  barLabel: {
    width: 42,
    fontSize: 13,
    fontWeight: "900",
    color: THEME.textMain,
  },

  barTrack: {
    flex: 1,
    height: 14,
    backgroundColor: "#f1f5f9",
    borderRadius: 999,
    overflow: "hidden",
  },

  barFill: {
    height: "100%",
    borderRadius: 999,
  },

  barValue: {
    width: 28,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "900",
    color: THEME.textMain,
  },

  chartHint: {
    marginTop: 4,
    color: THEME.textMuted,
    fontWeight: "700",
    fontSize: 12,
  },

  sectionHeader: {
    marginBottom: 12,
  },

  sectionHeading: {
    fontSize: 16,
    fontWeight: "900",
    color: THEME.textMain,
  },

  sectionSubheading: {
    fontSize: 12,
    color: THEME.textMuted,
    marginTop: 4,
    fontWeight: "700",
  },

  logContainer: {
    gap: 10,
  },

  logCard: {
    backgroundColor: THEME.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 14,
  },

  logMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },

  logUser: {
    fontSize: 13,
    fontWeight: "800",
    color: THEME.textMain,
    flex: 1,
  },

  miniBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },

  miniBadgeText: {
    fontSize: 10,
    fontWeight: "800",
  },

  logText: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 20,
    fontWeight: "700",
  },

  logTime: {
    fontSize: 12,
    fontWeight: "700",
    color: THEME.textMuted,
    marginTop: 6,
  },

  emptyCard: {
    backgroundColor: THEME.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 18,
  },

  emptyTitle: {
    color: THEME.textMain,
    fontWeight: "900",
    fontSize: 16,
  },

  emptyText: {
    color: THEME.textMuted,
    fontWeight: "700",
    marginTop: 6,
    lineHeight: 20,
  },
});