import { useCallback, useEffect, useMemo, useState } from "react";
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
import { router, useLocalSearchParams } from "expo-router";

import { supabase } from "../lib/supabase";

const API_BASE = "http://172.20.10.2:8000";

const RIPENESS_CHOICES = [
  { value: "green", label: "ดิบ" },
  { value: "breaker", label: "ห่าม" },
  { value: "ripe", label: "สุก" },
  { value: "overripe", label: "งอม" },
];

const COLOR_LEVEL_CHOICES: Record<string, { value: string; label: string }[]> = {
  green: [
    { value: "dark_green", label: "เขียวเข้ม" },
    { value: "light_green", label: "เขียวอ่อน" },
    { value: "pale_green", label: "เขียวซีด" },
  ],
  breaker: [
    { value: "green_yellow", label: "เขียวอมเหลือง" },
    { value: "yellow_green", label: "เหลืองอมเขียว" },
    { value: "partial_yellow", label: "เหลืองบางส่วน" },
  ],
  ripe: [
    { value: "yellow", label: "เหลืองล้วน" },
    { value: "golden_yellow", label: "เหลืองทอง" },
    { value: "light_spots", label: "เหลืองมีจุดดำนิดหน่อย" },
  ],
  overripe: [
    { value: "many_black_spots", label: "จุดดำเยอะ" },
    { value: "brown_yellow", label: "น้ำตาลปนเหลือง" },
    { value: "brown_black", label: "น้ำตาล/ดำ" },
  ],
};

function safeJson(value: any) {
  if (!value) return {};

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function buildImageUrl(path?: string | null) {
  if (!path) return null;

  const clean = String(path).replace(/\\/g, "/");

  if (clean.startsWith("http")) {
    return clean;
  }

  if (clean.startsWith("/")) {
    return `${API_BASE}${clean}`;
  }

  return clean;
}

function formatDate(value?: string) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return value;
  }
}

function pickValue(row: any, keys: string[], fallback: any = "-") {
  for (const key of keys) {
    const value = row?.[key];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return fallback;
}

function pickNumber(row: any, keys: string[], fallback = 0) {
  for (const key of keys) {
    const value = row?.[key];

    if (value !== undefined && value !== null && value !== "") {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    }
  }

  return fallback;
}

function getRipenessLabel(row: any) {
  const raw = String(
    pickValue(
      row,
      [
        "ripeness_th",
        "label_th",
        "ripeness",
        "ripeness_label",
        "class_name",
        "label",
      ],
      "-"
    )
  ).toLowerCase();

  if (raw.includes("green") || raw.includes("ดิบ")) return "ดิบ";
  if (raw.includes("breaker") || raw.includes("ห่าม")) return "ห่าม";
  if (raw.includes("overripe") || raw.includes("งอม")) return "งอม";
  if (raw.includes("ripe") || raw.includes("สุก")) return "สุก";

  return raw === "-" ? "-" : raw;
}

function getRipenessColor(label: string) {
  if (label === "ดิบ") return "#15803D";
  if (label === "ห่าม") return "#B45309";
  if (label === "สุก") return "#EA580C";
  if (label === "งอม") return "#DC2626";

  return "#111827";
}

function getChoiceColor(value?: string | null) {
  if (value === "green" || value === "dark_green" || value === "light_green" || value === "pale_green") {
    return "#15803D";
  }

  if (value === "breaker" || value === "green_yellow" || value === "yellow_green" || value === "partial_yellow") {
    return "#B45309";
  }

  if (value === "ripe" || value === "yellow" || value === "golden_yellow" || value === "light_spots") {
    return "#EA580C";
  }

  if (value === "overripe" || value === "many_black_spots" || value === "brown_yellow" || value === "brown_black") {
    return "#DC2626";
  }

  return "#111827";
}

function getRipenessChoiceLabel(value?: string | null) {
  if (!value) return "-";
  return RIPENESS_CHOICES.find((item) => item.value === value)?.label ?? value;
}

function getColorChoiceLabel(ripeness?: string | null, colorLevel?: string | null) {
  if (!colorLevel) return "-";
  const choices = COLOR_LEVEL_CHOICES[String(ripeness ?? "")] ?? [];
  return choices.find((item) => item.value === colorLevel)?.label ?? colorLevel;
}


// แปลงค่า confidence จากฐานข้อมูลเช่น 0.92 ให้เป็บ 92%
function getConfidence(row: any) {
  const value = pickNumber(
    row,
    ["confidence", "conf", "score", "ripeness_confidence", "ripeness_conf"],
    0
  );

  if (value <= 1) {
    return `${Math.round(value * 100)}%`;
  }

  return `${Math.round(value)}%`;
}

function getBBoxText(row: any) {
  const bbox = row?.bbox || row?.box || row?.bounding_box;

  if (bbox) {
    const parsed = safeJson(bbox);

    if (Array.isArray(parsed)) {
      return parsed.join(", ");
    }

    if (typeof parsed === "object" && Object.keys(parsed).length > 0) {
      return JSON.stringify(parsed);
    }

    return String(bbox);
  }

  const x1 = pickValue(row, ["x1", "xmin", "left"], null);
  const y1 = pickValue(row, ["y1", "ymin", "top"], null);
  const x2 = pickValue(row, ["x2", "xmax", "right"], null);
  const y2 = pickValue(row, ["y2", "ymax", "bottom"], null);

  if ([x1, y1, x2, y2].every((v) => v !== null)) {
    return `x1:${x1}, y1:${y1}, x2:${x2}, y2:${y2}`;
  }

  return "-";
}

function ChoicePill({
  label,
  active,
  color,
  disabled = false,
  onPress,
}: {
  label: string;
  active: boolean;
  color: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 999,
          backgroundColor: active ? color : "#FFFFFF",
          borderWidth: 2,
          borderColor: active ? color : "#D1D5DB",
          opacity: disabled ? 0.5 : 1,
        },
        pressed &&
          !disabled && {
            opacity: 0.8,
            transform: [{ scale: 0.96 }],
          },
      ]}
    >
      <Text
        style={{
          color: active ? "#FFFFFF" : color,
          fontWeight: "900",
          fontSize: 16,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function ScanDetailScreen() {
  const params = useLocalSearchParams();

  const scanId = String(
    Array.isArray(params.scanId)
      ? params.scanId[0] ?? ""
      : params.scanId ?? ""
  );

  const [scan, setScan] = useState<any>(null);
  const [details, setDetails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  
  
  // [FEEDBACK] เก็บช้อยท์แก้ label รายลูกตาม id ของ scan_details
  const [ripenessChoices, setRipenessChoices] = useState<Record<string, string>>({});
  const [colorChoices, setColorChoices] = useState<Record<string, string>>({});
  const [savingFeedbackId, setSavingFeedbackId] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg("");

      if (!scanId) {
        throw new Error("ไม่พบ scanId");
      }

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      const userId = sessionData?.session?.user?.id;

      if (!userId) {
        throw new Error("ต้อง Login ก่อนดูรายละเอียด");
      }

      // [STEP 7] ดึง scan_history เฉพาะ scan ของ user ที่ login อยู่
      const { data: scanData, error: scanError } = await supabase
        .from("scan_history")
        .select("*")
        .eq("id", scanId)
        .eq("user_id", userId)
        .single();

      if (scanError) {
        throw scanError;
      }

      setScan(scanData);

      // [STEP 7] ดึงรายละเอียดรายลูกจาก scan_details
      const { data: detailData, error: detailError } = await supabase
        .from("scan_details")
        .select("*")
        .eq("scan_id", scanId)
        .order("banana_index", { ascending: true })
        .order("created_at", { ascending: true });

      if (detailError) {
        throw detailError;
      }

      const detailRows = Array.isArray(detailData) ? detailData : [];

      setDetails(detailRows);

      // [FEEDBACK] เตรียมช้อยท์เดิมของแต่ละลูกให้ UI
      const nextRipenessChoices: Record<string, string> = {};
      const nextColorChoices: Record<string, string> = {};

      detailRows.forEach((row, index) => {
        const key = String(row.id ?? index);

        nextRipenessChoices[key] = row.user_selected_ripeness ?? "";
        nextColorChoices[key] = row.user_selected_color_level ?? "";
      });

      setRipenessChoices(nextRipenessChoices);
      setColorChoices(nextColorChoices);
    } catch (err: any) {
      setErrorMsg(err?.message || "โหลดรายละเอียดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [scanId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // [FEEDBACK] บันทึกผลแก้ไขแบบช้อยท์ลง scan_details
  const handleSaveFeedback = async (row: any, index: number) => {
    const detailId = row.id ?? row.detail_id ?? row.scan_detail_id;

    if (!detailId) {
      Alert.alert("บันทึกไม่ได้", "ไม่พบ id ของ scan_detail แถวนี้");
      return;
    }

    const key = String(detailId);
    const selectedRipeness = ripenessChoices[key] ?? "";
    const selectedColorLevel = colorChoices[key] ?? "";

    if (!selectedRipeness) {
      Alert.alert("ยังไม่ได้เลือกความสุก", "กรุณาเลือก ดิบ / ห่าม / สุก / งอม ก่อน");
      return;
    }

    if (!selectedColorLevel) {
      Alert.alert("ยังไม่ได้เลือกระดับสี", "กรุณาเลือกระดับสีของกล้วยลูกนี้ก่อน");
      return;
    }

    try {
      setSavingFeedbackId(key);

      const now = new Date().toISOString();

      const { data: updatedRow, error } = await supabase
        .from("scan_details")
        .update({
          user_selected_ripeness: selectedRipeness,
          user_selected_color_level: selectedColorLevel,
          feedback_updated_at: now,
        })
        .eq("id", detailId)
        .eq("scan_id", scanId)
        .select(
          "id, user_selected_ripeness, user_selected_color_level, feedback_updated_at"
        )
        .single();

      if (error) {
        throw error;
      }

      if (!updatedRow) {
        throw new Error("ไม่พบแถวที่ถูกอัปเดตใน scan_details");
      }

      setDetails((prev) =>
        prev.map((item) =>
          item.id === detailId
            ? {
                ...item,
                user_selected_ripeness: updatedRow.user_selected_ripeness,
                user_selected_color_level: updatedRow.user_selected_color_level,
                feedback_updated_at: updatedRow.feedback_updated_at,
              }
            : item
        )
      );

      setRipenessChoices((prev) => ({
        ...prev,
        [key]: updatedRow.user_selected_ripeness ?? "",
      }));

      setColorChoices((prev) => ({
        ...prev,
        [key]: updatedRow.user_selected_color_level ?? "",
      }));

      Alert.alert("บันทึกสำเร็จ", `บันทึกผลแก้ไขกล้วยลูกที่ ${index + 1} แล้ว`);
    } catch (err: any) {
      Alert.alert(
        "บันทึกไม่สำเร็จ",
        err?.message || "กรุณาลองใหม่อีกครั้ง"
      );
    } finally {
      setSavingFeedbackId(null);
    }
  };

  const imageUrl = useMemo(() => {
    return buildImageUrl(
      scan?.result_image_url ||
        scan?.supabase_result_url ||
        scan?.result_url ||
        scan?.result_path
    );
  }, [scan]);

  const summary = safeJson(scan?.summary);

  const total =
    pickNumber(scan, [
      "total_detections",
      "count",
      "total",
      "total_bananas",
      "banana_count",
    ]) || Number(summary.total ?? details.length ?? 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFDF7" }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={90}
      >
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            paddingHorizontal: 18,
            paddingTop: 46,
            paddingBottom: 70,
            gap: 14,
          }}
        >
        {/* Header Buttons */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              {
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 999,
                backgroundColor: "#E5E7EB",
              },
              pressed && {
                opacity: 0.75,
                transform: [{ scale: 0.96 }],
              },
            ]}
          >
            <Text style={{ color: "#111827", fontWeight: "900" }}>
              ← กลับ
            </Text>
          </Pressable>

          <Pressable
            onPress={loadDetail}
            style={({ pressed }) => [
              {
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 999,
                backgroundColor: "#16A34A",
              },
              pressed && {
                opacity: 0.8,
                transform: [{ scale: 0.96 }],
              },
            ]}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
              รีเฟรช
            </Text>
          </Pressable>
        </View>

        {/* Title */}
        <View>
          <Text
            style={{
              fontSize: 30,
              fontWeight: "900",
              color: "#111827",
            }}
          >
            🍌 Scan Detail
          </Text>

          <Text
            style={{
              color: "#6B7280",
              fontWeight: "700",
              marginTop: 4,
            }}
          >
            รายละเอียดผลการตรวจรายลูก พร้อมผลแก้ไขจากผู้ใช้
          </Text>
        </View>

        {/* Loading */}
        {loading && (
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 18,
              padding: 20,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "#E5E7EB",
            }}
          >
            <ActivityIndicator />
            <Text style={{ marginTop: 10, fontWeight: "800" }}>
              กำลังโหลดรายละเอียด...
            </Text>
          </View>
        )}

        {/* Error */}
        {!!errorMsg && !loading && (
          <View
            style={{
              backgroundColor: "#FFF0F0",
              borderRadius: 18,
              padding: 16,
              borderWidth: 1,
              borderColor: "#FCA5A5",
            }}
          >
            <Text style={{ color: "#B91C1C", fontWeight: "900" }}>
              โหลดไม่สำเร็จ
            </Text>
            <Text style={{ color: "#B91C1C", marginTop: 6 }}>
              {errorMsg}
            </Text>
          </View>
        )}

        {/* Content */}
        {!loading && !errorMsg && scan && (
          <>
            {/* Scan Summary Card */}
            <View
              style={{
                backgroundColor: "#ECFDF5",
                borderRadius: 18,
                padding: 14,
                borderWidth: 1,
                borderColor: "#22C55E",
              }}
            >
              <Text style={{ color: "#166534", fontWeight: "900" }}>
                Scan ID
              </Text>

              <Text
                selectable
                style={{
                  color: "#166534",
                  fontWeight: "800",
                  marginTop: 4,
                }}
              >
                {scanId}
              </Text>

              <Text
                style={{
                  color: "#166534",
                  fontWeight: "800",
                  marginTop: 8,
                }}
              >
                วันที่ตรวจ: {formatDate(scan?.created_at)}
              </Text>

              <Text
                style={{
                  color: "#166534",
                  fontWeight: "900",
                  marginTop: 8,
                }}
              >
                จำนวนที่ตรวจพบทั้งหมด: {total} ลูก
              </Text>
            </View>

            {/* Result Image */}
            {imageUrl ? (
              <Image
                source={{ uri: imageUrl }}
                style={{
                  width: "100%",
                  height: 330,
                  borderRadius: 18,
                  backgroundColor: "#F3F4F6",
                }}
                resizeMode="contain"
              />
            ) : (
              <View
                style={{
                  height: 180,
                  borderRadius: 18,
                  backgroundColor: "#F3F4F6",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#6B7280", fontWeight: "800" }}>
                  ไม่มีรูปผลลัพธ์
                </Text>
              </View>
            )}

            <Text
              style={{
                fontSize: 22,
                fontWeight: "900",
                color: "#111827",
              }}
            >
              รายละเอียดรายลูก
            </Text>

            {/* Empty Details */}
            {details.length === 0 && (
              <View
                style={{
                  backgroundColor: "#FFFFFF",
                  borderRadius: 18,
                  padding: 18,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                }}
              >
                <Text style={{ fontWeight: "900", fontSize: 18 }}>
                  ยังไม่มีข้อมูล scan_details
                </Text>

                <Text
                  style={{
                    color: "#6B7280",
                    fontWeight: "700",
                    marginTop: 6,
                  }}
                >
                  ถ้า History มีผลรวม แต่หน้านี้ไม่มีรายลูก แปลว่า backend
                  ยังไม่ได้บันทึก scan_details
                </Text>
              </View>
            )}

            {/* Detail List */}
            {details.map((row, index) => {
              const label = getRipenessLabel(row);
              const labelColor = getRipenessColor(label);
              const confidence = getConfidence(row); //ดึงค่าความมั่นใจของ AI จากข้อมูลกล้วยแต่ละลูก
              const bboxText = getBBoxText(row);
              const detailKey = String(row.id ?? index);
              const isSavingThisRow = savingFeedbackId === detailKey;
              const selectedRipeness = ripenessChoices[detailKey] ?? "";
              const selectedColorLevel = colorChoices[detailKey] ?? "";
              const colorOptions = selectedRipeness
                ? COLOR_LEVEL_CHOICES[selectedRipeness] ?? []
                : [];

              return (
                <View
                  key={row.id ?? index}
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: 18,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    gap: 8,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 20,
                        fontWeight: "900",
                        color: "#111827",
                      }}
                    >
                      กล้วยลูกที่ {index + 1}
                    </Text>

                    <View
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 999,
                        backgroundColor: "#F9FAFB",
                        borderWidth: 1,
                        borderColor: "#E5E7EB",
                      }}
                    >
                      <Text
                        style={{
                          color: labelColor,
                          fontWeight: "900",
                        }}
                      >
                        {label}
                      </Text>
                    </View>
                  </View>
                  
                  {/* แสดงค่าความมั่นใจของ AI เป็น เปอร์เซ็นต์ */}
                  <Text
                    style={{
                      color: "#374151",
                      fontWeight: "800",
                    }}
                  >
                    ความมั่นใจความสุก: {confidence}
                  </Text>

                  <Text
                    selectable
                    style={{
                      color: "#6B7280",
                      fontWeight: "700",
                      fontSize: 12,
                    }}
                  >
                    BBox: {bboxText}
                  </Text>

                  {/* [FEEDBACK] ผู้ใช้แก้ label ด้วยช้อยท์ */}
                  <View
                    style={{
                      marginTop: 8,
                      gap: 10,
                      backgroundColor: "#F9FAFB",
                      borderRadius: 14,
                      padding: 12,
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                    }}
                  >
                    <Text
                      style={{
                        color: "#111827",
                        fontWeight: "900",
                        fontSize: 16,
                      }}
                    >
                      1) ผู้ใช้เลือกความสุกที่ถูกต้อง
                    </Text>

                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: 10,
                      }}
                    >
                      {RIPENESS_CHOICES.map((choice) => (
                        <ChoicePill
                          key={choice.value}
                          label={choice.label}
                          active={selectedRipeness === choice.value}
                          color={getChoiceColor(choice.value)}
                          disabled={isSavingThisRow}
                          onPress={() => {
                            setRipenessChoices((prev) => ({
                              ...prev,
                              [detailKey]: choice.value,
                            }));

                            // เปลี่ยนความสุกหลักแล้วให้ล้างระดับสีเดิม
                            setColorChoices((prev) => ({
                              ...prev,
                              [detailKey]: "",
                            }));
                          }}
                        />
                      ))}
                    </View>

                    <Text
                      style={{
                        color: "#111827",
                        fontWeight: "900",
                        fontSize: 16,
                        marginTop: 4,
                      }}
                    >
                      2) เลือกระดับสี
                    </Text>

                    {selectedRipeness ? (
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 10,
                        }}
                      >
                        {colorOptions.map((choice) => (
                          <ChoicePill
                            key={choice.value}
                            label={choice.label}
                            active={selectedColorLevel === choice.value}
                            color={getChoiceColor(choice.value)}
                            disabled={isSavingThisRow}
                            onPress={() => {
                              setColorChoices((prev) => ({
                                ...prev,
                                [detailKey]: choice.value,
                              }));
                            }}
                          />
                        ))}
                      </View>
                    ) : (
                      <Text
                        style={{
                          color: "#6B7280",
                          fontWeight: "700",
                        }}
                      >
                        เลือกความสุกก่อน แล้วระบบจะแสดงระดับสีที่เกี่ยวข้อง
                      </Text>
                    )}

                    {!!row.user_selected_ripeness && !!row.user_selected_color_level && (
                      <View
                        style={{
                          backgroundColor: "#FFFFFF",
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: "#E5E7EB",
                          padding: 10,
                          gap: 4,
                        }}
                      >
                        <Text
                          style={{
                            color: "#374151",
                            fontWeight: "900",
                          }}
                        >
                          คำตอบล่าสุดของผู้ใช้: {getRipenessChoiceLabel(row.user_selected_ripeness)} / {getColorChoiceLabel(row.user_selected_ripeness, row.user_selected_color_level)}
                        </Text>

                        {!!row.feedback_updated_at && (
                          <Text
                            style={{
                              color: "#9CA3AF",
                              fontWeight: "700",
                              fontSize: 12,
                            }}
                          >
                            อัปเดตล่าสุด: {formatDate(row.feedback_updated_at)}
                          </Text>
                        )}
                      </View>
                    )}

                    <Pressable
                      onPress={() => handleSaveFeedback(row, index)}
                      disabled={isSavingThisRow}
                      style={({ pressed }) => [
                        {
                          backgroundColor: isSavingThisRow
                            ? "#93C5FD"
                            : "#007AFF",
                          borderRadius: 12,
                          paddingVertical: 12,
                          alignItems: "center",
                        },
                        pressed &&
                          !isSavingThisRow && {
                            opacity: 0.8,
                            transform: [{ scale: 0.97 }],
                          },
                      ]}
                    >
                      <Text
                        style={{
                          color: "#FFFFFF",
                          fontWeight: "900",
                        }}
                      >
                        {isSavingThisRow
                          ? "กำลังบันทึก..."
                          : "บันทึกผลแก้ไข"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </>
        )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}