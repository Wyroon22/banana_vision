import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";

import { supabase } from "../lib/supabase";

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

function formatDate(value?: string | null) {
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

function getInitial(text?: string | null) {
  if (!text) return "M";
  return text.slice(0, 1).toUpperCase();
}

export default function ProfileScreen() {
  const [user, setUser] = useState<any>(null);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [scanRows, setScanRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg("");

      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError) {
        throw userError;
      }

      const currentUser = userData?.user ?? null;
      setUser(currentUser);

      if (!currentUser?.id) {
        setScanRows([]);
        return;
      }

      setDisplayName(currentUser.user_metadata?.display_name || "Member");
      setAvatarUrl(currentUser.user_metadata?.avatar_url || "");

      const { data, error } = await supabase
        .from("scan_history")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      setScanRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setErrorMsg(err?.message || "โหลดโปรไฟล์ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const stats = useMemo(() => {
    let totalBananas = 0;

    for (const row of scanRows) {
      const summary = safeJson(row.summary);

      totalBananas +=
        pickNumber(row, [
          "total_detections",
          "count",
          "total",
          "total_bananas",
          "banana_count",
        ]) || Number(summary.total ?? 0);
    }

    return {
      totalScans: scanRows.length,
      totalBananas,
      latestScanDate: scanRows[0]?.created_at ?? null,
    };
  }, [scanRows]);

  const handleSaveProfile = async () => {
    try {
      setSaving(true);

      const name = displayName.trim();

      if (!name) {
        Alert.alert("กรอกชื่อเล่นก่อน", "ชื่อเล่นห้ามว่าง");
        return;
      }

      const { data, error } = await supabase.auth.updateUser({
  data: {
    display_name: name,
    avatar_url: avatarUrl || null,
  },
});

if (error) {
  throw error;
}

    // [STEP 8.8] บันทึกลง public.profiles ด้วย
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: data.user.id,
      email: data.user.email,
      display_name: name,
      avatar_url: avatarUrl || null,
      updated_at: new Date().toISOString(),
    });

    if (profileError) {
      throw profileError;
    }

    setUser(data.user);
    Alert.alert("บันทึกสำเร็จ", "อัปเดตข้อมูลโปรไฟล์แล้ว");
    } catch (err: any) {
      Alert.alert("บันทึกไม่สำเร็จ", err?.message || "กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  };

  const handlePickAvatar = async () => {
    try {
      setUploading(true);

      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert("ต้องอนุญาตก่อน", "กรุณาอนุญาตให้เข้าถึงรูปภาพ");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets?.[0];

      if (!asset?.uri) {
        throw new Error("ไม่พบรูปภาพที่เลือก");
      }

      if (!user?.id) {
        throw new Error("ต้อง Login ก่อนอัปโหลดรูปโปรไฟล์");
      }

      const fileExt =
        asset.uri.split(".").pop()?.toLowerCase()?.split("?")[0] || "jpg";

      const contentType =
        fileExt === "png" ? "image/png" : "image/jpeg";

      const filePath = `${user.id}/avatar-${Date.now()}.${fileExt}`;

      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, arrayBuffer, {
          contentType,
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const publicUrl = publicData.publicUrl;

      const { data: updatedData, error: updateError } =
  await supabase.auth.updateUser({
    data: {
      display_name: displayName.trim() || "Member",
      avatar_url: publicUrl,
    },
  });

if (updateError) {
  throw updateError;
}

  // [STEP 8.9] บันทึกรูปลง public.profiles ด้วย
    const { error: profileError } = await supabase.from("profiles").upsert({
      id: updatedData.user.id,
      email: updatedData.user.email,
      display_name: displayName.trim() || "Member",
      avatar_url: publicUrl,
      updated_at: new Date().toISOString(),
    });

    if (profileError) {
      throw profileError;
    }

    setAvatarUrl(publicUrl);
    setUser(updatedData.user);

    Alert.alert("อัปโหลดสำเร็จ", "เปลี่ยนรูปโปรไฟล์แล้ว");
    } catch (err: any) {
      Alert.alert("อัปโหลดไม่สำเร็จ", err?.message || "กรุณาลองใหม่");
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      router.replace("/" as any);
    } catch (err: any) {
      Alert.alert("Logout ไม่สำเร็จ", err?.message || "กรุณาลองใหม่");
    }
  };

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
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
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
            <Text style={{ color: "#111827", fontWeight: "900" }}>
              ← กลับ
            </Text>
          </Pressable>

          <Pressable
            onPress={loadProfile}
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

        <View>
          <Text
            style={{
              fontSize: 34,
              fontWeight: "900",
              color: "#111827",
            }}
          >
            👤 Profile
          </Text>

          <Text
            style={{
              color: "#6B7280",
              fontWeight: "700",
              marginTop: 4,
            }}
          >
            แก้ไขข้อมูลส่วนตัวและรูปโปรไฟล์
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
              กำลังโหลดโปรไฟล์...
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
            <Text style={{ color: "#B91C1C", marginTop: 6 }}>
              {errorMsg}
            </Text>
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

        {!loading && !errorMsg && user && (
          <>
            <View
              style={{
                backgroundColor: "#ECFDF5",
                borderRadius: 24,
                padding: 18,
                borderWidth: 1,
                borderColor: "#22C55E",
                alignItems: "center",
                gap: 12,
              }}
            >
              {avatarUrl ? (
                <Image
                  source={{ uri: avatarUrl }}
                  style={{
                    width: 110,
                    height: 110,
                    borderRadius: 55,
                    backgroundColor: "#DCFCE7",
                    borderWidth: 3,
                    borderColor: "#22C55E",
                  }}
                />
              ) : (
                <View
                  style={{
                    width: 110,
                    height: 110,
                    borderRadius: 55,
                    backgroundColor: "#16A34A",
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 3,
                    borderColor: "#BBF7D0",
                  }}
                >
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontWeight: "900",
                      fontSize: 44,
                    }}
                  >
                    {getInitial(displayName || user.email)}
                  </Text>
                </View>
              )}

              <Pressable
                onPress={handlePickAvatar}
                disabled={uploading}
                style={({ pressed }) => [
                  {
                    backgroundColor: uploading ? "#86EFAC" : "#16A34A",
                    borderRadius: 999,
                    paddingVertical: 12,
                    paddingHorizontal: 18,
                  },
                  pressed &&
                    !uploading && {
                      opacity: 0.8,
                      transform: [{ scale: 0.96 }],
                    },
                ]}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
                  {uploading ? "กำลังอัปโหลด..." : "อัปโหลดรูปโปรไฟล์"}
                </Text>
              </Pressable>

              <View style={{ width: "100%", gap: 8 }}>
                <Text style={{ color: "#166534", fontWeight: "900" }}>
                  ชื่อเล่น
                </Text>

                <TextInput
                  value={displayName}
                  onChangeText={setDisplayName}
                  placeholder="ตั้งชื่อเล่นของคุณ"
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: 16,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderWidth: 1,
                    borderColor: "#BBF7D0",
                    color: "#111827",
                    fontWeight: "800",
                  }}
                />
              </View>

              <Pressable
                onPress={handleSaveProfile}
                disabled={saving}
                style={({ pressed }) => [
                  {
                    width: "100%",
                    backgroundColor: saving ? "#93C5FD" : "#007AFF",
                    borderRadius: 18,
                    paddingVertical: 15,
                    alignItems: "center",
                  },
                  pressed &&
                    !saving && {
                      opacity: 0.8,
                      transform: [{ scale: 0.97 }],
                    },
                ]}
              >
                <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
                  {saving ? "กำลังบันทึก..." : "บันทึกข้อมูลส่วนตัว"}
                </Text>
              </Pressable>
            </View>

            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 20,
                padding: 16,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                gap: 8,
              }}
            >
              <Text style={{ color: "#111827", fontWeight: "900", fontSize: 20 }}>
                ข้อมูลบัญชี
              </Text>

              <Text selectable style={{ color: "#374151", fontWeight: "800" }}>
                Email: {user.email}
              </Text>

              <Text selectable style={{ color: "#374151", fontWeight: "800" }}>
                User ID: {user.id}
              </Text>

              <Text style={{ color: "#374151", fontWeight: "800" }}>
                สมัครเมื่อ: {formatDate(user.created_at)}
              </Text>

              <Text style={{ color: "#374151", fontWeight: "800" }}>
                Login ล่าสุด: {formatDate(user.last_sign_in_at)}
              </Text>
            </View>

            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 20,
                padding: 16,
                borderWidth: 1,
                borderColor: "#E5E7EB",
                gap: 8,
              }}
            >
              <Text style={{ color: "#111827", fontWeight: "900", fontSize: 20 }}>
                📊 สถิติการตรวจ
              </Text>

              <Text style={{ color: "#15803D", fontWeight: "900" }}>
                จำนวนครั้งที่ตรวจ: {stats.totalScans}
              </Text>

              <Text style={{ color: "#1D4ED8", fontWeight: "900" }}>
                กล้วยที่ตรวจทั้งหมด: {stats.totalBananas}
              </Text>

              <Text style={{ color: "#374151", fontWeight: "800" }}>
                ตรวจล่าสุด: {formatDate(stats.latestScanDate)}
              </Text>
            </View>

            <Pressable
              onPress={() => router.push("/history" as any)}
              style={({ pressed }) => [
                {
                  backgroundColor: "#ECFDF5",
                  borderRadius: 20,
                  paddingVertical: 18,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: "#22C55E",
                },
                pressed && {
                  opacity: 0.8,
                  transform: [{ scale: 0.97 }],
                },
              ]}
            >
              <Text style={{ color: "#166534", fontSize: 20, fontWeight: "900" }}>
                📜 ไปหน้าประวัติการตรวจ
              </Text>
            </Pressable>

            <Pressable
              onPress={handleLogout}
              style={({ pressed }) => [
                {
                  backgroundColor: "#EF4444",
                  borderRadius: 20,
                  paddingVertical: 18,
                  alignItems: "center",
                },
                pressed && {
                  opacity: 0.8,
                  transform: [{ scale: 0.97 }],
                },
              ]}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "900" }}>
                Logout
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}