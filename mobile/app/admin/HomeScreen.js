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

import {
  SafeAreaView,
} from "react-native-safe-area-context";

import {
  Ionicons,
} from "@expo/vector-icons";

import {
  router,
} from "expo-router";

import ImageView from "react-native-image-viewing";

import {
  supabase,
} from "../../lib/supabase";

// ======================================================
// THEME
// ======================================================

const THEME = {
  bg: "#F8FAFC",
  surface: "#FFFFFF",
  border: "#F1F5F9",
  borderStrong: "#E2E8F0",

  textMain: "#0F172A",
  textMuted: "#64748B",

  accent: "#10B981",
  accentDark: "#047857",

  yellow: "#F59E0B",
  red: "#EF4444",
  blue: "#3B82F6",
  purple: "#8B5CF6",

  shadow: "#94A3B8",
};

// ======================================================
// RIPENESS HELPERS
// ======================================================

function normalizeRipeness(value) {
  const raw = String(
    value ?? ""
  )
    .trim()
    .toLowerCase();

  if (
    raw === "green" ||
    raw.includes("ดิบ")
  ) {
    return "green";
  }

  if (
    raw === "breaker" ||
    raw.includes("ห่าม")
  ) {
    return "breaker";
  }

  /*
   * ต้องตรวจ overripe ก่อน ripe
   * เพราะคำว่า overripe มีคำว่า ripe อยู่ข้างใน
   */
  if (
    raw === "overripe" ||
    raw === "over-ripe" ||
    raw.includes("งอม")
  ) {
    return "overripe";
  }

  if (
    raw === "ripe" ||
    raw.includes("สุก")
  ) {
    return "ripe";
  }

  return raw || null;
}

function toThaiRipeness(value) {
  const normalized =
    normalizeRipeness(value);

  switch (normalized) {
    case "green":
      return "ดิบ (Green)";

    case "breaker":
      return "ห่าม (Breaker)";

    case "ripe":
      return "สุก (Ripe)";

    case "overripe":
      return "งอม (Overripe)";

    default:
      return value || "-";
  }
}

/*
 * ใช้เฉพาะคอลัมน์ที่มีจริง:
 * - ripeness_th
 * - ripeness_label
 *
 * ห้ามใช้ row.ripeness
 * เพราะไม่มีคอลัมน์นี้ใน scan_details
 */
function getPredictedRipeness(row) {
  return normalizeRipeness(
    row?.ripeness_th ||
      row?.ripeness_label ||
      null
  );
}

function getRipenessStyle(status) {
  const normalized =
    normalizeRipeness(status);

  switch (normalized) {
    case "green":
      return {
        bg: "#F0FDF4",
        text: "#059669",
        fill: "#10B981",
        border: "#DCFCE7",
      };

    case "breaker":
      return {
        bg: "#FFFBEB",
        text: "#D97706",
        fill: "#F59E0B",
        border: "#FEF3C7",
      };

    case "ripe":
      return {
        bg: "#EFF6FF",
        text: "#2563EB",
        fill: "#3B82F6",
        border: "#DBEAFE",
      };

    case "overripe":
      return {
        bg: "#FEF2F2",
        text: "#DC2626",
        fill: "#EF4444",
        border: "#FEE2E2",
      };

    default:
      return {
        bg: "#F1F5F9",
        text: "#475569",
        fill: "#94A3B8",
        border: "#E2E8F0",
      };
  }
}

function getScanImageUrl(scan) {
  if (!scan) {
    return null;
  }

  return (
    scan.result_image_url ||
    scan.original_image_url ||
    null
  );
}

/*
 * แยกสถานะการตรวจสอบของผู้ใช้
 *
 * is_ai_correct = true
 * หมายถึง ผู้ใช้ยืนยันว่า AI ถูก
 *
 * is_ai_correct = false และมี user_selected_ripeness
 * หมายถึง ผู้ใช้แก้ไขผล AI
 */
function getReviewState(row) {
  const predicted =
    getPredictedRipeness(row);

  const corrected =
    normalizeRipeness(
      row?.user_selected_ripeness
    );

  const isConfirmed =
    row?.is_ai_correct === true;

  const isCorrected =
    row?.is_ai_correct === false &&
    Boolean(corrected);

  const finalRipeness =
    isConfirmed
      ? predicted
      : isCorrected
        ? corrected
        : corrected || predicted;

  return {
    predicted,
    corrected,
    isConfirmed,
    isCorrected,
    finalRipeness,
  };
}

// ======================================================
// MAIN COMPONENT
// ======================================================

export default function HomeScreen() {
  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    stats,
    setStats,
  ] = useState({
    users: 0,
    scans: 0,
    reviews: 0,
    comments: 0,
  });

  const [
    recentReviews,
    setRecentReviews,
  ] = useState([]);

  /*
   * กราฟนี้นับเฉพาะ Correction
   * หรือแถวที่มี user_selected_ripeness
   */
  const [
    ripenessChart,
    setRipenessChart,
  ] = useState([
    {
      key: "green",
      label: "ดิบ (Green)",
      count: 0,
    },
    {
      key: "breaker",
      label: "ห่าม (Breaker)",
      count: 0,
    },
    {
      key: "ripe",
      label: "สุก (Ripe)",
      count: 0,
    },
    {
      key: "overripe",
      label: "งอม (Overripe)",
      count: 0,
    },
  ]);

  const [
    loadingImages,
    setLoadingImages,
  ] = useState({});

  const [
    imageErrors,
    setImageErrors,
  ] = useState({});

  const [
    viewerVisible,
    setViewerVisible,
  ] = useState(false);

  const [
    viewerImageUri,
    setViewerImageUri,
  ] = useState(null);

  // ====================================================
  // IMAGE VIEWER
  // ====================================================

  const openFullImage = (
    uri,
    event
  ) => {
    if (
      event?.stopPropagation
    ) {
      event.stopPropagation();
    }

    if (!uri) {
      Alert.alert(
        "ไม่สามารถเปิดรูปภาพได้",
        "ไม่พบลิงก์รูปภาพผลการตรวจในระบบ"
      );

      return;
    }

    setViewerImageUri(uri);
    setViewerVisible(true);
  };

  const closeFullImage =
    () => {
      setViewerVisible(false);

      setTimeout(() => {
        setViewerImageUri(
          null
        );
      }, 200);
    };

  const handleImageLoadStart =
    (itemId) => {
      setLoadingImages(
        (previous) => ({
          ...previous,
          [itemId]: true,
        })
      );
    };

  const handleImageLoadEnd =
    (itemId) => {
      setLoadingImages(
        (previous) => ({
          ...previous,
          [itemId]: false,
        })
      );
    };

  const handleImageError =
    (
      itemId,
      error
    ) => {
      console.log(
        "[HOME REVIEW IMAGE ERROR]",
        itemId,
        error
      );

      setLoadingImages(
        (previous) => ({
          ...previous,
          [itemId]: false,
        })
      );

      setImageErrors(
        (previous) => ({
          ...previous,
          [itemId]: true,
        })
      );
    };

  // ====================================================
  // LOAD DASHBOARD
  // ====================================================

  const loadDashboard =
    useCallback(
      async () => {
        try {
          setLoading(true);

          const [
            profilesResult,
            scanHistoryResult,
            reviewedCountResult,
            feedbackCountResult,
            recentResult,
            chartResult,
          ] =
            await Promise.all([
              /*
               * จำนวนผู้ใช้งาน
               */
              supabase
                .from(
                  "profiles"
                )
                .select(
                  "id",
                  {
                    count:
                      "exact",
                    head:
                      true,
                  }
                ),

              /*
               * จำนวนการสแกนทั้งหมด
               */
              supabase
                .from(
                  "scan_history"
                )
                .select(
                  "id",
                  {
                    count:
                      "exact",
                    head:
                      true,
                  }
                ),

              /*
               * นับทั้ง:
               * 1. ผู้ใช้ยืนยัน AI
               * 2. ผู้ใช้แก้ผล AI
               */
              supabase
                .from(
                  "scan_details"
                )
                .select(
                  "id",
                  {
                    count:
                      "exact",
                    head:
                      true,
                  }
                )
                .or(
                  "is_ai_correct.not.is.null,user_selected_ripeness.not.is.null"
                ),

              /*
               * จำนวนความคิดเห็นทั้งหมด
               */
              supabase
                .from(
                  "feedback"
                )
                .select(
                  "id",
                  {
                    count:
                      "exact",
                    head:
                      true,
                  }
                ),

              /*
               * โหลดผลตรวจสอบล่าสุด
               *
               * ไม่มีคอลัมน์ ripeness
               * ใช้ ripeness_th และ ripeness_label เท่านั้น
               */
              supabase
                .from(
                  "scan_details"
                )
                .select(`
                  id,
                  scan_id,
                  banana_index,
                  ripeness_th,
                  ripeness_label,
                  confidence,
                  is_ai_correct,
                  user_selected_ripeness,
                  feedback_updated_at,
                  created_at
                `)
                .or(
                  "is_ai_correct.not.is.null,user_selected_ripeness.not.is.null"
                )
                .order(
                  "feedback_updated_at",
                  {
                    ascending:
                      false,
                    nullsFirst:
                      false,
                  }
                )
                .limit(5),

              /*
               * กราฟนับเฉพาะแถวที่ผู้ใช้
               * แก้ไขระดับความสุก
               */
              supabase
                .from(
                  "scan_details"
                )
                .select(
                  "user_selected_ripeness"
                )
                .not(
                  "user_selected_ripeness",
                  "is",
                  null
                ),
            ]);

          const firstError =
            profilesResult.error ||
            scanHistoryResult.error ||
            reviewedCountResult.error ||
            feedbackCountResult.error ||
            recentResult.error ||
            chartResult.error;

          if (firstError) {
            throw firstError;
          }

          setStats({
            users:
              profilesResult
                .count ?? 0,

            scans:
              scanHistoryResult
                .count ?? 0,

            reviews:
              reviewedCountResult
                .count ?? 0,

            comments:
              feedbackCountResult
                .count ?? 0,
          });

          // ==============================================
          // โหลด scan_history ของรายการล่าสุด
          // ==============================================

          const recentRows =
            Array.isArray(
              recentResult.data
            )
              ? recentResult.data
              : [];

          const recentScanIds = [
            ...new Set(
              recentRows
                .map(
                  (item) =>
                    item.scan_id
                )
                .filter(
                  Boolean
                )
            ),
          ];

          let scanRows = [];

          if (
            recentScanIds.length >
            0
          ) {
            const {
              data:
                scansData,
              error:
                scansError,
            } =
              await supabase
                .from(
                  "scan_history"
                )
                .select(`
                  id,
                  user_id,
                  guest_id,
                  result_image_url,
                  original_image_url
                `)
                .in(
                  "id",
                  recentScanIds
                );

            if (scansError) {
              throw scansError;
            }

            scanRows =
              Array.isArray(
                scansData
              )
                ? scansData
                : [];
          }

          // ==============================================
          // โหลดชื่อผู้ใช้จาก profiles
          // ==============================================

          const userIds = [
            ...new Set(
              scanRows
                .map(
                  (scan) =>
                    scan.user_id
                )
                .filter(
                  Boolean
                )
            ),
          ];

          const profileMap =
            new Map();

          if (
            userIds.length >
            0
          ) {
            const {
              data:
                profilesData,
              error:
                profilesError,
            } =
              await supabase
                .from(
                  "profiles"
                )
                .select(
                  "id, display_name, email"
                )
                .in(
                  "id",
                  userIds
                );

            /*
             * ไม่ให้หน้า Dashboard พัง
             * ถ้าโหลดชื่อ profile ไม่สำเร็จ
             */
            if (
              profilesError
            ) {
              console.log(
                "[ADMIN HOME PROFILE WARNING]",
                profilesError.message
              );
            }

            if (
              Array.isArray(
                profilesData
              )
            ) {
              profilesData.forEach(
                (
                  profile
                ) => {
                  const name =
                    profile
                      .display_name ||
                    profile
                      .email
                      ?.split(
                        "@"
                      )[0] ||
                    "ผู้ใช้งาน";

                  profileMap.set(
                    profile.id,
                    name
                  );
                }
              );
            }
          }

          const scanMap =
            new Map(
              scanRows.map(
                (
                  scan
                ) => [
                  String(
                    scan.id
                  ),
                  scan,
                ]
              )
            );

          const mergedRecentReviews =
            recentRows.map(
              (
                item
              ) => {
                const scan =
                  scanMap.get(
                    String(
                      item.scan_id
                    )
                  ) || {};

                let authorName =
                  "ผู้ใช้งานทั่วไป (Guest)";

                if (
                  scan.user_id
                ) {
                  authorName =
                    profileMap.get(
                      scan.user_id
                    ) ||
                    `User (${String(
                      scan.user_id
                    ).slice(
                      0,
                      6
                    )})`;
                } else if (
                  scan.guest_id
                ) {
                  authorName =
                    `Guest (${String(
                      scan.guest_id
                    ).slice(
                      0,
                      6
                    )})`;
                }

                return {
                  ...item,

                  author_name:
                    authorName,

                  result_image_url:
                    scan
                      .result_image_url ||
                    null,

                  original_image_url:
                    scan
                      .original_image_url ||
                    null,

                  scan_image_url:
                    getScanImageUrl(
                      scan
                    ),
                };
              }
            );

          setRecentReviews(
            mergedRecentReviews
          );

          setLoadingImages(
            {}
          );

          setImageErrors(
            {}
          );

          // ==============================================
          // สร้างข้อมูลกราฟ Correction
          // ==============================================

          const chartCounts = {
            green: 0,
            breaker: 0,
            ripe: 0,
            overripe: 0,
          };

          const chartRows =
            Array.isArray(
              chartResult.data
            )
              ? chartResult.data
              : [];

          chartRows.forEach(
            (
              row
            ) => {
              const key =
                normalizeRipeness(
                  row
                    .user_selected_ripeness
                );

              if (
                key &&
                Object.prototype
                  .hasOwnProperty
                  .call(
                    chartCounts,
                    key
                  )
              ) {
                chartCounts[
                  key
                ] += 1;
              }
            }
          );

          setRipenessChart([
            {
              key:
                "green",
              label:
                "ดิบ (Green)",
              count:
                chartCounts
                  .green,
            },
            {
              key:
                "breaker",
              label:
                "ห่าม (Breaker)",
              count:
                chartCounts
                  .breaker,
            },
            {
              key:
                "ripe",
              label:
                "สุก (Ripe)",
              count:
                chartCounts
                  .ripe,
            },
            {
              key:
                "overripe",
              label:
                "งอม (Overripe)",
              count:
                chartCounts
                  .overripe,
            },
          ]);
        } catch (
          error
        ) {
          console.error(
            "[ADMIN HOME ERROR]",
            error
          );

          Alert.alert(
            "การโหลดข้อมูลล้มเหลว",
            error?.message ||
              "กรุณาลองใหม่อีกครั้ง"
          );
        } finally {
          setLoading(false);
        }
      },
      []
    );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // ====================================================
  // CHART CALCULATION
  // ====================================================

  const totalChartCount =
    ripenessChart.reduce(
      (
        sum,
        item
      ) =>
        sum +
        item.count,
      0
    );

  const maxChartCount =
    Math.max(
      ...ripenessChart.map(
        (
          item
        ) =>
          item.count
      ),
      1
    );

  // ====================================================
  // UI
  // ====================================================

  return (
    <SafeAreaView
      style={
        styles.screen
      }
      edges={[
        "top",
      ]}
    >
      <ScrollView
        style={
          styles.container
        }
        contentContainerStyle={
          styles.contentContainer
        }
        refreshControl={
          <RefreshControl
            refreshing={
              loading
            }
            onRefresh={
              loadDashboard
            }
            tintColor={
              THEME.accent
            }
            colors={[
              THEME.accent,
            ]}
          />
        }
        showsVerticalScrollIndicator={
          false
        }
      >
        {/* APP HEADER */}
        <View
          style={
            styles.header
          }
        >
          <View
            style={{
              flex: 1,
            }}
          >
            <View
              style={
                styles.brandRow
              }
            >
              <View
                style={
                  styles.brandBadge
                }
              >
                <Ionicons
                  name="flash"
                  size={12}
                  color="#FFFFFF"
                />
              </View>

              <Text
                style={
                  styles.appTitle
                }
              >
                BANANA VISION
              </Text>
            </View>

            <Text
              style={
                styles.appSubtitle
              }
            >
              ระบบจัดการและวิเคราะห์ข้อมูลอัจฉริยะ
            </Text>
          </View>

          <View
            style={
              styles.statusIndicator
            }
          >
            <View
              style={
                styles.greenDot
              }
            />

            <Text
              style={
                styles.statusIndicatorText
              }
            >
              พร้อมใช้งาน
            </Text>
          </View>
        </View>

        {/* LOADING */}
        {loading && (
          <View
            style={
              styles.loadingBox
            }
          >
            <ActivityIndicator
              color={
                THEME.accent
              }
              size="small"
            />

            <Text
              style={
                styles.loadingText
              }
            >
              กำลังซิงค์ฐานข้อมูลล่าสุด...
            </Text>
          </View>
        )}

        {/* STAT GRID */}
        <View
          style={
            styles.grid
          }
        >
          <TouchableOpacity
            style={
              styles.statCard
            }
            activeOpacity={
              0.88
            }
            onPress={() =>
              router.push(
                "/admin/manage-users"
              )
            }
          >
            <View
              style={[
                styles.statIcon,
                {
                  backgroundColor:
                    "#EFF6FF",
                },
              ]}
            >
              <Ionicons
                name="people-outline"
                size={20}
                color={
                  THEME.blue
                }
              />
            </View>

            <Text
              style={
                styles.statValue
              }
            >
              {stats.users}
            </Text>

            <Text
              style={
                styles.statLabel
              }
            >
              ผู้ใช้งานทั้งหมด
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={
              styles.statCard
            }
            activeOpacity={
              0.88
            }
            onPress={() =>
              router.push(
                "/admin/scans"
              )
            }
          >
            <View
              style={[
                styles.statIcon,
                {
                  backgroundColor:
                    "#F0FDF4",
                },
              ]}
            >
              <Ionicons
                name="scan-outline"
                size={20}
                color={
                  THEME.accent
                }
              />
            </View>

            <Text
              style={
                styles.statValue
              }
            >
              {stats.scans}
            </Text>

            <Text
              style={
                styles.statLabel
              }
            >
              การสแกนทั้งหมด
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={
              styles.statCard
            }
            activeOpacity={
              0.88
            }
            onPress={() =>
              router.push(
                "/admin/corrections"
              )
            }
          >
            <View
              style={[
                styles.statIcon,
                {
                  backgroundColor:
                    "#FEF2F2",
                },
              ]}
            >
              <Ionicons
                name="git-compare-outline"
                size={20}
                color={
                  THEME.red
                }
              />
            </View>

            <Text
              style={
                styles.statValue
              }
            >
              {stats.reviews}
            </Text>

            <Text
              style={
                styles.statLabel
              }
            >
              ผลตรวจสอบจากผู้ใช้
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={
              styles.statCard
            }
            activeOpacity={
              0.88
            }
            onPress={() =>
              router.push(
                "/admin/manage-comments"
              )
            }
          >
            <View
              style={[
                styles.statIcon,
                {
                  backgroundColor:
                    "#FAF5FF",
                },
              ]}
            >
              <Ionicons
                name="chatbubbles-outline"
                size={20}
                color={
                  THEME.purple
                }
              />
            </View>

            <Text
              style={
                styles.statValue
              }
            >
              {stats.comments}
            </Text>

            <Text
              style={
                styles.statLabel
              }
            >
              ความคิดเห็น
            </Text>
          </TouchableOpacity>
        </View>

        {/* CORRECTION CHART */}
        <View
          style={
            styles.chartCard
          }
        >
          <View
            style={
              styles.chartHeader
            }
          >
            <View
              style={{
                flex: 1,
              }}
            >
              <Text
                style={
                  styles.sectionHeading
                }
              >
                ภาพรวมการแก้ไขระดับความสุก
              </Text>

              <Text
                style={
                  styles.sectionSubheading
                }
              >
                นับเฉพาะระดับที่ผู้ใช้แก้ไขจากผล AI
              </Text>
            </View>

            <View
              style={
                styles.chartTotalBadge
              }
            >
              <Text
                style={
                  styles.chartTotalText
                }
              >
                {totalChartCount} รายการ
              </Text>
            </View>
          </View>

          <View
            style={
              styles.chartBody
            }
          >
            {ripenessChart.map(
              (
                item
              ) => {
                const styleConfig =
                  getRipenessStyle(
                    item.key
                  );

                const widthPercent =
                  item.count ===
                  0
                    ? 0
                    : (
                        item.count /
                        maxChartCount
                      ) *
                      100;

                return (
                  <View
                    key={
                      item.key
                    }
                    style={
                      styles.barRow
                    }
                  >
                    <View
                      style={
                        styles.barLabelContainer
                      }
                    >
                      <View
                        style={[
                          styles.colorDot,
                          {
                            backgroundColor:
                              styleConfig
                                .fill,
                          },
                        ]}
                      />

                      <Text
                        style={
                          styles.barLabel
                        }
                      >
                        {item.label}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.barTrack
                      }
                    >
                      <View
                        style={[
                          styles.barFill,
                          {
                            width:
                              `${widthPercent}%`,

                            backgroundColor:
                              styleConfig
                                .fill,
                          },
                        ]}
                      />
                    </View>

                    <View
                      style={[
                        styles.barValueBadge,
                        {
                          backgroundColor:
                            styleConfig
                              .bg,

                          borderColor:
                            styleConfig
                              .border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.barValue,
                          {
                            color:
                              styleConfig
                                .text,
                          },
                        ]}
                      >
                        {item.count}
                      </Text>
                    </View>
                  </View>
                );
              }
            )}
          </View>

          {totalChartCount ===
            0 && (
            <Text
              style={
                styles.chartHint
              }
            >
              ยังไม่มีรายการที่ผู้ใช้แก้ไขระดับความสุก
            </Text>
          )}
        </View>

        {/* RECENT REVIEW HEADER */}
        <View
          style={
            styles.sectionHeader
          }
        >
          <View
            style={
              styles.sectionTitleRow
            }
          >
            <View
              style={{
                flex: 1,
              }}
            >
              <Text
                style={
                  styles.sectionHeading
                }
              >
                ผลตรวจสอบล่าสุด
              </Text>

              <Text
                style={
                  styles.sectionSubheading
                }
              >
                แสดงทั้งการยืนยันผล AI และการแก้ไขระดับความสุก
              </Text>
            </View>

            <TouchableOpacity
              style={
                styles.seeAllButton
              }
              activeOpacity={
                0.6
              }
              onPress={() =>
                router.push(
                  "/admin/corrections"
                )
              }
            >
              <Text
                style={
                  styles.seeAllText
                }
              >
                ดูทั้งหมด
              </Text>

              <Ionicons
                name="arrow-forward"
                size={13}
                color={
                  THEME.accentDark
                }
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* RECENT REVIEW LIST */}
        <View
          style={
            styles.logContainer
          }
        >
          {recentReviews.length ===
          0 ? (
            <View
              style={
                styles.emptyCard
              }
            >
              <Ionicons
                name="folder-open-outline"
                size={40}
                color="#CBD5E1"
                style={{
                  marginBottom:
                    10,
                }}
              />

              <Text
                style={
                  styles.emptyTitle
                }
              >
                ยังไม่มีผลตรวจสอบจากผู้ใช้
              </Text>

              <Text
                style={
                  styles.emptyText
                }
              >
                รายการจะปรากฏเมื่อผู้ใช้ยืนยันผล AI หรือแก้ไขระดับความสุก
              </Text>
            </View>
          ) : (
            recentReviews.map(
              (
                item
              ) => {
                const reviewState =
                  getReviewState(
                    item
                  );

                const aiLabel =
                  toThaiRipeness(
                    reviewState
                      .predicted
                  );

                const finalLabel =
                  toThaiRipeness(
                    reviewState
                      .finalRipeness
                  );

                const badgeStyle =
                  getRipenessStyle(
                    reviewState
                      .finalRipeness
                  );

                const imageLoading =
                  Boolean(
                    loadingImages[
                      item.id
                    ]
                  );

                const imageError =
                  Boolean(
                    imageErrors[
                      item.id
                    ]
                  );

                return (
                  <View
                    key={
                      String(
                        item.id
                      )
                    }
                    style={
                      styles.logCard
                    }
                  >
                    {/* IMAGE */}
                    {item
                      .scan_image_url &&
                    !imageError ? (
                      <TouchableOpacity
                        style={
                          styles.correctionImageContainer
                        }
                        activeOpacity={
                          0.94
                        }
                        onPress={(
                          event
                        ) =>
                          openFullImage(
                            item
                              .scan_image_url,
                            event
                          )
                        }
                      >
                        <Image
                          source={{
                            uri:
                              item
                                .scan_image_url,
                          }}
                          style={
                            styles.correctionImage
                          }
                          resizeMode="cover"
                          fadeDuration={
                            100
                          }
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
                          onError={(
                            event
                          ) =>
                            handleImageError(
                              item.id,
                              event
                                .nativeEvent
                                .error
                            )
                          }
                        />

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

                        {!imageLoading && (
                          <View
                            style={
                              styles.imageCaption
                            }
                          >
                            <Ionicons
                              name="expand-outline"
                              size={12}
                              color="#FFFFFF"
                            />

                            <Text
                              style={
                                styles.imageCaptionText
                              }
                            >
                              แตะเพื่อขยาย
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    ) : (
                      <View
                        style={
                          styles.noImageBox
                        }
                      >
                        <Ionicons
                          name="image-outline"
                          size={24}
                          color="#94A3B8"
                        />

                        <Text
                          style={
                            styles.noImageText
                          }
                        >
                          {imageError
                            ? "โหลดรูปล้มเหลว"
                            : "ไม่มีภาพแนบ"}
                        </Text>
                      </View>
                    )}

                    {/* USER AND BADGE */}
                    <View
                      style={
                        styles.logMeta
                      }
                    >
                      <View
                        style={
                          styles.userInfoBox
                        }
                      >
                        <View
                          style={
                            styles.userAvatarIcon
                          }
                        >
                          <Ionicons
                            name="person"
                            size={10}
                            color={
                              THEME.accent
                            }
                          />
                        </View>

                        <Text
                          style={
                            styles.logUser
                          }
                          numberOfLines={
                            1
                          }
                        >
                          {
                            item.author_name
                          }
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.miniBadge,
                          {
                            backgroundColor:
                              badgeStyle
                                .bg,

                            borderColor:
                              badgeStyle
                                .border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.miniBadgeText,
                            {
                              color:
                                badgeStyle
                                  .text,
                            },
                          ]}
                        >
                          {
                            finalLabel
                          }
                        </Text>
                      </View>
                    </View>

                    <Text
                      style={
                        styles.subMetaText
                      }
                    >
                      กล้วยลูกที่ #
                      {item
                        .banana_index ??
                        "-"}
                    </Text>

                    {/* REVIEW STATUS */}
                    <View
                      style={
                        styles.reviewStatusBadge
                      }
                    >
                      <Ionicons
                        name={
                          reviewState
                            .isConfirmed
                            ? "shield-checkmark"
                            : "create-outline"
                        }
                        size={15}
                        color={
                          reviewState
                            .isConfirmed
                            ? THEME.accent
                            : THEME.yellow
                        }
                      />

                      <Text
                        style={[
                          styles.reviewStatusText,
                          {
                            color:
                              reviewState
                                .isConfirmed
                                ? THEME.accentDark
                                : "#B45309",
                          },
                        ]}
                      >
                        {reviewState
                          .isConfirmed
                          ? "ผู้ใช้ยืนยันว่าผล AI ถูกต้อง"
                          : "ผู้ใช้แก้ไขผลการทำนายของ AI"}
                      </Text>
                    </View>

                    {/* COMPARISON */}
                    <View
                      style={
                        styles.comparisonWrapper
                      }
                    >
                      <View
                        style={
                          styles.compareNode
                        }
                      >
                        <Text
                          style={
                            styles.compareNodeLabel
                          }
                        >
                          โมเดลประมวลผล
                        </Text>

                        <Text
                          style={
                            styles.aiLabelText
                          }
                        >
                          {aiLabel}
                        </Text>
                      </View>

                      <View
                        style={
                          styles.compareArrowBox
                        }
                      >
                        <Ionicons
                          name={
                            reviewState
                              .isConfirmed
                              ? "checkmark"
                              : "arrow-forward"
                          }
                          size={15}
                          color={
                            reviewState
                              .isConfirmed
                              ? THEME.accent
                              : "#CBD5E1"
                          }
                        />
                      </View>

                      <View
                        style={
                          styles.compareNode
                        }
                      >
                        <Text
                          style={
                            styles.compareNodeLabel
                          }
                        >
                          {reviewState
                            .isConfirmed
                            ? "ผู้ใช้ยืนยัน"
                            : "ผู้ใช้แก้ไขเป็น"}
                        </Text>

                        <Text
                          style={
                            styles.userLabelText
                          }
                        >
                          {finalLabel}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              }
            )
          )}
        </View>
      </ScrollView>

      {/* FULL IMAGE VIEWER */}
      <ImageView
        images={
          viewerImageUri
            ? [
                {
                  uri:
                    viewerImageUri,
                },
              ]
            : []
        }
        imageIndex={0}
        visible={
          viewerVisible &&
          Boolean(
            viewerImageUri
          )
        }
        onRequestClose={
          closeFullImage
        }
        swipeToCloseEnabled
        doubleTapToZoomEnabled
        backgroundColor="#000000"
        HeaderComponent={() => (
          <View
            style={
              styles.viewerHeader
            }
          >
            <TouchableOpacity
              style={
                styles.viewerCloseButton
              }
              activeOpacity={
                0.8
              }
              onPress={
                closeFullImage
              }
            >
              <Ionicons
                name="close"
                size={24}
                color="#FFFFFF"
              />
            </TouchableOpacity>
          </View>
        )}
        FooterComponent={() => (
          <View
            style={
              styles.viewerFooter
            }
          >
            <Ionicons
              name="search-outline"
              size={14}
              color="#FFFFFF"
            />

            <Text
              style={
                styles.viewerFooterText
              }
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

const styles =
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor:
        THEME.bg,
    },

    container: {
      flex: 1,
    },

    contentContainer: {
      padding: 16,
      paddingBottom: 40,
    },

    header: {
      flexDirection: "row",
      justifyContent:
        "space-between",
      alignItems: "center",

      marginBottom: 16,

      backgroundColor:
        THEME.surface,

      padding: 16,

      borderRadius: 20,
      borderWidth: 1,
      borderColor:
        THEME.borderStrong,

      shadowColor:
        THEME.shadow,

      shadowOffset: {
        width: 0,
        height: 2,
      },

      shadowOpacity: 0.04,
      shadowRadius: 8,

      elevation: 2,
    },

    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },

    brandBadge: {
      width: 22,
      height: 22,

      borderRadius: 6,

      backgroundColor:
        THEME.accent,

      alignItems: "center",
      justifyContent:
        "center",
    },

    appTitle: {
      fontSize: 16,
      fontWeight: "900",
      color:
        THEME.textMain,
      letterSpacing: -0.3,
    },

    appSubtitle: {
      fontSize: 11,
      fontWeight: "600",
      color:
        THEME.textMuted,
      marginTop: 2,
    },

    statusIndicator: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,

      backgroundColor:
        "#F0FDF4",

      paddingHorizontal: 10,
      paddingVertical: 5,

      borderRadius: 99,

      borderWidth: 1,
      borderColor:
        "#DCFCE7",
    },

    greenDot: {
      width: 6,
      height: 6,

      borderRadius: 3,

      backgroundColor:
        THEME.accent,
    },

    statusIndicatorText: {
      fontSize: 10,
      fontWeight: "800",
      color: "#059669",
    },

    loadingBox: {
      backgroundColor:
        "#F0FDF4",

      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        "#BBF7D0",

      padding: 12,
      marginBottom: 16,

      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "center",

      gap: 10,
    },

    loadingText: {
      color: "#15803D",
      fontSize: 12,
      fontWeight: "700",
    },

    grid: {
      flexDirection: "row",
      flexWrap: "wrap",

      justifyContent:
        "space-between",

      rowGap: 12,

      marginBottom: 20,
    },

    statCard: {
      width: "48%",

      backgroundColor:
        THEME.surface,

      borderRadius: 18,

      borderWidth: 1,
      borderColor:
        THEME.borderStrong,

      padding: 14,

      shadowColor:
        THEME.shadow,

      shadowOffset: {
        width: 0,
        height: 2,
      },

      shadowOpacity: 0.03,
      shadowRadius: 6,

      elevation: 2,
    },

    statIcon: {
      width: 36,
      height: 36,

      borderRadius: 10,

      alignItems: "center",
      justifyContent:
        "center",

      marginBottom: 10,
    },

    statValue: {
      color:
        THEME.textMain,

      fontWeight: "900",
      fontSize: 20,
    },

    statLabel: {
      color:
        THEME.textMuted,

      fontWeight: "600",
      fontSize: 11,

      marginTop: 2,
    },

    chartCard: {
      backgroundColor:
        THEME.surface,

      borderRadius: 20,

      borderWidth: 1,
      borderColor:
        THEME.borderStrong,

      padding: 16,

      marginBottom: 24,

      shadowColor:
        THEME.shadow,

      shadowOffset: {
        width: 0,
        height: 2,
      },

      shadowOpacity: 0.03,
      shadowRadius: 6,

      elevation: 2,
    },

    chartHeader: {
      flexDirection: "row",
      justifyContent:
        "space-between",
      alignItems:
        "flex-start",

      marginBottom: 16,
    },

    chartTotalBadge: {
      backgroundColor:
        THEME.bg,

      borderRadius: 8,

      paddingHorizontal: 8,
      paddingVertical: 4,

      borderWidth: 1,
      borderColor:
        THEME.borderStrong,
    },

    chartTotalText: {
      color:
        THEME.textMain,

      fontWeight: "800",
      fontSize: 10,
    },

    chartBody: {
      gap: 12,
    },

    barRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },

    barLabelContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      width: 115,
    },

    colorDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },

    barLabel: {
      fontSize: 11,
      fontWeight: "700",
      color:
        THEME.textMuted,
    },

    barTrack: {
      flex: 1,
      height: 7,

      backgroundColor:
        "#F1F5F9",

      borderRadius: 99,

      overflow: "hidden",
    },

    barFill: {
      height: "100%",
      borderRadius: 99,
    },

    barValueBadge: {
      minWidth: 28,

      paddingHorizontal: 8,
      paddingVertical: 2,

      borderRadius: 8,

      borderWidth: 1,

      alignItems: "center",
    },

    barValue: {
      fontSize: 11,
      fontWeight: "900",
    },

    chartHint: {
      color:
        THEME.textMuted,

      fontSize: 11,
      fontWeight: "600",

      textAlign: "center",

      marginTop: 12,
    },

    sectionHeader: {
      marginBottom: 12,
    },

    sectionTitleRow: {
      flexDirection: "row",
      alignItems:
        "flex-end",
    },

    sectionHeading: {
      fontSize: 15,
      fontWeight: "900",
      color:
        THEME.textMain,
    },

    sectionSubheading: {
      fontSize: 11,
      fontWeight: "600",
      color:
        THEME.textMuted,
      marginTop: 2,
    },

    seeAllButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,

      backgroundColor:
        THEME.surface,

      paddingHorizontal: 8,
      paddingVertical: 5,

      borderRadius: 8,

      borderWidth: 1,
      borderColor:
        THEME.borderStrong,
    },

    seeAllText: {
      color:
        THEME.accentDark,

      fontWeight: "800",
      fontSize: 11,
    },

    logContainer: {
      gap: 14,
    },

    logCard: {
      backgroundColor:
        THEME.surface,

      borderRadius: 20,

      borderWidth: 1,
      borderColor:
        THEME.borderStrong,

      padding: 14,

      shadowColor:
        THEME.shadow,

      shadowOffset: {
        width: 0,
        height: 2,
      },

      shadowOpacity: 0.03,
      shadowRadius: 6,

      elevation: 2,
    },

    correctionImageContainer: {
      width: "100%",
      height: 170,

      borderRadius: 14,

      overflow: "hidden",

      marginBottom: 12,

      backgroundColor:
        "#F1F5F9",

      position: "relative",
    },

    correctionImage: {
      width: "100%",
      height: "100%",
    },

    imageLoadingOverlay: {
      ...StyleSheet.absoluteFillObject,

      justifyContent:
        "center",
      alignItems: "center",

      backgroundColor:
        "rgba(248,250,252,0.85)",

      gap: 6,
    },

    imageLoadingText: {
      fontSize: 11,
      fontWeight: "700",
      color:
        THEME.textMuted,
    },

    imageCaption: {
      position: "absolute",
      right: 8,
      bottom: 8,

      flexDirection: "row",
      alignItems: "center",
      gap: 4,

      backgroundColor:
        "rgba(15,23,42,0.75)",

      borderRadius: 99,

      paddingHorizontal: 8,
      paddingVertical: 4,
    },

    imageCaptionText: {
      fontSize: 10,
      fontWeight: "800",
      color: "#FFFFFF",
    },

    noImageBox: {
      width: "100%",
      height: 110,

      borderRadius: 14,

      marginBottom: 12,

      backgroundColor:
        "#F8FAFC",

      justifyContent:
        "center",
      alignItems: "center",

      gap: 5,

      borderWidth: 1,
      borderColor:
        THEME.borderStrong,

      borderStyle: "dashed",
    },

    noImageText: {
      fontSize: 11,
      fontWeight: "700",
      color: "#94A3B8",
    },

    logMeta: {
      flexDirection: "row",
      justifyContent:
        "space-between",
      alignItems: "center",

      marginBottom: 4,
    },

    userInfoBox: {
      flexDirection: "row",
      alignItems: "center",

      gap: 6,

      flex: 1,

      marginRight: 8,
    },

    userAvatarIcon: {
      width: 20,
      height: 20,

      borderRadius: 10,

      backgroundColor:
        "#F0FDF4",

      justifyContent:
        "center",
      alignItems: "center",

      borderWidth: 1,
      borderColor:
        "#BBF7D0",
    },

    logUser: {
      flex: 1,

      fontSize: 12,
      fontWeight: "900",

      color:
        THEME.textMain,
    },

    miniBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,

      borderRadius: 8,
      borderWidth: 1,
    },

    miniBadgeText: {
      fontSize: 10,
      fontWeight: "900",
    },

    subMetaText: {
      fontSize: 11,
      fontWeight: "600",

      color:
        THEME.textMuted,

      marginBottom: 10,
    },

    reviewStatusBadge: {
      alignSelf:
        "flex-start",

      flexDirection: "row",
      alignItems: "center",

      gap: 6,

      backgroundColor:
        "#F8FAFC",

      borderRadius: 999,

      borderWidth: 1,
      borderColor:
        THEME.borderStrong,

      paddingHorizontal: 10,
      paddingVertical: 6,

      marginBottom: 10,
    },

    reviewStatusText: {
      fontSize: 11,
      fontWeight: "800",
    },

    comparisonWrapper: {
      flexDirection: "row",

      backgroundColor:
        "#F8FAFC",

      borderRadius: 12,

      padding: 10,

      justifyContent:
        "space-between",
      alignItems: "center",

      borderWidth: 1,
      borderColor:
        "#F1F5F9",
    },

    compareNode: {
      flex: 1,
    },

    compareArrowBox: {
      width: 24,

      alignItems: "center",
      justifyContent:
        "center",

      marginTop: 10,
    },

    compareNodeLabel: {
      fontSize: 10,

      color:
        THEME.textMuted,

      fontWeight: "700",

      marginBottom: 3,
    },

    aiLabelText: {
      color:
        THEME.red,

      fontWeight: "900",
      fontSize: 12,
    },

    userLabelText: {
      color:
        THEME.accent,

      fontWeight: "900",
      fontSize: 12,
    },

    emptyCard: {
      backgroundColor:
        THEME.surface,

      borderRadius: 20,

      padding: 28,

      alignItems: "center",

      borderWidth: 1,
      borderColor:
        THEME.borderStrong,
    },

    emptyTitle: {
      color:
        THEME.textMain,

      fontWeight: "900",
      fontSize: 14,
    },

    emptyText: {
      color:
        THEME.textMuted,

      fontSize: 11,
      fontWeight: "600",

      marginTop: 3,

      textAlign: "center",
      lineHeight: 16,
    },

    viewerHeader: {
      width: "100%",

      alignItems:
        "flex-end",

      paddingHorizontal:
        16,

      paddingTop: 16,
    },

    viewerCloseButton: {
      width: 36,
      height: 36,

      borderRadius: 18,

      backgroundColor:
        "rgba(15,23,42,0.75)",

      justifyContent:
        "center",
      alignItems: "center",
    },

    viewerFooter: {
      alignSelf: "center",

      marginBottom: 28,

      flexDirection: "row",
      alignItems: "center",

      gap: 6,

      backgroundColor:
        "rgba(15,23,42,0.85)",

      borderRadius: 99,

      paddingHorizontal: 14,
      paddingVertical: 8,
    },

    viewerFooterText: {
      fontSize: 11,
      fontWeight: "800",
      color: "#FFFFFF",
    },
  });