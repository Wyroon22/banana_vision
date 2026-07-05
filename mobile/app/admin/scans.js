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

        // [OPTIMIZE]
        // เดิม 200 รายการ ทำให้โหลดรูปใหญ่พร้อมกันหนักเกินไป
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
        {/* ปุ่มย้อนกลับ */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          activeOpacity={0.75}
        >
          <Ionicons name="arrow-back" size={22} color="#0f172a" />
          <Text style={styles.backText}>กลับ</Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>ประวัติการตรวจทั้งหมด</Text>

          <Text style={styles.subtitle}>
            ดึงข้อมูลจากตาราง scan_history ของ Supabase
          </Text>
        </View>

        {/* Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>จำนวนที่แสดง</Text>

          <Text style={styles.summaryValue}>
            {scans.length} รายการล่าสุด
          </Text>
        </View>

        {/* Loading */}
        {loading && scans.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#ca8a04" />
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
              />
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}

            // [OPTIMIZE]
            // ไม่ render 50 card พร้อมกัน
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={5}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews={Platform.OS === "android"}

            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>
                  ยังไม่มีประวัติการตรวจ
                </Text>

                <Text style={styles.emptyText}>
                  เมื่อมีการ Detect รูป ข้อมูล scan_history จะมาแสดงที่นี่
                </Text>
              </View>
            }

            renderItem={({ item }) => {
              // ให้ใช้รูปผลลัพธ์ตีกรอบก่อน
              // ถ้าไม่มีค่อย fallback ไปต้นฉบับ
              const imageUrl =
                item.result_image_url ||
                item.original_image_url ||
                null;

              return (
                <View style={styles.card}>
                  {/* รูป Scan */}
                  {imageUrl ? (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => openZoomImage(imageUrl)}
                    >
                      <Image
                        source={{ uri: imageUrl }}
                        style={styles.scanImage}
                        resizeMode="cover"

                        // Android ช่วยแสดงภาพ progressive ได้ดีขึ้น
                        progressiveRenderingEnabled

                        // ลดการกระพริบตอนรูปขึ้น
                        fadeDuration={150}
                      />

                      {/* Hint */}
                      <View style={styles.zoomHint}>
                        <Ionicons
                          name="search"
                          size={14}
                          color="#ffffff"
                        />

                        <Text style={styles.zoomHintText}>
                          แตะเพื่อดูเต็มรูป
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.noImageBox}>
                      <Ionicons
                        name="image-outline"
                        size={28}
                        color="#94a3b8"
                      />

                      <Text style={styles.noImageText}>
                        ไม่มีรูปภาพ
                      </Text>
                    </View>
                  )}

                  {/* Scan ID + จำนวนกล้วย */}
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle}>
                      Scan {String(item.id || "").slice(0, 8)}
                    </Text>

                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>
                        {item.total_bananas ?? 0} ลูก
                      </Text>
                    </View>
                  </View>

                  {/* ผู้ใช้ */}
                  <Text style={styles.infoText}>
                    ผู้ใช้:{" "}
                    <Text style={styles.bold}>
                      {item.user_id
                        ? String(item.user_id).slice(0, 8)
                        : item.guest_id
                        ? `Guest ${String(item.guest_id).slice(0, 8)}`
                        : "-"}
                    </Text>
                  </Text>

                  {/* Counts */}
                  <View style={styles.countGrid}>
                    <Text style={styles.countText}>
                      ดิบ:{" "}
                      <Text style={styles.bold}>
                        {item.green_count ?? 0}
                      </Text>
                    </Text>

                    <Text style={styles.countText}>
                      ห่าม:{" "}
                      <Text style={styles.bold}>
                        {item.breaker_count ?? 0}
                      </Text>
                    </Text>

                    <Text style={styles.countText}>
                      สุก:{" "}
                      <Text style={styles.bold}>
                        {item.ripe_count ?? 0}
                      </Text>
                    </Text>

                    <Text style={styles.countText}>
                      งอม:{" "}
                      <Text style={styles.bold}>
                        {item.overripe_count ?? 0}
                      </Text>
                    </Text>
                  </View>

                  {/* Inference */}
                  <Text style={styles.infoText}>
                    เวลา AI ประมวลผล:{" "}
                    <Text style={styles.bold}>
                      {formatMs(item.inference_ms)}
                    </Text>
                  </Text>

                  {/* Date */}
                  <Text style={styles.dateText}>
                    วันที่ตรวจ: {formatDate(item.created_at)}
                  </Text>
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
          {/* ปุ่มปิด */}
          <TouchableOpacity
            style={styles.imageModalCloseButton}
            onPress={closeZoomImage}
            activeOpacity={0.8}
          >
            <Ionicons
              name="close"
              size={24}
              color="#0f172a"
            />

            <Text style={styles.imageModalCloseText}>
              ปิด
            </Text>
          </TouchableOpacity>

          {/* รูปเต็มจอ */}
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

  scanImage: {
    width: "100%",
    height: 180,
    borderRadius: 14,
    backgroundColor: "#e2e8f0",
    marginBottom: 12,
  },

  zoomHint: {
    position: "absolute",
    right: 10,
    bottom: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(15, 23, 42, 0.72)",
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
    backgroundColor: "#f1f5f9",
    marginBottom: 12,
    alignItems: "center",
    justifyContent: "center",
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
    backgroundColor: "#e6f4ea",
  },

  badgeText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#137333",
  },

  infoText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 5,
  },

  countGrid: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 10,
    marginVertical: 8,
    gap: 4,
  },

  countText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
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

  // ===== FULL IMAGE MODAL =====

  imageModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.94)",
  },

  imageModalCloseButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 58 : 34,
    right: 20,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ffffff",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },

  imageModalCloseText: {
    fontSize: 15,
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