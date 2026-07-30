import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import ImageView from "react-native-image-viewing";

import { supabase } from "../../lib/supabase";

// ======================================================
// THEME
// ======================================================

const THEME = {
  bg: "#F8FAFC",
  surface: "#FFFFFF",
  border: "#E2E8F0",
  borderSoft: "#F1F5F9",

  textMain: "#0F172A",
  textMuted: "#64748B",
  textLight: "#94A3B8",

  accent: "#10B981",
  accentDark: "#047857",

  red: "#EF4444",
  redDark: "#B91C1C",

  blue: "#3B82F6",
  yellow: "#F59E0B",
  purple: "#8B5CF6",

  shadow: "#94A3B8",
};

// ======================================================
// RIPENESS HELPERS
// ======================================================

function normalizeRipeness(value) {
  const raw = String(value ?? "")
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
   * เพราะคำว่า overripe มีคำว่า ripe อยู่ภายใน
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
  const normalized = normalizeRipeness(value);

  switch (normalized) {
    case "green":
      return "ดิบ";

    case "breaker":
      return "ห่าม";

    case "ripe":
      return "สุก";

    case "overripe":
      return "งอม";

    default:
      return value || "ไม่ทราบ";
  }
}


function getPredictedRipeness(detail) {
  return normalizeRipeness(
    detail?.ripeness_th ||
      detail?.ripeness_label ||
      null
  );
}

function getRipenessStyle(value) {
  const normalized = normalizeRipeness(value);

  switch (normalized) {
    case "green":
      return {
        bg: "#F0FDF4",
        text: "#059669",
        border: "#BBF7D0",
        strong: "#10B981",
      };

    case "breaker":
      return {
        bg: "#FFFBEB",
        text: "#D97706",
        border: "#FDE68A",
        strong: "#F59E0B",
      };

    case "ripe":
      return {
        bg: "#EFF6FF",
        text: "#2563EB",
        border: "#BFDBFE",
        strong: "#3B82F6",
      };

    case "overripe":
      return {
        bg: "#FEF2F2",
        text: "#DC2626",
        border: "#FECACA",
        strong: "#EF4444",
      };

    default:
      return {
        bg: "#F1F5F9",
        text: "#475569",
        border: "#CBD5E1",
        strong: "#94A3B8",
      };
  }
}

// ======================================================
// OTHER HELPERS
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
    return value;
  }
}

function formatMs(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "-";
  }

  return `${numericValue.toFixed(0)} ms`;
}

function buildImageUrl(value) {
  if (!value) {
    return null;
  }

  const clean = String(value)
    .trim()
    .replace(/\\/g, "/");

  if (!clean) {
    return null;
  }

  return clean;
}

function getScanImageUrl(scan) {
  return buildImageUrl(
    scan?.result_image_url ||
      scan?.original_image_url ||
      null
  );
}

function getReviewState(detail) {
  const predicted = getPredictedRipeness(detail);

  const corrected = normalizeRipeness(
    detail?.user_selected_ripeness
  );

  const isConfirmed =
    detail?.is_ai_correct === true;

  const isCorrected =
    detail?.is_ai_correct === false &&
    Boolean(corrected);

  const isReviewed =
    detail?.is_ai_correct === true ||
    detail?.is_ai_correct === false ||
    Boolean(corrected);

  const finalRipeness = isConfirmed
    ? predicted
    : isCorrected
      ? corrected
      : corrected || predicted;

  return {
    predicted,
    corrected,
    isConfirmed,
    isCorrected,
    isReviewed,
    finalRipeness,
  };
}

function getStatusConfig(detail) {
  const reviewState = getReviewState(detail);

  if (reviewState.isConfirmed) {
    return {
      label: "ยืนยันผล AI",
      description: "ผู้ใช้ยืนยันว่าผลการทำนายถูกต้อง",
      icon: "shield-checkmark",
      color: "#10B981",
      textColor: "#047857",
      bg: "#ECFDF5",
      border: "#A7F3D0",
    };
  }

  if (reviewState.isCorrected) {
    return {
      label: "แก้ไขผล AI",
      description: "ผู้ใช้เปลี่ยนระดับความสุกจากผลเดิม",
      icon: "create-outline",
      color: "#F59E0B",
      textColor: "#B45309",
      bg: "#FFFBEB",
      border: "#FDE68A",
    };
  }

  if (detail?.is_ai_correct === false) {
    return {
      label: "ระบุว่า AI ไม่ถูกต้อง",
      description: "ผู้ใช้ระบุว่าผล AI ไม่ถูกต้อง แต่ยังไม่มีค่าที่แก้ไข",
      icon: "close-circle",
      color: "#EF4444",
      textColor: "#B91C1C",
      bg: "#FEF2F2",
      border: "#FECACA",
    };
  }

  return {
    label: "ยังไม่ตรวจสอบ",
    description: "ยังไม่มีการยืนยันหรือแก้ไขผล",
    icon: "help-circle-outline",
    color: "#94A3B8",
    textColor: "#64748B",
    bg: "#F8FAFC",
    border: "#E2E8F0",
  };
}

// ======================================================
// MAIN COMPONENT
// ======================================================

export default function AdminCorrectionsScreen() {
  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    scansWithReviews,
    setScansWithReviews,
  ] = useState([]);

  const [
    searchQuery,
    setSearchQuery,
  ] = useState("");

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

  const [
    selectedScanItem,
    setSelectedScanItem,
  ] = useState(null);

  const [
    scanDetailsList,
    setScanDetailsList,
  ] = useState([]);

  const [
    loadingDetails,
    setLoadingDetails,
  ] = useState(false);

  const [
    detailsModalVisible,
    setDetailsModalVisible,
  ] = useState(false);

  // ====================================================
  // NAVIGATION
  // ====================================================

  const handleBack = () => {
    if (
      router.canGoBack &&
      router.canGoBack()
    ) {
      router.back();
      return;
    }

    router.replace("/admin");
  };

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
        "เปิดรูปไม่ได้",
        "ไม่พบ URL ของรูปผลการตรวจ"
      );
      return;
    }

    setViewerImageUri(uri);
    setViewerVisible(true);
  };

  const closeFullImage = () => {
    setViewerVisible(false);

    setTimeout(() => {
      setViewerImageUri(null);
    }, 200);
  };

  const handleImageLoadStart = (
    itemId
  ) => {
    setLoadingImages((previous) => ({
      ...previous,
      [itemId]: true,
    }));
  };

  const handleImageLoadEnd = (
    itemId
  ) => {
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
      "[ADMIN CORRECTION IMAGE ERROR]",
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
  // MODAL
  // ====================================================

  const handleOpenDetails = async (
    scanItem
  ) => {
    setSelectedScanItem(scanItem);
    setDetailsModalVisible(true);
    setLoadingDetails(true);
    setScanDetailsList([]);

    try {
      /*
       * โหลดรายละเอียดทุกลูกใน Scan
       * เพื่อให้ Admin เห็นทั้งลูกที่ยืนยัน,
       * ลูกที่แก้ไข และลูกที่ยังไม่ตรวจสอบ
       */
      const {
        data,
        error,
      } = await supabase
        .from("scan_details")
        .select(`
          id,
          scan_id,
          banana_index,
          ripeness_th,
          ripeness_label,
          confidence,
          is_ai_correct,
          user_selected_ripeness,
          user_selected_color_level,
          correction_comment,
          feedback_updated_at,
          created_at
        `)
        .eq(
          "scan_id",
          scanItem.scan_id
        )
        .order(
          "banana_index",
          {
            ascending: true,
          }
        );

      if (error) {
        throw error;
      }

      setScanDetailsList(
        Array.isArray(data)
          ? data
          : []
      );
    } catch (error) {
      console.log(
        "[ADMIN CORRECTIONS DETAIL ERROR]",
        error
      );

      Alert.alert(
        "โหลดรายละเอียดไม่สำเร็จ",
        error?.message ||
          "ไม่สามารถโหลดรายละเอียดผลตรวจสอบได้"
      );

      setScanDetailsList([]);
    } finally {
      setLoadingDetails(false);
    }
  };

  const closeDetailsModal = () => {
    setDetailsModalVisible(false);

    setTimeout(() => {
      setSelectedScanItem(null);
      setScanDetailsList([]);
      setLoadingDetails(false);
    }, 200);
  };

  // ====================================================
  // LOAD DATA
  // ====================================================

  const loadCorrections = useCallback(
    async () => {
      try {
        setLoading(true);

        /*
         * โหลดทั้ง:
         * - is_ai_correct = true
         * - is_ai_correct = false
         * - มี user_selected_ripeness
         */
        const {
          data: detailsData,
          error: detailsError,
        } = await supabase
          .from("scan_details")
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
              ascending: false,
              nullsFirst: false,
            }
          );

        if (detailsError) {
          throw detailsError;
        }

        const reviewedDetails =
          Array.isArray(detailsData)
            ? detailsData
            : [];

        if (
          reviewedDetails.length === 0
        ) {
          setScansWithReviews([]);
          setLoadingImages({});
          setImageErrors({});
          return;
        }

        const scanIds = [
          ...new Set(
            reviewedDetails
              .map(
                (item) =>
                  item.scan_id
              )
              .filter(Boolean)
          ),
        ];

        if (
          scanIds.length === 0
        ) {
          setScansWithReviews([]);
          return;
        }

        const {
          data: scansData,
          error: scansError,
        } = await supabase
          .from("scan_history")
          .select(`
            id,
            user_id,
            guest_id,
            total_bananas,
            green_count,
            breaker_count,
            ripe_count,
            overripe_count,
            inference_ms,
            result_image_url,
            original_image_url,
            created_at
          `)
          .in(
            "id",
            scanIds
          )
          .order(
            "created_at",
            {
              ascending: false,
            }
          );

        if (scansError) {
          throw scansError;
        }

        const scanRows =
          Array.isArray(scansData)
            ? scansData
            : [];

        const userIds = [
          ...new Set(
            scanRows
              .map(
                (scan) =>
                  scan.user_id
              )
              .filter(Boolean)
          ),
        ];

        const profileMap =
          new Map();

        if (
          userIds.length > 0
        ) {
          const {
            data: profilesData,
            error: profilesError,
          } = await supabase
            .from("profiles")
            .select(
              "id, display_name, email"
            )
            .in(
              "id",
              userIds
            );

          if (profilesError) {
            console.log(
              "[ADMIN CORRECTIONS PROFILE WARNING]",
              profilesError.message
            );
          }

          if (
            Array.isArray(
              profilesData
            )
          ) {
            profilesData.forEach(
              (profile) => {
                const name =
                  profile.display_name ||
                  profile.email
                    ?.split("@")[0] ||
                  "ผู้ใช้งาน";

                profileMap.set(
                  profile.id,
                  name
                );
              }
            );
          }
        }

        /*
         * จัดกลุ่ม detail ตาม scan_id
         */
        const detailMap = new Map();

        reviewedDetails.forEach(
          (detail) => {
            const key =
              String(
                detail.scan_id
              );

            const current =
              detailMap.get(key) ||
              [];

            current.push(detail);

            detailMap.set(
              key,
              current
            );
          }
        );

        const mergedList =
          scanRows.map((scan) => {
            let authorName =
              "ผู้ใช้งานทั่วไป (Guest)";

            if (scan.user_id) {
              authorName =
                profileMap.get(
                  scan.user_id
                ) ||
                `User (${String(
                  scan.user_id
                ).slice(0, 6)})`;
            } else if (
              scan.guest_id
            ) {
              authorName =
                `Guest (${String(
                  scan.guest_id
                ).slice(0, 6)})`;
            }

            const reviewDetails =
              detailMap.get(
                String(scan.id)
              ) || [];

            const confirmedCount =
              reviewDetails.filter(
                (detail) =>
                  detail.is_ai_correct ===
                  true
              ).length;

            const correctedCount =
              reviewDetails.filter(
                (detail) =>
                  detail.is_ai_correct ===
                    false &&
                  Boolean(
                    detail.user_selected_ripeness
                  )
              ).length;

            const incorrectOnlyCount =
              reviewDetails.filter(
                (detail) =>
                  detail.is_ai_correct ===
                    false &&
                  !detail.user_selected_ripeness
              ).length;

            const lastUpdatedAt =
              reviewDetails
                .map(
                  (detail) =>
                    detail.feedback_updated_at ||
                    detail.created_at
                )
                .filter(Boolean)
                .sort()
                .reverse()[0] ||
              scan.created_at;

            return {
              ...scan,

              scan_id: scan.id,

              author_name:
                authorName,

              scan_image_url:
                getScanImageUrl(scan),

              formatted_date:
                formatDate(
                  scan.created_at
                ),

              formatted_updated_date:
                formatDate(
                  lastUpdatedAt
                ),

              review_details:
                reviewDetails,

              reviewed_count:
                reviewDetails.length,

              confirmed_count:
                confirmedCount,

              corrected_count:
                correctedCount,

              incorrect_only_count:
                incorrectOnlyCount,
            };
          });

        /*
         * เรียงตามเวลาที่ผู้ใช้ตรวจสอบล่าสุด
         */
        mergedList.sort(
          (a, b) => {
            const aTimestamp =
              Math.max(
                ...(
                  a.review_details ||
                  []
                ).map((detail) =>
                  new Date(
                    detail.feedback_updated_at ||
                    detail.created_at ||
                    0
                  ).getTime()
                ),
                0
              );

            const bTimestamp =
              Math.max(
                ...(
                  b.review_details ||
                  []
                ).map((detail) =>
                  new Date(
                    detail.feedback_updated_at ||
                    detail.created_at ||
                    0
                  ).getTime()
                ),
                0
              );

            return (
              bTimestamp -
              aTimestamp
            );
          }
        );

        setScansWithReviews(
          mergedList
        );

        setImageErrors({});
        setLoadingImages({});
      } catch (error) {
        console.error(
          "[ADMIN CORRECTIONS ERROR]",
          error
        );

        Alert.alert(
          "โหลดผลตรวจสอบไม่สำเร็จ",
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
    loadCorrections();
  }, [loadCorrections]);

  // ====================================================
  // FILTER
  // ====================================================

  const filteredScans =
    useMemo(() => {
      const query =
        searchQuery
          .toLowerCase()
          .trim();

      if (!query) {
        return scansWithReviews;
      }

      return scansWithReviews.filter(
        (item) => {
          const author =
            String(
              item.author_name ||
              ""
            ).toLowerCase();

          const createdDate =
            String(
              item.formatted_date ||
              ""
            ).toLowerCase();

          const updatedDate =
            String(
              item.formatted_updated_date ||
              ""
            ).toLowerCase();

          const scanId =
            String(
              item.scan_id ||
              ""
            ).toLowerCase();

          return (
            author.includes(query) ||
            createdDate.includes(query) ||
            updatedDate.includes(query) ||
            scanId.includes(query)
          );
        }
      );
    }, [
      scansWithReviews,
      searchQuery,
    ]);

  // ====================================================
  // RENDER
  // ====================================================

  return (
    <SafeAreaView
      style={styles.safeArea}
    >
      <View
        style={styles.container}
      >
        {/* HEADER BAR */}
        <View
          style={styles.headerBar}
        >
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={0.75}
          >
            <Ionicons
              name="arrow-back"
              size={18}
              color={THEME.textMain}
            />

            <Text
              style={styles.backText}
            >
              ย้อนกลับ
            </Text>
          </TouchableOpacity>

          <View
            style={
              styles.summaryBadgeHeader
            }
          >
            <Ionicons
              name="shield-checkmark-outline"
              size={14}
              color={THEME.accent}
            />

            <Text
              style={
                styles.summaryBadgeText
              }
            >
              {filteredScans.length} รายการ
            </Text>
          </View>
        </View>

        {/* TITLE */}
        <View
          style={styles.header}
        >
          <Text
            style={styles.title}
          >
            ผลตรวจสอบจากผู้ใช้
          </Text>

          <Text
            style={styles.subtitle}
          >
            แสดงทั้งการยืนยันว่าผล AI ถูกต้อง และการแก้ไขระดับความสุกของกล้วยแต่ละลูก
          </Text>
        </View>

        {/* SEARCH */}
        <View
          style={
            styles.searchContainer
          }
        >
          <Ionicons
            name="search-outline"
            size={18}
            color={THEME.textMuted}
          />

          <TextInput
            style={styles.searchInput}
            placeholder="ค้นหาชื่อผู้ใช้ วันที่ หรือ Scan ID..."
            placeholderTextColor={
              THEME.textLight
            }
            value={searchQuery}
            onChangeText={
              setSearchQuery
            }
            autoCapitalize="none"
          />

          {searchQuery.length >
            0 && (
            <TouchableOpacity
              onPress={() =>
                setSearchQuery("")
              }
              activeOpacity={0.7}
            >
              <Ionicons
                name="close-circle"
                size={19}
                color={
                  THEME.textMuted
                }
              />
            </TouchableOpacity>
          )}
        </View>

        {/* LIST */}
        {loading &&
        scansWithReviews.length ===
          0 ? (
          <View
            style={styles.loadingBox}
          >
            <ActivityIndicator
              size="small"
              color={THEME.accent}
            />

            <Text
              style={
                styles.loadingText
              }
            >
              กำลังโหลดข้อมูลล่าสุด...
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredScans}
            keyExtractor={(item) =>
              String(item.id)
            }
            showsVerticalScrollIndicator={
              false
            }
            refreshControl={
              <RefreshControl
                refreshing={loading}
                onRefresh={
                  loadCorrections
                }
                tintColor={
                  THEME.accent
                }
                colors={[
                  THEME.accent,
                ]}
              />
            }
            contentContainerStyle={
              styles.listContent
            }
            ListEmptyComponent={
              <View
                style={styles.emptyCard}
              >
                <Ionicons
                  name="shield-checkmark-outline"
                  size={48}
                  color="#CBD5E1"
                />

                <Text
                  style={
                    styles.emptyTitle
                  }
                >
                  ยังไม่มีผลตรวจสอบ
                </Text>

                <Text
                  style={
                    styles.emptyText
                  }
                >
                  รายการจะปรากฏเมื่อผู้ใช้ยืนยันผล AI หรือแก้ไขระดับความสุก
                </Text>
              </View>
            }
            renderItem={({ item }) => {
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
                <TouchableOpacity
                  style={styles.card}
                  activeOpacity={0.95}
                  onPress={() =>
                    handleOpenDetails(
                      item
                    )
                  }
                >
                  {/* SCAN IMAGE */}
                  {item.scan_image_url &&
                  !imageError ? (
                    <TouchableOpacity
                      style={
                        styles.imageContainer
                      }
                      activeOpacity={0.92}
                      onPress={(event) =>
                        openFullImage(
                          item.scan_image_url,
                          event
                        )
                      }
                    >
                      <Image
                        source={{
                          uri:
                            item.scan_image_url,
                        }}
                        style={
                          styles.scanImage
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
                            size={13}
                            color="#FFFFFF"
                          />

                          <Text
                            style={
                              styles.imageCaptionText
                            }
                          >
                            แตะเพื่อขยายรูป
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
                        size={28}
                        color={
                          THEME.textLight
                        }
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

                  {/* USER */}
                  <View
                    style={styles.cardTop}
                  >
                    <View
                      style={
                        styles.userInfoBox
                      }
                    >
                      <Ionicons
                        name="person-circle-outline"
                        size={20}
                        color={
                          THEME.accent
                        }
                      />

                      <Text
                        style={
                          styles.userNameText
                        }
                        numberOfLines={1}
                      >
                        {item.author_name}
                      </Text>
                    </View>

                    <View
                      style={
                        styles.totalBadge
                      }
                    >
                      <Text
                        style={
                          styles.totalBadgeText
                        }
                      >
                        {item.total_bananas ??
                          0}{" "}
                        ลูก
                      </Text>
                    </View>
                  </View>

                  <View
                    style={styles.dateRow}
                  >
                    <Ionicons
                      name="time-outline"
                      size={13}
                      color={
                        THEME.textLight
                      }
                    />

                    <Text
                      style={styles.dateText}
                    >
                      วันที่สแกน:{" "}
                      {item.formatted_date}
                    </Text>
                  </View>

                  {/* REVIEW SUMMARY */}
                  <View
                    style={
                      styles.reviewSummaryRow
                    }
                  >
                    <View
                      style={[
                        styles.reviewSummaryItem,
                        {
                          backgroundColor:
                            "#ECFDF5",
                          borderColor:
                            "#A7F3D0",
                        },
                      ]}
                    >
                      <Ionicons
                        name="shield-checkmark"
                        size={17}
                        color={
                          THEME.accent
                        }
                      />

                      <Text
                        style={[
                          styles.reviewSummaryValue,
                          {
                            color:
                              THEME.accentDark,
                          },
                        ]}
                      >
                        {
                          item.confirmed_count
                        }
                      </Text>

                      <Text
                        style={[
                          styles.reviewSummaryLabel,
                          {
                            color:
                              THEME.accentDark,
                          },
                        ]}
                      >
                        ยืนยัน AI
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.reviewSummaryItem,
                        {
                          backgroundColor:
                            "#FFFBEB",
                          borderColor:
                            "#FDE68A",
                        },
                      ]}
                    >
                      <Ionicons
                        name="create-outline"
                        size={17}
                        color={
                          THEME.yellow
                        }
                      />

                      <Text
                        style={[
                          styles.reviewSummaryValue,
                          {
                            color:
                              "#B45309",
                          },
                        ]}
                      >
                        {
                          item.corrected_count
                        }
                      </Text>

                      <Text
                        style={[
                          styles.reviewSummaryLabel,
                          {
                            color:
                              "#B45309",
                          },
                        ]}
                      >
                        แก้ไขผล
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.reviewSummaryItem,
                        {
                          backgroundColor:
                            "#F8FAFC",
                          borderColor:
                            THEME.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name="document-text-outline"
                        size={17}
                        color={
                          THEME.textMuted
                        }
                      />

                      <Text
                        style={[
                          styles.reviewSummaryValue,
                          {
                            color:
                              THEME.textMain,
                          },
                        ]}
                      >
                        {
                          item.reviewed_count
                        }
                      </Text>

                      <Text
                        style={[
                          styles.reviewSummaryLabel,
                          {
                            color:
                              THEME.textMuted,
                          },
                        ]}
                      >
                        ตรวจแล้ว
                      </Text>
                    </View>
                  </View>

                  {/* ORIGINAL COUNTS */}
                  <View
                    style={styles.countGrid}
                  >
                    <View
                      style={[
                        styles.countBadgeItem,
                        {
                          backgroundColor:
                            "#F0FDF4",
                          borderColor:
                            "#DCFCE7",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.countLabel,
                          {
                            color:
                              "#059669",
                          },
                        ]}
                      >
                        ดิบ
                      </Text>

                      <Text
                        style={[
                          styles.countValue,
                          {
                            color:
                              "#059669",
                          },
                        ]}
                      >
                        {item.green_count ??
                          0}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.countBadgeItem,
                        {
                          backgroundColor:
                            "#FFFBEB",
                          borderColor:
                            "#FEF3C7",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.countLabel,
                          {
                            color:
                              "#D97706",
                          },
                        ]}
                      >
                        ห่าม
                      </Text>

                      <Text
                        style={[
                          styles.countValue,
                          {
                            color:
                              "#D97706",
                          },
                        ]}
                      >
                        {item.breaker_count ??
                          0}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.countBadgeItem,
                        {
                          backgroundColor:
                            "#EFF6FF",
                          borderColor:
                            "#DBEAFE",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.countLabel,
                          {
                            color:
                              "#2563EB",
                          },
                        ]}
                      >
                        สุก
                      </Text>

                      <Text
                        style={[
                          styles.countValue,
                          {
                            color:
                              "#2563EB",
                          },
                        ]}
                      >
                        {item.ripe_count ??
                          0}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.countBadgeItem,
                        {
                          backgroundColor:
                            "#FEF2F2",
                          borderColor:
                            "#FEE2E2",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.countLabel,
                          {
                            color:
                              "#DC2626",
                          },
                        ]}
                      >
                        งอม
                      </Text>

                      <Text
                        style={[
                          styles.countValue,
                          {
                            color:
                              "#DC2626",
                          },
                        ]}
                      >
                        {item.overripe_count ??
                          0}
                      </Text>
                    </View>
                  </View>

                  {/* FOOTER */}
                  <View
                    style={
                      styles.cardFooter
                    }
                  >
                    <View
                      style={
                        styles.inferenceBox
                      }
                    >
                      <Ionicons
                        name="flash-outline"
                        size={13}
                        color={
                          THEME.yellow
                        }
                      />

                      <Text
                        style={
                          styles.inferenceText
                        }
                      >
                        ประมวลผล:{" "}
                        <Text
                          style={
                            styles.bold
                          }
                        >
                          {formatMs(
                            item.inference_ms
                          )}
                        </Text>
                      </Text>
                    </View>

                    <View
                      style={
                        styles.detailHintBox
                      }
                    >
                      <Text
                        style={
                          styles.detailHintText
                        }
                      >
                        ดูรายละเอียดรายลูก
                      </Text>

                      <Ionicons
                        name="chevron-forward"
                        size={13}
                        color={
                          THEME.accent
                        }
                      />
                    </View>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>

      {/* DETAILS MODAL */}
      <Modal
        visible={
          detailsModalVisible
        }
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={
          closeDetailsModal
        }
      >
        <View
          style={styles.modalOverlay}
        >
          <View
            style={styles.modalContent}
          >
            {/* MODAL HEADER */}
            <View
              style={styles.modalHeader}
            >
              <View
                style={{
                  flex: 1,
                  marginRight: 10,
                }}
              >
                <Text
                  style={
                    styles.modalTitle
                  }
                >
                  รายละเอียดผลตรวจสอบ
                </Text>

                <Text
                  style={
                    styles.modalSubtitle
                  }
                >
                  ผู้ใช้:{" "}
                  {selectedScanItem?.author_name ||
                    "-"}
                </Text>

                <Text
                  style={
                    styles.modalSubtitle
                  }
                >
                  วันที่สแกน:{" "}
                  {selectedScanItem?.formatted_date ||
                    "-"}
                </Text>
              </View>

              <TouchableOpacity
                style={
                  styles.modalCloseButton
                }
                onPress={
                  closeDetailsModal
                }
                activeOpacity={0.8}
              >
                <Ionicons
                  name="close"
                  size={21}
                  color={
                    THEME.textMain
                  }
                />
              </TouchableOpacity>
            </View>

            {/* MODAL IMAGE */}
            {!!selectedScanItem?.scan_image_url && (
              <TouchableOpacity
                activeOpacity={0.92}
                onPress={() =>
                  openFullImage(
                    selectedScanItem.scan_image_url
                  )
                }
                style={
                  styles.modalImageWrapper
                }
              >
                <Image
                  source={{
                    uri:
                      selectedScanItem.scan_image_url,
                  }}
                  style={
                    styles.modalScanImage
                  }
                  resizeMode="contain"
                />

                <View
                  style={
                    styles.modalImageOverlayBadge
                  }
                >
                  <Ionicons
                    name="expand-outline"
                    size={14}
                    color="#FFFFFF"
                  />

                  <Text
                    style={
                      styles.modalImageOverlayText
                    }
                  >
                    แตะเพื่อขยายรูป
                  </Text>
                </View>
              </TouchableOpacity>
            )}

            <View
              style={
                styles.modalListHeader
              }
            >
              <Ionicons
                name="list-outline"
                size={17}
                color={
                  THEME.accent
                }
              />

              <Text
                style={
                  styles.modalListHeaderText
                }
              >
                ผลตรวจสอบแยกตามกล้วยรายลูก
              </Text>

              <View
                style={
                  styles.modalCountBadge
                }
              >
                <Text
                  style={
                    styles.modalCountText
                  }
                >
                  {scanDetailsList.length} ลูก
                </Text>
              </View>
            </View>

            {loadingDetails ? (
              <View
                style={
                  styles.modalLoadingBox
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
                    styles.loadingText
                  }
                >
                  กำลังโหลดรายละเอียด...
                </Text>
              </View>
            ) : scanDetailsList.length ===
              0 ? (
              <View
                style={
                  styles.modalEmptyBox
                }
              >
                <Ionicons
                  name="information-circle-outline"
                  size={34}
                  color={
                    THEME.textLight
                  }
                />

                <Text
                  style={
                    styles.modalEmptyText
                  }
                >
                  ไม่พบข้อมูลกล้วยรายลูก
                </Text>
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={
                  false
                }
                contentContainerStyle={
                  styles.modalScrollContent
                }
              >
                {scanDetailsList.map(
                  (
                    detail,
                    index
                  ) => {
                    const reviewState =
                      getReviewState(
                        detail
                      );

                    const statusConfig =
                      getStatusConfig(
                        detail
                      );

                    const aiLabel =
                      toThaiRipeness(
                        reviewState.predicted
                      );

                    const finalLabel =
                      toThaiRipeness(
                        reviewState.finalRipeness
                      );

                    const finalBadgeStyle =
                      getRipenessStyle(
                        reviewState.finalRipeness
                      );

                    const confidence =
                      Number(
                        detail.confidence ??
                          0
                      );

                    const confidencePercent =
                      confidence <= 1
                        ? confidence * 100
                        : confidence;

                    return (
                      <View
                        key={
                          detail.id ||
                          index
                        }
                        style={
                          styles.detailCard
                        }
                      >
                        {/* DETAIL HEADER */}
                        <View
                          style={
                            styles.detailCardTop
                          }
                        >
                          <View
                            style={
                              styles.detailIndexBadge
                            }
                          >
                            <Text
                              style={
                                styles.detailIndexText
                              }
                            >
                              #
                              {detail.banana_index ??
                                index +
                                  1}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.badge,
                              {
                                backgroundColor:
                                  finalBadgeStyle.bg,
                                borderColor:
                                  finalBadgeStyle.border,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.badgeText,
                                {
                                  color:
                                    finalBadgeStyle.text,
                                },
                              ]}
                            >
                              {finalLabel}
                            </Text>
                          </View>
                        </View>

                        {/* REVIEW STATUS */}
                        <View
                          style={[
                            styles.statusBox,
                            {
                              backgroundColor:
                                statusConfig.bg,
                              borderColor:
                                statusConfig.border,
                            },
                          ]}
                        >
                          <Ionicons
                            name={
                              statusConfig.icon
                            }
                            size={19}
                            color={
                              statusConfig.color
                            }
                          />

                          <View
                            style={{
                              flex: 1,
                            }}
                          >
                            <Text
                              style={[
                                styles.statusTitle,
                                {
                                  color:
                                    statusConfig.textColor,
                                },
                              ]}
                            >
                              {
                                statusConfig.label
                              }
                            </Text>

                            <Text
                              style={[
                                styles.statusDescription,
                                {
                                  color:
                                    statusConfig.textColor,
                                },
                              ]}
                            >
                              {
                                statusConfig.description
                              }
                            </Text>
                          </View>
                        </View>

                        {/* COMPARISON */}
                        <View
                          style={
                            styles.detailComparisonBox
                          }
                        >
                          <View
                            style={
                              styles.detailRow
                            }
                          >
                            <View
                              style={
                                styles.detailItemLeft
                              }
                            >
                              <Ionicons
                                name="hardware-chip-outline"
                                size={14}
                                color={
                                  THEME.textMuted
                                }
                              />

                              <Text
                                style={
                                  styles.infoLabel
                                }
                              >
                                AI ทำนาย
                              </Text>
                            </View>

                            <Text
                              style={
                                styles.aiLabel
                              }
                            >
                              {aiLabel}
                            </Text>
                          </View>

                          <View
                            style={
                              styles.detailDivider
                            }
                          />

                          <View
                            style={
                              styles.detailRow
                            }
                          >
                            <View
                              style={
                                styles.detailItemLeft
                              }
                            >
                              <Ionicons
                                name={
                                  reviewState.isConfirmed
                                    ? "shield-checkmark-outline"
                                    : "person-outline"
                                }
                                size={14}
                                color={
                                  THEME.accent
                                }
                              />

                              <Text
                                style={
                                  styles.infoLabel
                                }
                              >
                                {reviewState.isConfirmed
                                  ? "ผู้ใช้ยืนยัน"
                                  : reviewState.isCorrected
                                    ? "ผู้ใช้แก้ไขเป็น"
                                    : "ผลปัจจุบัน"}
                              </Text>
                            </View>

                            <Text
                              style={
                                reviewState.isConfirmed ||
                                reviewState.isCorrected
                                  ? styles.userLabel
                                  : styles.textMutedCustom
                              }
                            >
                              {reviewState.isConfirmed
                                ? aiLabel
                                : reviewState.isCorrected
                                  ? finalLabel
                                  : "ยังไม่ตรวจสอบ"}
                            </Text>
                          </View>

                          {Number.isFinite(
                            confidencePercent
                          ) &&
                            confidencePercent >
                              0 && (
                            <>
                              <View
                                style={
                                  styles.detailDivider
                                }
                              />

                              <View
                                style={
                                  styles.detailRow
                                }
                              >
                                <View
                                  style={
                                    styles.detailItemLeft
                                  }
                                >
                                  <Ionicons
                                    name="analytics-outline"
                                    size={14}
                                    color={
                                      THEME.blue
                                    }
                                  />

                                  <Text
                                    style={
                                      styles.infoLabel
                                    }
                                  >
                                    คะแนนการทำนาย
                                  </Text>
                                </View>

                                <Text
                                  style={
                                    styles.bold
                                  }
                                >
                                  {confidencePercent.toFixed(
                                    0
                                  )}
                                  %
                                </Text>
                              </View>
                            </>
                          )}

                          {!!detail.feedback_updated_at && (
                            <>
                              <View
                                style={
                                  styles.detailDivider
                                }
                              />

                              <View
                                style={
                                  styles.detailRow
                                }
                              >
                                <View
                                  style={
                                    styles.detailItemLeft
                                  }
                                >
                                  <Ionicons
                                    name="time-outline"
                                    size={14}
                                    color={
                                      THEME.textMuted
                                    }
                                  />

                                  <Text
                                    style={
                                      styles.infoLabel
                                    }
                                  >
                                    อัปเดตล่าสุด
                                  </Text>
                                </View>

                                <Text
                                  style={
                                    styles.updatedText
                                  }
                                >
                                  {formatDate(
                                    detail.feedback_updated_at
                                  )}
                                </Text>
                              </View>
                            </>
                          )}
                        </View>
                      </View>
                    );
                  }
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

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
          <SafeAreaView
            style={
              styles.viewerHeader
            }
          >
            <TouchableOpacity
              style={
                styles.viewerCloseButton
              }
              onPress={
                closeFullImage
              }
              activeOpacity={0.8}
            >
              <Ionicons
                name="close"
                size={24}
                color="#FFFFFF"
              />
            </TouchableOpacity>
          </SafeAreaView>
        )}
        FooterComponent={() => (
          <View
            style={
              styles.viewerFooter
            }
          >
            <Ionicons
              name="search-outline"
              size={15}
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: THEME.bg,
  },

  container: {
    flex: 1,
    backgroundColor: THEME.bg,
    paddingHorizontal: 16,
    paddingTop:
      Platform.OS === "ios"
        ? 8
        : 12,
  },

  headerBar: {
    flexDirection: "row",
    justifyContent:
      "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor:
      THEME.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor:
      THEME.border,
  },

  backText: {
    fontSize: 13,
    fontWeight: "800",
    color: THEME.textMain,
  },

  summaryBadgeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor:
      "#ECFDF5",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },

  summaryBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    color: THEME.accentDark,
  },

  header: {
    marginBottom: 12,
    paddingHorizontal: 2,
  },

  title: {
    fontSize: 21,
    fontWeight: "900",
    color: THEME.textMain,
    marginBottom: 4,
  },

  subtitle: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.textMuted,
    lineHeight: 18,
  },

  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor:
      THEME.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: THEME.border,
    paddingHorizontal: 12,
    paddingVertical:
      Platform.OS === "ios"
        ? 11
        : 8,
    marginBottom: 14,
    gap: 8,
  },

  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: THEME.textMain,
    padding: 0,
  },

  loadingBox: {
    backgroundColor:
      THEME.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 24,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent:
      "center",
    marginTop: 20,
  },

  loadingText: {
    fontSize: 13,
    fontWeight: "700",
    color: THEME.textMuted,
  },

  listContent: {
    paddingBottom: 40,
    gap: 14,
  },

  card: {
    backgroundColor:
      THEME.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 14,

    shadowColor:
      THEME.shadow,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,

    width: "100%",
  },

  imageContainer: {
    width: "100%",
    height: 190,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 12,
    backgroundColor:
      "#F1F5F9",
    position: "relative",
  },

  scanImage: {
    width: "100%",
    height: "100%",
  },

  imageLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent:
      "center",
    alignItems: "center",
    backgroundColor:
      "rgba(248,250,252,0.88)",
    gap: 6,
  },

  imageLoadingText: {
    fontSize: 11,
    fontWeight: "700",
    color: THEME.textMuted,
  },

  imageCaption: {
    position: "absolute",
    right: 9,
    bottom: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor:
      "rgba(15,23,42,0.78)",
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 999,
  },

  imageCaptionText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  noImageBox: {
    width: "100%",
    height: 140,
    borderRadius: 14,
    marginBottom: 12,
    backgroundColor:
      "#F8FAFC",
    justifyContent:
      "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: THEME.border,
    borderStyle: "dashed",
    gap: 5,
  },

  noImageText: {
    fontSize: 12,
    fontWeight: "700",
    color: THEME.textLight,
  },

  cardTop: {
    flexDirection: "row",
    justifyContent:
      "space-between",
    alignItems: "center",
    marginBottom: 5,
  },

  userInfoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    marginRight: 8,
  },

  userNameText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "900",
    color: THEME.textMain,
  },

  totalBadge: {
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor:
      "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },

  totalBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    color: THEME.accentDark,
  },

  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 11,
  },

  dateText: {
    fontSize: 11,
    fontWeight: "600",
    color: THEME.textLight,
  },

  reviewSummaryRow: {
    flexDirection: "row",
    gap: 7,
    marginBottom: 11,
  },

  reviewSummaryItem: {
    flex: 1,
    minHeight: 76,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: "center",
    justifyContent:
      "center",
    paddingVertical: 8,
    gap: 2,
  },

  reviewSummaryValue: {
    fontSize: 16,
    fontWeight: "900",
  },

  reviewSummaryLabel: {
    fontSize: 9.5,
    fontWeight: "800",
    textAlign: "center",
  },

  countGrid: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 11,
  },

  countBadgeItem: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 7,
    alignItems: "center",
    borderWidth: 1,
  },

  countLabel: {
    fontSize: 10,
    fontWeight: "700",
    marginBottom: 1,
  },

  countValue: {
    fontSize: 13,
    fontWeight: "900",
  },

  cardFooter: {
    borderTopWidth: 1,
    borderTopColor:
      THEME.borderSoft,
    paddingTop: 9,
    flexDirection: "row",
    justifyContent:
      "space-between",
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
    fontWeight: "600",
  },

  bold: {
    fontWeight: "900",
    color: THEME.textMain,
  },

  detailHintBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },

  detailHintText: {
    fontSize: 11,
    fontWeight: "800",
    color: THEME.accentDark,
  },

  emptyCard: {
    backgroundColor:
      THEME.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 30,
    alignItems: "center",
    marginTop: 20,
  },

  emptyTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: THEME.textMain,
    marginTop: 10,
  },

  emptyText: {
    fontSize: 12,
    fontWeight: "600",
    color: THEME.textMuted,
    textAlign: "center",
    marginTop: 5,
    lineHeight: 18,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor:
      "rgba(15,23,42,0.62)",
    justifyContent:
      "flex-end",
  },

  modalContent: {
    backgroundColor:
      THEME.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    height: "92%",
    padding: 20,
    paddingBottom:
      Platform.OS === "ios"
        ? 44
        : 24,
  },

  modalHeader: {
    flexDirection: "row",
    justifyContent:
      "space-between",
    alignItems: "center",
    marginBottom: 14,
  },

  modalTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: THEME.textMain,
  },

  modalSubtitle: {
    fontSize: 11.5,
    fontWeight: "600",
    color: THEME.textMuted,
    marginTop: 2,
  },

  modalCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor:
      "#F1F5F9",
    justifyContent:
      "center",
    alignItems: "center",
  },

  modalImageWrapper: {
    width: "100%",
    height: 220,
    borderRadius: 17,
    overflow: "hidden",
    marginBottom: 15,
    backgroundColor:
      "#F1F5F9",
    position: "relative",
    borderWidth: 1,
    borderColor: THEME.border,
  },

  modalScanImage: {
    width: "100%",
    height: "100%",
  },

  modalImageOverlayBadge: {
    position: "absolute",
    right: 11,
    bottom: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor:
      "rgba(15,23,42,0.82)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },

  modalImageOverlayText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
  },

  modalListHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 12,
  },

  modalListHeaderText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
    color: THEME.textMain,
  },

  modalCountBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor:
      "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },

  modalCountText: {
    color: THEME.accentDark,
    fontSize: 10.5,
    fontWeight: "900",
  },

  modalLoadingBox: {
    padding: 30,
    alignItems: "center",
    justifyContent:
      "center",
    gap: 8,
  },

  modalEmptyBox: {
    padding: 30,
    alignItems: "center",
    justifyContent:
      "center",
    gap: 8,
  },

  modalEmptyText: {
    fontSize: 13,
    fontWeight: "700",
    color: THEME.textMuted,
    textAlign: "center",
  },

  modalScrollContent: {
    gap: 13,
    paddingBottom: 28,
  },

  detailCard: {
    backgroundColor:
      "#F8FAFC",
    borderRadius: 17,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 14,
  },

  detailCardTop: {
    flexDirection: "row",
    justifyContent:
      "space-between",
    alignItems: "center",
    marginBottom: 10,
  },

  detailIndexBadge: {
    backgroundColor:
      "#E2E8F0",
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },

  detailIndexText: {
    fontSize: 12,
    fontWeight: "900",
    color: THEME.textMain,
  },

  badge: {
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },

  badgeText: {
    fontSize: 11,
    fontWeight: "900",
  },

  statusBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 1,
    borderRadius: 13,
    padding: 11,
    marginBottom: 10,
  },

  statusTitle: {
    fontSize: 12.5,
    fontWeight: "900",
  },

  statusDescription: {
    marginTop: 2,
    fontSize: 10.5,
    fontWeight: "600",
    lineHeight: 15,
  },

  detailComparisonBox: {
    backgroundColor:
      THEME.surface,
    borderRadius: 13,
    padding: 12,
    borderWidth: 1,
    borderColor: THEME.border,
  },

  detailRow: {
    flexDirection: "row",
    justifyContent:
      "space-between",
    alignItems: "center",
    paddingVertical: 4,
    gap: 10,
  },

  detailItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },

  infoLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: THEME.textMuted,
  },

  detailDivider: {
    height: 1,
    backgroundColor:
      THEME.borderSoft,
    marginVertical: 6,
  },

  aiLabel: {
    fontSize: 13,
    fontWeight: "900",
    color: THEME.red,
  },

  userLabel: {
    fontSize: 13,
    fontWeight: "900",
    color: THEME.accentDark,
  },

  textMutedCustom: {
    fontSize: 12.5,
    fontWeight: "700",
    color: THEME.textLight,
  },

  updatedText: {
    maxWidth: "50%",
    textAlign: "right",
    fontSize: 10.5,
    fontWeight: "700",
    color: THEME.textMuted,
  },

  viewerHeader: {
    width: "100%",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop:
      Platform.OS === "ios"
        ? 8
        : 16,
  },

  viewerCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor:
      "rgba(15,23,42,0.78)",
    justifyContent:
      "center",
    alignItems: "center",
  },

  viewerFooter: {
    alignSelf: "center",
    marginBottom:
      Platform.OS === "ios"
        ? 32
        : 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor:
      "rgba(15,23,42,0.85)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  viewerFooterText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});