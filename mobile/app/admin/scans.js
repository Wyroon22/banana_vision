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

  // [IMAGE PREVIEW] รูปที่กำลังเปิดเต็มจอ
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

  const loadScans = useCallback(async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
        .from("scan_history")
        .select(
          "id, user_id, guest_id, total_bananas, green_count, breaker_count, ripe_count, overripe_count, inference_ms, original_image_url, result_image_url, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) {
        throw error;
      }

      setScans(Array.isArray(data) ? data : []);
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
            <Ionicons name="document-text-outline" size={14} color="#16a34a" />
            <Text style={styles.summaryBadgeText}>{scans.length} รายการ</Text>
          </View>
        </View>

        {/* Title Section */}
        <View style={styles.header}>
          <Text style={styles.title}>ประวัติการตรวจทั้งหมด</Text>
          <Text style={styles.subtitle}>
            บันทึกประวัติการวิเคราะห์ผลกล้วยจากตาราง scan_history
          </Text>
        </View>

        {/* Loading */}
        {loading && scans.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#16a34a" />
            <Text style={styles.loadingText}>กำลังโหลดข้อมูล...</Text>
          </View>
        ) : (
          <FlatList
            data={scans}
            keyExtractor={(item) => String(item.id)}
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={loadScans}
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
                <Ionicons name="folder-open-outline" size={48} color="#cbd5e1" />
                <Text style={styles.emptyTitle}>
                  ยังไม่มีประวัติการตรวจ
                </Text>
                <Text style={styles.emptyText}>
                  เมื่อมีการสแกนรูปภาพ ข้อมูลจะมาแสดงที่นี่โดยอัตโนมัติ
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const imageUrl =
                item.result_image_url ||
                item.original_image_url ||
                null;

              return (
                <View style={styles.card}>
                  {/* รูป Scan */}
                  {imageUrl ? (
                    <TouchableOpacity
                      activeOpacity={0.92}
                      onPress={() => openZoomImage(imageUrl)}
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
                          size={13}
                          color="#ffffff"
                        />
                        <Text style={styles.zoomHintText}>แตะเพื่อขยายรูป</Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.noImageBox}>
                      <Ionicons
                        name="image-outline"
                        size={28}
                        color="#94a3b8"
                      />
                      <Text style={styles.noImageText}>ไม่มีรูปภาพ</Text>
                    </View>
                  )}

                  {/* Card Content Header */}
                  <View style={styles.cardTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardTitle}>
                        ID: {String(item.id || "").slice(0, 8)}...
                      </Text>
                      <Text style={styles.dateText}>
                        <Ionicons name="time-outline" size={12} color="#94a3b8" /> {formatDate(item.created_at)}
                      </Text>
                    </View>

                    <View style={styles.totalBadge}>
                      <Text style={styles.totalBadgeText}>
                        {item.total_bananas ?? 0} ลูก
                      </Text>
                    </View>
                  </View>

                  {/* ผู้ใช้ */}
                  <View style={styles.userRow}>
                    <Ionicons name="person-circle-outline" size={16} color="#64748b" />
                    <Text style={styles.infoText}>
                      ผู้ใช้งาน:{" "}
                      <Text style={styles.bold}>
                        {item.user_id
                          ? `User (${String(item.user_id).slice(0, 8)}...)`
                          : item.guest_id
                          ? `Guest (${String(item.guest_id).slice(0, 8)}...)`
                          : "ไม่ระบุตัวตน"}
                      </Text>
                    </Text>
                  </View>

                  {/* Counts Grid (ดิบ, ห่าม, สุก, งอม) */}
                  <View style={styles.countGrid}>
                    <View style={[styles.countBadgeItem, { backgroundColor: "#f0fdf4", borderColor: "#dcfce7" }]}>
                      <Text style={[styles.countLabel, { color: "#15803d" }]}>ดิบ</Text>
                      <Text style={[styles.countVal, { color: "#15803d" }]}>{item.green_count ?? 0}</Text>
                    </View>

                    <View style={[styles.countBadgeItem, { backgroundColor: "#fefce8", borderColor: "#fef08a" }]}>
                      <Text style={[styles.countLabel, { color: "#a16207" }]}>ห่าม</Text>
                      <Text style={[styles.countVal, { color: "#a16207" }]}>{item.breaker_count ?? 0}</Text>
                    </View>

                    <View style={[styles.countBadgeItem, { backgroundColor: "#eff6ff", borderColor: "#bfdbfe" }]}>
                      <Text style={[styles.countLabel, { color: "#1d4ed8" }]}>สุก</Text>
                      <Text style={[styles.countVal, { color: "#1d4ed8" }]}>{item.ripe_count ?? 0}</Text>
                    </View>

                    <View style={[styles.countBadgeItem, { backgroundColor: "#fef2f2", borderColor: "#fecaca" }]}>
                      <Text style={[styles.countLabel, { color: "#b91c1c" }]}>งอม</Text>
                      <Text style={[styles.countVal, { color: "#b91c1c" }]}>{item.overripe_count ?? 0}</Text>
                    </View>
                  </View>

                  {/* Footer Info: Inference Time */}
                  <View style={styles.cardFooter}>
                    <View style={styles.inferenceBox}>
                      <Ionicons name="flash-outline" size={13} color="#ca8a04" />
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

  totalBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#dcfce7",
  },

  totalBadgeText: {
    fontSize: 12,
    fontWeight: "900",
    color: "#16a34a",
  },

  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },

  infoText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
  },

  countGrid: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },

  countBadgeItem: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 8,
    alignItems: "center",
    borderWidth: 1,
  },

  countLabel: {
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 2,
  },

  countVal: {
    fontSize: 14,
    fontWeight: "900",
  },

  bold: {
    fontWeight: "900",
    color: "#0f172a",
  },

  dateText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94a3b8",
    marginTop: 2,
  },

  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    paddingTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  inferenceBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  inferenceText: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
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