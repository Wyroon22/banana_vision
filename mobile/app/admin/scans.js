import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

// [FULL IMAGE VIEWER] รองรับการซูมภาพเข้า-ออกเต็มจอ
import ImageView from "react-native-image-viewing";

import { supabase } from "../../lib/supabase";

// ======================================================
// THEME CONFIG (Professional Palette)
// ======================================================
const THEME = {
  bg: '#f8fafc',
  surface: '#ffffff',
  border: '#e2e8f0',
  textMain: '#0f172a',
  textMuted: '#64748b',
  accent: '#059669', // ปรับโทนเขียวให้ดูเป็นทางการมากขึ้น
  red: '#dc2626',
  blue: '#2563eb',
  yellow: '#d97706',
};

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

function formatMs(value) {
  if (value === null || value === undefined) return "-";
  return `${value} ms`;
}

export default function AdminScansScreen() {
  const [loading, setLoading] = useState(false);
  const [scans, setScans] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  // [FULL IMAGE VIEWER STATES]
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerImageUri, setViewerImageUri] = useState(null);

  const handleBack = () => {
    if (router.canGoBack && router.canGoBack()) {
      router.back();
    } else {
      router.replace("/admin");
    }
  };

  const openFullImage = (uri) => {
    if (!uri) {
      Alert.alert("เปิดรูปไม่ได้", "ไม่พบ URL ของรูปภาพนี้");
      return;
    }

    setViewerImageUri(uri);
    setViewerVisible(true);
  };

  const closeFullImage = () => {
    setViewerVisible(false);
    setTimeout(() => {
      setViewerImageUri(null);
    }, 250);
  };

  const loadScans = useCallback(async () => {
    try {
      setLoading(true);

      // 1. ดึงข้อมูล scan_history ล่าสุด 50 รายการ
      const { data: scanData, error: scanError } = await supabase
        .from("scan_history")
        .select(
          "id, user_id, guest_id, total_bananas, green_count, breaker_count, ripe_count, overripe_count, inference_ms, original_image_url, result_image_url, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(50);

      if (scanError) throw scanError;

      const scanList = Array.isArray(scanData) ? scanData : [];

      if (scanList.length === 0) {
        setScans([]);
        return;
      }

      const scanIds = scanList.map((item) => item.id).filter(Boolean);

      // 2. ดึงข้อมูลโปรไฟล์ผู้ใช้งาน (profiles)
      const userIds = [
        ...new Set(scanList.map((item) => item.user_id).filter(Boolean)),
      ];

      let profileMap = new Map();
      if (userIds.length > 0) {
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("id, display_name, email")
          .in("id", userIds);

        if (!profilesError && profilesData) {
          profilesData.forEach((p) => {
            const name = p.display_name || p.email?.split("@")[0] || "ผู้ใช้งาน";
            profileMap.set(p.id, name);
          });
        }
      }

      // 3. ดึงข้อมูลความเห็นหรือการแก้ไขเพิ่มเติมจาก scan_details
      let detailsMap = new Map();
      if (scanIds.length > 0) {
        const { data: detailsData, error: detailsError } = await supabase
          .from("scan_details")
          .select("scan_id, user_selected_ripeness, user_selected_color_level, feedback_updated_at")
          .in("scan_id", scanIds)
          .not("user_selected_ripeness", "is", null);

        if (!detailsError && detailsData) {
          detailsData.forEach((d) => {
            detailsMap.set(d.scan_id, d);
          });
        }
      }

      // 4. ผสานข้อมูลทั้งหมดเข้ากับ scan list
      const mergedScans = scanList.map((item) => {
        let authorName = "ผู้ใช้งานทั่วไป (Guest)";
        if (item.user_id) {
          authorName = profileMap.get(item.user_id) || `User (${String(item.user_id).slice(0, 6)})`;
        } else if (item.guest_id) {
          authorName = `Guest (${String(item.guest_id).slice(0, 6)})`;
        }

        const correctionInfo = detailsMap.get(item.id) || null;

        return {
          ...item,
          author_name: authorName,
          correction: correctionInfo,
          formatted_date: formatDate(item.created_at),
        };
      });

      setScans(mergedScans);
    } catch (error) {
      Alert.alert(
        "โหลดประวัติการตรวจไม่สำเร็จ",
        error?.message || "กรุณาลองใหม่"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadScans();
  }, [loadScans]);

  // กรองรายการตามชื่อผู้ใช้ หรือ วันที่
  const filteredScans = scans.filter((item) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;

    const matchAuthor = item.author_name.toLowerCase().includes(query);
    const matchDate = item.formatted_date.toLowerCase().includes(query);

    return matchAuthor || matchDate;
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header Bar */}
        <View style={styles.headerBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={0.75}
          >
            <Ionicons name="arrow-back" size={18} color={THEME.textMain} />
            <Text style={styles.backText}>ย้อนกลับ</Text>
          </TouchableOpacity>

          <View style={styles.summaryBadgeHeader}>
            <Ionicons name="document-text-outline" size={13} color={THEME.accent} />
            <Text style={styles.summaryBadgeText}>{filteredScans.length} รายการ</Text>
          </View>
        </View>

        {/* Title Section */}
        <View style={styles.header}>
          <Text style={styles.title}>ประวัติการตรวจทั้งหมด</Text>
          <Text style={styles.subtitle}>
            บันทึกประวัติการวิเคราะห์ผลกล้วย พร้อมข้อมูลผู้ใช้และความคิดเห็นการแก้ไข
          </Text>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color={THEME.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="ค้นหาชื่อผู้ใช้ หรือ วันที่ (เช่น 20 ก.ค., 2569)..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={18} color={THEME.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Loading */}
        {loading && scans.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={THEME.accent} />
            <Text style={styles.loadingText}>กำลังโหลดข้อมูล...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredScans}
            keyExtractor={(item) => String(item.id)}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={loadScans}
                tintColor={THEME.accent}
              />
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={5}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews={Platform.OS === "android"}
            ListEmptyComponent={
              !loading && (
                <View style={styles.emptyCard}>
                  <Ionicons name="search-outline" size={48} color="#cbd5e1" />
                  <Text style={styles.emptyTitle}>
                    ไม่พบข้อมูลที่ค้นหา
                  </Text>
                  <Text style={styles.emptyText}>
                    ลองเปลี่ยนคำค้นหาชื่อผู้ใช้ หรือระบุวันที่ใหม่อีกครั้ง
                  </Text>
                </View>
              )
            }
            renderItem={({ item }) => {
              const imageUrl =
                item.result_image_url ||
                item.original_image_url ||
                null;

              return (
                <View style={styles.card}>
                  {/* รูป Scan (แตะเพื่อซูมเต็มจอ) */}
                  {imageUrl ? (
                    <TouchableOpacity
                      activeOpacity={0.92}
                      onPress={() => openFullImage(imageUrl)}
                      style={styles.imageContainer}
                    >
                      <Image
                        source={{ uri: imageUrl }}
                        style={styles.scanImage}
                        resizeMode="cover"
                        progressiveRenderingEnabled
                        fadeDuration={150}
                      />
                      <View style={styles.zoomHint}>
                        <Ionicons
                          name="scan-outline"
                          size={12}
                          color="#ffffff"
                        />
                        <Text style={styles.zoomHintText}>แตะเพื่อขยายรูป</Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.noImageBox}>
                      <Ionicons
                        name="image-outline"
                        size={26}
                        color="#94a3b8"
                      />
                      <Text style={styles.noImageText}>ไม่มีรูปภาพ</Text>
                    </View>
                  )}

                  {/* Card Content Header */}
                  <View style={styles.cardTop}>
                    <View style={styles.userInfoBox}>
                      <Ionicons name="person-circle-outline" size={18} color={THEME.accent} />
                      <Text style={styles.userNameText} numberOfLines={1}>
                        {item.author_name}
                      </Text>
                    </View>

                    <View style={styles.totalBadge}>
                      <Text style={styles.totalBadgeText}>
                        {item.total_bananas ?? 0} ลูก
                      </Text>
                    </View>
                  </View>

                  <View style={styles.dateRow}>
                    <Ionicons name="time-outline" size={12} color="#94a3b8" />
                    <Text style={styles.dateText}>
                      วันที่ตรวจ: {item.formatted_date}
                    </Text>
                  </View>

                  {/* Counts Grid (ดิบ, ห่าม, สุก, งอม) */}
                  <View style={styles.countGrid}>
                    <View style={[styles.countBadgeItem, { backgroundColor: "#f0fdf4", borderColor: "#dcfce7" }]}>
                      <Text style={[styles.countLabel, { color: "#059669" }]}>ดิบ</Text>
                      <Text style={[styles.countVal, { color: "#059669" }]}>{item.green_count ?? 0}</Text>
                    </View>

                    <View style={[styles.countBadgeItem, { backgroundColor: "#fffbeb", borderColor: "#fef3c7" }]}>
                      <Text style={[styles.countLabel, { color: "#d97706" }]}>ห่าม</Text>
                      <Text style={[styles.countVal, { color: "#d97706" }]}>{item.breaker_count ?? 0}</Text>
                    </View>

                    <View style={[styles.countBadgeItem, { backgroundColor: "#eff6ff", borderColor: "#dbeafe" }]}>
                      <Text style={[styles.countLabel, { color: "#2563eb" }]}>สุก</Text>
                      <Text style={[styles.countVal, { color: "#2563eb" }]}>{item.ripe_count ?? 0}</Text>
                    </View>

                    <View style={[styles.countBadgeItem, { backgroundColor: "#fef2f2", borderColor: "#fee2e2" }]}>
                      <Text style={[styles.countLabel, { color: "#dc2626" }]}>งอม</Text>
                      <Text style={[styles.countVal, { color: "#dc2626" }]}>{item.overripe_count ?? 0}</Text>
                    </View>
                  </View>

                  {/* แสดงความคิดเห็น / การแก้ไขเพิ่มเติมจากผู้ใช้ (ถ้ามี) */}
                  {item.correction && (
                    <View style={styles.correctionFeedbackBox}>
                      <View style={styles.feedbackHeaderRow}>
                        <Ionicons name="chatbubble-ellipses-outline" size={13} color={THEME.accent} />
                        <Text style={styles.feedbackTitle}>ความคิดเห็น/แก้ไขจากผู้ใช้</Text>
                      </View>
                      <Text style={styles.feedbackText}>
                        ปรับแก้เป็น: <Text style={styles.bold}>{item.correction.user_selected_ripeness}</Text>
                        {item.correction.user_selected_color_level
                          ? ` (ระดับสี: ${item.correction.user_selected_color_level})`
                          : ""}
                      </Text>
                    </View>
                  )}

                  {/* Footer Info: Inference Time */}
                  <View style={styles.cardFooter}>
                    <View style={styles.inferenceBox}>
                      <Ionicons name="flash-outline" size={12} color={THEME.yellow} />
                      <Text style={styles.inferenceText}>
                        ประมวลผล: <Text style={styles.bold}>{formatMs(item.inference_ms)}</Text>
                      </Text>
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>

      {/* [FULL SCREEN IMAGE VIEWER WITH ZOOM SUPPORT] */}
      <ImageView
        images={viewerImageUri ? [{ uri: viewerImageUri }] : []}
        imageIndex={0}
        visible={viewerVisible && Boolean(viewerImageUri)}
        onRequestClose={closeFullImage}
        swipeToCloseEnabled={true}
        doubleTapToZoomEnabled={true}
        backgroundColor="#000000"
        HeaderComponent={() => (
          <SafeAreaView style={styles.viewerHeader}>
            <TouchableOpacity
              style={styles.viewerCloseButton}
              onPress={closeFullImage}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={24} color="#ffffff" />
            </TouchableOpacity>
          </SafeAreaView>
        )}
        FooterComponent={() => (
          <View style={styles.viewerFooter}>
            <Ionicons name="search-outline" size={14} color="#ffffff" />
            <Text style={styles.viewerFooterText}>
              ใช้นิ้วซูมเข้า-ออก • ปัดลงเพื่อปิด
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.bg,
  },

  container: {
    flex: 1,
    backgroundColor: THEME.bg,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 8 : 12,
  },

  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: THEME.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: THEME.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },

  backText: {
    fontSize: 13,
    fontWeight: "700",
    color: THEME.textMain,
  },

  summaryBadgeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dcfce7",
  },

  summaryBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: THEME.accent,
  },

  header: {
    marginBottom: 12,
    paddingHorizontal: 2,
  },

  title: {
    fontSize: 20,
    fontWeight: "900",
    color: THEME.textMain,
    marginBottom: 3,
  },

  subtitle: {
    fontSize: 12,
    fontWeight: "500",
    color: THEME.textMuted,
    lineHeight: 18,
  },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: THEME.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
    marginBottom: 14,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1,
  },

  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: THEME.textMain,
    padding: 0,
  },

  loadingBox: {
    backgroundColor: THEME.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 24,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },

  loadingText: {
    fontSize: 13,
    fontWeight: "600",
    color: THEME.textMuted,
  },

  listContent: {
    paddingBottom: 32,
    gap: 12,
  },

  card: {
    backgroundColor: THEME.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    width: "100%",
  },

  imageContainer: {
    position: "relative",
    marginBottom: 12,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: THEME.border,
  },

  scanImage: {
    width: "100%",
    height: 180,
  },

  zoomHint: {
    position: "absolute",
    right: 8,
    bottom: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
  },

  zoomHintText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#ffffff",
  },

  noImageBox: {
    width: "100%",
    height: 130,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    marginBottom: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: THEME.border,
    borderStyle: "dashed",
    gap: 4,
  },

  noImageText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94a3b8",
  },

  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
    width: "100%",
  },

  userInfoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    marginRight: 8,
  },

  userNameText: {
    fontSize: 14,
    fontWeight: "800",
    color: THEME.textMain,
  },

  totalBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#dcfce7",
  },

  totalBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: THEME.accent,
  },

  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 10,
  },

  dateText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#94a3b8",
  },

  countGrid: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
  },

  countBadgeItem: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 6,
    alignItems: "center",
    borderWidth: 1,
  },

  countLabel: {
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 1,
  },

  countVal: {
    fontSize: 13,
    fontWeight: "800",
  },

  correctionFeedbackBox: {
    backgroundColor: "#f0fdf4",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    padding: 8,
    marginBottom: 10,
    gap: 3,
  },

  feedbackHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  feedbackTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#166534",
  },

  feedbackText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#15803d",
    paddingLeft: 18,
  },

  bold: {
    fontWeight: "800",
    color: THEME.textMain,
  },

  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  inferenceBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },

  inferenceText: {
    fontSize: 11,
    color: THEME.textMuted,
    fontWeight: "500",
  },

  emptyCard: {
    backgroundColor: THEME.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 28,
    alignItems: "center",
    marginTop: 20,
  },

  emptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: THEME.textMain,
    marginTop: 10,
  },

  emptyText: {
    fontSize: 12,
    fontWeight: "500",
    color: THEME.textMuted,
    textAlign: "center",
    marginTop: 4,
    lineHeight: 18,
  },

  // ===== LIGHTBOX VIEWER STYLES =====

  viewerHeader: {
    width: "100%",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 8 : 16,
  },

  viewerCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    alignItems: "center",
  },

  viewerFooter: {
    alignSelf: "center",
    marginBottom: Platform.OS === "ios" ? 32 : 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  viewerFooterText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#ffffff",
  },
});