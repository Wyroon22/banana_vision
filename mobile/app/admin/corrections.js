import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

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
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

// [FULL IMAGE VIEWER]
import ImageView from "react-native-image-viewing";

import { supabase } from "../../lib/supabase";

// ======================================================
// RIPENESS HELPER
// ======================================================

function toThaiRipeness(value) {
  if (value === "green" || value === "ดิบ") {
    return "ดิบ";
  }

  if (value === "breaker" || value === "ห่าม") {
    return "ห่าม";
  }

  if (value === "ripe" || value === "สุก") {
    return "สุก";
  }

  if (value === "overripe" || value === "งอม") {
    return "งอม";
  }

  return value || "-";
}

// ======================================================
// DATE HELPER
// ======================================================

function formatDate(value) {
  if (!value) {
    return "-";
  }

  try {
    return new Date(value).toLocaleString("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "-";
  }
}

// ======================================================
// BADGE COLOR
// ======================================================

function getBadgeStyle(label) {
  switch (label) {
    case "ดิบ":
      return {
        bg: "#e6f4ea",
        text: "#137333",
      };

    case "ห่าม":
      return {
        bg: "#fff7ed",
        text: "#c2410c",
      };

    case "สุก":
      return {
        bg: "#fef9c3",
        text: "#ca8a04",
      };

    case "งอม":
      return {
        bg: "#fef2f2",
        text: "#991b1b",
      };

    default:
      return {
        bg: "#f1f5f9",
        text: "#475569",
      };
  }
}

// ======================================================
// MAIN COMPONENT
// ======================================================

export default function AdminCorrectionsScreen() {
  // ====================================================
  // MAIN DATA STATE
  // ====================================================

  const [loading, setLoading] = useState(false);

  const [corrections, setCorrections] = useState([]);

  // ====================================================
  // IMAGE LOADING STATE
  // ====================================================

  // เก็บ id ของรูปที่กำลังโหลด
  const [loadingImages, setLoadingImages] = useState({});

  // เก็บ id ของรูปที่โหลดไม่สำเร็จ
  const [imageErrors, setImageErrors] = useState({});

  // ====================================================
  // FULL SCREEN IMAGE VIEWER STATE
  // ====================================================

  const [viewerVisible, setViewerVisible] =
    useState(false);

  const [viewerImageUri, setViewerImageUri] =
    useState(null);

  // ====================================================
  // BACK
  // ====================================================

  const handleBack = () => {
    if (
      router.canGoBack &&
      router.canGoBack()
    ) {
      router.back();
    } else {
      router.replace("/admin");
    }
  };

  // ====================================================
  // OPEN FULL IMAGE
  // ====================================================

  const openFullImage = (uri) => {
    if (!uri) {
      Alert.alert(
        "เปิดรูปไม่ได้",
        "ไม่พบ URL ของรูปผลการตรวจ"
      );

      return;
    }

    setViewerImageUri(uri);
    setViewerVisible(true);
  };

  // ====================================================
  // CLOSE FULL IMAGE
  // ====================================================

  const closeFullImage = () => {
    setViewerVisible(false);

    // รอ animation ปิดก่อนค่อยล้าง URI
    setTimeout(() => {
      setViewerImageUri(null);
    }, 250);
  };

  // ====================================================
  // LOAD CORRECTIONS
  //
  // scan_details
  //      ↓ scan_id
  // scan_history
  //      ↓ result_image_url
  // ====================================================

  const loadCorrections = useCallback(async () => {
    try {
      setLoading(true);

      // ==========================================
      // STEP 1
      // ดึงเฉพาะรายการที่ User แก้ Label แล้ว
      // ==========================================

      const {
        data: detailsData,
        error: detailsError,
      } = await supabase
        .from("scan_details")
        .select(
          `
            id,
            scan_id,
            banana_index,
            ripeness_label,
            ripeness_th,
            confidence,
            user_selected_ripeness,
            user_selected_color_level,
            feedback_updated_at,
            created_at
          `
        )
        .not(
          "user_selected_ripeness",
          "is",
          null
        )
        .order("feedback_updated_at", {
          ascending: false,
        });

      if (detailsError) {
        throw detailsError;
      }

      const details = Array.isArray(detailsData)
        ? detailsData
        : [];

      // ==========================================
      // ถ้าไม่มี Correction
      // ==========================================

      if (details.length === 0) {
        setCorrections([]);
        return;
      }

      // ==========================================
      // STEP 2
      // เก็บ scan_id แบบไม่ซ้ำ
      // ==========================================

      const scanIds = [
        ...new Set(
          details
            .map((item) => item.scan_id)
            .filter(Boolean)
        ),
      ];

      // ==========================================
      // STEP 3
      // ดึงรูปจาก scan_history
      // ==========================================

      const {
        data: scansData,
        error: scansError,
      } = await supabase
        .from("scan_history")
        .select(
          `
            id,
            result_image_url,
            original_image_url
          `
        )
        .in("id", scanIds);

      if (scansError) {
        throw scansError;
      }

      const scans = Array.isArray(scansData)
        ? scansData
        : [];

      // ==========================================
      // STEP 4
      // สร้าง Map
      //
      // scan_id -> scan_history
      // ==========================================

      const scanMap = new Map(
        scans.map((scan) => [
          scan.id,
          scan,
        ])
      );

      // ==========================================
      // STEP 5
      // Merge scan_details + scan_history
      // ==========================================

      const mergedCorrections = details.map(
        (detail) => {
          const scan =
            scanMap.get(detail.scan_id) || {};

          // เลือกรูปตีกรอบก่อน
          // ถ้าไม่มีค่อยใช้รูปต้นฉบับ
          const scanImageUrl =
            scan.result_image_url ||
            scan.original_image_url ||
            null;

          return {
            ...detail,

            result_image_url:
              scan.result_image_url || null,

            original_image_url:
              scan.original_image_url || null,

            scan_image_url: scanImageUrl,
          };
        }
      );

      // ==========================================
      // SAVE DATA
      // ==========================================

      setCorrections(mergedCorrections);

      // Reset image states
      setImageErrors({});
      setLoadingImages({});
    } catch (error) {
      console.error(
        "[ADMIN CORRECTIONS ERROR]",
        error
      );

      Alert.alert(
        "โหลดผลแก้ไขไม่สำเร็จ",
        error?.message || "กรุณาลองใหม่"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // ====================================================
  // LOAD FIRST TIME
  // ====================================================

  useEffect(() => {
    loadCorrections();
  }, [loadCorrections]);

  // ====================================================
  // IMAGE LOAD START
  // ====================================================

  const handleImageLoadStart = (itemId) => {
    setLoadingImages((previous) => ({
      ...previous,
      [itemId]: true,
    }));
  };

  // ====================================================
  // IMAGE LOAD END
  // ====================================================

  const handleImageLoadEnd = (itemId) => {
    setLoadingImages((previous) => ({
      ...previous,
      [itemId]: false,
    }));
  };

  // ====================================================
  // IMAGE ERROR
  // ====================================================

  const handleImageError = (
    itemId,
    error
  ) => {
    console.log(
      "[CORRECTION IMAGE ERROR]",
      itemId,
      error
    );

    setLoadingImages((previous) => ({
      ...previous,
      [itemId]: false,
    }));

    setImageErrors((previous) => ({
      ...previous,
      [itemId]: true,
    }));
  };

  // ====================================================
  // UI
  // ====================================================

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* ================================================= */}
      {/* MAIN PAGE */}
      {/* ================================================= */}

      <View style={styles.container}>
        {/* ====================================== */}
        {/* BACK BUTTON */}
        {/* ====================================== */}

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

        {/* ====================================== */}
        {/* HEADER */}
        {/* ====================================== */}

        <View style={styles.header}>
          <Text style={styles.title}>
            ผลแก้ไขจากผู้ใช้
          </Text>

          <Text style={styles.subtitle}>
            แสดงรูปผลตรวจจริง พร้อม Label ที่ AI
            ทำนายและค่าที่ผู้ใช้แก้ไข
          </Text>
        </View>

        {/* ====================================== */}
        {/* SUMMARY */}
        {/* ====================================== */}

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>
            จำนวนผลแก้ไขทั้งหมด
          </Text>

          <Text style={styles.summaryValue}>
            {corrections.length} รายการ
          </Text>
        </View>

        {/* ====================================== */}
        {/* LOADING / LIST */}
        {/* ====================================== */}

        {loading &&
        corrections.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator
              color="#ca8a04"
            />

            <Text style={styles.loadingText}>
              กำลังโหลดข้อมูล...
            </Text>
          </View>
        ) : (
          <FlatList
            data={corrections}
            keyExtractor={(item) =>
              String(item.id)
            }
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={loadCorrections}
              />
            }
            showsVerticalScrollIndicator={
              false
            }
            contentContainerStyle={
              styles.listContent
            }
            ListEmptyComponent={
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>
                  ยังไม่มีผลแก้ไขจากผู้ใช้
                </Text>

                <Text style={styles.emptyText}>
                  เมื่อผู้ใช้เลือก
                  ดิบ/ห่าม/สุก/งอม และกดบันทึก
                  ข้อมูลจะมาแสดงที่นี่
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              // ==================================
              // AI LABEL
              // ==================================

              const aiLabel =
                toThaiRipeness(
                  item.ripeness_th ||
                    item.ripeness_label
                );

              // ==================================
              // USER LABEL
              // ==================================

              const userLabel =
                toThaiRipeness(
                  item.user_selected_ripeness
                );

              // ==================================
              // BADGE STYLE
              // ==================================

              const badgeStyle =
                getBadgeStyle(userLabel);

              // ==================================
              // IMAGE STATE
              // ==================================

              const imageLoading =
                Boolean(
                  loadingImages[item.id]
                );

              const imageError =
                Boolean(
                  imageErrors[item.id]
                );

              // ==================================
              // CARD
              // ==================================

              return (
                <View style={styles.card}>
                  {/* ============================ */}
                  {/* REAL SCAN IMAGE */}
                  {/* CLICKABLE */}
                  {/* ============================ */}

                  {item.scan_image_url &&
                  !imageError ? (
                    <TouchableOpacity
                      style={
                        styles.imageContainer
                      }
                      activeOpacity={0.92}
                      onPress={() =>
                        openFullImage(
                          item.scan_image_url
                        )
                      }
                    >
                      {/* IMAGE */}

                      <Image
                        source={{
                          uri: item.scan_image_url,
                        }}
                        style={styles.scanImage}
                        resizeMode="cover"
                        fadeDuration={150}
                        onLoadStart={() =>
                          handleImageLoadStart(
                            item.id
                          )
                        }
                        onLoadEnd={() =>
                          handleImageLoadEnd(
                            item.id
                          )
                        }
                        onError={(event) =>
                          handleImageError(
                            item.id,
                            event.nativeEvent.error
                          )
                        }
                      />

                      {/* ======================== */}
                      {/* LOADING OVERLAY */}
                      {/* ======================== */}

                      {imageLoading && (
                        <View
                          style={
                            styles.imageLoadingOverlay
                          }
                        >
                          <ActivityIndicator
                            size="small"
                            color="#ca8a04"
                          />

                          <Text
                            style={
                              styles.imageLoadingText
                            }
                          >
                            กำลังโหลดรูป...
                          </Text>
                        </View>
                      )}

                      {/* ======================== */}
                      {/* TAP CAPTION */}
                      {/* ======================== */}

                      {!imageLoading && (
                        <View
                          style={
                            styles.imageCaption
                          }
                        >
                          <Ionicons
                            name="search-outline"
                            size={15}
                            color="#ffffff"
                          />

                          <Text
                            style={
                              styles.imageCaptionText
                            }
                          >
                            แตะเพื่อดูเต็มรูป
                          </Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  ) : (
                    // ============================
                    // NO IMAGE
                    // ============================

                    <View
                      style={styles.noImageBox}
                    >
                      <Ionicons
                        name="image-outline"
                        size={30}
                        color="#94a3b8"
                      />

                      <Text
                        style={
                          styles.noImageText
                        }
                      >
                        {imageError
                          ? "โหลดรูปไม่สำเร็จ"
                          : "ไม่มีรูปผลการตรวจ"}
                      </Text>
                    </View>
                  )}

                  {/* ============================ */}
                  {/* CARD TOP */}
                  {/* ============================ */}

                  <View style={styles.cardTop}>
                    <Text
                      style={styles.cardTitle}
                    >
                      Scan{" "}
                      {String(
                        item.scan_id || ""
                      ).slice(0, 8)}
                      {" • "}
                      ลูกที่{" "}
                      {item.banana_index ??
                        "-"}
                    </Text>

                    <View
                      style={[
                        styles.badge,
                        {
                          backgroundColor:
                            badgeStyle.bg,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          {
                            color:
                              badgeStyle.text,
                          },
                        ]}
                      >
                        {userLabel}
                      </Text>
                    </View>
                  </View>

                  {/* ============================ */}
                  {/* AI PREDICTION */}
                  {/* ============================ */}

                  <Text style={styles.infoText}>
                    AI ทำนาย:{" "}

                    <Text style={styles.aiLabel}>
                      {aiLabel}
                    </Text>
                  </Text>

                  {/* ============================ */}
                  {/* USER CORRECTION */}
                  {/* ============================ */}

                  <Text style={styles.infoText}>
                    ผู้ใช้แก้เป็น:{" "}

                    <Text
                      style={styles.userLabel}
                    >
                      {userLabel}
                    </Text>
                  </Text>

                  {/* ============================ */}
                  {/* COLOR LEVEL */}
                  {/* ============================ */}

                  <Text style={styles.infoText}>
                    ระดับสี:{" "}

                    <Text style={styles.bold}>
                      {item.user_selected_color_level ||
                        "-"}
                    </Text>
                  </Text>

                  {/* ============================ */}
                  {/* DATE */}
                  {/* ============================ */}

                  <Text style={styles.dateText}>
                    อัปเดตล่าสุด:{" "}
                    {formatDate(
                      item.feedback_updated_at ||
                        item.created_at
                    )}
                  </Text>
                </View>
              );
            }}
          />
        )}
      </View>

      {/* ================================================= */}
      {/* FULL SCREEN IMAGE VIEWER */}
      {/* ================================================= */}

      <ImageView
        images={
          viewerImageUri
            ? [
                {
                  uri: viewerImageUri,
                },
              ]
            : []
        }
        imageIndex={0}
        visible={
          viewerVisible &&
          Boolean(viewerImageUri)
        }
        onRequestClose={closeFullImage}
        swipeToCloseEnabled={true}
        doubleTapToZoomEnabled={true}
        backgroundColor="#000000"

        // ปุ่มปิดด้านบน
        HeaderComponent={() => (
          <SafeAreaView
            style={styles.viewerHeader}
          >
            <TouchableOpacity
              style={styles.viewerCloseButton}
              onPress={closeFullImage}
              activeOpacity={0.8}
            >
              <Ionicons
                name="close"
                size={28}
                color="#ffffff"
              />
            </TouchableOpacity>
          </SafeAreaView>
        )}

        // ข้อความด้านล่าง
        FooterComponent={() => (
          <View style={styles.viewerFooter}>
            <Ionicons
              name="search-outline"
              size={16}
              color="#ffffff"
            />

            <Text
              style={styles.viewerFooterText}
            >
              ใช้นิ้วซูมเข้า-ออก • ปัดลงเพื่อปิด
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

// ======================================================
// STYLES
// ======================================================

const styles = StyleSheet.create({
  // ====================================================
  // PAGE
  // ====================================================

  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },

  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 20,
    paddingTop:
      Platform.OS === "android"
        ? 24
        : 8,
  },

  // ====================================================
  // BACK
  // ====================================================

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

  // ====================================================
  // HEADER
  // ====================================================

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

  // ====================================================
  // SUMMARY
  // ====================================================

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

  // ====================================================
  // LOADING
  // ====================================================

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

  // ====================================================
  // LIST
  // ====================================================

  listContent: {
    paddingBottom: 36,
  },

  // ====================================================
  // CARD
  // ====================================================

  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
    marginBottom: 14,
    overflow: "hidden",
  },

  // ====================================================
  // IMAGE
  // ====================================================

  imageContainer: {
    width: "100%",
    height: 190,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 14,
    backgroundColor: "#e2e8f0",
    position: "relative",
  },

  scanImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "#e2e8f0",
  },

  // ====================================================
  // IMAGE LOADING
  // ====================================================

  imageLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor:
      "rgba(248, 250, 252, 0.88)",
    gap: 8,
  },

  imageLoadingText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748b",
  },

  // ====================================================
  // IMAGE CAPTION
  // ====================================================

  imageCaption: {
    position: "absolute",
    left: 10,
    bottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor:
      "rgba(15, 23, 42, 0.82)",
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },

  imageCaptionText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#ffffff",
  },

  // ====================================================
  // NO IMAGE
  // ====================================================

  noImageBox: {
    width: "100%",
    height: 140,
    borderRadius: 14,
    marginBottom: 14,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },

  noImageText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#94a3b8",
  },

  // ====================================================
  // CARD INFO
  // ====================================================

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

  // ====================================================
  // EMPTY
  // ====================================================

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

  // ====================================================
  // FULL SCREEN VIEWER HEADER
  // ====================================================

  viewerHeader: {
    width: "100%",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop:
      Platform.OS === "android"
        ? 16
        : 4,
  },

  viewerCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor:
      "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    alignItems: "center",
  },

  // ====================================================
  // FULL SCREEN VIEWER FOOTER
  // ====================================================

  viewerFooter: {
    alignSelf: "center",
    marginBottom:
      Platform.OS === "ios"
        ? 28
        : 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor:
      "rgba(15, 23, 42, 0.82)",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },

  viewerFooterText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#ffffff",
  },
});