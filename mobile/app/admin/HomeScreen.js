import React, {
  useCallback,
  useEffect,
  useState,
} from "react";

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

// [FULL IMAGE VIEWER]
import ImageView from "react-native-image-viewing";

import { supabase } from "../../lib/supabase";

// ======================================================
// THEME
// ======================================================

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

// ======================================================
// RIPENESS HELPERS
// ======================================================

function normalizeRipeness(value) {
  const v = String(value || "")
    .trim()
    .toLowerCase();

  if (v === "green" || v === "ดิบ") {
    return "green";
  }

  if (v === "breaker" || v === "ห่าม") {
    return "breaker";
  }

  if (v === "ripe" || v === "สุก") {
    return "ripe";
  }

  if (v === "overripe" || v === "งอม") {
    return "overripe";
  }

  return "";
}

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
// RIPENESS COLOR
// ======================================================

function getRipenessStyle(status) {
  switch (status) {
    case "ดิบ":
      return {
        bg: "#e6f4ea",
        text: "#137333",
        fill: "#16a34a",
      };

    case "ห่าม":
      return {
        bg: "#fff7ed",
        text: "#c2410c",
        fill: "#f97316",
      };

    case "สุก":
      return {
        bg: THEME.accentLight,
        text: THEME.accent,
        fill: "#ca8a04",
      };

    case "งอม":
      return {
        bg: "#fef2f2",
        text: "#991b1b",
        fill: "#ef4444",
      };

    default:
      return {
        bg: "#f1f5f9",
        text: "#475569",
        fill: THEME.accent,
      };
  }
}

// ======================================================
// MAIN COMPONENT
// ======================================================

export default function HomeScreen() {
  // ====================================================
  // MAIN LOADING
  // ====================================================

  const [loading, setLoading] = useState(false);

  // ====================================================
  // DASHBOARD STATS
  // ====================================================

  const [stats, setStats] = useState({
    users: 0,
    scans: 0,
    bananas: 0,
    corrections: 0,
  });

  // ====================================================
  // RECENT CORRECTIONS
  // ====================================================

  const [
    recentCorrections,
    setRecentCorrections,
  ] = useState([]);

  // ====================================================
  // GRAPH
  // ====================================================

  const [
    ripenessChart,
    setRipenessChart,
  ] = useState([
    {
      key: "green",
      label: "ดิบ",
      count: 0,
    },
    {
      key: "breaker",
      label: "ห่าม",
      count: 0,
    },
    {
      key: "ripe",
      label: "สุก",
      count: 0,
    },
    {
      key: "overripe",
      label: "งอม",
      count: 0,
    },
  ]);

  // ====================================================
  // IMAGE STATES
  // ====================================================

  // รูปที่กำลังโหลด
  const [
    loadingImages,
    setLoadingImages,
  ] = useState({});

  // รูปที่โหลด Error
  const [
    imageErrors,
    setImageErrors,
  ] = useState({});

  // ====================================================
  // FULL SCREEN IMAGE VIEWER
  // ====================================================

  const [
    viewerVisible,
    setViewerVisible,
  ] = useState(false);

  const [
    viewerImageUri,
    setViewerImageUri,
  ] = useState(null);

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

    // รอ Animation ปิดก่อนค่อยล้าง URI
    setTimeout(() => {
      setViewerImageUri(null);
    }, 250);
  };

  // ====================================================
  // IMAGE EVENTS
  // ====================================================

  const handleImageLoadStart = (itemId) => {
    setLoadingImages((previous) => ({
      ...previous,
      [itemId]: true,
    }));
  };

  const handleImageLoadEnd = (itemId) => {
    setLoadingImages((previous) => ({
      ...previous,
      [itemId]: false,
    }));
  };

  const handleImageError = (
    itemId,
    error
  ) => {
    console.log(
      "[HOME CORRECTION IMAGE ERROR]",
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
  // LOAD DASHBOARD
  // ====================================================

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);

      // ==========================================
      // STEP 1
      // โหลดข้อมูล Dashboard หลักพร้อมกัน
      // ==========================================

      const [
        profilesResult,
        scanHistoryResult,
        scanDetailsResult,
        correctionCountResult,
        recentResult,
        chartResult,
      ] = await Promise.all([
        // จำนวนผู้ใช้
        supabase
          .from("profiles")
          .select("id", {
            count: "exact",
            head: true,
          }),

        // จำนวนครั้งที่ตรวจ
        supabase
          .from("scan_history")
          .select("id", {
            count: "exact",
            head: true,
          }),

        // จำนวนกล้วยทั้งหมด
        supabase
          .from("scan_details")
          .select("id", {
            count: "exact",
            head: true,
          }),

        // จำนวน Correction
        supabase
          .from("scan_details")
          .select("id", {
            count: "exact",
            head: true,
          })
          .not(
            "user_selected_ripeness",
            "is",
            null
          ),

        // Correction ล่าสุด 5 รายการ
        supabase
          .from("scan_details")
          .select(
            `
              id,
              banana_index,
              ripeness_th,
              ripeness_label,
              confidence,
              user_selected_ripeness,
              user_selected_color_level,
              feedback_updated_at,
              created_at,
              scan_id
            `
          )
          .not(
            "user_selected_ripeness",
            "is",
            null
          )
          .order("feedback_updated_at", {
            ascending: false,
          })
          .limit(5),

        // ข้อมูลสำหรับกราฟ
        supabase
          .from("scan_details")
          .select(
            "user_selected_ripeness"
          )
          .not(
            "user_selected_ripeness",
            "is",
            null
          ),
      ]);

      // ==========================================
      // ตรวจ Error
      // ==========================================

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

      // ==========================================
      // STEP 2
      // เซ็ตตัวเลข 4 ช่อง
      // ==========================================

      setStats({
        users: profilesResult.count ?? 0,
        scans: scanHistoryResult.count ?? 0,
        bananas: scanDetailsResult.count ?? 0,
        corrections:
          correctionCountResult.count ?? 0,
      });

      // ==========================================
      // STEP 3
      // เตรียม Correction ล่าสุด
      // ==========================================

      const recentRows = Array.isArray(
        recentResult.data
      )
        ? recentResult.data
        : [];

      // ==========================================
      // STEP 4
      // เก็บ scan_id แบบไม่ซ้ำ
      // ==========================================

      const recentScanIds = [
        ...new Set(
          recentRows
            .map((item) => item.scan_id)
            .filter(Boolean)
        ),
      ];

      // ==========================================
      // STEP 5
      // ดึงรูปจริงจาก scan_history
      // ==========================================

      let scanImageRows = [];

      if (recentScanIds.length > 0) {
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
          .in("id", recentScanIds);

        if (scansError) {
          throw scansError;
        }

        scanImageRows = Array.isArray(
          scansData
        )
          ? scansData
          : [];
      }

      // ==========================================
      // STEP 6
      // Map scan_id -> รูป
      // ==========================================

      const scanImageMap = new Map(
        scanImageRows.map((scan) => [
          scan.id,
          scan,
        ])
      );

      // ==========================================
      // STEP 7
      // Merge Correction + รูปจริง
      // ==========================================

      const mergedRecentCorrections =
        recentRows.map((item) => {
          const scan =
            scanImageMap.get(item.scan_id) ||
            {};

          const scanImageUrl =
            scan.result_image_url ||
            scan.original_image_url ||
            null;

          return {
            ...item,

            result_image_url:
              scan.result_image_url || null,

            original_image_url:
              scan.original_image_url || null,

            scan_image_url:
              scanImageUrl,
          };
        });

      setRecentCorrections(
        mergedRecentCorrections
      );

      // Reset image states
      setLoadingImages({});
      setImageErrors({});

      // ==========================================
      // STEP 8
      // คำนวณกราฟ
      // ==========================================

      const chartCounts = {
        green: 0,
        breaker: 0,
        ripe: 0,
        overripe: 0,
      };

      (chartResult.data || []).forEach(
        (row) => {
          const key = normalizeRipeness(
            row.user_selected_ripeness
          );

          if (
            key &&
            chartCounts[key] !== undefined
          ) {
            chartCounts[key] += 1;
          }
        }
      );

      setRipenessChart([
        {
          key: "green",
          label: "ดิบ",
          count: chartCounts.green,
        },
        {
          key: "breaker",
          label: "ห่าม",
          count: chartCounts.breaker,
        },
        {
          key: "ripe",
          label: "สุก",
          count: chartCounts.ripe,
        },
        {
          key: "overripe",
          label: "งอม",
          count: chartCounts.overripe,
        },
      ]);
    } catch (error) {
      console.error(
        "[ADMIN HOME ERROR]",
        error
      );

      Alert.alert(
        "โหลด Dashboard ไม่สำเร็จ",
        error?.message ||
          "กรุณาลองใหม่"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // ====================================================
  // FIRST LOAD
  // ====================================================

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // ====================================================
  // CHART CALCULATION
  // ====================================================

  const totalChartCount =
    ripenessChart.reduce(
      (sum, item) =>
        sum + item.count,
      0
    );

  const maxChartCount = Math.max(
    ...ripenessChart.map(
      (item) => item.count
    ),
    1
  );

  // ====================================================
  // UI
  // ====================================================

  return (
    <View style={styles.screen}>
      {/* ================================================= */}
      {/* MAIN SCROLL */}
      {/* ================================================= */}

      <ScrollView
        style={styles.container}
        contentContainerStyle={
          styles.contentContainer
        }
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={loadDashboard}
          />
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        {/* ====================================== */}
        {/* HEADER */}
        {/* ====================================== */}

        <View style={styles.header}>
          <View style={styles.headerTextBox}>
            <Text style={styles.appTitle}>
              BANANA VISION
            </Text>

            <Text style={styles.appSubtitle}>
              Admin Dashboard จากฐานข้อมูล
              Supabase
            </Text>
          </View>

          <View
            style={styles.statusIndicator}
          >
            <View style={styles.greenDot} />

            <Text
              style={
                styles.statusIndicatorText
              }
            >
              ระบบออนไลน์
            </Text>
          </View>
        </View>

        {/* ====================================== */}
        {/* LOADING */}
        {/* ====================================== */}

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator
              color={THEME.accent}
            />

            <Text style={styles.loadingText}>
              กำลังโหลดข้อมูล...
            </Text>
          </View>
        )}

        {/* ====================================== */}
        {/* STATS GRID */}
        {/* ====================================== */}

        <View style={styles.grid}>
          {/* USERS */}

          <TouchableOpacity
            style={styles.statCard}
            activeOpacity={0.82}
            onPress={() =>
              router.push("/admin/users")
            }
          >
            <View style={styles.statIcon}>
              <Ionicons
                name="people"
                size={18}
                color="#3b82f6"
              />
            </View>

            <Text style={styles.statLabel}>
              ผู้ใช้งานทั้งหมด
            </Text>

            <Text style={styles.statValue}>
              {stats.users}
            </Text>

            <Text style={styles.detailHint}>
              แตะเพื่อดูรายละเอียด
            </Text>
          </TouchableOpacity>

          {/* SCANS */}

          <TouchableOpacity
            style={styles.statCard}
            activeOpacity={0.82}
            onPress={() =>
              router.push("/admin/scans")
            }
          >
            <View style={styles.statIcon}>
              <Ionicons
                name="camera"
                size={18}
                color="#16a34a"
              />
            </View>

            <Text style={styles.statLabel}>
              จำนวนครั้งที่ตรวจ
            </Text>

            <Text style={styles.statValue}>
              {stats.scans}
            </Text>

            <Text style={styles.detailHint}>
              แตะเพื่อดูรายละเอียด
            </Text>
          </TouchableOpacity>

          {/* BANANAS */}

          <TouchableOpacity
            style={styles.statCard}
            activeOpacity={0.82}
            onPress={() =>
              router.push("/admin/bananas")
            }
          >
            <View style={styles.statIcon}>
              <Ionicons
                name="nutrition"
                size={18}
                color="#ca8a04"
              />
            </View>

            <Text style={styles.statLabel}>
              กล้วยที่ตรวจทั้งหมด
            </Text>

            <Text style={styles.statValue}>
              {stats.bananas}
            </Text>

            <Text style={styles.detailHint}>
              แตะเพื่อดูรายละเอียด
            </Text>
          </TouchableOpacity>

          {/* CORRECTIONS */}

          <TouchableOpacity
            style={styles.statCard}
            activeOpacity={0.82}
            onPress={() =>
              router.push(
                "/admin/corrections"
              )
            }
          >
            <View style={styles.statIcon}>
              <Ionicons
                name="create"
                size={18}
                color="#ef4444"
              />
            </View>

            <Text style={styles.statLabel}>
              ผลแก้ไขจากผู้ใช้
            </Text>

            <Text style={styles.statValue}>
              {stats.corrections}
            </Text>

            <Text style={styles.detailHint}>
              แตะเพื่อดูรายละเอียด
            </Text>
          </TouchableOpacity>
        </View>

        {/* ====================================== */}
        {/* CHART */}
        {/* ====================================== */}

        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <View style={styles.chartTitleBox}>
              <Text
                style={styles.sectionHeading}
              >
                กราฟผลแก้ไขจากผู้ใช้
              </Text>

              <Text
                style={
                  styles.sectionSubheading
                }
              >
                จำนวน Label Correction
                แยกตามระดับความสุก
              </Text>
            </View>

            <View
              style={styles.chartTotalBadge}
            >
              <Text
                style={styles.chartTotalText}
              >
                รวม {totalChartCount}
              </Text>
            </View>
          </View>

          {ripenessChart.map((item) => {
            const config =
              getRipenessStyle(item.label);

            const widthPercent =
              (item.count /
                maxChartCount) *
              100;

            return (
              <View
                key={item.key}
                style={styles.barRow}
              >
                <Text
                  style={styles.barLabel}
                >
                  {item.label}
                </Text>

                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${widthPercent}%`,
                        backgroundColor:
                          config.fill,
                      },
                    ]}
                  />
                </View>

                <Text
                  style={styles.barValue}
                >
                  {item.count}
                </Text>
              </View>
            );
          })}

          {totalChartCount === 0 && (
            <Text style={styles.chartHint}>
              ยังไม่มีข้อมูลกราฟ
              ให้ผู้ใช้บันทึก Label Correction
              ก่อน
            </Text>
          )}
        </View>

        {/* ====================================== */}
        {/* RECENT CORRECTION HEADER */}
        {/* ====================================== */}

        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <View style={{ flex: 1 }}>
              <Text
                style={styles.sectionHeading}
              >
                ผลแก้ไขล่าสุดจากผู้ใช้
              </Text>

              <Text
                style={
                  styles.sectionSubheading
                }
              >
                แสดงรูปผลตรวจจริง พร้อม Label
                ที่ AI ทำนายและค่าที่ผู้ใช้แก้ไข
              </Text>
            </View>

            <TouchableOpacity
              style={styles.seeAllButton}
              activeOpacity={0.8}
              onPress={() =>
                router.push(
                  "/admin/corrections"
                )
              }
            >
              <Text style={styles.seeAllText}>
                ดูทั้งหมด
              </Text>

              <Ionicons
                name="chevron-forward"
                size={15}
                color={THEME.accent}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* ====================================== */}
        {/* RECENT CORRECTIONS */}
        {/* ====================================== */}

        <View style={styles.logContainer}>
          {recentCorrections.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                ยังไม่มีผลแก้ไขจากผู้ใช้
              </Text>

              <Text style={styles.emptyText}>
                เมื่อผู้ใช้เลือก
                ดิบ/ห่าม/สุก/งอม
                และระดับสี
                ข้อมูลจะมาแสดงตรงนี้
              </Text>
            </View>
          ) : (
            recentCorrections.map(
              (item) => {
                // ============================
                // AI LABEL
                // ============================

                const aiLabel =
                  toThaiRipeness(
                    item.ripeness_th ||
                      item.ripeness_label
                  );

                // ============================
                // USER LABEL
                // ============================

                const userLabel =
                  toThaiRipeness(
                    item.user_selected_ripeness
                  );

                // ============================
                // BADGE
                // ============================

                const badgeStyle =
                  getRipenessStyle(
                    userLabel
                  );

                // ============================
                // IMAGE STATE
                // ============================

                const imageLoading =
                  Boolean(
                    loadingImages[item.id]
                  );

                const imageError =
                  Boolean(
                    imageErrors[item.id]
                  );

                // ============================
                // CARD
                // ============================

                return (
                  <View
                    key={String(item.id)}
                    style={styles.logCard}
                  >
                    {/* ====================== */}
                    {/* REAL SCAN IMAGE */}
                    {/* CLICKABLE */}
                    {/* ====================== */}

                    {item.scan_image_url &&
                    !imageError ? (
                      <TouchableOpacity
                        style={
                          styles.correctionImageContainer
                        }
                        activeOpacity={0.92}
                        onPress={() =>
                          openFullImage(
                            item.scan_image_url
                          )
                        }
                      >
                        <Image
                          source={{
                            uri: item.scan_image_url,
                          }}
                          style={
                            styles.correctionImage
                          }
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
                              event.nativeEvent
                                .error
                            )
                          }
                        />

                        {/* IMAGE LOADING */}

                        {imageLoading && (
                          <View
                            style={
                              styles.imageLoadingOverlay
                            }
                          >
                            <ActivityIndicator
                              size="small"
                              color={
                                THEME.accent
                              }
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

                        {/* TAP HINT */}

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
                      // ======================
                      // NO IMAGE
                      // ======================

                      <View
                        style={
                          styles.noImageBox
                        }
                      >
                        <Ionicons
                          name="image-outline"
                          size={28}
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

                    {/* ====================== */}
                    {/* META */}
                    {/* ====================== */}

                    <View
                      style={styles.logMeta}
                    >
                      <Text
                        style={styles.logUser}
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
                          styles.miniBadge,
                          {
                            backgroundColor:
                              badgeStyle.bg,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.miniBadgeText,
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

                    {/* ====================== */}
                    {/* AI -> USER */}
                    {/* ====================== */}

                    <Text
                      style={styles.logText}
                    >
                      AI ทำนาย:{" "}

                      <Text
                        style={
                          styles.aiLabelText
                        }
                      >
                        {aiLabel}
                      </Text>

                      {" → "}

                      ผู้ใช้แก้เป็น:{" "}

                      <Text
                        style={
                          styles.userLabelText
                        }
                      >
                        {userLabel}
                      </Text>
                    </Text>

                    {/* ====================== */}
                    {/* COLOR */}
                    {/* ====================== */}

                    <Text
                      style={styles.logTime}
                    >
                      ระดับสี:{" "}

                      <Text
                        style={
                          styles.logTimeValue
                        }
                      >
                        {item.user_selected_color_level ||
                          "-"}
                      </Text>
                    </Text>
                  </View>
                );
              }
            )
          )}
        </View>
      </ScrollView>

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

        // ปุ่ม X ปิด
        HeaderComponent={() => (
          <View style={styles.viewerHeader}>
            <TouchableOpacity
              style={
                styles.viewerCloseButton
              }
              activeOpacity={0.8}
              onPress={closeFullImage}
            >
              <Ionicons
                name="close"
                size={28}
                color="#ffffff"
              />
            </TouchableOpacity>
          </View>
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
              style={
                styles.viewerFooterText
              }
            >
              ใช้นิ้วซูมเข้า-ออก •
              ปัดลงเพื่อปิด
            </Text>
          </View>
        )}
      />
    </View>
  );
}

// ======================================================
// STYLES
// ======================================================

const styles = StyleSheet.create({
  // ====================================================
  // SCREEN
  // ====================================================

  screen: {
    flex: 1,
    backgroundColor: THEME.bg,
  },

  container: {
    flex: 1,
    backgroundColor: THEME.bg,
  },

  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },

  // ====================================================
  // HEADER
  // ====================================================

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

  headerTextBox: {
    flex: 1,
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

  // ====================================================
  // LOADING
  // ====================================================

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

  // ====================================================
  // GRID
  // ====================================================

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

  // ====================================================
  // CHART
  // ====================================================

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

  chartTitleBox: {
    flex: 1,
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

  // ====================================================
  // SECTION
  // ====================================================

  sectionHeader: {
    marginBottom: 12,
  },

  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
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
    lineHeight: 18,
  },

  seeAllButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 4,
  },

  seeAllText: {
    color: THEME.accent,
    fontWeight: "900",
    fontSize: 11,
  },

  // ====================================================
  // LOG CONTAINER
  // ====================================================

  logContainer: {
    gap: 12,
  },

  // ====================================================
  // CORRECTION CARD
  // ====================================================

  logCard: {
    backgroundColor: THEME.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 12,
    overflow: "hidden",
  },

  // ====================================================
  // CORRECTION IMAGE
  // ====================================================

  correctionImageContainer: {
    width: "100%",
    height: 165,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 12,
    backgroundColor: "#e2e8f0",
    position: "relative",
  },

  correctionImage: {
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
    gap: 7,
  },

  imageLoadingText: {
    fontSize: 11,
    fontWeight: "800",
    color: THEME.textMuted,
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
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  imageCaptionText: {
    fontSize: 10,
    fontWeight: "900",
    color: "#ffffff",
  },

  // ====================================================
  // NO IMAGE
  // ====================================================

  noImageBox: {
    width: "100%",
    height: 120,
    borderRadius: 14,
    marginBottom: 12,
    backgroundColor: "#f1f5f9",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
  },

  noImageText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#94a3b8",
  },

  // ====================================================
  // LOG INFO
  // ====================================================

  logMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },

  logUser: {
    fontSize: 13,
    fontWeight: "900",
    color: THEME.textMain,
    flex: 1,
  },

  miniBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },

  miniBadgeText: {
    fontSize: 10,
    fontWeight: "900",
  },

  logText: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 20,
    fontWeight: "700",
  },

  aiLabelText: {
    color: THEME.red,
    fontWeight: "900",
  },

  userLabelText: {
    color: "#16a34a",
    fontWeight: "900",
  },

  logTime: {
    fontSize: 12,
    fontWeight: "700",
    color: THEME.textMuted,
    marginTop: 6,
  },

  logTimeValue: {
    color: THEME.textMain,
    fontWeight: "900",
  },

  // ====================================================
  // EMPTY
  // ====================================================

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

  // ====================================================
  // FULL SCREEN VIEWER HEADER
  // ====================================================

  viewerHeader: {
    width: "100%",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 54,
  },

  viewerCloseButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor:
      "rgba(15, 23, 42, 0.78)",
    justifyContent: "center",
    alignItems: "center",
  },

  // ====================================================
  // FULL SCREEN VIEWER FOOTER
  // ====================================================

  viewerFooter: {
    alignSelf: "center",
    marginBottom: 34,
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