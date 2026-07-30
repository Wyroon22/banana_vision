import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from "react-native";
import {
  router,
  useLocalSearchParams,
} from "expo-router";
import ImageView from "react-native-image-viewing";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../lib/supabase";

const API_BASE =
  "http://172.20.10.2:8000";

type RipenessValue =
  | "green"
  | "breaker"
  | "ripe"
  | "overripe";

type RipenessChoice = {
  value: RipenessValue;
  label: string;
  description: string;
  color: string;
  paleColor: string;
  textColor: string;
};

type SaveButtonIcon =
  | "save-outline"
  | "trash-outline"
  | "checkmark-done-outline"
  | "alert-circle-outline";

const RIPENESS_CHOICES: RipenessChoice[] = [
  {
    value: "green",
    label: "ดิบ",
    description:
      "เปลือกเขียวแน่น เนื้อแข็ง",
    color: "#10B981",
    paleColor: "#ECFDF5",
    textColor: "#047857",
  },
  {
    value: "breaker",
    label: "ห่าม",
    description:
      "เริ่มเปลี่ยนสี ปลายเหลือง",
    color: "#F59E0B",
    paleColor: "#FFFBEB",
    textColor: "#B45309",
  },
  {
    value: "ripe",
    label: "สุก",
    description:
      "เหลืองสวย พร้อมรับประทาน",
    color: "#F97316",
    paleColor: "#FFF7ED",
    textColor: "#C2410C",
  },
  {
    value: "overripe",
    label: "งอม",
    description:
      "สุกงอมมาก มีจุดดำ",
    color: "#EF4444",
    paleColor: "#FEF2F2",
    textColor: "#B91C1C",
  },
];

function normalizeParam(
  value: string | string[] | undefined
): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function safeJson(
  value: any
): Record<string, any> {
  if (!value) {
    return {};
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function pickValue(
  row: any,
  keys: string[],
  fallback: any = null
) {
  for (const key of keys) {
    const value = row?.[key];

    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      return value;
    }
  }

  return fallback;
}

function pickNumber(
  row: any,
  keys: string[],
  fallback = 0
): number {
  const value = pickValue(
    row,
    keys,
    fallback
  );

  const numberValue =
    Number(value);

  return Number.isFinite(numberValue)
    ? numberValue
    : fallback;
}

function buildImageUrl(
  value?: string | null
): string | null {
  if (!value) {
    return null;
  }

  const path = String(value)
    .trim()
    .replace(/\\/g, "/");

  if (!path) {
    return null;
  }

  if (
    path.startsWith("http://") ||
    path.startsWith("https://")
  ) {
    return path;
  }

  if (path.startsWith("/")) {
    return `${API_BASE}${path}`;
  }

  return path;
}

function formatDate(
  value?: string | null
): string {
  if (!value) {
    return "-";
  }

  try {
    return new Date(
      value
    ).toLocaleString(
      "th-TH",
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    );
  } catch {
    return value;
  }
}

function normalizeRipeness(
  value: any
): RipenessValue | null {
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

  return null;
}

function getPredictedRipeness(
  row: any
): RipenessValue | null {
  return normalizeRipeness(
    pickValue(
      row,
      [
        "ripeness_label",
        "ripeness",
        "class_name",
        "label",
        "ripeness_th",
        "label_th",
      ],
      null
    )
  );
}

function getChoice(
  value?: RipenessValue | null
): RipenessChoice | null {
  if (!value) {
    return null;
  }

  return (
    RIPENESS_CHOICES.find(
      (item) =>
        item.value === value
    ) ?? null
  );
}

function getConfidence(
  row: any
): number {
  const raw = pickNumber(
    row,
    [
      "confidence",
      "conf",
      "score",
      "ripeness_confidence",
      "ripeness_conf",
    ],
    0
  );

  if (raw <= 1) {
    return raw * 100;
  }

  return raw;
}

function getBananaIndex(
  row: any,
  fallback: number
): number {
  return pickNumber(
    row,
    [
      "banana_index",
      "index",
      "detection_index",
      "banana_number",
    ],
    fallback
  );
}

function ZoomImageModal({
  uri,
  title,
  imageKey,
  onClose,
}: {
  uri: string | null;
  title: string;
  imageKey: number;
  onClose: () => void;
}) {
  const images = useMemo(
    () =>
      uri
        ? [{ uri }]
        : [],
    [uri]
  );

  return (
    <ImageView
      key={
        `scan-viewer-` +
        `${imageKey}-` +
        `${uri ?? "empty"}`
      }
      images={images}
      imageIndex={0}
      visible={!!uri}
      onRequestClose={onClose}
      swipeToCloseEnabled
      doubleTapToZoomEnabled
      HeaderComponent={() => (
        <View
          style={{
            paddingTop: 54,
            paddingHorizontal: 20,
            paddingBottom: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent:
              "space-between",
            backgroundColor:
              "rgba(15,23,42,0.95)",
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: "#FFFFFF",
              fontSize: 17,
              fontWeight: "800",
              flex: 1,
              marginRight: 12,
            }}
          >
            {title}
          </Text>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              {
                paddingVertical: 8,
                paddingHorizontal: 16,
                borderRadius: 999,
                backgroundColor:
                  "#FFFFFF",
              },
              pressed && {
                opacity: 0.8,
              },
            ]}
          >
            <Text
              style={{
                color: "#0F172A",
                fontWeight: "800",
              }}
            >
              ปิด
            </Text>
          </Pressable>
        </View>
      )}
      FooterComponent={() => (
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 32,
            backgroundColor:
              "rgba(15,23,42,0.95)",
          }}
        >
          <Text
            style={{
              color: "#94A3B8",
              textAlign: "center",
              fontWeight: "600",
              fontSize: 12,
            }}
          >
            บีบนิ้วเพื่อซูม /
            ลากเพื่อดูรายละเอียด 🔍
          </Text>
        </View>
      )}
    />
  );
}

function RipenessChoiceCard({
  choice,
  active,
  predicted,
  disabled,
  onPress,
}: {
  choice: RipenessChoice;
  active: boolean;
  predicted: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const isDisabled =
    disabled || predicted;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          width: "48%",
          minHeight: 112,
          paddingVertical: 14,
          paddingHorizontal: 14,
          borderRadius: 18,

          backgroundColor:
            active
              ? choice.color
              : predicted
                ? "#F1F5F9"
                : "#FFFFFF",

          borderWidth: 1.5,

          borderColor:
            active
              ? choice.color
              : predicted
                ? "#CBD5E1"
                : "#E2E8F0",

          opacity:
            disabled
              ? 0.55
              : 1,

          shadowColor:
            active
              ? choice.color
              : "#0F172A",

          shadowOffset: {
            width: 0,
            height:
              active ? 6 : 2,
          },

          shadowOpacity:
            active
              ? 0.24
              : 0.03,

          shadowRadius:
            active
              ? 10
              : 4,

          elevation:
            active
              ? 4
              : 1,

          gap: 6,
        },

        pressed &&
          !isDisabled && {
            opacity: 0.85,
            transform: [
              {
                scale: 0.97,
              },
            ],
          },
      ]}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent:
            "space-between",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Text
          style={{
            fontSize: 17,
            fontWeight: "900",

            color:
              active
                ? "#FFFFFF"
                : predicted
                  ? "#64748B"
                  : "#0F172A",
          }}
        >
          {choice.label}
        </Text>

        {predicted && (
          <View
            style={{
              paddingVertical: 3,
              paddingHorizontal: 7,
              backgroundColor:
                "#E2E8F0",
              borderRadius: 999,
            }}
          >
            <Text
              style={{
                color: "#475569",
                fontSize: 9,
                fontWeight: "900",
              }}
            >
              ผล AI
            </Text>
          </View>
        )}

        {active && (
          <Ionicons
            name="checkmark-circle"
            size={19}
            color="#FFFFFF"
          />
        )}
      </View>

      <Text
        style={{
          fontSize: 11.5,
          lineHeight: 17,
          fontWeight: "600",

          color:
            active
              ? "rgba(255,255,255,0.90)"
              : predicted
                ? "#94A3B8"
                : "#64748B",
        }}
      >
        {predicted
          ? "เป็นผลที่ระบบทำนายไว้ ให้ใช้ปุ่มยืนยันผล AI ด้านบน"
          : choice.description}
      </Text>
    </Pressable>
  );
}

function ConfirmAiButton({
  active,
  disabled,
  predictedLabel,
  onPress,
}: {
  active: boolean;
  disabled: boolean;
  predictedLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          paddingVertical: 14,
          paddingHorizontal: 15,
          borderRadius: 17,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,

          backgroundColor:
            active
              ? "#16A34A"
              : "#FFFFFF",

          borderWidth: 1.5,

          borderColor:
            active
              ? "#16A34A"
              : "#86EFAC",

          opacity:
            disabled
              ? 0.55
              : 1,
        },

        pressed &&
          !disabled && {
            opacity: 0.85,
            transform: [
              {
                scale: 0.98,
              },
            ],
          },
      ]}
    >
      <Ionicons
        name={
          active
            ? "checkmark-circle"
            : "checkmark-circle-outline"
        }
        size={21}
        color={
          active
            ? "#FFFFFF"
            : "#16A34A"
        }
      />

      <Text
        style={{
          color:
            active
              ? "#FFFFFF"
              : "#16A34A",
          fontSize: 14,
          fontWeight: "900",
          textAlign: "center",
        }}
      >
        {active
          ? `ยืนยันแล้วว่า AI ทำนาย “${predictedLabel}” ถูกต้อง`
          : `ยืนยันว่า AI ทำนาย “${predictedLabel}” ถูกต้อง`}
      </Text>
    </Pressable>
  );
}

export default function ScanDetailScreen() {
  const params =
    useLocalSearchParams<{
      scanId?:
        | string
        | string[];
      openReview?:
        | string
        | string[];
    }>();

  const scanId =
    normalizeParam(
      params.scanId
    );

  const [
    scan,
    setScan,
  ] = useState<any>(null);

  const [
    details,
    setDetails,
  ] = useState<any[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    selectedChoices,
    setSelectedChoices,
  ] = useState<
    Record<
      string,
      RipenessValue | null
    >
  >({});

  const [
    confirmedChoices,
    setConfirmedChoices,
  ] = useState<
    Record<string, boolean>
  >({});

  const [
    savingDetailId,
    setSavingDetailId,
  ] = useState<
    string | null
  >(null);

  const [
    zoomImageUri,
    setZoomImageUri,
  ] = useState<
    string | null
  >(null);

  const [
    zoomImageTitle,
    setZoomImageTitle,
  ] = useState("");

  const [
    zoomImageKey,
    setZoomImageKey,
  ] = useState(0);

  const openZoomImage = (
    uri:
      | string
      | null
      | undefined,
    title: string
  ) => {
    if (!uri) {
      return;
    }

    setZoomImageUri(null);
    setZoomImageTitle("");

    requestAnimationFrame(
      () => {
        setZoomImageKey(
          Date.now()
        );

        setZoomImageUri(uri);
        setZoomImageTitle(title);
      }
    );
  };

  const loadDetail =
    useCallback(
      async () => {
        try {
          setLoading(true);
          setErrorMessage("");

          if (!scanId) {
            throw new Error(
              "ไม่พบรหัสผลสแกน"
            );
          }

          const {
            data: sessionData,
            error: sessionError,
          } =
            await supabase.auth
              .getSession();

          if (sessionError) {
            throw sessionError;
          }

          const userId =
            sessionData
              ?.session
              ?.user
              ?.id;

          if (!userId) {
            throw new Error(
              "กรุณาเข้าสู่ระบบก่อนดูรายละเอียด"
            );
          }

          const {
            data: scanData,
            error: scanError,
          } =
            await supabase
              .from("scan_history")
              .select("*")
              .eq("id", scanId)
              .eq(
                "user_id",
                userId
              )
              .single();

          if (scanError) {
            throw scanError;
          }

          const {
            data: detailData,
            error: detailError,
          } =
            await supabase
              .from("scan_details")
              .select("*")
              .eq(
                "scan_id",
                scanId
              )
              .order(
                "banana_index",
                {
                  ascending: true,
                }
              );

          if (detailError) {
            throw detailError;
          }

          const rows =
            Array.isArray(
              detailData
            )
              ? detailData
              : [];

          setScan(scanData);
          setDetails(rows);

          const nextChoices:
            Record<
              string,
              RipenessValue | null
            > = {};

          const nextConfirmations:
            Record<string, boolean> =
            {};

          rows.forEach(
            (
              row,
              index
            ) => {
              const key =
                String(
                  row.id ??
                    index
                );

              nextChoices[key] =
                normalizeRipeness(
                  row
                    .user_selected_ripeness
                );

              nextConfirmations[key] =
                row.is_ai_correct ===
                true;
            }
          );

          setSelectedChoices(
            nextChoices
          );

          setConfirmedChoices(
            nextConfirmations
          );
        } catch (
          error: any
        ) {
          console.log(
            "[scan-detail] load error:",
            error
          );

          setErrorMessage(
            error?.message ||
              "โหลดรายละเอียดไม่สำเร็จ"
          );
        } finally {
          setLoading(false);
        }
      },
      [scanId]
    );

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const toggleConfirmation = (
    detailKey: string
  ) => {
    setConfirmedChoices(
      (previous) => {
        const nextValue =
          !previous[detailKey];

        return {
          ...previous,
          [detailKey]:
            nextValue,
        };
      }
    );

    setSelectedChoices(
      (previous) => ({
        ...previous,
        [detailKey]: null,
      })
    );
  };

  const toggleChoice = (
    detailKey: string,
    predictedValue:
      | RipenessValue
      | null,
    selectedValue:
      RipenessValue
  ) => {
    if (
      predictedValue ===
      selectedValue
    ) {
      return;
    }

    setSelectedChoices(
      (previous) => {
        const current =
          previous[
            detailKey
          ] ?? null;

        return {
          ...previous,
          [detailKey]:
            current ===
            selectedValue
              ? null
              : selectedValue,
        };
      }
    );

    setConfirmedChoices(
      (previous) => ({
        ...previous,
        [detailKey]: false,
      })
    );
  };

  const saveReview =
    async (
      row: any,
      fallbackIndex: number
    ) => {
      const detailId =
        row.id ??
        row.detail_id ??
        row.scan_detail_id;

      if (!detailId) {
        Alert.alert(
          "บันทึกไม่ได้",
          "ไม่พบรหัส scan_detail ของกล้วยลูกนี้"
        );

        return;
      }

      const detailKey =
        String(detailId);

      const predicted =
        getPredictedRipeness(row);

      const selected =
        selectedChoices[
          detailKey
        ] ?? null;

      const isConfirmed =
        confirmedChoices[
          detailKey
        ] === true;

      const savedCorrection =
        normalizeRipeness(
          row
            .user_selected_ripeness
        );

      const wasReviewed =
        row.is_ai_correct ===
          true ||
        row.is_ai_correct ===
          false ||
        savedCorrection !== null;

      if (
        selected &&
        selected === predicted
      ) {
        Alert.alert(
          "เลือกระดับเดิมไม่ได้",
          "ระดับนี้เป็นผลที่ AI ทำนายไว้อยู่แล้ว กรุณาใช้ปุ่มยืนยันผล AI"
        );

        return;
      }

      if (
        !isConfirmed &&
        !selected &&
        !wasReviewed
      ) {
        Alert.alert(
          "ยังไม่ได้ตรวจสอบ",
          "กรุณายืนยันว่าผล AI ถูกต้อง หรือเลือกระดับความสุกที่ถูกต้อง"
        );

        return;
      }

      const bananaNumber =
        getBananaIndex(
          row,
          fallbackIndex
        );

      try {
        setSavingDetailId(
          detailKey
        );

        const updatedAt =
          new Date()
            .toISOString();

        let updatePayload:
          Record<string, any>;

        if (isConfirmed) {
          updatePayload = {
            is_ai_correct: true,

            user_selected_ripeness:
              null,

            user_selected_color_level:
              null,

            correction_comment:
              null,

            feedback_updated_at:
              updatedAt,
          };
        } else if (selected) {
          updatePayload = {
            is_ai_correct: false,

            user_selected_ripeness:
              selected,

            user_selected_color_level:
              null,

            correction_comment:
              null,

            feedback_updated_at:
              updatedAt,
          };
        } else {
          updatePayload = {
            is_ai_correct: null,

            user_selected_ripeness:
              null,

            user_selected_color_level:
              null,

            correction_comment:
              null,

            feedback_updated_at:
              updatedAt,
          };
        }

        const {
          data: updatedData,
          error: updateError,
        } =
          await supabase
            .from("scan_details")
            .update(updatePayload)
            .eq(
              "id",
              detailId
            )
            .eq(
              "scan_id",
              scanId
            )
            .select("*")
            .single();

        if (updateError) {
          throw updateError;
        }

        if (!updatedData) {
          throw new Error(
            "Supabase ไม่ได้ส่งข้อมูลแถวที่อัปเดตกลับมา"
          );
        }

        setDetails(
          (previous) =>
            previous.map(
              (item) =>
                String(item.id) ===
                String(detailId)
                  ? {
                      ...item,
                      ...updatedData,
                    }
                  : item
            )
        );

        setSelectedChoices(
          (previous) => ({
            ...previous,

            [detailKey]:
              normalizeRipeness(
                updatedData
                  .user_selected_ripeness
              ),
          })
        );

        setConfirmedChoices(
          (previous) => ({
            ...previous,

            [detailKey]:
              updatedData
                .is_ai_correct ===
              true,
          })
        );

        if (
          updatedData
            .is_ai_correct ===
          true
        ) {
          Alert.alert(
            "ยืนยันสำเร็จ",
            `ยืนยันแล้วว่า AI ทำนายกล้วยลูกที่ ${bananaNumber} เป็น “${getChoice(predicted)?.label ?? predicted ?? "ไม่ทราบ"}” ถูกต้อง`
          );
        } else if (
          updatedData
            .is_ai_correct ===
            false &&
          updatedData
            .user_selected_ripeness
        ) {
          const correctedValue =
            normalizeRipeness(
              updatedData
                .user_selected_ripeness
            );

          Alert.alert(
            "บันทึกผลแก้ไขสำเร็จ",
            `แก้ไขกล้วยลูกที่ ${bananaNumber} เป็น “${getChoice(correctedValue)?.label ?? correctedValue}” แล้ว`
          );
        } else {
          Alert.alert(
            "ยกเลิกการตรวจสอบแล้ว",
            `ล้างผลยืนยันหรือผลแก้ไขของกล้วยลูกที่ ${bananaNumber} แล้ว`
          );
        }
      } catch (
        error: any
      ) {
        console.log(
          "[scan-detail] save review error:",
          error
        );

        Alert.alert(
          "บันทึกไม่สำเร็จ",
          error?.message ||
            "กรุณาลองใหม่อีกครั้ง"
        );
      } finally {
        setSavingDetailId(null);
      }
    };

  const resultImageUrl =
    useMemo(
      () =>
        buildImageUrl(
          scan
            ?.result_image_url ||
            scan
              ?.supabase_result_url ||
            scan
              ?.result_url ||
            scan
              ?.result_path
        ),
      [scan]
    );

  const scanSummary =
    useMemo(
      () =>
        safeJson(
          scan?.summary
        ),
      [scan]
    );

  const totalBananas =
    useMemo(() => {
      const value =
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

      return (
        value ||
        Number(
          scanSummary
            .total ?? 0
        ) ||
        details.length
      );
    }, [
      scan,
      scanSummary,
      details.length,
    ]);

  const averageConfidence =
    useMemo(() => {
      if (
        details.length === 0
      ) {
        return 0;
      }

      const total =
        details.reduce(
          (
            sum,
            detail
          ) =>
            sum +
            getConfidence(
              detail
            ),
          0
        );

      return (
        total /
        details.length
      );
    }, [details]);

  const openImageComment =
    () => {
      if (!scanId) {
        Alert.alert(
          "เปิดหน้าแสดงความคิดเห็นไม่ได้",
          "ไม่พบรหัสผลสแกน"
        );

        return;
      }

      router.push({
        pathname:
          "/CommentScreen" as any,

        params: {
          scanId,
        },
      });
    };

  if (loading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor:
            "#F8FAFC",
          justifyContent:
            "center",
          alignItems:
            "center",
        }}
      >
        <ActivityIndicator
          size="large"
          color="#10B981"
        />

        <Text
          style={{
            marginTop: 12,
            color: "#64748B",
            fontWeight: "700",
          }}
        >
          กำลังโหลดรายละเอียด...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor:
          "#F8FAFC",
      }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : "height"
        }
        keyboardVerticalOffset={
          90
        }
      >
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 120,
            gap: 18,
          }}
        >
          {/* Navigation */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent:
                "space-between",
            }}
          >
            <Pressable
              onPress={() =>
                router.back()
              }
              style={({ pressed }) => [
                {
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 7,
                  backgroundColor:
                    "#FFFFFF",
                  borderWidth: 1,
                  borderColor:
                    "#E2E8F0",
                },
                pressed && {
                  opacity: 0.8,
                },
              ]}
            >
              <Ionicons
                name="arrow-back"
                size={18}
                color="#0F172A"
              />

              <Text
                style={{
                  color: "#0F172A",
                  fontWeight: "800",
                }}
              >
                ย้อนกลับ
              </Text>
            </Pressable>

            <Pressable
              onPress={loadDetail}
              style={({ pressed }) => [
                {
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 7,
                  backgroundColor:
                    "#FFFFFF",
                  borderWidth: 1,
                  borderColor:
                    "#E2E8F0",
                },
                pressed && {
                  opacity: 0.8,
                },
              ]}
            >
              <Ionicons
                name="refresh-outline"
                size={18}
                color="#10B981"
              />

              <Text
                style={{
                  color: "#10B981",
                  fontWeight: "800",
                }}
              >
                รีเฟรช
              </Text>
            </Pressable>
          </View>

          {/* Header */}
          <View style={{ gap: 5 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 42,
                  borderRadius: 999,
                  backgroundColor:
                    "#10B981",
                }}
              />

              <Text
                style={{
                  flex: 1,
                  color: "#0F172A",
                  fontSize: 25,
                  fontWeight: "900",
                }}
              >
                ผลการวิเคราะห์กล้วย
              </Text>
            </View>

            <Text
              style={{
                marginLeft: 16,
                color: "#64748B",
                fontSize: 13,
                fontWeight: "600",
                lineHeight: 19,
              }}
            >
              ตรวจสอบ ยืนยัน
              หรือแก้ไขระดับความสุก
              ของกล้วยแต่ละลูก
            </Text>
          </View>

          {!!errorMessage && (
            <View
              style={{
                padding: 16,
                borderRadius: 18,
                backgroundColor:
                  "#FEF2F2",
                borderWidth: 1,
                borderColor:
                  "#FECACA",
                flexDirection: "row",
                gap: 10,
              }}
            >
              <Ionicons
                name="alert-circle"
                size={23}
                color="#EF4444"
              />

              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: "#991B1B",
                    fontWeight: "900",
                  }}
                >
                  โหลดข้อมูลไม่สำเร็จ
                </Text>

                <Text
                  style={{
                    marginTop: 3,
                    color: "#B91C1C",
                    fontSize: 12,
                    lineHeight: 17,
                  }}
                >
                  {errorMessage}
                </Text>
              </View>
            </View>
          )}

          {!errorMessage &&
            scan && (
              <>
                {/* Summary */}
                <View
                  style={{
                    padding: 18,
                    borderRadius: 24,
                    backgroundColor:
                      "#FFFFFF",
                    borderWidth: 1,
                    borderColor:
                      "#E2E8F0",
                    gap: 15,
                  }}
                >
                  <View
                    style={{
                      flexDirection:
                        "row",
                      justifyContent:
                        "space-between",
                      alignItems:
                        "center",
                      paddingBottom: 12,
                      borderBottomWidth:
                        1,
                      borderBottomColor:
                        "#F1F5F9",
                    }}
                  >
                    <View
                      style={{
                        flexDirection:
                          "row",
                        alignItems:
                          "center",
                        gap: 7,
                      }}
                    >
                      <Ionicons
                        name="time-outline"
                        size={17}
                        color="#64748B"
                      />

                      <Text
                        style={{
                          color:
                            "#64748B",
                          fontWeight:
                            "700",
                          fontSize: 12,
                        }}
                      >
                        {formatDate(
                          scan
                            ?.created_at
                        )}
                      </Text>
                    </View>

                    <View
                      style={{
                        paddingHorizontal:
                          12,
                        paddingVertical:
                          6,
                        borderRadius:
                          999,
                        backgroundColor:
                          "#ECFDF5",
                      }}
                    >
                      <Text
                        style={{
                          color:
                            "#047857",
                          fontWeight:
                            "800",
                          fontSize: 11,
                        }}
                      >
                        วิเคราะห์สำเร็จ
                      </Text>
                    </View>
                  </View>

                  <View
                    style={{
                      flexDirection:
                        "row",
                      gap: 12,
                    }}
                  >
                    <View
                      style={{
                        flex: 1,
                        padding: 15,
                        borderRadius:
                          18,
                        backgroundColor:
                          "#F8FAFC",
                        borderWidth: 1,
                        borderColor:
                          "#E2E8F0",
                        alignItems:
                          "center",
                      }}
                    >
                      <Text
                        style={{
                          color:
                            "#64748B",
                          fontSize: 11,
                          fontWeight:
                            "700",
                        }}
                      >
                        จำนวนที่ตรวจพบ
                      </Text>

                      <Text
                        style={{
                          marginTop: 4,
                          color:
                            "#0F172A",
                          fontSize: 24,
                          fontWeight:
                            "900",
                        }}
                      >
                        {totalBananas}{" "}
                        <Text
                          style={{
                            fontSize: 13,
                            color:
                              "#64748B",
                          }}
                        >
                          ลูก
                        </Text>
                      </Text>
                    </View>

                    <View
                      style={{
                        flex: 1,
                        padding: 15,
                        borderRadius:
                          18,
                        backgroundColor:
                          "#ECFDF5",
                        borderWidth: 1,
                        borderColor:
                          "#A7F3D0",
                        alignItems:
                          "center",
                      }}
                    >
                      <Text
                        style={{
                          color:
                            "#047857",
                          fontSize: 11,
                          fontWeight:
                            "700",
                          textAlign:
                            "center",
                        }}
                      >
                        คะแนนการทำนายเฉลี่ย
                      </Text>

                      <Text
                        style={{
                          marginTop: 4,
                          color:
                            "#10B981",
                          fontSize: 24,
                          fontWeight:
                            "900",
                        }}
                      >
                        {averageConfidence
                          .toFixed(1)}
                        %
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Result image */}
                {resultImageUrl ? (
                  <Pressable
                    onPress={() =>
                      openZoomImage(
                        resultImageUrl,
                        "ผลลัพธ์ Segmentation รายลูก"
                      )
                    }
                    style={({ pressed }) => [
                      {
                        padding: 6,
                        borderRadius:
                          24,
                        backgroundColor:
                          "#FFFFFF",
                        borderWidth: 1,
                        borderColor:
                          "#E2E8F0",
                        overflow:
                          "hidden",
                      },
                      pressed && {
                        opacity: 0.9,
                      },
                    ]}
                  >
                    <Image
                      source={{
                        uri:
                          resultImageUrl,
                      }}
                      style={{
                        width: "100%",
                        height: 300,
                        borderRadius:
                          18,
                        backgroundColor:
                          "#F8FAFC",
                      }}
                      resizeMode="contain"
                    />

                    <View
                      style={{
                        position:
                          "absolute",
                        right: 18,
                        bottom: 18,
                        paddingVertical:
                          8,
                        paddingHorizontal:
                          13,
                        borderRadius:
                          999,
                        backgroundColor:
                          "rgba(15,23,42,0.88)",
                        flexDirection:
                          "row",
                        alignItems:
                          "center",
                        gap: 6,
                      }}
                    >
                      <Ionicons
                        name="search"
                        size={15}
                        color="#FFFFFF"
                      />

                      <Text
                        style={{
                          color:
                            "#FFFFFF",
                          fontSize: 11,
                          fontWeight:
                            "800",
                        }}
                      >
                        แตะเพื่อขยาย
                      </Text>
                    </View>
                  </Pressable>
                ) : (
                  <View
                    style={{
                      height: 160,
                      borderRadius: 24,
                      backgroundColor:
                        "#FFFFFF",
                      borderWidth: 1,
                      borderColor:
                        "#E2E8F0",
                      justifyContent:
                        "center",
                      alignItems:
                        "center",
                      gap: 7,
                    }}
                  >
                    <Ionicons
                      name="image-outline"
                      size={32}
                      color="#94A3B8"
                    />

                    <Text
                      style={{
                        color:
                          "#94A3B8",
                        fontWeight:
                          "700",
                      }}
                    >
                      ไม่พบภาพผลลัพธ์
                    </Text>
                  </View>
                )}

                <Text
                  style={{
                    marginTop: 4,
                    color: "#0F172A",
                    fontSize: 19,
                    fontWeight: "900",
                  }}
                >
                  รายการกล้วยรายลูก{" "}
                  ({details.length})
                </Text>

                {details.length ===
                  0 && (
                  <View
                    style={{
                      padding: 30,
                      borderRadius: 24,
                      backgroundColor:
                        "#FFFFFF",
                      borderWidth: 1,
                      borderColor:
                        "#E2E8F0",
                      alignItems:
                        "center",
                      gap: 8,
                    }}
                  >
                    <Ionicons
                      name="document-text-outline"
                      size={34}
                      color="#94A3B8"
                    />

                    <Text
                      style={{
                        color:
                          "#0F172A",
                        fontWeight:
                          "900",
                      }}
                    >
                      ไม่พบข้อมูลรายลูก
                    </Text>

                    <Text
                      style={{
                        color:
                          "#64748B",
                        fontSize: 12,
                        textAlign:
                          "center",
                      }}
                    >
                      โปรดตรวจสอบว่า
                      Backend บันทึกข้อมูล
                      ในตาราง scan_details
                      แล้ว
                    </Text>
                  </View>
                )}

                {details.map(
                  (
                    row,
                    arrayIndex
                  ) => {
                    const detailId =
                      row.id ??
                      row
                        .detail_id ??
                      arrayIndex;

                    const detailKey =
                      String(
                        detailId
                      );

                    const bananaIndex =
                      getBananaIndex(
                        row,
                        arrayIndex +
                          1
                      );

                    const predicted =
                      getPredictedRipeness(
                        row
                      );

                    const predictedChoice =
                      getChoice(
                        predicted
                      );

                    const selected =
                      selectedChoices[
                        detailKey
                      ] ?? null;

                    const isConfirmed =
                      confirmedChoices[
                        detailKey
                      ] === true;

                    const savedCorrection =
                      normalizeRipeness(
                        row
                          .user_selected_ripeness
                      );

                    const wasReviewed =
                      row
                        .is_ai_correct ===
                        true ||
                      row
                        .is_ai_correct ===
                        false ||
                      savedCorrection !==
                        null;

                    const isSaving =
                      savingDetailId ===
                      detailKey;

                    const confidence =
                      getConfidence(
                        row
                      );

                    const selectedChoice =
                      getChoice(
                        selected
                      );

                    /*
                     * มีการเลือกใหม่ในหน้าจอหรือไม่
                     */
                    const hasCurrentSelection =
                      isConfirmed ||
                      selected !== null;

                    /*
                     * เคยบันทึกผลไว้แล้ว แต่ตอนนี้ล้างตัวเลือก
                     * จึงเปิดโหมดลบผลเดิม
                     */
                    const shouldClearSavedReview =
                      !hasCurrentSelection &&
                      wasReviewed;

                    /*
                     * ปุ่มจะกดได้เมื่อ:
                     * - ยืนยันผล AI
                     * - เลือกระดับใหม่
                     * - หรือต้องการล้างผลเดิม
                     */
                    const canSubmitReview =
                      hasCurrentSelection ||
                      shouldClearSavedReview;

                    let buttonLabel =
                      "กรุณาเลือกผลการแก้ไข";

                    let buttonIcon:
                      SaveButtonIcon =
                      "alert-circle-outline";

                    let buttonColor =
                      "#CBD5E1";

                    if (isConfirmed) {
                      buttonLabel =
                        "บันทึกการยืนยันผล AI";

                      buttonIcon =
                        "checkmark-done-outline";

                      buttonColor =
                        "#10B981";
                    } else if (
                      selected
                    ) {
                      buttonLabel =
                        "บันทึกผลการแก้ไข";

                      buttonIcon =
                        "save-outline";

                      buttonColor =
                        "#10B981";
                    } else if (
                      shouldClearSavedReview
                    ) {
                      buttonLabel =
                        "ยกเลิกผลตรวจสอบที่บันทึกไว้";

                      buttonIcon =
                        "trash-outline";

                      buttonColor =
                        "#EF4444";
                    }

                    return (
                      <View
                        key={detailKey}
                        style={{
                          padding: 18,
                          borderRadius:
                            24,
                          backgroundColor:
                            "#FFFFFF",
                          borderWidth: 1,
                          borderColor:
                            "#E2E8F0",
                          gap: 15,
                        }}
                      >
                        {/* Banana Header */}
                        <View
                          style={{
                            flexDirection:
                              "row",
                            justifyContent:
                              "space-between",
                            alignItems:
                              "center",
                            gap: 10,
                          }}
                        >
                          <View
                            style={{
                              flexDirection:
                                "row",
                              alignItems:
                                "center",
                              gap: 10,
                              flex: 1,
                            }}
                          >
                            <View
                              style={{
                                width: 38,
                                height: 38,
                                borderRadius:
                                  12,
                                alignItems:
                                  "center",
                                justifyContent:
                                  "center",
                                backgroundColor:
                                  "#F8FAFC",
                                borderWidth:
                                  1,
                                borderColor:
                                  "#E2E8F0",
                              }}
                            >
                              <Text
                                style={{
                                  color:
                                    "#475569",
                                  fontWeight:
                                    "900",
                                  fontSize:
                                    15,
                                }}
                              >
                                {bananaIndex}
                              </Text>
                            </View>

                            <Text
                              style={{
                                flex: 1,
                                color:
                                  "#0F172A",
                                fontSize:
                                  17,
                                fontWeight:
                                  "900",
                              }}
                            >
                              กล้วยลูกที่{" "}
                              {bananaIndex}
                            </Text>
                          </View>

                          <View
                            style={{
                              paddingVertical:
                                7,
                              paddingHorizontal:
                                13,
                              borderRadius:
                                999,
                              backgroundColor:
                                predictedChoice
                                  ?.paleColor ??
                                "#F1F5F9",
                              borderWidth:
                                1,
                              borderColor:
                                predictedChoice
                                  ?.color ??
                                "#CBD5E1",
                            }}
                          >
                            <Text
                              style={{
                                color:
                                  predictedChoice
                                    ?.textColor ??
                                  "#475569",
                                fontWeight:
                                  "900",
                                fontSize:
                                  12,
                              }}
                            >
                              {predictedChoice
                                ?.label ??
                                "ไม่ทราบ"}
                            </Text>
                          </View>
                        </View>

                        {/* Prediction score */}
                        <View
                          style={{
                            paddingVertical:
                              12,
                            paddingHorizontal:
                              14,
                            borderRadius:
                              16,
                            backgroundColor:
                              "#F8FAFC",
                            borderWidth: 1,
                            borderColor:
                              "#E2E8F0",
                            flexDirection:
                              "row",
                            justifyContent:
                              "space-between",
                            alignItems:
                              "center",
                          }}
                        >
                          <Text
                            style={{
                              color:
                                "#64748B",
                              fontSize: 12,
                              fontWeight:
                                "700",
                            }}
                          >
                            คะแนนการทำนายของโมเดล
                          </Text>

                          <Text
                            style={{
                              color:
                                "#10B981",
                              fontSize: 15,
                              fontWeight:
                                "900",
                            }}
                          >
                            {confidence
                              .toFixed(0)}
                            %
                          </Text>
                        </View>

                        {/* Review Area */}
                        <View
                          style={{
                            padding: 15,
                            borderRadius:
                              20,
                            backgroundColor:
                              "#F8FAFC",
                            borderWidth: 1,
                            borderColor:
                              "#E2E8F0",
                            gap: 13,
                          }}
                        >
                          <View
                            style={{
                              gap: 3,
                            }}
                          >
                            <Text
                              style={{
                                color:
                                  "#0F172A",
                                fontWeight:
                                  "900",
                                fontSize:
                                  15,
                              }}
                            >
                              ตรวจสอบผล AI
                            </Text>

                            <Text
                              style={{
                                color:
                                  "#64748B",
                                fontSize:
                                  11.5,
                                lineHeight:
                                  17,
                                fontWeight:
                                  "600",
                              }}
                            >
                              ยืนยันเมื่อผล AI
                              ถูกต้อง
                              หรือเลือกระดับอื่น
                              เมื่อผล AI
                              ทำนายคลาดเคลื่อน
                            </Text>
                          </View>

                          {/* Confirm AI */}
                          <ConfirmAiButton
                            active={
                              isConfirmed
                            }
                            disabled={
                              isSaving
                            }
                            predictedLabel={
                              predictedChoice
                                ?.label ??
                              "ไม่ทราบ"
                            }
                            onPress={() =>
                              toggleConfirmation(
                                detailKey
                              )
                            }
                          />

                          <View
                            style={{
                              flexDirection:
                                "row",
                              alignItems:
                                "center",
                              gap: 10,
                            }}
                          >
                            <View
                              style={{
                                flex: 1,
                                height: 1,
                                backgroundColor:
                                  "#E2E8F0",
                              }}
                            />

                            <Text
                              style={{
                                color:
                                  "#94A3B8",
                                fontSize:
                                  10.5,
                                fontWeight:
                                  "700",
                              }}
                            >
                              หรือแก้ไขเป็น
                            </Text>

                            <View
                              style={{
                                flex: 1,
                                height: 1,
                                backgroundColor:
                                  "#E2E8F0",
                              }}
                            />
                          </View>

                          {/* Correction Choices */}
                          <View
                            style={{
                              flexDirection:
                                "row",
                              flexWrap:
                                "wrap",
                              justifyContent:
                                "space-between",
                              rowGap: 10,
                            }}
                          >
                            {RIPENESS_CHOICES.map(
                              (
                                choice
                              ) => {
                                const isPredicted =
                                  predicted ===
                                  choice.value;

                                const isActive =
                                  selected ===
                                  choice.value;

                                return (
                                  <RipenessChoiceCard
                                    key={
                                      choice.value
                                    }
                                    choice={
                                      choice
                                    }
                                    active={
                                      isActive
                                    }
                                    predicted={
                                      isPredicted
                                    }
                                    disabled={
                                      isSaving
                                    }
                                    onPress={() =>
                                      toggleChoice(
                                        detailKey,
                                        predicted,
                                        choice.value
                                      )
                                    }
                                  />
                                );
                              }
                            )}
                          </View>

                          {/* Saved confirm */}
                          {row
                            .is_ai_correct ===
                            true && (
                            <View
                              style={{
                                padding:
                                  13,
                                borderRadius:
                                  15,
                                backgroundColor:
                                  "#ECFDF5",
                                borderWidth:
                                  1,
                                borderColor:
                                  "#A7F3D0",
                                gap: 4,
                              }}
                            >
                              <View
                                style={{
                                  flexDirection:
                                    "row",
                                  alignItems:
                                    "center",
                                  gap: 7,
                                }}
                              >
                                <Ionicons
                                  name="shield-checkmark"
                                  size={18}
                                  color="#10B981"
                                />

                                <Text
                                  style={{
                                    flex: 1,
                                    color:
                                      "#047857",
                                    fontWeight:
                                      "900",
                                    fontSize:
                                      12.5,
                                  }}
                                >
                                  ผู้ใช้ยืนยันแล้วว่า
                                  AI ทำนาย “
                                  {predictedChoice
                                    ?.label ??
                                    "ไม่ทราบ"}
                                  ” ถูกต้อง
                                </Text>
                              </View>

                              {!!row
                                .feedback_updated_at && (
                                <Text
                                  style={{
                                    marginLeft:
                                      25,
                                    color:
                                      "#6B7280",
                                    fontSize:
                                      10.5,
                                    fontWeight:
                                      "600",
                                  }}
                                >
                                  อัปเดตเมื่อ{" "}
                                  {formatDate(
                                    row
                                      .feedback_updated_at
                                  )}
                                </Text>
                              )}
                            </View>
                          )}

                          {/* Saved correction */}
                          {row
                            .is_ai_correct ===
                            false &&
                            savedCorrection && (
                            <View
                              style={{
                                padding:
                                  13,
                                borderRadius:
                                  15,
                                backgroundColor:
                                  "#FFF7ED",
                                borderWidth:
                                  1,
                                borderColor:
                                  "#FED7AA",
                                gap: 4,
                              }}
                            >
                              <View
                                style={{
                                  flexDirection:
                                    "row",
                                  alignItems:
                                    "center",
                                  gap: 7,
                                }}
                              >
                                <Ionicons
                                  name="create"
                                  size={18}
                                  color="#F97316"
                                />

                                <Text
                                  style={{
                                    flex: 1,
                                    color:
                                      "#C2410C",
                                    fontWeight:
                                      "900",
                                    fontSize:
                                      12.5,
                                  }}
                                >
                                  ค่าที่ผู้ใช้แก้ไขไว้:{" "}
                                  {getChoice(
                                    savedCorrection
                                  )
                                    ?.label ??
                                    savedCorrection}
                                </Text>
                              </View>

                              {!!row
                                .feedback_updated_at && (
                                <Text
                                  style={{
                                    marginLeft:
                                      25,
                                    color:
                                      "#6B7280",
                                    fontSize:
                                      10.5,
                                    fontWeight:
                                      "600",
                                  }}
                                >
                                  อัปเดตเมื่อ{" "}
                                  {formatDate(
                                    row
                                      .feedback_updated_at
                                  )}
                                </Text>
                              )}
                            </View>
                          )}

                          {/* Current confirmation */}
                          {isConfirmed && (
                            <View
                              style={{
                                padding:
                                  12,
                                borderRadius:
                                  15,
                                backgroundColor:
                                  "#ECFDF5",
                                borderWidth:
                                  1,
                                borderColor:
                                  "#10B981",
                              }}
                            >
                              <Text
                                style={{
                                  color:
                                    "#047857",
                                  fontWeight:
                                    "800",
                                  fontSize:
                                    12,
                                }}
                              >
                                กำลังเลือก:
                                ยืนยันว่าผล AI
                                ถูกต้อง
                              </Text>
                            </View>
                          )}

                          {/* Current correction */}
                          {selectedChoice && (
                            <View
                              style={{
                                padding:
                                  12,
                                borderRadius:
                                  15,
                                backgroundColor:
                                  selectedChoice
                                    .paleColor,
                                borderWidth:
                                  1,
                                borderColor:
                                  selectedChoice
                                    .color,
                              }}
                            >
                              <Text
                                style={{
                                  color:
                                    selectedChoice
                                      .textColor,
                                  fontWeight:
                                    "800",
                                  fontSize:
                                    12,
                                }}
                              >
                                กำลังเลือกแก้เป็น:{" "}
                                {
                                  selectedChoice.label
                                }
                              </Text>
                            </View>
                          )}

                          {/* Save */}
                          <Pressable
                            disabled={
                              isSaving ||
                              !canSubmitReview
                            }
                            onPress={() =>
                              saveReview(
                                row,
                                bananaIndex
                              )
                            }
                            style={({ pressed }) => [
                              {
                                paddingVertical:
                                  14,
                                borderRadius:
                                  17,
                                alignItems:
                                  "center",
                                justifyContent:
                                  "center",
                                flexDirection:
                                  "row",
                                gap: 8,

                                backgroundColor:
                                  isSaving
                                    ? "#86EFAC"
                                    : buttonColor,

                                opacity:
                                  !canSubmitReview &&
                                  !isSaving
                                    ? 0.9
                                    : 1,
                              },

                              pressed &&
                                !isSaving &&
                                canSubmitReview && {
                                  opacity:
                                    0.85,
                                  transform:
                                    [
                                      {
                                        scale:
                                          0.98,
                                      },
                                    ],
                                },
                            ]}
                          >
                            {isSaving ? (
                              <ActivityIndicator
                                size="small"
                                color="#FFFFFF"
                              />
                            ) : (
                              <Ionicons
                                name={
                                  buttonIcon
                                }
                                size={19}
                                color="#FFFFFF"
                              />
                            )}

                            <Text
                              style={{
                                color:
                                  "#FFFFFF",
                                fontSize:
                                  14,
                                fontWeight:
                                  "900",
                              }}
                            >
                              {isSaving
                                ? "กำลังบันทึก..."
                                : buttonLabel}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    );
                  }
                )}

                {/* Image-level comment */}
                <Pressable
                  onPress={
                    openImageComment
                  }
                  style={({ pressed }) => [
                    {
                      marginTop: 4,
                      paddingVertical:
                        16,
                      paddingHorizontal:
                        18,
                      borderRadius:
                        20,
                      flexDirection:
                        "row",
                      justifyContent:
                        "center",
                      alignItems:
                        "center",
                      gap: 9,
                      backgroundColor:
                        "#0F172A",
                    },

                    pressed && {
                      opacity: 0.86,
                      transform: [
                        {
                          scale: 0.98,
                        },
                      ],
                    },
                  ]}
                >
                  <Ionicons
                    name="chatbubble-ellipses-outline"
                    size={21}
                    color="#FFFFFF"
                  />

                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontSize: 14,
                      fontWeight: "900",
                    }}
                  >
                    แสดงความคิดเห็นต่อผลคะแนนการทำนายของ AI
                  </Text>
                </Pressable>
              </>
            )}
        </ScrollView>

        <ZoomImageModal
          uri={zoomImageUri}
          title={zoomImageTitle}
          imageKey={zoomImageKey}
          onClose={() => {
            setZoomImageUri(null);
            setZoomImageTitle("");
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
