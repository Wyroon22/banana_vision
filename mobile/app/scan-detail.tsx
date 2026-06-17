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
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { supabase } from "../lib/supabase";

const API_BASE = "http://172.20.10.2:8000";

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

function getConfidence(row: any) {
  const value = pickNumber(
    row,
    ["confidence", "conf", "score", "ripeness_confidence"],
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

  // [STEP 10] เก็บคอมเมนต์รายลูกตาม id ของ scan_details
  const [comments, setComments] = useState<Record<string, string>>({});
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);

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
        .order("created_at", { ascending: true });

      if (detailError) {
        throw detailError;
      }

      const detailRows = Array.isArray(detailData) ? detailData : [];

      setDetails(detailRows);

      // [STEP 10] เตรียมคอมเมนต์เดิมของแต่ละลูกให้ TextInput
      const nextComments: Record<string, string> = {};

      detailRows.forEach((row, index) => {
        const key = String(row.id ?? index);
        nextComments[key] = row.user_comment ?? "";
      });

      setComments(nextComments);
    } catch (err: any) {
      setErrorMsg(err?.message || "โหลดรายละเอียดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [scanId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  // [STEP 10] บันทึกคอมเมนต์รายลูกลง scan_details.user_comment
  const handleSaveComment = async (row: any, index: number) => {
    const detailId = row.id;

    if (!detailId) {
      Alert.alert("บันทึกไม่ได้", "ไม่พบ id ของ scan_detail แถวนี้");
      return;
    }

    const key = String(detailId);
    const text = comments[key]?.trim() ?? "";

    try {
      setSavingCommentId(key);

      const now = new Date().toISOString();

      const { error } = await supabase
        .from("scan_details")
        .update({
          user_comment: text || null,
          comment_updated_at: now,
        })
        .eq("id", detailId)
        .eq("scan_id", scanId);

      if (error) {
        throw error;
      }

      // [STEP 10] อัปเดต UI ทันทีหลังบันทึก
      setDetails((prev) =>
        prev.map((item) =>
          item.id === detailId
            ? {
                ...item,
                user_comment: text || null,
                comment_updated_at: now,
              }
            : item
        )
      );

      Alert.alert(
        "บันทึกสำเร็จ",
        `บันทึกคอมเมนต์กล้วยลูกที่ ${index + 1} แล้ว`
      );
    } catch (err: any) {
      Alert.alert(
        "บันทึกไม่สำเร็จ",
        err?.message || "กรุณาลองใหม่อีกครั้ง"
      );
    } finally {
      setSavingCommentId(null);
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
            รายละเอียดผลการตรวจรายลูก พร้อมคอมเมนต์แยกแต่ละลูก
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
              const confidence = getConfidence(row);
              const bboxText = getBBoxText(row);
              const commentKey = String(row.id ?? index);
              const isSavingThisRow = savingCommentId === commentKey;

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

                  <Text
                    style={{
                      color: "#374151",
                      fontWeight: "800",
                    }}
                  >
                    Confidence: {confidence}
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

                  {/* [STEP 10] ช่องคอมเมนต์รายลูก */}
                  <View
                    style={{
                      marginTop: 8,
                      gap: 8,
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
                        fontSize: 15,
                      }}
                    >
                      📝 คอมเมนต์รายลูก
                    </Text>

                    <TextInput
                      value={comments[commentKey] ?? ""}
                      onChangeText={(text) => {
                        setComments((prev) => ({
                          ...prev,
                          [commentKey]: text,
                        }));
                      }}
                      placeholder={`เขียนคอมเมนต์สำหรับกล้วยลูกที่ ${index + 1}`}
                      placeholderTextColor="#9CA3AF"
                      multiline
                      style={{
                        minHeight: 80,
                        backgroundColor: "#FFFFFF",
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: "#D1D5DB",
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        color: "#111827",
                        fontWeight: "700",
                        textAlignVertical: "top",
                      }}
                    />

                    {!!row.user_comment && (
                      <Text
                        style={{
                          color: "#6B7280",
                          fontWeight: "700",
                          fontSize: 12,
                        }}
                      >
                        คอมเมนต์ล่าสุด: {row.user_comment}
                      </Text>
                    )}

                    {!!row.comment_updated_at && (
                      <Text
                        style={{
                          color: "#9CA3AF",
                          fontWeight: "700",
                          fontSize: 12,
                        }}
                      >
                        อัปเดตล่าสุด: {formatDate(row.comment_updated_at)}
                      </Text>
                    )}

                    <Pressable
                      onPress={() => handleSaveComment(row, index)}
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
                          : "บันทึกคอมเมนต์"}
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