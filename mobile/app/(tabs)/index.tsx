import { View, Text, Image, Pressable, ScrollView, SafeAreaView, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
// [STEP 4.1] import Supabase client เพื่ออ่าน session/login state
import { supabase } from "../../lib/supabase";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

// [STEP 9] เพิ่ม Component สำหรับให้คะแนนดาว + ส่ง Feedback หลัง Detect สำเร็จ
import FeedbackCard from "../../components/FeedbackCard";


const API_BASE = "http://172.20.10.2:8000";
const TARGET_WIDTH = 1280; // ✅ resize กันไฟล์ใหญ่เกิน

export default function HomeScreen() {
  const [image, setImage] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  // [STEP 4.1] เก็บ user ที่ login อยู่
  const [user, setUser] = useState<any>(null);

  // [STEP 4.1] ใช้บอกว่ากำลังเช็ก session อยู่ไหม
  const [authLoading, setAuthLoading] = useState(true);
  const [annotatedUrl, setAnnotatedUrl] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [showDebug, setShowDebug] = useState(false);

  // [STEP 4.1] เช็กว่า user login อยู่ไหม ตอนเปิดหน้า Home
useEffect(() => {
  let mounted = true;

  const loadSession = async () => {
    try {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.log("[auth] getSession error:", error.message);
      }

      if (mounted) {
        setUser(data?.session?.user ?? null);
        setAuthLoading(false);
      }
    } catch (err) {
      console.log("[auth] getSession failed:", err);

      if (mounted) {
        setUser(null);
        setAuthLoading(false);
      }
    }
  };

  loadSession();

  // [STEP 4.1] ฟัง event เวลา login/logout/session เปลี่ยน
  const { data: authListener } = supabase.auth.onAuthStateChange(
    (_event, session) => {
      const nextUser = session?.user ?? null;

      // [STEP 5 FIX] ถ้า Auth state เปลี่ยน เช่น Login / Logout
      // ให้เคลียร์รูป ผลตรวจ และ Debug เก่า
      // กันข้อมูล Member ค้างไปโผล่ตอน Guest
      setImage(null);
      setResult(null);
      setAnnotatedUrl(null);
      setStatusText("");
      setErrorMsg("");
      setShowDebug(false);

      setUser(nextUser);
      setAuthLoading(false);
      }
  );

  return () => {
    mounted = false;
    authListener?.subscription?.unsubscribe();
  };
  }, []);

  // [STEP 4.2] Logout ออกจาก Supabase แล้วเคลียร์ user ในหน้า Home
  const handleLogout = async () => {
  try {
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw error;
    }

    // [STEP 5 FIX] เคลียร์รูป/ผลตรวจเก่าหลัง Logout
    clearScanState();

    setUser(null);
    router.replace("/");
  } catch (err: any) {
    Alert.alert(
      "Logout ไม่สำเร็จ",
      err?.message || "เกิดข้อผิดพลาดระหว่างออกจากระบบ"
    );
  }
};

  const summary = useMemo(() => {
    if (!result?.ok) return null;

    const dets = Array.isArray(result.detections) ? result.detections : [];

    const maxDetConf =
      dets.length > 0
        ? Math.max(...dets.map((d: any) => Number(d.det_conf ?? d.conf ?? 0)))
        : 0;

    const maxRipenessConf =
      dets.length > 0
        ? Math.max(...dets.map((d: any) => Number(d.ripeness_conf ?? 0)))
        : 0;

    const green = Number(result.summary?.green ?? 0);
    const breaker = Number(result.summary?.breaker ?? 0);
    const ripe = Number(result.summary?.ripe ?? 0);
    const overripe = Number(result.summary?.overripe ?? 0);

    const totalRipeness = green + breaker + ripe + overripe;

    let overall = "ยังสรุปไม่ได้";

    if (totalRipeness > 0) {
      const maxValue = Math.max(green, breaker, ripe, overripe);

      if (green === maxValue) overall = "ดิบเป็นส่วนใหญ่";
      if (breaker === maxValue) overall = "ห่ามเป็นส่วนใหญ่";
      if (ripe === maxValue) overall = "สุกเป็นส่วนใหญ่";
      if (overripe === maxValue) overall = "งอมเป็นส่วนใหญ่";
    }

    return {
      total: result.count ?? result.total_detections ?? dets.length,
      ms: result.inference_ms ?? 0,
      green,
      breaker,
      ripe,
      overripe,
      overall,
      maxDetConf,
      maxRipenessConf,
      detections: dets,
    };
  }, [result]);

  const resetState = () => {
    setErrorMsg("");
    setStatusText("");
    setResult(null);
    setAnnotatedUrl(null);
    setShowDebug(false);
  };

  // [STEP 5 FIX] เคลียร์ข้อมูล scan ทั้งหมดเมื่อเปลี่ยน user / logout
  // กันรูปหรือผลตรวจของ Member ค้างไปโผล่ตอน Guest
  const clearScanState = () => {
    setImage(null);
    setResult(null);
    setAnnotatedUrl(null);
    setStatusText("");
    setErrorMsg("");
    setShowDebug(false);
  };

  // 📸 ถ่ายรูป
  const takePhoto = async () => {
    resetState();

    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      alert("ต้องอนุญาตกล้องก่อนนะ 🥲");
      return;
    }

    const shot = await ImagePicker.launchCameraAsync({
      quality: 1,
    });

    if (!shot.canceled) {
      setImage(shot.assets[0].uri);
    }
  };

  // 🖼 เลือกรูป
  const pickImage = async () => {
    resetState();

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });

    if (!picked.canceled) {
      setImage(picked.assets[0].uri);
    }
  };

  const checkBackend = async () => {
    setLoading(true);
    resetState();

    try {
      const res = await fetch(`${API_BASE}/health`);
      const json = await res.json();

      if (!res.ok) throw new Error(json?.detail ?? "Backend error");

      setStatusText("✅ Backend พร้อมใช้งาน");
      setResult(json);
    } catch (err: any) {
      setErrorMsg(String(err?.message || err));
      setStatusText("❌ Backend เข้าไม่ถึง");
    } finally {
      setLoading(false);
    }
  };

  const detect = async () => {
    if (!image) {
      setErrorMsg("ยังไม่ได้เลือกรูป");
      return;
    }

    setLoading(true);
    resetState();
    setStatusText("กำลังตรวจจับ... 🔍");

    try {
      // ✅ Resize + แปลงเป็น JPEG
      const converted = await ImageManipulator.manipulateAsync(
        image,
        [{ resize: { width: TARGET_WIDTH } }],
        {
          compress: 0.85,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      const formData = new FormData();
      formData.append("file", {
        uri: converted.uri,
        name: "banana.jpg",
        type: "image/jpeg",
      } as any);

      // [STEP 5.1] ส่ง user_id ถ้า Login อยู่
      // ถ้าไม่ได้ Login ให้ส่ง guest_id เป็น guest เหมือนเดิม
      if (user?.id) {
        formData.append("user_id", user.id);
      } else {
        formData.append("guest_id", "guest");
      }

      const res = await fetch(`${API_BASE}/detect`, {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail ?? "Detect failed");

      setResult(json);

      if (json?.result_url) {
        setAnnotatedUrl(`${API_BASE}${json.result_url}?t=${Date.now()}`);
      }

      const total = json?.count ?? json?.total_detections ?? json?.detections?.length ?? 0;
      const ms = json?.inference_ms ?? 0;
      setStatusText(`✅ ตรวจจับสำเร็จ • พบ ${total} ลูก • ${ms} ms`);
    } catch (err: any) {
      setErrorMsg(String(err?.message || err));
      setStatusText("❌ ตรวจจับไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

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
        paddingBottom: 140, // [STEP 9.5] เพิ่มพื้นที่ล่างกันคีย์บอร์ดบัง
      }}
    >
      <View style={{ gap: 14 }}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
      <View style={{ flexShrink: 1, maxWidth: user ? 130 : 220 }}>
        <Text
          style={{
            // [STEP 4.3] ลดขนาดตัวอักษร เพื่อไม่ให้ชน Member/Logout
            fontSize: user ? 24 : 30,
            fontWeight: "900",
            color: "#111827",
          }}
          numberOfLines={1}
        >
          🍌 BVision
        </Text>

        <Text
          style={{
            color: "#6B7280",
            marginTop: 4,
            // [STEP 4.3] ตอนเป็น Member ลด subtitle ไม่ให้กินพื้นที่
            fontSize: user ? 12 : 14,
            fontWeight: "700",
        }}
        numberOfLines={user ? 2 : 1}
      >
        AI ตรวจความสุกของกล้วย
        </Text>
      </View>

          {/* [STEP 4.2] ขวาบน: ถ้า Login แล้ว แสดง Member + Logout / ถ้ายังไม่ Login แสดง Login + Register */}
        <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
          {authLoading ? (
            <Text style={{ color: "#6B7280", fontWeight: "800" }}>
              Checking...
            </Text>
      ) : user ? (
    <>
      <View
        style={{
           // [STEP 4.3] ลดขนาดกล่อง Member ไม่ให้เบียดชื่อแอป
          maxWidth: 135,
          paddingVertical: 7,
          paddingHorizontal: 10,
          borderRadius: 999,
          backgroundColor: "#ECFDF5",
          borderWidth: 1,
          borderColor: "#22C55E",
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            color: "#166534",
            fontWeight: "900",
            fontSize: 12,
          }}
        >
          Member
        </Text>

        <Text
          numberOfLines={1}
          style={{
            color: "#166534",
            fontWeight: "700",
            fontSize: 10,
          }}
        >
          {user.email}
        </Text>
      </View>

      <Pressable
        // [STEP 4.2] กดแล้วออกจากระบบ
      onPress={handleLogout}
      android_ripple={{ color: "#FFCDD2" }} // [UI EFFECT] Android กดแล้วมี ripple
      style={({ pressed }) => [
        {
          // [STEP 4.3] ลดขนาดปุ่ม Logout ให้ Header สมดุล
          paddingVertical: 8,
          paddingHorizontal: 10,
          borderRadius: 999,
          backgroundColor: "#EF4444",

          // [UI EFFECT] เพิ่มเงาแดงเบา ๆ ให้ปุ่มดูมีมิติ
          shadowColor: "#EF4444",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: 0.22,
          shadowRadius: 5,
          elevation: 3,
        },

        // [UI EFFECT] ตอนกด ปุ่มจะยุบ/จางลงนิด ๆ
        pressed && {
          opacity: 0.8,
          transform: [{ scale: 0.95 }],
        },
      ]}
    >
      <Text
        style={{
          color: "#FFFFFF",
          fontWeight: "900",
          fontSize: 13,
      }}
    >
      Logout
    </Text>
    </Pressable>
    </>
    ) : (
    <>
      <Pressable
        onPress={() => router.push("/login" as any)}
        android_ripple={{ color: "#D6E9FF" }} // [UI EFFECT] Android กดแล้วมี ripple
        style={({ pressed }) => [
          {
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: "#007AFF",
            backgroundColor: "#FFFFFF",

            // [UI EFFECT] เพิ่มเงาให้ปุ่มดูมีมิติ
          shadowColor: "#007AFF",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.12,
          shadowRadius: 4,
          elevation: 2,
          },

          // [UI EFFECT] ตอนกด ปุ่มจะยุบ/จางลงนิด ๆ
          pressed && {
            opacity: 0.75,
            transform: [{ scale: 0.96 }],
          },
        ]}
      >
        <Text
          style={{
            color: "#007AFF",
            fontWeight: "900",
            fontSize: 13,
          }}
        >
          Login
        </Text>
  
      </Pressable>

      <Pressable
        onPress={() => router.push("/register" as any)}
        android_ripple={{ color: "#4DA3FF" }} // [UI EFFECT] Android กดแล้วมี ripple
        style={({ pressed }) => [
          {
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderRadius: 999,
            backgroundColor: "#007AFF",

            // [UI EFFECT] เพิ่มเงาให้ปุ่ม Register ดูนูนขึ้น
            shadowColor: "#007AFF",
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.25,
            shadowRadius: 5,
            elevation: 3,
          },

          // [UI EFFECT] ตอนกด ปุ่มจะยุบ/จางลงนิด ๆ
          pressed && {
            opacity: 0.82,
            transform: [{ scale: 0.96 }],
          },
        ]}
      >
        <Text
          style={{
            color: "#FFFFFF",
            fontWeight: "900",
            fontSize: 13,
        }}
      >
          Register
        </Text>
      </Pressable>
          </>
        )}
        </View>
        </View>

        {/* Guide Card */}

        <View
          style={{
            backgroundColor: "#FFF8E6",
            borderRadius: 18,
            padding: 16,
            borderWidth: 1,
            borderColor: "#FDE68A",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: "#3B2A10",
              fontSize: 18,
              fontWeight: "900",
              textAlign: "center",
              lineHeight: 28,
            }}
          >
            🍌 ถ่ายรูป/เลือกรูป → Detect →{"\n"}ดูผลความสุกของกล้วยรายลูก
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={{ gap: 12, marginTop: 4 }}>
          <Pressable
            onPress={checkBackend}
            style={{
              backgroundColor: "#EAF4FF",
              borderRadius: 18,
              padding: 16,
              borderWidth: 1,
              borderColor: "#BBD7FF",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View>
              <Text style={{ color: "#007AFF", fontSize: 20, fontWeight: "900" }}>
                ☁️ เช็ก Backend
              </Text>
              <Text style={{ color: "#64748B", marginTop: 3, fontWeight: "700" }}>
                ตรวจสอบการเชื่อมต่อกับ Backend
              </Text>
            </View>

            <Text style={{ color: "#007AFF", fontSize: 28, fontWeight: "900" }}>
              ›
            </Text>
          </Pressable>

          <View style={{ flexDirection: "row", gap: 12 }}>
            <Pressable
              onPress={takePhoto}
              style={{
                flex: 1,
                backgroundColor: "#FFFFFF",
                borderRadius: 18,
                paddingVertical: 20,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "#E5E7EB",
              }}
            >
              <Text style={{ color: "#16A34A", fontSize: 20, fontWeight: "900" }}>
                📸 ถ่ายรูป
              </Text>
            </Pressable>

            <Pressable
              onPress={pickImage}
              style={{
                flex: 1,
                backgroundColor: "#FFFFFF",
                borderRadius: 18,
                paddingVertical: 20,
                alignItems: "center",
                borderWidth: 1,
                borderColor: "#E5E7EB",
              }}
            >
              <Text style={{ color: "#4F46E5", fontSize: 20, fontWeight: "900" }}>
                🖼 เลือกรูป
              </Text>
            </Pressable>
          </View>

          <Pressable
            onPress={detect}
            disabled={loading}
            style={{
              backgroundColor: loading ? "#86EFAC" : "#16A34A",
              borderRadius: 20,
              paddingVertical: 20,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 24, fontWeight: "900" }}>
              {loading ? "กำลังทำงาน..." : "Detect 🍌"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => router.push("/video-detect" as any)}
            style={{
              backgroundColor: "#111827",
              borderRadius: 20,
              paddingVertical: 18,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 22, fontWeight: "900" }}>
              📹 ตรวจแบบวิดีโอ
            </Text>
          </Pressable>
        </View>

        <View
  style={{
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  }}
>
  <Text style={{ fontWeight: "800", color: "#374151" }}>
    🏷️ Guide:
  </Text>

  <Text style={{ color: "#15803D", fontWeight: "800" }}>Green=ดิบ</Text>
  <Text style={{ color: "#B45309", fontWeight: "800" }}>• Breaker=ห่าม</Text>
  <Text style={{ color: "#C2410C", fontWeight: "800" }}>• Ripe=สุก</Text>
  <Text style={{ color: "#DC2626", fontWeight: "800" }}>• Overripe=งอม</Text>
</View>

        {!!statusText && (
          <View
            style={{
              padding: 12,
              borderRadius: 12,
              backgroundColor: "#F3F3F3",
            }}
          >
            <Text style={{ fontWeight: "600" }}>{statusText}</Text>
          </View>
        )}

        {!!errorMsg && (
          <View
            style={{
              padding: 12,
              borderRadius: 12,
              backgroundColor: "#FFF0F0",
            }}
          >
            <Text style={{ color: "#B00020", fontWeight: "700" }}>
              เกิดข้อผิดพลาด
            </Text>
            <Text style={{ color: "#B00020", marginTop: 6 }}>{errorMsg}</Text>
          </View>
        )}

        {image && (
          <>
            <Text style={{ fontWeight: "700", fontSize: 16 }}>รูปต้นฉบับ</Text>
            <Image
              source={{ uri: image }}
              style={{
                width: "100%",
                height: 280,
                borderRadius: 12,
                backgroundColor: "#F3F3F3",
              }}
              resizeMode="contain"
            />
          </>
        )}

        {annotatedUrl && (
          <>
            <Text style={{ fontWeight: "700", fontSize: 16 }}>
              ผลลัพธ์รายลูก
            </Text>
            <Image
              source={{ uri: annotatedUrl }}
              style={{
                width: "100%",
                height: 340,
                borderRadius: 12,
                backgroundColor: "#F3F3F3",
              }}
              resizeMode="contain"
            />
          </>
        )}

        {summary && (
          <View
            style={{
              padding: 14,
              borderRadius: 14,
              backgroundColor: "#F6F6F6",
              gap: 6,
            }}
          >
            <Text style={{ fontWeight: "800", fontSize: 18, marginBottom: 4 }}>
              📊 สรุปผล
            </Text>

            <Text>• ตรวจเจอ: {summary.total} ลูก</Text>
            <Text>• ดิบ: {summary.green} ลูก</Text>
            <Text>• ห่าม: {summary.breaker} ลูก</Text>
            <Text>• สุก: {summary.ripe} ลูก</Text>
            <Text>• งอม: {summary.overripe} ลูก</Text>
            <Text>• ระดับโดยรวม: {summary.overall}</Text>
            <Text>• เวลา inference: {summary.ms} ms</Text>
            <Text>
              • ความมั่นใจตรวจจับสูงสุด: {summary.maxDetConf.toFixed(2)}
            </Text>
            <Text>
              • ความมั่นใจความสุกสูงสุด: {summary.maxRipenessConf.toFixed(2)}
            </Text>
          </View>
        )}

        {summary && summary.detections.length > 0 && (
          <View
            style={{
              padding: 14,
              borderRadius: 14,
              backgroundColor: "#FFFFFF",
              borderWidth: 1,
              borderColor: "#E5E5E5",
              gap: 6,
            }}
          >
            <Text style={{ fontWeight: "800", fontSize: 18, marginBottom: 4 }}>
              🍌 รายละเอียดรายลูก
            </Text>

            {summary.detections.map((d: any) => (
              <View
                key={d.index}
                style={{
                  paddingVertical: 6,
                  borderBottomWidth: 1,
                  borderBottomColor: "#EEEEEE",
                }}
              >
                <Text style={{ fontWeight: "700" }}>ลูกที่ {d.index}</Text>
                <Text>
                  ระดับ: {d.ripeness_th ?? d.ripeness ?? "-"} (
                  {d.ripeness ?? "-"})
                </Text>
                <Text>
                  ความมั่นใจความสุก:{" "}
                  {Number(d.ripeness_conf ?? 0).toFixed(2)}
                </Text>
                <Text>
                  ความมั่นใจตรวจจับ:{" "}
                  {Number(d.det_conf ?? d.conf ?? 0).toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        )}

    {/* [STEP 9] กล่องให้คะแนนดาว + Feedback
    จะแสดงเฉพาะหลัง Detect สำเร็จและ Backend คืน scan_id มาแล้ว
    scan_id ใช้ผูก Feedback กับผลตรวจครั้งนั้น */}
    <FeedbackCard

      // [STEP 5.4 FIX] บังคับให้ FeedbackCard สร้างใหม่เมื่อ scan/user เปลี่ยน
      key={`${result?.scan_id ?? "no-scan"}-${user?.id ?? "guest"}`}
      apiBase={API_BASE}
      scanId={result?.scan_id}

      // [STEP 5.4] ส่ง user id ให้ FeedbackCard ถ้า Login อยู่
      userId={user?.id ?? null}

      // [STEP 5.4] ถ้าไม่มี user จะถือเป็น guest
      guestId="guest"
    />

  <Pressable onPress={() => setShowDebug((v) => !v)}>
    <Text
      style={{
        textDecorationLine: "underline",
        color: "#0066CC",
        fontWeight: "700",
      }}
  >
        {showDebug ? "ซ่อนรายละเอียด (Debug)" : "ดูรายละเอียด (Debug)"}
    </Text>
  </Pressable>

        <Pressable onPress={() => setShowDebug((v) => !v)}>
          <Text
            style={{
              textDecorationLine: "underline",
              color: "#0066CC",
              fontWeight: "700",
            }}
          >
            
          </Text>
        </Pressable>

        {showDebug && result && (
          <View
            style={{
              padding: 12,
              borderRadius: 12,
              backgroundColor: "#111",
            }}
          >
            <Text style={{ color: "#fff", fontFamily: "monospace" }}>
              {JSON.stringify(result, null, 2)}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}