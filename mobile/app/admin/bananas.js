import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
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

function formatConfidence(value) {
  if (value === null || value === undefined) return "-";
  const num = Number(value);
  if (Number.isNaN(num)) return "-";
  return `${Math.round(num * 100)}%`;
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

export default function AdminBananasScreen() {
  const [loading, setLoading] = useState(false);
  const [bananas, setBananas] = useState([]);

  // [IMAGE PREVIEW]
  const [zoomImageUri, setZoomImageUri] = useState(null);

  const handleBack = () => {
    if (router.canGoBack && router.canGoBack()) {
      router.back();
    } else {
      router.replace("/admin");
    }
  };

  const openZoomImage = (uri) => {
    if (!uri) {
      Alert.alert("เปิดรูปไม่ได้", "ไม่พบ URL ของรูปภาพนี้");
      return;
    }
    setZoomImageUri(uri);
  };

  const closeZoomImage = () => {
    setZoomImageUri(null);
  };

  const loadBananas = useCallback(async () => {
    try {
      setLoading(true);

      const {
        data: detailData,
        error: detailError,
      } = await supabase
        .from("scan_details")
        .select(
          "id, scan_id, banana_index, ripeness_label, ripeness_th, confidence, user_selected_ripeness, user_selected_color_level, feedback_updated_at, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(50);

      if (detailError) {
        throw detailError;
      }

      const details = Array.isArray(detailData) ? detailData : [];

      const scanIds = [
        ...new Set(
          details
            .map((item) => item.scan_id)
            .filter(Boolean)
        ),
      ];

      let scanImageMap = {};

      if (scanIds.length > 0) {
        const {
          data: scanData,
          error: scanError,
        } = await supabase
          .from("scan_history")
          .select("id, original_image_url, result_image_url")
          .in("id", scanIds);

        if (scanError) {
          throw scanError;
        }

        scanImageMap = (scanData || []).reduce(
          (acc, scan) => {
            acc[scan.id] =
              scan.result_image_url ||
              scan.original_image_url ||
              null;
            return acc;
          },
          {}
        );
      }

      const mergedDetails = details.map((item) => ({
        ...item,
        scan_image_url: scanImageMap[item.scan_id] || null,
      }));

      setBananas(mergedDetails);
    } catch (error) {
      Alert.alert(
        "โหลดข้อมูลกล้วยไม่สำเร็จ",
        error?.message || "กรุณาลองใหม่"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBananas();
  }, [loadBananas]);

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
            <Ionicons name="arrow-back" size={20} color="#0f172a" />
            <Text style={styles.backText}>ย้อนกลับ</Text>
          </TouchableOpacity>

          <View style={styles.summaryBadgeHeader}>
            <Ionicons name="grid-outline" size={14} color="#16a34a" />
            <Text style={styles.summaryBadgeText}>{bananas.length} รายการ</Text>
          </View>
        </View>

        {/* Title Section */}
        <View style={styles.header}>
          <Text style={styles.title}>รายละเอียดกล้วยรายลูก</Text>
          <Text style={styles.subtitle}>
            ข้อมูลการวิเคราะห์ผลผลิตกล้วยแต่ละลูกจากตาราง scan_details
          </Text>
        </View>

        {/* Loading */}
        {loading && bananas.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#16a34a" />
            <Text style={styles.loadingText}>กำลังโหลดข้อมูล...</Text>
          </View>
        ) : (
          <FlatList
            data={bananas}
            keyExtractor={(item) => String(item.id)}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={loadBananas}
                tintColor="#16a34a"
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
              <View style={styles.emptyCard}>
                <Ionicons name="basket-outline" size={48} color="#cbd5e1" />
                <Text style={styles.emptyTitle}>
                  ยังไม่มีข้อมูลกล้วยรายลูก
                </Text>
                <Text style={styles.emptyText}>
                  เมื่อมีการตรวจวิเคราะห์และบันทึกข้อมูล ข้อมูลจะมาแสดงที่นี่โดยอัตโนมัติ
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const aiLabel = toThaiRipeness(
                item.ripeness_th || item.ripeness_label
              );
              const userLabel = toThaiRipeness(
                item.user_selected_ripeness
              );
              const hasCorrection = !!item.user_selected_ripeness;

              return (
                <View style={styles.card}>
                  {/* Scan Image */}
                  {item.scan_image_url ? (
                    <TouchableOpacity
                      activeOpacity={0.92}
                      onPress={() => openZoomImage(item.scan_image_url)}
                      style={styles.imageContainer}
                    >
                      <Image
                        source={{ uri: item.scan_image_url }}
                        style={styles.scanImage}
                        resizeMode="cover"
                        progressiveRenderingEnabled
                        fadeDuration={150}
                      />
                      <View style={styles.zoomHint}>
                        <Ionicons name="scan-outline" size={13} color="#ffffff" />
                        <Text style={styles.zoomHintText}>แตะเพื่อขยายรูป</Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.noImageBox}>
                      <Ionicons name="image-outline" size={28} color="#94a3b8" />
                      <Text style={styles.noImageText}>ไม่มีรูปภาพ</Text>
                    </View>
                  )}

                  {/* Card Header */}
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>
                        Scan: {String(item.scan_id || "").slice(0, 8)}...
                      </Text>
                      <Text style={styles.bananaIndexBadgeText}>
                        กล้วยลูกที่ #{item.banana_index ?? "-"}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.badge,
                        hasCorrection ? styles.badgeRed : styles.badgeGreen,
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          hasCorrection ? styles.badgeTextRed : styles.badgeTextGreen,
                        ]}
                      >
                        {hasCorrection ? "มีการแก้ไข" : aiLabel}
                      </Text>
                    </View>
                  </View>

                  {/* Details Grid */}
                  <View style={styles.detailsBox}>
                    <View style={styles.detailRow}>
                      <Text style={styles.infoLabel}>AI ทำนายผล:</Text>
                      <Text style={styles.bold}>{aiLabel}</Text>
                    </View>

                    <View style={styles.detailRow}>
                      <Text style={styles.infoLabel}>ความแม่นยำ:</Text>
                      <Text style={styles.bold}>{formatConfidence(item.confidence)}</Text>
                    </View>

                    {hasCorrection && (
                      <>
                        <View style={styles.detailRow}>
                          <Text style={styles.infoLabel}>ผู้ใช้แก้เป็น:</Text>
                          <Text style={[styles.bold, { color: "#dc2626" }]}>{userLabel}</Text>
                        </View>
                        <View style={styles.detailRow}>
                          <Text style={styles.infoLabel}>ระดับสี:</Text>
                          <Text style={styles.bold}>{item.user_selected_color_level || "-"}</Text>
                        </View>
                      </>
                    )}
                  </View>

                  {/* Footer Date */}
                  <View style={styles.cardFooter}>
                    <Text style={styles.dateText}>
                      <Ionicons name="time-outline" size={12} color="#94a3b8" /> บันทึกเมื่อ: {formatDate(item.created_at)}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>

      {/* [FULL IMAGE MODAL] */}
      <Modal
        visible={!!zoomImageUri}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeZoomImage}
      >
        <View style={styles.imageModalOverlay}>
          <TouchableOpacity
            style={styles.imageModalCloseButton}
            onPress={closeZoomImage}
            activeOpacity={0.8}
          >
            <Ionicons name="close" size={20} color="#0f172a" />
            <Text style={styles.imageModalCloseText}>ปิด</Text>
          </TouchableOpacity>

          <View style={styles.imageModalBody}>
            {zoomImageUri && (
              <Image
                source={{ uri: zoomImageUri }}
                style={styles.fullImage}
                resizeMode="contain"
                progressiveRenderingEnabled
                fadeDuration={150}
              />
            )}
          </View>
        </View>
      </Modal>
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
    paddingTop: Platform.OS === "android" ? 16 : 8,
  },

  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },

  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  backText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },

  summaryBadgeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#f0fdf4",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dcfce7",
  },

  summaryBadgeText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#16a34a",
  },

  header: {
    marginBottom: 16,
  },

  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
  },

  loadingBox: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 24,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },

  loadingText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#64748b",
  },

  listContent: {
    paddingBottom: 36,
    gap: 14,
  },

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 2,
  },

  imageContainer: {
    position: "relative",
    marginBottom: 14,
  },

  scanImage: {
    width: "100%",
    height: 190,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
  },

  zoomHint: {
    position: "absolute",
    right: 10,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },

  zoomHintText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#ffffff",
  },

  noImageBox: {
    width: "100%",
    height: 140,
    borderRadius: 14,
    backgroundColor: "#f8fafc",
    marginBottom: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderStyle: "dashed",
    gap: 6,
  },

  noImageText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#94a3b8",
  },

  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },

  cardTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0f172a",
  },

  bananaIndexBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748b",
    marginTop: 2,
  },

  badge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },

  badgeGreen: {
    backgroundColor: "#f0fdf4",
    borderColor: "#dcfce7",
  },

  badgeRed: {
    backgroundColor: "#fef2f2",
    borderColor: "#fee2e2",
  },

  badgeText: {
    fontSize: 11,
    fontWeight: "900",
  },

  badgeTextGreen: {
    color: "#16a34a",
  },

  badgeTextRed: {
    color: "#dc2626",
  },

  detailsBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },

  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  infoLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
  },

  bold: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0f172a",
  },

  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 10,
  },

  dateText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94a3b8",
  },

  emptyCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 32,
    alignItems: "center",
    marginTop: 20,
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 12,
  },

  emptyText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },

  // ===== FULL IMAGE MODAL =====

  imageModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.94)",
  },

  imageModalCloseButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 54 : 32,
    right: 20,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  imageModalCloseText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },

  imageModalBody: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 70,
    alignItems: "center",
    justifyContent: "center",
  },

  fullImage: {
    width: "100%",
    height: "100%",
  },
});