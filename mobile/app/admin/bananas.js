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

      // STEP 1:
      // ดึงรายละเอียดกล้วยรายลูก
      const {
        data: detailData,
        error: detailError,
      } = await supabase
        .from("scan_details")
        .select(
          "id, scan_id, banana_index, ripeness_label, ripeness_th, confidence, user_selected_ripeness, user_selected_color_level, feedback_updated_at, created_at"
        )
        .order("created_at", { ascending: false })

        // [OPTIMIZE]
        // เดิม 200 ทำให้มีรูปซ้ำจำนวนมากและโหลดหนัก
        .limit(50);

      if (detailError) {
        throw detailError;
      }

      const details = Array.isArray(detailData)
        ? detailData
        : [];

      // STEP 2:
      // เอา scan_id ที่ไม่ซ้ำกัน
      const scanIds = [
        ...new Set(
          details
            .map((item) => item.scan_id)
            .filter(Boolean)
        ),
      ];

      let scanImageMap = {};

      // STEP 3:
      // ดึงรูปจาก scan_history
      if (scanIds.length > 0) {
        const {
          data: scanData,
          error: scanError,
        } = await supabase
          .from("scan_history")
          .select(
            "id, original_image_url, result_image_url"
          )
          .in("id", scanIds);

        if (scanError) {
          throw scanError;
        }

        // STEP 4:
        // map scan_id -> image URL
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

      // STEP 5:
      // รวม scan_details + URL รูป
      const mergedDetails = details.map((item) => ({
        ...item,
        scan_image_url:
          scanImageMap[item.scan_id] || null,
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
        {/* Back */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBack}
          activeOpacity={0.75}
        >
          <Ionicons
            name="arrow-back"
            size={22}
            color="#0f172a"
          />

          <Text style={styles.backText}>
            กลับ
          </Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>
            รายละเอียดกล้วยรายลูกทั้งหมด
          </Text>

          <Text style={styles.subtitle}>
            ดึงข้อมูลจากตาราง scan_details ของ Supabase
          </Text>
        </View>

        {/* Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>
            จำนวนที่แสดง
          </Text>

          <Text style={styles.summaryValue}>
            {bananas.length} รายการล่าสุด
          </Text>
        </View>

        {/* Loading */}
        {loading && bananas.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#ca8a04" />

            <Text style={styles.loadingText}>
              กำลังโหลดข้อมูล...
            </Text>
          </View>
        ) : (
          <FlatList
            data={bananas}
            keyExtractor={(item) => String(item.id)}

            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={loadBananas}
              />
            }

            showsVerticalScrollIndicator={false}

            contentContainerStyle={styles.listContent}

            // [OPTIMIZE]
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={5}
            updateCellsBatchingPeriod={50}
            removeClippedSubviews={Platform.OS === "android"}

            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>
                  ยังไม่มีข้อมูลกล้วยรายลูก
                </Text>

                <Text style={styles.emptyText}>
                  เมื่อมีการ Detect และบันทึก scan_details
                  ข้อมูลจะมาแสดงที่นี่
                </Text>
              </View>
            }

            renderItem={({ item }) => {
              const aiLabel = toThaiRipeness(
                item.ripeness_th ||
                item.ripeness_label
              );

              const userLabel = toThaiRipeness(
                item.user_selected_ripeness
              );

              const hasCorrection =
                !!item.user_selected_ripeness;

              return (
                <View style={styles.card}>
                  {/* Scan Image */}
                  {item.scan_image_url ? (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() =>
                        openZoomImage(item.scan_image_url)
                      }
                    >
                      <Image
                        source={{
                          uri: item.scan_image_url,
                        }}
                        style={styles.scanImage}
                        resizeMode="cover"
                        progressiveRenderingEnabled
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

                  {/* Card Header */}
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle}>
                      Scan{" "}
                      {String(item.scan_id || "").slice(
                        0,
                        8
                      )}{" "}
                      • ลูกที่{" "}
                      {item.banana_index ?? "-"}
                    </Text>

                    <View
                      style={[
                        styles.badge,
                        hasCorrection
                          ? styles.badgeRed
                          : styles.badgeGreen,
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          hasCorrection
                            ? styles.badgeTextRed
                            : styles.badgeTextGreen,
                        ]}
                      >
                        {hasCorrection
                          ? "มีการแก้ไข"
                          : aiLabel}
                      </Text>
                    </View>
                  </View>

                  {/* AI Prediction */}
                  <Text style={styles.infoText}>
                    AI ทำนาย:{" "}
                    <Text style={styles.bold}>
                      {aiLabel}
                    </Text>
                  </Text>

                  {/* Confidence */}
                  <Text style={styles.infoText}>
                    Confidence:{" "}
                    <Text style={styles.bold}>
                      {formatConfidence(
                        item.confidence
                      )}
                    </Text>
                  </Text>

                  {/* Correction */}
                  {hasCorrection && (
                    <>
                      <Text style={styles.infoText}>
                        ผู้ใช้แก้เป็น:{" "}
                        <Text style={styles.bold}>
                          {userLabel}
                        </Text>
                      </Text>

                      <Text style={styles.infoText}>
                        ระดับสี:{" "}
                        <Text style={styles.bold}>
                          {item.user_selected_color_level ||
                            "-"}
                        </Text>
                      </Text>
                    </>
                  )}

                  {/* Date */}
                  <Text style={styles.dateText}>
                    วันที่บันทึก:{" "}
                    {formatDate(item.created_at)}
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
          {/* Close */}
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

          {/* Full Image */}
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
  },

  badgeGreen: {
    backgroundColor: "#e6f4ea",
  },

  badgeRed: {
    backgroundColor: "#fef2f2",
  },

  badgeText: {
    fontSize: 11,
    fontWeight: "900",
  },

  badgeTextGreen: {
    color: "#137333",
  },

  badgeTextRed: {
    color: "#991b1b",
  },

  infoText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 5,
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