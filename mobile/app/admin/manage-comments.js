import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  RefreshControl,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
  Image,
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


const API_BASE =
  "http://172.20.10.2:8000";


if (
  Platform.OS === "android" &&
  UIManager
    .setLayoutAnimationEnabledExperimental
) {
  UIManager
    .setLayoutAnimationEnabledExperimental(
      true
    );
}


// ======================================================
// DESIGN SYSTEM
// ======================================================

const THEME = {
  bg: "#F8FAFC",
  surface: "#FFFFFF",

  border: "#F1F5F9",
  borderStrong: "#E2E8F0",

  textMain: "#0F172A",
  textBody: "#334155",
  textMuted: "#64748B",
  textLight: "#94A3B8",

  accent: "#10B981",
  accentDark: "#047857",
  accentBg: "#ECFDF5",

  blue: "#2563EB",
  blueBg: "#EFF6FF",

  orange: "#F97316",
  orangeBg: "#FFF7ED",

  yellow: "#F59E0B",
  yellowBg: "#FFFBEB",

  red: "#EF4444",
  redDark: "#B91C1C",
  redBg: "#FEF2F2",

  shadow: "#94A3B8",
};


// ======================================================
// HELPERS
// ======================================================

const getAvatarBgColor = (
  name = ""
) => {
  const colors = [
    "#6366F1",
    "#EC4899",
    "#F59E0B",
    "#06B6D4",
    "#10B981",
    "#8B5CF6",
  ];

  let hash = 0;

  for (
    let index = 0;
    index < name.length;
    index += 1
  ) {
    hash =
      name.charCodeAt(
        index
      ) +
      (
        (hash << 5) -
        hash
      );
  }

  return colors[
    Math.abs(hash) %
      colors.length
  ];
};


const safeJson = (
  value
) => {
  if (!value) {
    return {};
  }

  if (
    typeof value ===
    "object"
  ) {
    return value;
  }

  try {
    return JSON.parse(
      value
    );
  } catch {
    return {};
  }
};


const buildImageUrl = (
  value
) => {
  if (!value) {
    return null;
  }

  const path =
    String(value)
      .trim()
      .replace(
        /\\/g,
        "/"
      );

  if (!path) {
    return null;
  }

  if (
    path.startsWith(
      "http://"
    ) ||
    path.startsWith(
      "https://"
    )
  ) {
    return path;
  }

  if (
    path.startsWith("/")
  ) {
    return (
      `${API_BASE}` +
      `${path}`
    );
  }

  return path;
};


const getScanImageUrl = (
  scan
) => {
  if (!scan) {
    return null;
  }

  return buildImageUrl(
    scan
      .supabase_result_url ||
    scan
      .result_image_url ||
    scan
      .annotated_image_url ||
    scan
      .result_url ||
    scan
      .result_path ||
    scan
      .image_url ||
    scan
      .original_image_url ||
    scan
      .upload_url ||
    null
  );
};


const getScanOriginalImageUrl = (
  scan
) => {
  if (!scan) {
    return null;
  }

  return buildImageUrl(
    scan
      .supabase_original_url ||
    scan
      .original_image_url ||
    scan
      .original_url ||
    scan
      .upload_url ||
    scan
      .image_url ||
    null
  );
};


const pickNumber = (
  row,
  keys,
  fallback = 0
) => {
  for (
    const key
    of keys
  ) {
    const value =
      row?.[key];

    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      const numberValue =
        Number(value);

      if (
        Number.isFinite(
          numberValue
        )
      ) {
        return numberValue;
      }
    }
  }

  return fallback;
};


const getScanTotal = (
  scan
) => {
  if (!scan) {
    return 0;
  }

  const directValue =
    pickNumber(
      scan,
      [
        "total_bananas",
        "total_detections",
        "count",
        "total",
        "banana_count",
      ],
      0
    );

  if (
    directValue > 0
  ) {
    return directValue;
  }

  const summary =
    safeJson(
      scan.summary
    );

  return Number(
    summary.total ??
      summary.count ??
      0
  );
};


const getScanSummary = (
  scan
) => {
  const summary =
    safeJson(
      scan?.summary
    );

  return {
    green:
      pickNumber(
        scan,
        [
          "green_count",
          "green",
        ],
        Number(
          summary.green ??
            0
        )
      ),

    breaker:
      pickNumber(
        scan,
        [
          "breaker_count",
          "breaker",
        ],
        Number(
          summary.breaker ??
            0
        )
      ),

    ripe:
      pickNumber(
        scan,
        [
          "ripe_count",
          "ripe",
        ],
        Number(
          summary.ripe ??
            0
        )
      ),

    overripe:
      pickNumber(
        scan,
        [
          "overripe_count",
          "overripe",
        ],
        Number(
          summary.overripe ??
            0
        )
      ),
  };
};


const formatDate = (
  value
) => {
  if (!value) {
    return "ไม่ระบุเวลา";
  }

  try {
    return new Date(
      value
    ).toLocaleString(
      "th-TH",
      {
        dateStyle:
          "medium",
        timeStyle:
          "short",
      }
    );
  } catch {
    return String(
      value
    );
  }
};


// ======================================================
// COMPONENT
// ======================================================

export default function ManageCommentsScreen() {
  const [
    comments,
    setComments,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    deletingId,
    setDeletingId,
  ] = useState(null);

  const [
    zoomImageUri,
    setZoomImageUri,
  ] = useState(null);

  const [
    zoomImageTitle,
    setZoomImageTitle,
  ] = useState("");

  const [
    zoomImageKey,
    setZoomImageKey,
  ] = useState(0);


  const zoomImages =
    useMemo(
      () =>
        zoomImageUri
          ? [
              {
                uri:
                  zoomImageUri,
              },
            ]
          : [],
      [zoomImageUri]
    );


  const openZoomImage = (
    uri,
    title
  ) => {
    if (!uri) {
      return;
    }

    setZoomImageUri(
      null
    );

    setZoomImageTitle(
      ""
    );

    requestAnimationFrame(
      () => {
        setZoomImageKey(
          Date.now()
        );

        setZoomImageUri(
          uri
        );

        setZoomImageTitle(
          title
        );
      }
    );
  };


  const fetchComments =
    useCallback(
      async () => {
        try {
          setLoading(
            true
          );

          /*
           * 1. โหลดความคิดเห็นทั้งหมด
           */
          const {
            data:
              feedbackData,
            error:
              feedbackError,
          } =
            await supabase
              .from(
                "feedback"
              )
              .select("*")
              .order(
                "created_at",
                {
                  ascending:
                    false,
                }
              );

          if (
            feedbackError
          ) {
            throw feedbackError;
          }

          const feedbackRows =
            Array.isArray(
              feedbackData
            )
              ? feedbackData
              : [];

          if (
            feedbackRows.length ===
            0
          ) {
            setComments(
              []
            );

            return;
          }


          /*
           * 2. รวม User ID ที่ต้องโหลด Profile
           */
          const userIds = [
            ...new Set(
              feedbackRows
                .map(
                  (
                    feedback
                  ) =>
                    feedback
                      .user_id
                )
                .filter(
                  Boolean
                )
            ),
          ];


          /*
           * 3. รวม Scan ID ที่ต้องโหลดภาพ
           */
          const scanIds = [
            ...new Set(
              feedbackRows
                .map(
                  (
                    feedback
                  ) =>
                    feedback
                      .scan_id
                )
                .filter(
                  Boolean
                )
            ),
          ];


          /*
           * 4. โหลด Profiles
           */
          let profilesData =
            [];

          if (
            userIds.length >
            0
          ) {
            const {
              data,
              error:
                profilesError,
            } =
              await supabase
                .from(
                  "profiles"
                )
                .select(
                  "id, display_name, email, avatar_url"
                )
                .in(
                  "id",
                  userIds
                );

            if (
              profilesError
            ) {
              /*
               * ไม่ให้หน้า Admin พังทั้งหมด
               * หาก Profiles ถูก RLS ปิด
               */
              console.log(
                "[admin comments] profiles error:",
                profilesError.message
              );
            } else {
              profilesData =
                Array.isArray(
                  data
                )
                  ? data
                  : [];
            }
          }


          /*
           * 5. โหลด Scan History
           */
          let scanHistoryData =
            [];

          if (
            scanIds.length >
            0
          ) {
            const {
              data,
              error:
                scanHistoryError,
            } =
              await supabase
                .from(
                  "scan_history"
                )
                .select("*")
                .in(
                  "id",
                  scanIds
                );

            if (
              scanHistoryError
            ) {
              console.log(
                "[admin comments] scan history error:",
                scanHistoryError.message
              );
            } else {
              scanHistoryData =
                Array.isArray(
                  data
                )
                  ? data
                  : [];
            }
          }


          /*
           * 6. สร้าง Maps สำหรับ Join ข้อมูล
           */
          const profileMap =
            new Map();

          profilesData.forEach(
            (
              profile
            ) => {
              profileMap.set(
                String(
                  profile.id
                ),
                profile
              );
            }
          );


          const scanMap =
            new Map();

          scanHistoryData.forEach(
            (
              scan
            ) => {
              scanMap.set(
                String(
                  scan.id
                ),
                scan
              );
            }
          );


          /*
           * 7. รวม Feedback + Profile + Scan
           */
          const mergedData =
            feedbackRows.map(
              (
                item
              ) => {
                const profile =
                  item.user_id
                    ? profileMap.get(
                        String(
                          item.user_id
                        )
                      )
                    : null;

                const scan =
                  item.scan_id
                    ? scanMap.get(
                        String(
                          item.scan_id
                        )
                      )
                    : null;

                const authorName =
                  profile
                    ?.display_name ||
                  profile
                    ?.email
                    ?.split(
                      "@"
                    )[0] ||
                  "ผู้ใช้งานทั่วไป";

                const scanSummary =
                  getScanSummary(
                    scan
                  );

                return {
                  ...item,

                  author_name:
                    authorName,

                  author_email:
                    profile
                      ?.email ||
                    null,

                  avatar_url:
                    profile
                      ?.avatar_url ||
                    null,

                  avatar_color:
                    getAvatarBgColor(
                      authorName
                    ),

                  scan_history:
                    scan ||
                    null,

                  scan_image_url:
                    getScanImageUrl(
                      scan
                    ),

                  scan_original_image_url:
                    getScanOriginalImageUrl(
                      scan
                    ),

                  scan_total:
                    getScanTotal(
                      scan
                    ),

                  scan_summary:
                    scanSummary,
                };
              }
            );


          LayoutAnimation
            .configureNext(
              LayoutAnimation
                .Presets
                .easeInEaseOut
            );

          setComments(
            mergedData
          );
        } catch (
          error
        ) {
          console.log(
            "[admin comments] load error:",
            error
          );

          Alert.alert(
            "โหลดข้อมูลไม่สำเร็จ",
            error?.message ||
              "กรุณาลองใหม่อีกครั้ง"
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      []
    );


  useEffect(() => {
    fetchComments();
  }, [fetchComments]);


  const handleBack =
    () => {
      if (
        router.canGoBack()
      ) {
        router.back();

        return;
      }

      router.replace(
        "/HomeAdmin"
      );
    };


  const handleDelete = (
    item
  ) => {
    Alert.alert(
      "ลบความคิดเห็น",
      `คุณต้องการลบความคิดเห็นของ “${item.author_name}” ใช่หรือไม่?`,
      [
        {
          text:
            "ยกเลิก",

          style:
            "cancel",
        },

        {
          text:
            "ลบ",

          style:
            "destructive",

          onPress:
            async () => {
              try {
                setDeletingId(
                  item.id
                );

                const {
                  error,
                } =
                  await supabase
                    .from(
                      "feedback"
                    )
                    .delete()
                    .eq(
                      "id",
                      item.id
                    );

                if (error) {
                  throw error;
                }

                LayoutAnimation
                  .configureNext(
                    LayoutAnimation
                      .Presets
                      .easeInEaseOut
                  );

                setComments(
                  (
                    previousComments
                  ) =>
                    previousComments
                      .filter(
                        (
                          comment
                        ) =>
                          comment.id !==
                          item.id
                      )
                );
              } catch (
                error
              ) {
                console.log(
                  "[admin comments] delete error:",
                  error
                );

                Alert.alert(
                  "ลบไม่สำเร็จ",
                  error?.message ||
                    "กรุณาลองใหม่"
                );
              } finally {
                setDeletingId(
                  null
                );
              }
            },
        },
      ]
    );
  };


  const renderStars = (
    rating
  ) => {
    const safeRating =
      Math.max(
        0,
        Math.min(
          5,
          Number(
            rating ??
              0
          )
        )
      );

    return (
      <View
        style={
          styles.starsRow
        }
      >
        {[
          1,
          2,
          3,
          4,
          5,
        ].map(
          (
            star
          ) => (
            <Ionicons
              key={star}
              name={
                star <=
                safeRating
                  ? "star"
                  : "star-outline"
              }
              size={16}
              color="#FBBF24"
            />
          )
        )}

        <Text
          style={
            styles.ratingText
          }
        >
          {safeRating}/5
        </Text>
      </View>
    );
  };


  const renderCorrectnessBadge = (
    isCorrect
  ) => {
    if (
      isCorrect === true
    ) {
      return (
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                THEME.accentBg,
            },
          ]}
        >
          <Ionicons
            name=
              "checkmark-circle"
            size={14}
            color={
              THEME.accent
            }
          />

          <Text
            style={[
              styles.statusText,
              {
                color:
                  THEME.accentDark,
              },
            ]}
          >
            ถูกต้อง
          </Text>
        </View>
      );
    }

    if (
      isCorrect === false
    ) {
      return (
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                THEME.redBg,
            },
          ]}
        >
          <Ionicons
            name=
              "close-circle"
            size={14}
            color={THEME.red}
          />

          <Text
            style={[
              styles.statusText,
              {
                color:
                  THEME.redDark,
              },
            ]}
          >
            ไม่ถูกต้อง
          </Text>
        </View>
      );
    }

    return (
      <View
        style={[
          styles.statusBadge,
          {
            backgroundColor:
              "#F1F5F9",
          },
        ]}
      >
        <Ionicons
          name=
            "help-circle"
          size={14}
          color={
            THEME.textMuted
          }
        />

        <Text
          style={[
            styles.statusText,
            {
              color:
                THEME.textMuted,
            },
          ]}
        >
          ไม่ระบุ
        </Text>
      </View>
    );
  };


  const renderCommentItem = ({
    item,
  }) => {
    const userName =
      item.author_name ||
      "ผู้ใช้งานทั่วไป";

    const commentText =
      item.comment ||
      "ไม่มีข้อความรีวิวเพิ่มเติม";

    const isDeleting =
      deletingId ===
      item.id;

    const scanSummary =
      item.scan_summary ||
      {
        green: 0,
        breaker: 0,
        ripe: 0,
        overripe: 0,
      };

    return (
      <View
        style={
          styles.commentCard
        }
      >
        {isDeleting && (
          <View
            style={
              styles.cardOverlay
            }
          >
            <ActivityIndicator
              size="small"
              color={
                THEME.red
              }
            />

            <Text
              style={
                styles.deletingText
              }
            >
              กำลังลบ...
            </Text>
          </View>
        )}


        {/* User Header */}
        <View
          style={
            styles.cardHeader
          }
        >
          <View
            style={
              styles.userSection
            }
          >
            {item.avatar_url ? (
              <Image
                source={{
                  uri:
                    item.avatar_url,
                }}
                style={
                  styles.avatarImage
                }
              />
            ) : (
              <View
                style={[
                  styles.avatarBox,
                  {
                    backgroundColor:
                      item.avatar_color,
                  },
                ]}
              >
                <Text
                  style={
                    styles.avatarText
                  }
                >
                  {userName
                    .charAt(0)
                    .toUpperCase()}
                </Text>
              </View>
            )}

            <View
              style={
                styles.userTextContainer
              }
            >
              <Text
                style={
                  styles.userName
                }
                numberOfLines={
                  1
                }
              >
                {userName}
              </Text>

              {!!item.author_email && (
                <Text
                  style={
                    styles.emailText
                  }
                  numberOfLines={
                    1
                  }
                >
                  {item.author_email}
                </Text>
              )}

              <View
                style={
                  styles.dateRow
                }
              >
                <Ionicons
                  name=
                    "time-outline"
                  size={12}
                  color={
                    THEME.textMuted
                  }
                />

                <Text
                  style={
                    styles.dateText
                  }
                >
                  {formatDate(
                    item.updated_at ||
                    item.created_at
                  )}
                </Text>
              </View>
            </View>
          </View>

          {renderCorrectnessBadge(
            item.is_correct
          )}
        </View>


        {/* Rating */}
        {renderStars(
          item.rating
        )}


        {/* Comment */}
        <View
          style={
            styles.commentBodyBox
          }
        >
          <Ionicons
            name=
              "chatbubble-ellipses-outline"
            size={17}
            color={
              THEME.accent
            }
          />

          <Text
            style={
              styles.commentBody
            }
          >
            {commentText}
          </Text>
        </View>


        {/* Scan Information */}
        <View
          style={
            styles.scanSection
          }
        >
          <View
            style={
              styles.scanHeader
            }
          >
            <View
              style={
                styles.scanHeaderLeft
              }
            >
              <View
                style={
                  styles.scanIconBox
                }
              >
                <Ionicons
                  name=
                    "scan-outline"
                  size={18}
                  color={
                    THEME.blue
                  }
                />
              </View>

              <View>
                <Text
                  style={
                    styles.scanTitle
                  }
                >
                  ผลสแกนที่รีวิว
                </Text>

                <Text
                  style={
                    styles.scanDate
                  }
                >
                  {item
                    .scan_history
                    ?.created_at
                    ? formatDate(
                        item
                          .scan_history
                          .created_at
                      )
                    : "ไม่พบข้อมูลเวลา"}
                </Text>
              </View>
            </View>

            <View
              style={
                styles.scanCountBadge
              }
            >
              <Text
                style={
                  styles.scanCountText
                }
              >
                {item.scan_total ??
                  0}{" "}
                ลูก
              </Text>
            </View>
          </View>


          {item.scan_image_url ? (
            <TouchableOpacity
              activeOpacity={
                0.88
              }
              onPress={() =>
                openZoomImage(
                  item
                    .scan_image_url,
                  `ผลลัพธ์ Scan ของ ${userName}`
                )
              }
              style={
                styles.scanImageWrapper
              }
            >
              <Image
                source={{
                  uri:
                    item
                      .scan_image_url,
                }}
                style={
                  styles.scanImage
                }
                resizeMode=
                  "contain"
              />

              <View
                style={
                  styles.zoomBadge
                }
              >
                <Ionicons
                  name="search"
                  size={14}
                  color="#FFFFFF"
                />

                <Text
                  style={
                    styles.zoomText
                  }
                >
                  แตะเพื่อขยาย
                </Text>
              </View>
            </TouchableOpacity>
          ) : (
            <View
              style={
                styles.noImageBox
              }
            >
              <Ionicons
                name=
                  "image-outline"
                size={30}
                color={
                  THEME.textLight
                }
              />

              <Text
                style={
                  styles.noImageText
                }
              >
                ไม่พบภาพผลลัพธ์ของ Scan นี้
              </Text>
            </View>
          )}


          {/* Scan Summary */}
          <View
            style={
              styles.summaryGrid
            }
          >
            <View
              style={[
                styles.summaryItem,
                {
                  backgroundColor:
                    THEME.accentBg,
                },
              ]}
            >
              <Text
                style={[
                  styles.summaryLabel,
                  {
                    color:
                      THEME.accentDark,
                  },
                ]}
              >
                ดิบ
              </Text>

              <Text
                style={[
                  styles.summaryValue,
                  {
                    color:
                      THEME.accent,
                  },
                ]}
              >
                {scanSummary.green ??
                  0}
              </Text>
            </View>

            <View
              style={[
                styles.summaryItem,
                {
                  backgroundColor:
                    THEME.yellowBg,
                },
              ]}
            >
              <Text
                style={[
                  styles.summaryLabel,
                  {
                    color:
                      "#B45309",
                  },
                ]}
              >
                ห่าม
              </Text>

              <Text
                style={[
                  styles.summaryValue,
                  {
                    color:
                      THEME.yellow,
                  },
                ]}
              >
                {scanSummary.breaker ??
                  0}
              </Text>
            </View>

            <View
              style={[
                styles.summaryItem,
                {
                  backgroundColor:
                    THEME.orangeBg,
                },
              ]}
            >
              <Text
                style={[
                  styles.summaryLabel,
                  {
                    color:
                      "#C2410C",
                  },
                ]}
              >
                สุก
              </Text>

              <Text
                style={[
                  styles.summaryValue,
                  {
                    color:
                      THEME.orange,
                  },
                ]}
              >
                {scanSummary.ripe ??
                  0}
              </Text>
            </View>

            <View
              style={[
                styles.summaryItem,
                {
                  backgroundColor:
                    THEME.redBg,
                },
              ]}
            >
              <Text
                style={[
                  styles.summaryLabel,
                  {
                    color:
                      THEME.redDark,
                  },
                ]}
              >
                งอม
              </Text>

              <Text
                style={[
                  styles.summaryValue,
                  {
                    color:
                      THEME.red,
                  },
                ]}
              >
                {scanSummary.overripe ??
                  0}
              </Text>
            </View>
          </View>


          <Text
            selectable
            numberOfLines={
              2
            }
            style={
              styles.scanIdText
            }
          >
            Scan ID:{" "}
            {item.scan_id ||
              "ไม่พบ Scan ID"}
          </Text>
        </View>


        {/* Footer */}
        <View
          style={
            styles.footerRow
          }
        >
          <View
            style={
              styles.verifiedTag
            }
          >
            <Ionicons
              name=
                "shield-checkmark-outline"
              size={15}
              color={
                THEME.accent
              }
            />

            <Text
              style={
                styles.verifiedText
              }
            >
              เชื่อมกับผลสแกนแล้ว
            </Text>
          </View>

          <TouchableOpacity
            style={
              styles.delButton
            }
            onPress={() =>
              handleDelete(
                item
              )
            }
            activeOpacity={
              0.7
            }
            disabled={
              isDeleting
            }
          >
            <Ionicons
              name=
                "trash-outline"
              size={15}
              color={
                THEME.red
              }
            />

            <Text
              style={
                styles.delText
              }
            >
              ลบ
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };


  return (
    <SafeAreaView
      style={
        styles.screen
      }
      edges={[
        "top",
      ]}
    >
      <View
        style={
          styles.container
        }
      >
        {/* Top Bar */}
        <View
          style={
            styles.topBar
          }
        >
          <TouchableOpacity
            style={
              styles.backButton
            }
            onPress={
              handleBack
            }
            activeOpacity={
              0.75
            }
            accessibilityRole=
              "button"
            accessibilityLabel=
              "ย้อนกลับ"
          >
            <Ionicons
              name=
                "chevron-back"
              size={24}
              color={
                THEME.textMain
              }
            />
          </TouchableOpacity>

          <Text
            style={
              styles.topBarTitle
            }
          >
            ความคิดเห็น
          </Text>

          <TouchableOpacity
            style={
              styles.refreshButton
            }
            onPress={
              fetchComments
            }
            activeOpacity={
              0.75
            }
            disabled={
              loading
            }
          >
            {loading ? (
              <ActivityIndicator
                size="small"
                color={
                  THEME.accent
                }
              />
            ) : (
              <Ionicons
                name=
                  "refresh-outline"
                size={21}
                color={
                  THEME.accent
                }
              />
            )}
          </TouchableOpacity>
        </View>


        {/* Header Card */}
        <View
          style={
            styles.headerContainer
          }
        >
          <View
            style={
              styles.headerIconBox
            }
          >
            <Ionicons
              name=
                "chatbubbles"
              size={22}
              color={
                THEME.accent
              }
            />
          </View>

          <View
            style={
              styles.headerTextSection
            }
          >
            <Text
              style={
                styles.headerTitle
              }
            >
              ความคิดเห็นและฟีดแบ็ก
            </Text>

            <Text
              style={
                styles.headerSubtitle
              }
            >
              ตรวจสอบรีวิวรายภาพ
              พร้อมผลสแกนที่เชื่อมโยง
              {" "}
              ({comments.length} รายการ)
            </Text>
          </View>
        </View>


        {/* Comments List */}
        <FlatList
          data={
            comments
          }
          keyExtractor={(
            item
          ) =>
            String(
              item.id
            )
          }
          renderItem={
            renderCommentItem
          }
          showsVerticalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.listContent
          }
          refreshControl={
            <RefreshControl
              refreshing={
                loading &&
                deletingId ===
                  null
              }
              onRefresh={
                fetchComments
              }
              tintColor={
                THEME.accent
              }
              colors={[
                THEME.accent,
              ]}
            />
          }
          ListEmptyComponent={
            !loading ? (
              <View
                style={
                  styles.emptyCard
                }
              >
                <View
                  style={
                    styles.emptyIconCircle
                  }
                >
                  <Ionicons
                    name=
                      "chatbubble-ellipses-outline"
                    size={34}
                    color={
                      THEME.textMuted
                    }
                  />
                </View>

                <Text
                  style={
                    styles.emptyTitle
                  }
                >
                  ไม่มีข้อมูลความคิดเห็น
                </Text>

                <Text
                  style={
                    styles.emptySubtitle
                  }
                >
                  เมื่อผู้ใช้ส่งความคิดเห็นรายภาพ
                  ข้อมูลและผลสแกนจะแสดงที่นี่อัตโนมัติ
                </Text>
              </View>
            ) : null
          }
        />


        {/* Zoom Image */}
        <ImageView
          key={
            `admin-comment-viewer-` +
            `${zoomImageKey}-` +
            `${zoomImageUri ?? "empty"}`
          }
          images={
            zoomImages
          }
          imageIndex={0}
          visible={
            !!zoomImageUri
          }
          onRequestClose={() => {
            setZoomImageUri(
              null
            );

            setZoomImageTitle(
              ""
            );
          }}
          swipeToCloseEnabled
          doubleTapToZoomEnabled
          HeaderComponent={() => (
            <View
              style={
                styles.zoomHeader
              }
            >
              <Text
                numberOfLines={
                  1
                }
                style={
                  styles.zoomHeaderTitle
                }
              >
                {zoomImageTitle}
              </Text>

              <TouchableOpacity
                onPress={() => {
                  setZoomImageUri(
                    null
                  );

                  setZoomImageTitle(
                    ""
                  );
                }}
                style={
                  styles.zoomCloseButton
                }
                activeOpacity={
                  0.8
                }
              >
                <Text
                  style={
                    styles.zoomCloseText
                  }
                >
                  ปิด
                </Text>
              </TouchableOpacity>
            </View>
          )}
        />
      </View>
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
      paddingHorizontal:
        16,
      paddingTop: 8,
      backgroundColor:
        THEME.bg,
    },

    topBar: {
      height: 52,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      marginBottom: 12,
    },

    backButton: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor:
        THEME.surface,
      borderWidth: 1,
      borderColor:
        THEME.borderStrong,
      alignItems:
        "center",
      justifyContent:
        "center",
      shadowColor:
        THEME.shadow,
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },

    topBarTitle: {
      flex: 1,
      marginHorizontal:
        12,
      textAlign:
        "center",
      fontSize: 17,
      fontWeight:
        "900",
      color:
        THEME.textMain,
    },

    refreshButton: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor:
        THEME.accentBg,
      borderWidth: 1,
      borderColor:
        "#D1FAE5",
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    headerContainer: {
      flexDirection:
        "row",
      alignItems:
        "center",
      backgroundColor:
        THEME.surface,
      padding: 16,
      borderRadius: 20,
      borderWidth: 1,
      borderColor:
        THEME.borderStrong,
      marginBottom: 16,
      gap: 12,
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

    headerIconBox: {
      width: 46,
      height: 46,
      borderRadius: 15,
      backgroundColor:
        THEME.accentBg,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    headerTextSection: {
      flex: 1,
      minWidth: 0,
    },

    headerTitle: {
      fontSize: 16,
      fontWeight:
        "900",
      color:
        THEME.textMain,
      letterSpacing: -0.3,
    },

    headerSubtitle: {
      fontSize: 11.5,
      fontWeight:
        "600",
      color:
        THEME.textMuted,
      marginTop: 3,
      lineHeight: 17,
    },

    listContent: {
      paddingBottom: 44,
      gap: 14,
    },

    commentCard: {
      backgroundColor:
        THEME.surface,
      padding: 17,
      borderRadius: 22,
      borderWidth: 1,
      borderColor:
        THEME.borderStrong,
      shadowColor:
        THEME.shadow,
      shadowOffset: {
        width: 0,
        height: 3,
      },
      shadowOpacity: 0.04,
      shadowRadius: 10,
      elevation: 2,
      position:
        "relative",
      overflow:
        "hidden",
      gap: 13,
    },

    cardOverlay: {
      ...StyleSheet
        .absoluteFillObject,
      backgroundColor:
        "rgba(255,255,255,0.90)",
      justifyContent:
        "center",
      alignItems:
        "center",
      zIndex: 10,
      gap: 8,
    },

    deletingText: {
      color:
        THEME.red,
      fontSize: 11,
      fontWeight:
        "800",
    },

    cardHeader: {
      flexDirection:
        "row",
      justifyContent:
        "space-between",
      alignItems:
        "center",
      gap: 9,
    },

    userSection: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 10,
      flex: 1,
      marginRight: 5,
    },

    userTextContainer: {
      flex: 1,
      minWidth: 0,
    },

    avatarBox: {
      width: 45,
      height: 45,
      borderRadius: 14,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    avatarImage: {
      width: 45,
      height: 45,
      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        THEME.borderStrong,
    },

    avatarText: {
      fontSize: 16,
      fontWeight:
        "900",
      color:
        "#FFFFFF",
    },

    userName: {
      fontSize: 14.5,
      fontWeight:
        "900",
      color:
        THEME.textMain,
    },

    emailText: {
      marginTop: 1,
      fontSize: 10.5,
      color:
        THEME.textMuted,
      fontWeight:
        "600",
    },

    dateRow: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 4,
      marginTop: 3,
    },

    dateText: {
      flexShrink: 1,
      fontSize: 10.5,
      color:
        THEME.textLight,
      fontWeight:
        "600",
    },

    statusBadge: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 4,
      paddingHorizontal:
        9,
      paddingVertical:
        6,
      borderRadius: 10,
    },

    statusText: {
      fontSize: 10.5,
      fontWeight:
        "900",
    },

    starsRow: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 3,
      paddingVertical: 2,
    },

    ratingText: {
      marginLeft: 5,
      color:
        "#B45309",
      fontSize: 11,
      fontWeight:
        "800",
    },

    commentBodyBox: {
      backgroundColor:
        "#F8FAFC",
      padding: 14,
      borderRadius: 15,
      borderWidth: 1,
      borderColor:
        THEME.border,
      flexDirection:
        "row",
      alignItems:
        "flex-start",
      gap: 9,
    },

    commentBody: {
      flex: 1,
      fontSize: 13.5,
      color:
        THEME.textBody,
      lineHeight: 20,
      fontWeight:
        "500",
    },

    scanSection: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor:
        THEME.borderStrong,
      backgroundColor:
        "#FFFFFF",
      padding: 12,
      gap: 11,
    },

    scanHeader: {
      flexDirection:
        "row",
      justifyContent:
        "space-between",
      alignItems:
        "center",
      gap: 9,
    },

    scanHeaderLeft: {
      flex: 1,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 8,
    },

    scanIconBox: {
      width: 35,
      height: 35,
      borderRadius: 11,
      backgroundColor:
        THEME.blueBg,
      alignItems:
        "center",
      justifyContent:
        "center",
    },

    scanTitle: {
      color:
        THEME.textMain,
      fontWeight:
        "900",
      fontSize: 12.5,
    },

    scanDate: {
      marginTop: 2,
      color:
        THEME.textMuted,
      fontSize: 9.5,
      fontWeight:
        "600",
    },

    scanCountBadge: {
      paddingHorizontal:
        10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor:
        THEME.accentBg,
    },

    scanCountText: {
      color:
        THEME.accentDark,
      fontSize: 10.5,
      fontWeight:
        "900",
    },

    scanImageWrapper: {
      height: 230,
      borderRadius: 15,
      overflow:
        "hidden",
      backgroundColor:
        "#F8FAFC",
      borderWidth: 1,
      borderColor:
        THEME.border,
      position:
        "relative",
    },

    scanImage: {
      width: "100%",
      height: "100%",
      backgroundColor:
        "#F8FAFC",
    },

    zoomBadge: {
      position:
        "absolute",
      right: 10,
      bottom: 10,
      borderRadius: 999,
      paddingVertical: 6,
      paddingHorizontal: 9,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 5,
      backgroundColor:
        "rgba(15,23,42,0.85)",
    },

    zoomText: {
      color:
        "#FFFFFF",
      fontSize: 9.5,
      fontWeight:
        "800",
    },

    noImageBox: {
      height: 140,
      borderRadius: 15,
      backgroundColor:
        "#F8FAFC",
      borderWidth: 1,
      borderColor:
        THEME.border,
      alignItems:
        "center",
      justifyContent:
        "center",
      gap: 6,
    },

    noImageText: {
      color:
        THEME.textLight,
      fontSize: 10.5,
      fontWeight:
        "700",
      textAlign:
        "center",
    },

    summaryGrid: {
      flexDirection:
        "row",
      gap: 6,
    },

    summaryItem: {
      flex: 1,
      paddingVertical: 9,
      borderRadius: 12,
      alignItems:
        "center",
      gap: 2,
    },

    summaryLabel: {
      fontSize: 9.5,
      fontWeight:
        "800",
    },

    summaryValue: {
      fontSize: 15,
      fontWeight:
        "900",
    },

    scanIdText: {
      color:
        THEME.textLight,
      fontSize: 9.5,
      lineHeight: 14,
      fontWeight:
        "600",
    },

    footerRow: {
      borderTopWidth: 1,
      borderTopColor:
        THEME.border,
      paddingTop: 11,
      flexDirection:
        "row",
      justifyContent:
        "space-between",
      alignItems:
        "center",
    },

    verifiedTag: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 5,
      flex: 1,
    },

    verifiedText: {
      fontSize: 10.5,
      color:
        THEME.textMuted,
      fontWeight:
        "700",
    },

    delButton: {
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 5,
      backgroundColor:
        THEME.redBg,
      paddingHorizontal:
        13,
      paddingVertical: 7,
      borderRadius: 10,
    },

    delText: {
      color:
        THEME.red,
      fontSize: 12,
      fontWeight:
        "900",
    },

    emptyCard: {
      backgroundColor:
        THEME.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor:
        THEME.borderStrong,
      padding: 40,
      alignItems:
        "center",
      gap: 8,
      marginTop: 20,
    },

    emptyIconCircle: {
      width: 58,
      height: 58,
      borderRadius: 18,
      backgroundColor:
        "#F8FAFC",
      justifyContent:
        "center",
      alignItems:
        "center",
      marginBottom: 4,
      borderWidth: 1,
      borderColor:
        THEME.borderStrong,
    },

    emptyTitle: {
      fontSize: 15,
      fontWeight:
        "900",
      color:
        THEME.textMain,
    },

    emptySubtitle: {
      fontSize: 12,
      fontWeight:
        "600",
      color:
        THEME.textMuted,
      textAlign:
        "center",
      lineHeight: 18,
    },

    zoomHeader: {
      paddingTop: 54,
      paddingHorizontal:
        20,
      paddingBottom: 14,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      backgroundColor:
        "rgba(15,23,42,0.95)",
    },

    zoomHeaderTitle: {
      color:
        "#FFFFFF",
      fontSize: 16,
      fontWeight:
        "900",
      flex: 1,
      marginRight: 12,
    },

    zoomCloseButton: {
      backgroundColor:
        "#FFFFFF",
      borderRadius: 999,
      paddingVertical: 7,
      paddingHorizontal:
        15,
    },

    zoomCloseText: {
      color:
        THEME.textMain,
      fontSize: 12,
      fontWeight:
        "900",
    },
  });