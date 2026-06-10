import { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Image,
    Pressable,
    SafeAreaView,
    ScrollView,
    Text,
    View,
} from "react-native";
import { router } from "expo-router";

import { supabase } from "../lib/supabase";

const API_BASE = "http://172.20.10.2:8000";

function safeJson(value: any) {
    if (!value) return {};
    if (typeof value === "object") return value;

    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
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

export default function HistoryScreen() {
    const [user, setUser] = useState<any>(null);
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState("");

    const loadHistory = async () => {
        try {
            setLoading(true);
            setErrorMsg("");

        const { data: sessionData, error: sessionError } =
            await supabase.auth.getSession();

        if (sessionError) {
            throw sessionError;
        }

        const currentUser = sessionData?.session?.user ?? null;
        setUser(currentUser);

        if (!currentUser?.id) {
            setItems([]);
            return;
        }

    // [STEP 6] ดึงเฉพาะประวัติของ Member คนที่ Login อยู่
    const { data, error } = await supabase
        .from("scan_history")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false });

    if (error) {
        throw error;
    }

    setItems(Array.isArray(data) ? data : []);
        } catch (err: any) {
    setErrorMsg(err?.message || "โหลดประวัติไม่สำเร็จ");
        } finally {
    setLoading(false);
    }
    };

    useEffect(() => {
        loadHistory();
    }, []);

    const totalScans = useMemo(() => items.length, [items]);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FFFDF7" }}>
        <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
                paddingHorizontal: 18,
                paddingTop: 46,
                paddingBottom: 40,
                gap: 14,
        }}
        >
        {/* Header */}
        <View
            style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
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
            <Text style={{ fontWeight: "900", color: "#111827" }}>← กลับ</Text>
        </Pressable>

        <Pressable
            onPress={loadHistory}
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
            <Text style={{ fontWeight: "900", color: "#FFFFFF" }}>รีเฟรช</Text>
        </Pressable>
        </View>

        <View>
            <Text
                style={{
                    fontSize: 32,
                    fontWeight: "900",
                    color: "#111827",
            }}
        >
                📜 Scan History
            </Text>

            <Text
            style={{
                color: "#6B7280",
                fontWeight: "700",
                marginTop: 4,
            }}
            >
                ประวัติการตรวจของสมาชิก
            </Text>
        </View>

        {/* User Card */}
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
            Member
        </Text>

        <Text
            numberOfLines={1}
            style={{
                color: "#166534",
                fontWeight: "700",
                marginTop: 4,
            }}
        >
            {user?.email ?? "ยังไม่ได้ Login"}
        </Text>

        <Text
            style={{
                color: "#166534",
                fontWeight: "800",
                marginTop: 8,
            }}
        >
            ทั้งหมด {totalScans} รายการ
        </Text>
        </View>

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
                กำลังโหลดประวัติ...
            </Text>
        </View>
        )}

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
            <Text style={{ color: "#B91C1C", marginTop: 6 }}>{errorMsg}</Text>
        </View>
        )}

        {!loading && !errorMsg && !user && (
        <View
            style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 18,
                padding: 18,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                gap: 10,
            }}
        >
            <Text style={{ fontSize: 18, fontWeight: "900" }}>
                ต้อง Login ก่อน
            </Text>
            <Text style={{ color: "#6B7280", fontWeight: "700" }}>
                History จะแสดงเฉพาะประวัติของ Member
            </Text>

            <Pressable
                onPress={() => router.push("/login" as any)}
                style={{
                    backgroundColor: "#007AFF",
                    borderRadius: 16,
                    paddingVertical: 14,
                    alignItems: "center",
            }}
            >
                <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
                    ไป Login
                </Text>
            </Pressable>
            </View>
        )}

        {!loading && !errorMsg && user && items.length === 0 && (
        <View
            style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 18,
                padding: 18,
                borderWidth: 1,
                borderColor: "#E5E7EB",
            }}
        >
            <Text style={{ fontSize: 18, fontWeight: "900" }}>
                ยังไม่มีประวัติการตรวจ
            </Text>
            <Text style={{ color: "#6B7280", fontWeight: "700", marginTop: 6 }}>
                ลองกลับไป Detect รูปก่อน แล้วกลับมาดูหน้านี้ใหม่
            </Text>
        </View>
        )}

        {!loading &&
          !errorMsg &&
          items.map((row, index) => {
            const summary = safeJson(row.summary);

            const total =
              pickNumber(row, [
                "total_detections",
                "count",
                "total",
                "total_bananas",
                "banana_count",
              ]) || Number(summary.total ?? 0);

            const green =
              pickNumber(row, ["green", "green_count"]) ||
              Number(summary.green ?? 0);

            const breaker =
              pickNumber(row, ["breaker", "breaker_count"]) ||
              Number(summary.breaker ?? 0);

            const ripe =
              pickNumber(row, ["ripe", "ripe_count"]) ||
              Number(summary.ripe ?? 0);

            const overripe =
              pickNumber(row, ["overripe", "overripe_count"]) ||
              Number(summary.overripe ?? 0);

            const imageUrl = buildImageUrl(
              row.result_image_url ||
                row.supabase_result_url ||
                row.result_url ||
                row.result_path
            );

            return (
              <View
                key={row.id ?? index}
                style={{
                  backgroundColor: "#FFFFFF",
                  borderRadius: 20,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  gap: 10,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 18,
                        fontWeight: "900",
                        color: "#111827",
                      }}
                    >
                      Scan #{items.length - index}
                    </Text>

                    <Text
                      style={{
                        color: "#6B7280",
                        fontWeight: "700",
                        marginTop: 3,
                      }}
                    >
                      {formatDate(row.created_at)}
                    </Text>
                  </View>

                  <View
                    style={{
                      backgroundColor: "#F0FDF4",
                      borderRadius: 14,
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderWidth: 1,
                      borderColor: "#BBF7D0",
                      alignItems: "center",
                    }}
                  >
                    <Text style={{ color: "#15803D", fontWeight: "900" }}>
                      {total}
                    </Text>
                    <Text
                      style={{
                        color: "#15803D",
                        fontSize: 11,
                        fontWeight: "800",
                      }}
                    >
                      ลูก
                    </Text>
                  </View>
                </View>

                {imageUrl ? (
                  <Image
                    source={{ uri: imageUrl }}
                    style={{
                      width: "100%",
                      height: 220,
                      borderRadius: 14,
                      backgroundColor: "#F3F4F6",
                    }}
                    resizeMode="contain"
                  />
                ) : (
                  <View
                    style={{
                      height: 120,
                      borderRadius: 14,
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

                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <Text style={{ color: "#15803D", fontWeight: "900" }}>
                    ดิบ: {green}
                  </Text>
                  <Text style={{ color: "#B45309", fontWeight: "900" }}>
                    ห่าม: {breaker}
                  </Text>
                  <Text style={{ color: "#EA580C", fontWeight: "900" }}>
                    สุก: {ripe}
                  </Text>
                  <Text style={{ color: "#DC2626", fontWeight: "900" }}>
                    งอม: {overripe}
                  </Text>
                </View>

                <Text
                  numberOfLines={1}
                  style={{
                    color: "#9CA3AF",
                    fontSize: 11,
                    fontWeight: "700",
                  }}
                >
                  scan_id: {row.id}
                </Text>
              </View>
            );
          })}
      </ScrollView>
    </SafeAreaView>
  );
}