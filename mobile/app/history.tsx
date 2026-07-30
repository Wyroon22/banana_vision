import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../lib/supabase";
import { HomeDock } from "../components/HomeDock";

const API_BASE = "http://172.20.10.2:8000";
const PAGE_SIZE = 10;

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

  if (clean.startsWith("http")) return clean;
  if (clean.startsWith("/")) return `${API_BASE}${clean}`;

  return clean;
}

function getRowStats(row: any) {
  const summary = safeJson(row.summary);

  return {
    total:
      pickNumber(row, [
        "total_detections",
        "count",
        "total",
        "total_bananas",
        "banana_count",
      ]) || Number(summary.total ?? 0),
    green:
      pickNumber(row, ["green", "green_count"]) ||
      Number(summary.green ?? 0),
    breaker:
      pickNumber(row, ["breaker", "breaker_count"]) ||
      Number(summary.breaker ?? 0),
    ripe:
      pickNumber(row, ["ripe", "ripe_count"]) ||
      Number(summary.ripe ?? 0),
    overripe:
      pickNumber(row, ["overripe", "overripe_count"]) ||
      Number(summary.overripe ?? 0),
  };
}

export default function HistoryScreen() {
  const [user, setUser] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [totalRows, setTotalRows] = useState(0);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const [errorMsg, setErrorMsg] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchPage = useCallback(
    async ({
      page,
      replace,
      currentUserId,
    }: {
      page: number;
      replace: boolean;
      currentUserId: string;
    }) => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await supabase
        .from("scan_history")
        .select("*", { count: "exact" })
        .eq("user_id", currentUserId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      const rows = Array.isArray(data) ? data : [];

      setTotalRows(count ?? 0);
      setHasMore(rows.length === PAGE_SIZE);

      setItems((prev) => {
        if (replace) return rows;

        const seen = new Set(prev.map((item) => String(item.id)));
        const uniqueRows = rows.filter((item) => !seen.has(String(item.id)));
        return [...prev, ...uniqueRows];
      });
    },
    []
  );

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg("");
      setHasMore(true);

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      const currentUser = sessionData?.session?.user ?? null;
      setUser(currentUser);

      if (!currentUser?.id) {
        setItems([]);
        setTotalRows(0);
        setHasMore(false);
        return;
      }

      await fetchPage({
        page: 0,
        replace: true,
        currentUserId: currentUser.id,
      });
    } catch (err: any) {
      setErrorMsg(err?.message || "โหลดประวัติไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;

    try {
      setRefreshing(true);
      setErrorMsg("");

      if (!user?.id) {
        await loadHistory();
        return;
      }

      await fetchPage({
        page: 0,
        replace: true,
        currentUserId: user.id,
      });
    } catch (err: any) {
      setErrorMsg(err?.message || "รีเฟรชประวัติไม่สำเร็จ");
    } finally {
      setRefreshing(false);
    }
  }, [fetchPage, loadHistory, refreshing, user?.id]);

  const loadMore = useCallback(async () => {
    if (
      loading ||
      refreshing ||
      loadingMore ||
      !hasMore ||
      !user?.id ||
      searchQuery.trim()
    ) {
      return;
    }

    try {
      setLoadingMore(true);
      const nextPage = Math.floor(items.length / PAGE_SIZE);

      await fetchPage({
        page: nextPage,
        replace: false,
        currentUserId: user.id,
      });
    } catch (err: any) {
      setErrorMsg(err?.message || "โหลดรายการเพิ่มเติมไม่สำเร็จ");
    } finally {
      setLoadingMore(false);
    }
  }, [
    fetchPage,
    hasMore,
    items.length,
    loading,
    loadingMore,
    refreshing,
    searchQuery,
    user?.id,
  ]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;

    const query = searchQuery.toLowerCase().trim();

    return items.filter((row, index) => {
      const { total, green, breaker, ripe, overripe } = getRowStats(row);
      const scanNumber = totalRows > 0 ? totalRows - index : items.length - index;

      return (
        `scan #${scanNumber}`.toLowerCase().includes(query) ||
        formatDate(row.created_at).toLowerCase().includes(query) ||
        String(row.id).toLowerCase().includes(query) ||
        String(total).includes(query) ||
        (query.includes("ดิบ") && green > 0) ||
        (query.includes("ห่าม") && breaker > 0) ||
        (query.includes("สุก") && ripe > 0) ||
        (query.includes("งอม") && overripe > 0)
      );
    });
  }, [items, searchQuery, totalRows]);

  const renderHistoryItem = useCallback(
    ({ item: row, index }: { item: any; index: number }) => {
      const { total, green, breaker, ripe, overripe } = getRowStats(row);

      const imageUrl = buildImageUrl(
        row.thumbnail_url ||
          row.result_thumbnail_url ||
          row.result_image_url ||
          row.supabase_result_url ||
          row.result_url ||
          row.result_path
      );

      const scanNumber =
        totalRows > 0 ? Math.max(totalRows - index, 1) : items.length - index;

      return (
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/scan-detail",
              params: { scanId: row.id },
            } as any)
          }
          style={({ pressed }) => [
            {
              backgroundColor: "#FFFFFF",
              borderRadius: 22,
              padding: 16,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              gap: 12,
              shadowColor: "#0F172A",
              shadowOffset: { width: 0, height: 3 },
              shadowOpacity: 0.04,
              shadowRadius: 8,
              elevation: 2,
              marginBottom: 16,
            },
            pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: "900",
                  color: "#0F172A",
                }}
              >
                Scan #{scanNumber}
              </Text>
              <Text
                style={{
                  color: "#64748B",
                  fontWeight: "600",
                  fontSize: 11,
                  marginTop: 2,
                }}
              >
                {formatDate(row.created_at)}
              </Text>
            </View>

            <View
              style={{
                backgroundColor: "#F0FDF4",
                borderRadius: 14,
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderWidth: 1,
                borderColor: "#BBF7D0",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: "#15803D",
                  fontWeight: "900",
                  fontSize: 13,
                }}
              >
                {total}
              </Text>
              <Text
                style={{ color: "#15803D", fontSize: 10, fontWeight: "700" }}
              >
                ลูก
              </Text>
            </View>
          </View>

          {imageUrl ? (
            <ExpoImage
              source={{ uri: imageUrl }}
              style={{
                width: "100%",
                height: 190,
                borderRadius: 14,
                backgroundColor: "#F1F5F9",
              }}
              contentFit="contain"
              cachePolicy="memory-disk"
              transition={150}
              recyclingKey={String(row.id)}
            />
          ) : (
            <View
              style={{
                height: 100,
                borderRadius: 14,
                backgroundColor: "#F8FAFC",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "#F1F5F9",
              }}
            >
              <Text
                style={{
                  color: "#94A3B8",
                  fontWeight: "700",
                  fontSize: 12,
                }}
              >
                ไม่มีรูปผลลัพธ์
              </Text>
            </View>
          )}

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "space-between",
              backgroundColor: "#F8FAFC",
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderRadius: 14,
            }}
          >
            <Text style={{ color: "#15803D", fontWeight: "800", fontSize: 13 }}>
              ดิบ: {green}
            </Text>
            <Text style={{ color: "#B45309", fontWeight: "800", fontSize: 13 }}>
              ห่าม: {breaker}
            </Text>
            <Text style={{ color: "#EA580C", fontWeight: "800", fontSize: 13 }}>
              สุก: {ripe}
            </Text>
            <Text style={{ color: "#DC2626", fontWeight: "800", fontSize: 13 }}>
              งอม: {overripe}
            </Text>
          </View>

          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 2,
            }}
          >
            <Text style={{ color: "#16A34A", fontSize: 13, fontWeight: "800" }}>
              ดูรายละเอียดรายลูก →
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: "#94A3B8",
                fontSize: 10,
                fontWeight: "600",
                maxWidth: 110,
              }}
            >
              {row.id}
            </Text>
          </View>
        </Pressable>
      );
    },
    [items.length, totalRows]
  );

  const listHeader = (
    <View style={{ gap: 16, paddingTop: 16 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: "#FFFFFF",
          paddingVertical: 12,
          paddingHorizontal: 16,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: "#E2E8F0",
          shadowColor: "#0F172A",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              backgroundColor: "#DCFCE7",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="time-outline" size={22} color="#16A34A" />
          </View>
          <Text
            style={{ fontSize: 18, fontWeight: "800", color: "#0F172A" }}
          >
            Scan History
          </Text>
        </View>

        <Pressable
          onPress={handleRefresh}
          disabled={refreshing}
          style={({ pressed }) => [
            {
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 999,
              backgroundColor: "#F0FDF4",
              borderWidth: 1,
              borderColor: "#BBF7D0",
              opacity: refreshing ? 0.6 : 1,
            },
            pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
          ]}
        >
          <Ionicons name="refresh-outline" size={16} color="#16A34A" />
          <Text
            style={{ fontWeight: "800", color: "#16A34A", fontSize: 12 }}
          >
            รีเฟรช
          </Text>
        </Pressable>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#FFFFFF",
          borderRadius: 16,
          paddingHorizontal: 16,
          paddingVertical: Platform.OS === "ios" ? 12 : 8,
          borderWidth: 1,
          borderColor: "#E2E8F0",
          gap: 10,
          elevation: 1,
        }}
      >
        <Ionicons name="search-outline" size={20} color="#94A3B8" />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="ค้นหาตามวันที่, ID, หรือระดับความสุก..."
          placeholderTextColor="#94A3B8"
          style={{
            flex: 1,
            fontSize: 14,
            color: "#0F172A",
            fontWeight: "600",
          }}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color="#94A3B8" />
          </Pressable>
        )}
      </View>

      <View
        style={{
          backgroundColor: "#F0FDF4",
          borderRadius: 18,
          padding: 14,
          borderWidth: 1,
          borderColor: "#DCFCE7",
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            backgroundColor: "#DCFCE7",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 10,
          }}
        >
          <Ionicons name="person-outline" size={18} color="#166534" />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={{ color: "#14532D", fontWeight: "800", fontSize: 13 }}
          >
            {user?.user_metadata?.display_name || user?.email || "สมาชิก"}
          </Text>
          <Text
            style={{
              color: "#15803D",
              fontWeight: "600",
              fontSize: 11,
              marginTop: 1,
            }}
          >
            ทั้งหมด {totalRows} รายการ • โหลดแล้ว {items.length} รายการ
          </Text>
        </View>
      </View>

      {!!errorMsg && !loading && (
        <View
          style={{
            backgroundColor: "#FEF2F2",
            borderRadius: 20,
            padding: 16,
            borderWidth: 1,
            borderColor: "#FEE2E2",
          }}
        >
          <Text style={{ color: "#991B1B", fontWeight: "800", fontSize: 14 }}>
            โหลดไม่สำเร็จ
          </Text>
          <Text style={{ color: "#B91C1C", marginTop: 4, fontSize: 12 }}>
            {errorMsg}
          </Text>
        </View>
      )}

      {!loading && !user && (
        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 20,
            padding: 24,
            borderWidth: 1,
            borderColor: "#E2E8F0",
            gap: 12,
            alignItems: "center",
          }}
        >
          <Ionicons name="lock-closed-outline" size={32} color="#16A34A" />
          <Text style={{ fontSize: 18, fontWeight: "900", color: "#0F172A" }}>
            ต้องเข้าสู่ระบบก่อน
          </Text>
          <Pressable
            onPress={() => router.replace("/login" as any)}
            style={{
              backgroundColor: "#16A34A",
              borderRadius: 14,
              paddingVertical: 14,
              alignItems: "center",
              width: "100%",
            }}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "800", fontSize: 14 }}>
              เข้าสู่ระบบ
            </Text>
          </Pressable>
        </View>
      )}

      {!loading && user && filteredItems.length === 0 && (
        <View
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 20,
            padding: 32,
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#E2E8F0",
            gap: 8,
          }}
        >
          <Ionicons name="folder-open-outline" size={36} color="#94A3B8" />
          <Text style={{ fontSize: 17, fontWeight: "800", color: "#0F172A" }}>
            {searchQuery ? "ไม่พบผลลัพธ์ที่ค้นหา" : "ยังไม่มีประวัติการตรวจ"}
          </Text>
        </View>
      )}

      <View style={{ height: 16 }} />
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {loading ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 20,
            }}
          >
            <ActivityIndicator size="large" color="#16A34A" />
            <Text
              style={{ marginTop: 12, fontWeight: "700", color: "#475569" }}
            >
              กำลังโหลดประวัติ...
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredItems}
            keyExtractor={(item, index) => String(item.id ?? index)}
            renderItem={renderHistoryItem}
            ListHeaderComponent={listHeader}
            ListFooterComponent={
              loadingMore ? (
                <View style={{ paddingVertical: 20 }}>
                  <ActivityIndicator color="#16A34A" />
                </View>
              ) : (
                <View style={{ height: 10 }} />
              )
            }
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingBottom: 140,
            }}
            keyboardShouldPersistTaps="handled"
            onEndReached={loadMore}
            onEndReachedThreshold={0.45}
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            updateCellsBatchingPeriod={50}
            windowSize={5}
            removeClippedSubviews={Platform.OS === "android"}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor="#16A34A"
                colors={["#16A34A"]}
              />
            }
          />
        )}

        <HomeDock
          takePhoto={() => router.replace("/(tabs)" as any)}
          pickImage={() => router.replace("/(tabs)" as any)}
          scrollToTop={() => router.replace("/(tabs)" as any)}
          user={user}
          activeTab="history"
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}