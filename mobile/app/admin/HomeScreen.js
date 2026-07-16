import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import ImageView from "react-native-image-viewing";
import { supabase } from "../../lib/supabase";

// ======================================================
// PREMIUM THEME CONFIG
// ======================================================
const THEME = {
  bg: "#f8fafc",          // Slate 50 (สะอาด, สบายตา)
  surface: "#ffffff",     // ขาวบริสุทธิ์สำหรับ Card
  border: "#f1f5f9",      // Slate 100 เส้นบางเบาไม่ขัดสายตา
  borderDark: "#e2e8f0",  // Slate 200
  textMain: "#0f172a",    // Slate 900 อ่านง่ายสุด
  textMuted: "#64748b",   // Slate 500 สำหรับรองหัวข้อ
  accent: "#eab308",      // เหลืองกล้วยโมเดิร์น
  accentDark: "#a16207",
  accentLight: "#fef9c3",
  green: "#10b981",
  red: "#ef4444",
};

// ======================================================
// RIPENESS HELPERS
// ======================================================
function normalizeRipeness(value) {
  const v = String(value || "").trim().toLowerCase();
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
      return { bg: "#f0fdf4", text: "#16a34a", fill: "#22c55e" };
    case "ห่าม":
      return { bg: "#fff7ed", text: "#ea580c", fill: "#f97316" };
    case "สุก":
      return { bg: "#fef9c3", text: "#a16207", fill: "#eab308" };
    case "งอม":
      return { bg: "#fef2f2", text: "#dc2626", fill: "#ef4444" };
    default:
      return { bg: "#f8fafc", text: "#64748b", fill: "#cbd5e1" };
  }
}

// ======================================================
// MAIN COMPONENT
// ======================================================
export default function HomeScreen() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ users: 0, scans: 0, corrections: 0, comments: 0 });
  const [recentCorrections, setRecentCorrections] = useState([]);
  const [ripenessChart, setRipenessChart] = useState([
    { key: "green", label: "ดิบ", count: 0 },
    { key: "breaker", label: "ห่าม", count: 0 },
    { key: "ripe", label: "สุก", count: 0 },
    { key: "overripe", label: "งอม", count: 0 },
  ]);

  const [loadingImages, setLoadingImages] = useState({});
  const [imageErrors, setImageErrors] = useState({});
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImageUri, setViewerImageUri] = useState(null);

  const openFullImage = (uri) => {
    if (!uri) {
      Alert.alert("ไม่สามารถเปิดรูปภาพได้", "ไม่พบลิงก์รูปภาพผลการตรวจในระบบ");
      return;
    }
    setViewerImageUri(uri);
    setViewerVisible(true);
  };

  const closeFullImage = () => {
    setViewerVisible(false);
    setTimeout(() => setViewerImageUri(null), 205);
  };

  const handleImageLoadStart = (itemId) => {
    setLoadingImages((prev) => ({ ...prev, [itemId]: true }));
  };

  const handleImageLoadEnd = (itemId) => {
    setLoadingImages((prev) => ({ ...prev, [itemId]: false }));
  };

  const handleImageError = (itemId, error) => {
    console.log("[HOME CORRECTION IMAGE ERROR]", itemId, error);
    setLoadingImages((prev) => ({ ...prev, [itemId]: false }));
    setImageErrors((prev) => ({ ...prev, [itemId]: true }));
  };

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);

      const [
        profilesResult,
        scanHistoryResult,
        correctionCountResult,
        feedbackCountResult,
        recentResult,
        chartResult,
      ] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("scan_history").select("id", { count: "exact", head: true }),
        supabase.from("scan_details").select("id", { count: "exact", head: true }).not("user_selected_ripeness", "is", null),
        supabase.from("feedback").select("id", { count: "exact", head: true }),
        supabase.from("scan_details")
          .select("id, banana_index, ripeness_th, ripeness_label, confidence, user_selected_ripeness, user_selected_color_level, feedback_updated_at, created_at, scan_id")
          .not("user_selected_ripeness", "is", null)
          .order("feedback_updated_at", { ascending: false })
          .limit(5),
        supabase.from("scan_details").select("user_selected_ripeness").not("user_selected_ripeness", "is", null),
      ]);

      const firstError =
        profilesResult.error ||
        scanHistoryResult.error ||
        correctionCountResult.error ||
        feedbackCountResult.error ||
        recentResult.error ||
        chartResult.error;

      if (firstError) throw firstError;

      setStats({
        users: profilesResult.count ?? 0,
        scans: scanHistoryResult.count ?? 0,
        corrections: correctionCountResult.count ?? 0,
        comments: feedbackCountResult.count ?? 0,
      });

      const recentRows = Array.isArray(recentResult.data) ? recentResult.data : [];
      const recentScanIds = [...new Set(recentRows.map((item) => item.scan_id).filter(Boolean))];

      let scanImageRows = [];
      if (recentScanIds.length > 0) {
        const { data: scansData, error: scansError } = await supabase
          .from("scan_history")
          .select("id, result_image_url, original_image_url")
          .in("id", recentScanIds);

        if (scansError) throw scansError;
        scanImageRows = Array.isArray(scansData) ? scansData : [];
      }

      const scanImageMap = new Map(scanImageRows.map((scan) => [scan.id, scan]));
      const mergedRecentCorrections = recentRows.map((item) => {
        const scan = scanImageMap.get(item.scan_id) || {};
        return {
          ...item,
          result_image_url: scan.result_image_url || null,
          original_image_url: scan.original_image_url || null,
          scan_image_url: scan.result_image_url || scan.original_image_url || null,
        };
      });

      setRecentCorrections(mergedRecentCorrections);
      setLoadingImages({});
      setImageErrors({});

      const chartCounts = { green: 0, breaker: 0, ripe: 0, overripe: 0 };
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
      console.error("[ADMIN HOME ERROR]", error);
      Alert.alert("การโหลดข้อมูลล้มเหลว", error?.message || "กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const totalChartCount = ripenessChart.reduce((sum, item) => sum + item.count, 0);
  const maxChartCount = Math.max(...ripenessChart.map((item) => item.count), 1);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadDashboard} tintColor={THEME.accentDark} colors={[THEME.accentDark]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* APP HEADER */}
        <View style={styles.header}>
          <View>
            <Text style={styles.appTitle}>BANANA VISION</Text>
            <Text style={styles.appSubtitle}>ระบบจัดการข้อมูลกลางสำหรับผู้ดูแล</Text>
          </View>
          <View style={styles.statusIndicator}>
            <View style={styles.greenDot} />
            <Text style={styles.statusIndicatorText}>ระบบออนไลน์</Text>
          </View>
        </View>

        {/* LOADING NOTIFICATION */}
        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={THEME.green} size="small" />
            <Text style={styles.loadingText}>กำลังซิงค์ข้อมูลกับ Supabase...</Text>
          </View>
        )}

        {/* METRICS METERS GRID (แก้ไขพาธการนำทางไปยังหน้าจัดการผู้ใช้และหน้าความคิดเห็นด้วย Absolute Path) */}
        <View style={styles.grid}>
          <TouchableOpacity style={styles.statCard} activeOpacity={0.9} onPress={() => router.push("/admin/manage-users")}>
            <View style={[styles.statIcon, { backgroundColor: "#f0f9ff" }]}>
              <Ionicons name="people-outline" size={20} color="#0284c7" />
            </View>
            <Text style={styles.statValue}>{stats.users}</Text>
            <Text style={styles.statLabel}>ผู้ใช้งานระบบ</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.statCard} activeOpacity={0.9} onPress={() => router.push("/admin/scans")}>
            <View style={[styles.statIcon, { backgroundColor: "#f0fdf4" }]}>
              <Ionicons name="scan-outline" size={20} color="#16a34a" />
            </View>
            <Text style={styles.statValue}>{stats.scans}</Text>
            <Text style={styles.statLabel}>จำนวนสแกนรวม</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.statCard} activeOpacity={0.9} onPress={() => router.push("/admin/corrections")}>
            <View style={[styles.statIcon, { backgroundColor: "#fef2f2" }]}>
              <Ionicons name="git-compare-outline" size={20} color="#dc2626" />
            </View>
            <Text style={styles.statValue}>{stats.corrections}</Text>
            <Text style={styles.statLabel}>รายงานการแก้ไข</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.statCard} activeOpacity={0.9} onPress={() => router.push("/admin/manage-comments")}>
            <View style={[styles.statIcon, { backgroundColor: "#faf5ff" }]}>
              <Ionicons name="chatbubbles-outline" size={20} color="#9333ea" />
            </View>
            <Text style={styles.statValue}>{stats.comments}</Text>
            <Text style={styles.statLabel}>ความคิดเห็น</Text>
          </TouchableOpacity>
        </View>

        {/* ANALYTICS VISUALIZER CARD */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionHeading}>ภาพรวมการแก้ไขสถานะ</Text>
              <Text style={styles.sectionSubheading}>สัดส่วนข้อมูลที่ถูกผู้ใช้ปรับแก้ระดับความสุกใหม่</Text>
            </View>
            <View style={styles.chartTotalBadge}>
              <Text style={styles.chartTotalText}>{totalChartCount} รายการ</Text>
            </View>
          </View>

          <View style={styles.chartBody}>
            {ripenessChart.map((item) => {
              const styleConfig = getRipenessStyle(item.label);
              const widthPercent = (item.count / maxChartCount) * 100;

              return (
                <View key={item.key} style={styles.barRow}>
                  <Text style={styles.barLabel}>{item.label}</Text>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${widthPercent}%`, backgroundColor: styleConfig.fill }]} />
                  </View>
                  <Text style={[styles.barValue, item.count > 0 && { color: THEME.textMain }]}>{item.count}</Text>
                </View>
              );
            })}
          </View>

          {totalChartCount === 0 && (
            <Text style={styles.chartHint}>ไม่มีข้อมูลการแก้ไขของระดับความสุกในระบบ</Text>
          )}
        </View>

        {/* SECTION HEADER FOR RECENT FEEDBACK */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeading}>ฟีดแบ็กการแก้ไขล่าสุด</Text>
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionSubheading, { flex: 1 }]}>ข้อมูลเปรียบเทียบระหว่างผลลัพธ์โมเดล AI กับความเห็นจริงจากผู้ใช้</Text>
            <TouchableOpacity style={styles.seeAllButton} activeOpacity={0.6} onPress={() => router.push("/admin/corrections")}>
              <Text style={styles.seeAllText}>ดูทั้งหมด</Text>
              <Ionicons name="arrow-forward" size={14} color={THEME.accentDark} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ACTIVITY LOGS STREAM */}
        <View style={styles.logContainer}>
          {recentCorrections.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="folder-open-outline" size={32} color={THEME.textMuted} style={{ marginBottom: 8 }} />
              <Text style={styles.emptyTitle}>ไม่มีข้อมูลอัปเดตใหม่</Text>
              <Text style={styles.emptyText}>ระบบจะแสดงผลตรวจทันทีเมื่อมีผู้ใช้รายงานผลแก้ไขเข้ามาในระบบ</Text>
            </View>
          ) : (
            recentCorrections.map((item) => {
              const aiLabel = toThaiRipeness(item.ripeness_th || item.ripeness_label);
              const userLabel = toThaiRipeness(item.user_selected_ripeness);
              const badgeStyle = getRipenessStyle(userLabel);
              const imageLoading = Boolean(loadingImages[item.id]);
              const imageError = Boolean(imageErrors[item.id]);

              return (
                <View key={String(item.id)} style={styles.logCard}>
                  {item.scan_image_url && !imageError ? (
                    <TouchableOpacity
                      style={styles.correctionImageContainer}
                      activeOpacity={0.95}
                      onPress={() => openFullImage(item.scan_image_url)}
                    >
                      <Image
                        source={{ uri: item.scan_image_url }}
                        style={styles.correctionImage}
                        resizeMode="cover"
                        fadeDuration={100}
                        onLoadStart={() => handleImageLoadStart(item.id)}
                        onLoadEnd={() => handleImageLoadEnd(item.id)}
                        onError={(e) => handleImageError(item.id, e.nativeEvent.error)}
                      />
                      {imageLoading && (
                        <View style={styles.imageLoadingOverlay}>
                          <ActivityIndicator size="small" color={THEME.textMuted} />
                        </View>
                      )}
                      {!imageLoading && (
                        <View style={styles.imageCaption}>
                          <Ionicons name="expand-outline" size={12} color="#ffffff" />
                          <Text style={styles.imageCaptionText}>ขยายรูป</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.noImageBox}>
                      <Ionicons name="image-outline" size={22} color="#cbd5e1" />
                      <Text style={styles.noImageText}>{imageError ? "โหลดรูปล้มเหลว" : "ไม่มีภาพแนบ"}</Text>
                    </View>
                  )}

                  <View style={styles.logMeta}>
                    <Text style={styles.logUser} numberOfLines={1}>
                      ID: {String(item.scan_id || "").slice(0, 8)} • ผลกล้วยอันดับที่ {item.banana_index ?? "-"}
                    </Text>
                    <View style={[styles.miniBadge, { backgroundColor: badgeStyle.bg }]}>
                      <Text style={[styles.miniBadgeText, { color: badgeStyle.text }]}>{userLabel}</Text>
                    </View>
                  </View>

                  <View style={styles.comparisonWrapper}>
                    <View style={styles.compareNode}>
                      <Text style={styles.compareNodeLabel}>ทำนายโดย AI</Text>
                      <Text style={styles.aiLabelText}>{aiLabel}</Text>
                    </View>
                    <Ionicons name="arrow-forward-outline" size={16} color="#94a3b8" style={{ marginTop: 14 }} />
                    <View style={styles.compareNode}>
                      <Text style={styles.compareNodeLabel}>ผู้ใช้ยืนยัน</Text>
                      <Text style={styles.userLabelText}>{userLabel}</Text>
                    </View>
                  </View>

                  <Text style={styles.logTime}>
                    ระดับสีโค้ด: <Text style={styles.logTimeValue}>{item.user_selected_color_level || "ไม่ได้ระบุ"}</Text>
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* LIGHTBOX DISPLAY VIEWER */}
      <ImageView
        images={viewerImageUri ? [{ uri: viewerImageUri }] : []}
        imageIndex={0}
        visible={viewerVisible && Boolean(viewerImageUri)}
        onRequestClose={closeFullImage}
        swipeToCloseEnabled={true}
        doubleTapToZoomEnabled={true}
        backgroundColor="#090d16"
        HeaderComponent={() => (
          <View style={styles.viewerHeader}>
            <TouchableOpacity style={styles.viewerCloseButton} activeOpacity={0.7} onPress={closeFullImage}>
              <Ionicons name="close-outline" size={26} color="#ffffff" />
            </TouchableOpacity>
          </View>
        )}
        FooterComponent={() => (
          <View style={styles.viewerFooter}>
            <Text style={styles.viewerFooterText}>ปัดหน้าจอลงเพื่อปิดการดูภาพขยาย</Text>
          </View>
        )}
      />
    </View>
  );
}

// ======================================================
// STYLES SHEET
// ======================================================
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: THEME.bg,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    paddingBottom: 4,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: THEME.textMain,
    letterSpacing: -0.3,
  },
  appSubtitle: {
    fontSize: 12,
    color: THEME.textMuted,
    marginTop: 2,
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: THEME.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    borderWidth: 0.5,
    borderColor: THEME.borderDark,
  },
  greenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: THEME.green,
  },
  statusIndicatorText: {
    fontSize: 11,
    fontWeight: "600",
    color: THEME.textMain,
  },
  loadingBox: {
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: "#bbf7d0",
    padding: 12,
    marginBottom: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: "#15803d",
    fontSize: 12,
    fontWeight: "500",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 14,
    marginBottom: 24,
  },
  statCard: {
    width: "48%",
    backgroundColor: THEME.surface,
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: THEME.border,
    padding: 16,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.015,
    shadowRadius: 8,
    elevation: 2,
  },
  statIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  statLabel: {
    color: THEME.textMuted,
    fontWeight: "500",
    fontSize: 12,
    marginTop: 2,
  },
  statValue: {
    color: THEME.textMain,
    fontWeight: "700",
    fontSize: 24,
  },
  chartCard: {
    backgroundColor: THEME.surface,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: THEME.border,
    padding: 20,
    marginBottom: 28,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.02,
    shadowRadius: 12,
    elevation: 3,
  },
  chartHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  chartTotalBadge: {
    backgroundColor: THEME.bg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 0.5,
    borderColor: THEME.borderDark,
  },
  chartTotalText: {
    color: THEME.textMain,
    fontWeight: "600",
    fontSize: 11,
  },
  chartBody: {
    gap: 12,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  barLabel: {
    width: 36,
    fontSize: 13,
    fontWeight: "500",
    color: THEME.textMuted,
  },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: "#f1f5f9",
    borderRadius: 99,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 99,
  },
  barValue: {
    width: 24,
    textAlign: "right",
    fontSize: 13,
    fontWeight: "600",
    color: THEME.textMuted,
  },
  chartHint: {
    color: THEME.textMuted,
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginTop: 2,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: "700",
    color: THEME.textMain,
  },
  sectionSubheading: {
    fontSize: 12,
    color: THEME.textMuted,
    lineHeight: 16,
  },
  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 12,
  },
  seeAllText: {
    color: THEME.accentDark,
    fontWeight: "600",
    fontSize: 12,
  },
  logContainer: {
    gap: 16,
  },
  logCard: {
    backgroundColor: THEME.surface,
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: THEME.border,
    padding: 16,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.015,
    shadowRadius: 10,
    elevation: 2,
  },
  correctionImageContainer: {
    width: "100%",
    height: 190,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 16,
    backgroundColor: "#f8fafc",
    position: "relative",
  },
  correctionImage: {
    width: "100%",
    height: "100%",
  },
  imageLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
  },
  imageCaption: {
    position: "absolute",
    right: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  imageCaptionText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#ffffff",
  },
  noImageBox: {
    width: "100%",
    height: 130,
    borderRadius: 14,
    marginBottom: 16,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    borderWidth: 0.5,
    borderColor: THEME.border,
  },
  noImageText: {
    fontSize: 12,
    color: "#94a3b8",
  },
  logMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  logUser: {
    fontSize: 12,
    fontWeight: "500",
    color: THEME.textMuted,
    flex: 1,
  },
  miniBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  miniBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  comparisonWrapper: {
    flexDirection: "row",
    backgroundColor: THEME.bg,
    borderRadius: 12,
    padding: 12,
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 0.5,
    borderColor: THEME.border,
  },
  compareNode: {
    flex: 1,
  },
  compareNodeLabel: {
    fontSize: 10,
    color: THEME.textMuted,
    fontWeight: "500",
    marginBottom: 4,
  },
  aiLabelText: {
    color: THEME.red,
    fontWeight: "700",
    fontSize: 15,
  },
  userLabelText: {
    color: THEME.green,
    fontWeight: "700",
    fontSize: 15,
  },
  logTime: {
    fontSize: 12,
    color: THEME.textMuted,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderColor: THEME.borderDark,
  },
  logTimeValue: {
    color: THEME.textMain,
    fontWeight: "500",
  },
  emptyCard: {
    backgroundColor: THEME.surface,
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    borderWidth: 0.5,
    borderColor: THEME.border,
  },
  emptyTitle: {
    color: THEME.textMain,
    fontWeight: "600",
    fontSize: 14,
  },
  emptyText: {
    color: THEME.textMuted,
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
    lineHeight: 16,
  },
  viewerHeader: {
    width: "100%",
    alignItems: "flex-end",
    paddingHorizontal: 24,
    paddingTop: 44,
  },
  viewerCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  viewerFooter: {
    alignSelf: "center",
    marginBottom: 36,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  viewerFooterText: {
    fontSize: 12,
    color: "rgba(255, 255, 255, 0.7)",
  },
});