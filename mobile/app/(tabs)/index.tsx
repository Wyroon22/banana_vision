import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  TextInput,
  Modal,
  Dimensions,
} from "react-native";
import { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";

// [STEP 4.1] import Supabase client เพื่ออ่าน session/login state
import { supabase } from "../../lib/supabase";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

const API_BASE = "http://172.20.10.2:8000";
const TARGET_WIDTH = 1280; // ✅ resize กันไฟล์ใหญ่เกิน

function ZoomImageModal({
  uri,
  title,
  onClose,
}: {
  uri: string | null;
  title: string;
  onClose: () => void;
}) {
  const { width, height } = Dimensions.get("window");

  return (
    <Modal
      visible={!!uri}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.95)",
          paddingTop: 50,
        }}
      >
        <View
          style={{
            paddingHorizontal: 18,
            paddingBottom: 12,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: "#FFFFFF",
              fontSize: 18,
              fontWeight: "900",
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
                backgroundColor: "#FFFFFF",
                borderRadius: 999,
                paddingVertical: 10,
                paddingHorizontal: 14,
              },
              pressed && {
                opacity: 0.75,
                transform: [{ scale: 0.96 }],
              },
            ]}
          >
            <Text style={{ color: "#111827", fontWeight: "900" }}>ปิด</Text>
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            minHeight: height - 90,
            alignItems: "center",
            justifyContent: "center",
          }}
          maximumZoomScale={4}
          minimumZoomScale={1}
          centerContent
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          {uri && (
            <Image
              source={{ uri }}
              style={{
                width,
                height: height - 120,
              }}
              resizeMode="contain"
            />
          )}
        </ScrollView>

        <Text
          style={{
            color: "#D1D5DB",
            textAlign: "center",
            fontWeight: "700",
            paddingBottom: 18,
          }}
        >
          บีบนิ้วเพื่อซูม / ลากเพื่อดูรายละเอียด 🔍
        </Text>
      </View>
    </Modal>
  );
}

function StarRating({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {[1, 2, 3, 4, 5].map((star) => {
        const active = star <= value;

        return (
          <Pressable
            key={star}
            disabled={disabled}
            onPress={() => onChange(star)}
            style={({ pressed }) => [
              {
                opacity: disabled ? 0.45 : pressed ? 0.65 : 1,
                transform: pressed ? [{ scale: 0.9 }] : [{ scale: 1 }],
              },
            ]}
          >
            <Text
              style={{
                fontSize: 34,
                color: active ? "#F59E0B" : "#D1D5DB",
                fontWeight: "900",
              }}
            >
              {active ? "★" : "☆"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function getRipenessColor(label?: string | null) {
  if (label === "ดิบ" || label === "green") return "#15803D";
  if (label === "ห่าม" || label === "breaker") return "#B45309";
  if (label === "สุก" || label === "ripe") return "#EA580C";
  if (label === "งอม" || label === "overripe") return "#DC2626";

  return "#111827";
}

function formatConfidence(value: any) {
  const n = Number(value ?? 0);

  if (!Number.isFinite(n)) {
    return "-";
  }

  if (n <= 1) {
    return `${Math.round(n * 100)}%`;
  }

  return `${Math.round(n)}%`;
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

type BatchDetectResult = {
  id: string;
  order: number;
  sourceUri: string;
  ok: boolean;
  scanId?: string;
  annotatedUrl?: string | null;
  count?: number;
  inferenceMs?: number;
  summary?: any;
  rawResult?: any;
  error?: string;
};

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
  const [zoomImageUri, setZoomImageUri] = useState<string | null>(null);
  const [zoomImageTitle, setZoomImageTitle] = useState("");

  // [STEP 12.1] เก็บรูปที่เลือกหลายใบจาก Gallery
  // ตอนนี้ Detect จะยังตรวจเฉพาะรูปหลักที่อยู่ใน state image ก่อน
  const [selectedImages, setSelectedImages] = useState<
    { id: string; uri: string }[]
  >([]);

  // [STEP 12.2] ผลลัพธ์ Detect หลายรูป
  const [batchResults, setBatchResults] = useState<BatchDetectResult[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchStatusText, setBatchStatusText] = useState("");

  // [STEP 11] เก็บ feedback รายลูกบนหน้า Home หลัง Detect
  const [scanDetails, setScanDetails] = useState<any[]>([]);
  const [bananaComments, setBananaComments] = useState<Record<string, string>>({});
  const [bananaRatings, setBananaRatings] = useState<Record<string, number>>({});
  const [savingBananaId, setSavingBananaId] = useState<string | null>(null);

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
        setSelectedImages([]);
        setBatchResults([]);
        setBatchLoading(false);
        setBatchStatusText("");
        setScanDetails([]);
        setBananaComments({});
        setBananaRatings({});
        setSavingBananaId(null);

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

    // [STEP 11] เคลียร์ feedback รายลูกเก่า
    setScanDetails([]);
    setBananaComments({});
    setBananaRatings({});
    setSavingBananaId(null);

    // [STEP 12.2] เคลียร์ผล Detect หลายรูปเก่า
    setBatchResults([]);
    setBatchLoading(false);
    setBatchStatusText("");
  };

  // [STEP 5 FIX] เคลียร์ข้อมูล scan ทั้งหมดเมื่อเปลี่ยน user / logout
  // กันรูปหรือผลตรวจของ Member ค้างไปโผล่ตอน Guest
  const clearScanState = () => {
    setImage(null);
    setSelectedImages([]);
    setResult(null);
    setAnnotatedUrl(null);
    setStatusText("");
    setErrorMsg("");
    setShowDebug(false);
    setScanDetails([]);
    setBananaComments({});
    setBananaRatings({});
    setSavingBananaId(null);
    setBatchResults([]);
    setBatchLoading(false);
    setBatchStatusText("");
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
      const uri = shot.assets[0].uri;

      setImage(uri);
      setSelectedImages([
        {
          id: `${Date.now()}-camera`,
          uri,
        },
      ]);
    }
  };

  // 🖼 เลือกรูปหลายรูป
  const pickImage = async () => {
    resetState();

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,

      // [STEP 12.1] ให้เลือกหลายรูปจาก Gallery ได้
      allowsMultipleSelection: true,
      selectionLimit: 10,
    });

    if (!picked.canceled) {
      const images = picked.assets.map((asset, index) => ({
        id: `${Date.now()}-${index}`,
        uri: asset.uri,
      }));

      setSelectedImages(images);

      // [STEP 12.1] ตั้งรูปแรกเป็นรูปหลักก่อน
      // Detect เดิมจะยังตรวจจากรูปหลักนี้
      setImage(images[0]?.uri ?? null);
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

  const loadScanDetailsForFeedback = async (scanIdValue: string) => {
    const { data, error } = await supabase
      .from("scan_details")
      .select("*")
      .eq("scan_id", scanIdValue)
      .order("banana_index", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      console.log("[STEP 11] load scan_details error:", error.message);
      return;
    }

    const rows = Array.isArray(data) ? data : [];

    setScanDetails(rows);

    const nextComments: Record<string, string> = {};
    const nextRatings: Record<string, number> = {};

    rows.forEach((row, index) => {
      const key = String(row.id ?? index);

      nextComments[key] = row.user_comment ?? "";
      nextRatings[key] = Number(row.user_rating ?? 0);
    });

    setBananaComments(nextComments);
    setBananaRatings(nextRatings);
  };

  const handleSaveBananaFeedback = async (row: any, index: number) => {
    const detailId = row.id;
    const bananaNo = Number(row.banana_index ?? index + 1);

    if (!detailId) {
      Alert.alert("บันทึกไม่ได้", "ไม่พบ id ของ scan_details แถวนี้");
      return;
    }

    if (!user?.id) {
      Alert.alert("ต้อง Login ก่อน", "กรุณา Login ก่อนบันทึกคอมเมนต์รายลูก");
      return;
    }

    const key = String(detailId);
    const text = bananaComments[key]?.trim() ?? "";
    const rating = Number(bananaRatings[key] ?? 0);

    try {
      setSavingBananaId(key);

      const now = new Date().toISOString();

      const { data: updatedRow, error } = await supabase
        .from("scan_details")
        .update({
          user_comment: text || null,
          user_rating: rating > 0 ? rating : null,
          comment_updated_at: now,
        })
        .eq("id", detailId)
        .eq("scan_id", row.scan_id)
        .select("id, user_comment, user_rating, comment_updated_at")
        .single();

      if (error) {
        throw error;
      }

      if (!updatedRow) {
        throw new Error("ไม่พบแถวที่ถูกอัปเดตใน scan_details");
      }

      setScanDetails((prev) =>
        prev.map((item) =>
          item.id === detailId
            ? {
                ...item,
                user_comment: updatedRow.user_comment,
                user_rating: updatedRow.user_rating,
                comment_updated_at: updatedRow.comment_updated_at,
              }
            : item
        )
      );

      setBananaComments((prev) => ({
        ...prev,
        [key]: updatedRow.user_comment ?? "",
      }));

      setBananaRatings((prev) => ({
        ...prev,
        [key]: Number(updatedRow.user_rating ?? 0),
      }));

      Alert.alert("บันทึกสำเร็จ", `บันทึกกล้วยลูกที่ ${bananaNo} แล้ว`);
    } catch (err: any) {
      Alert.alert(
        "บันทึกไม่สำเร็จ",
        err?.message || "กรุณาลองใหม่อีกครั้ง"
      );
    } finally {
      setSavingBananaId(null);
    }
  };

  // [STEP 12.2] Detect รูปเดียวสำหรับใช้ใน Batch Detect
  const detectSingleImageForBatch = async (
    uri: string,
    order: number
  ): Promise<BatchDetectResult> => {
    try {
      const converted = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: TARGET_WIDTH } }],
        {
          compress: 0.85,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      const formData = new FormData();

      formData.append("file", {
        uri: converted.uri,
        name: `banana-${order}.jpg`,
        type: "image/jpeg",
      } as any);

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

      if (!res.ok) {
        throw new Error(json?.detail ?? `Detect รูปที่ ${order} ไม่สำเร็จ`);
      }

      const resultUrl = json?.result_url
        ? `${API_BASE}${json.result_url}?t=${Date.now()}-${order}`
        : null;

      return {
        id: `${Date.now()}-${order}`,
        order,
        sourceUri: uri,
        ok: true,
        scanId: json?.scan_id,
        annotatedUrl: resultUrl,
        count:
          json?.count ??
          json?.total_detections ??
          json?.detections?.length ??
          0,
        inferenceMs: json?.inference_ms ?? 0,
        summary: json?.summary ?? null,
        rawResult: json,
      };
    } catch (err: any) {
      return {
        id: `${Date.now()}-${order}-error`,
        order,
        sourceUri: uri,
        ok: false,
        error: err?.message || "Detect ไม่สำเร็จ",
      };
    }
  };

  // [STEP 12.2] Detect รูปที่เลือกทั้งหมดแบบแยก scan_id ทีละรูป
  const detectAllSelectedImages = async () => {
    if (selectedImages.length === 0) {
      Alert.alert("ยังไม่มีรูป", "กรุณาเลือกรูปก่อน");
      return;
    }

    try {
      setBatchLoading(true);
      setBatchResults([]);
      setErrorMsg("");
      setStatusText("");
      setBatchStatusText(`กำลังตรวจรูปทั้งหมด ${selectedImages.length} รูป...`);

      // เคลียร์ผลเดี่ยวเก่า แต่ไม่ล้าง selectedImages
      setResult(null);
      setAnnotatedUrl(null);
      setScanDetails([]);
      setBananaComments({});
      setBananaRatings({});
      setSavingBananaId(null);
      setShowDebug(false);

      for (let i = 0; i < selectedImages.length; i += 1) {
        const item = selectedImages[i];

        setBatchStatusText(
          `กำลังตรวจรูปที่ ${i + 1} จาก ${selectedImages.length}...`
        );

        const batchResult = await detectSingleImageForBatch(item.uri, i + 1);

        setBatchResults((prev) => [...prev, batchResult]);
      }

      setBatchStatusText("✅ ตรวจครบทุกภาพแล้ว");
    } catch (err: any) {
      setErrorMsg(err?.message || "Detect หลายรูปไม่สำเร็จ");
      setBatchStatusText("❌ Detect หลายรูปไม่สำเร็จ");
    } finally {
      setBatchLoading(false);
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

      if (json?.scan_id) {
        await loadScanDetailsForFeedback(json.scan_id);
      }

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
                    <Pressable
                      onPress={() => router.push("/profile" as any)}
                      android_ripple={{ color: "#BBF7D0" }}
                      style={({ pressed }) => [
                        {
                          // [STEP 8.2] เปลี่ยนกล่อง Member เป็นปุ่ม Profile Chip
                          maxWidth: 150,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 7,
                          paddingVertical: 6,
                          paddingHorizontal: 8,
                          borderRadius: 999,
                          backgroundColor: "#ECFDF5",
                          borderWidth: 1,
                          borderColor: "#22C55E",
                        },
                        pressed && {
                          opacity: 0.8,
                          transform: [{ scale: 0.96 }],
                        },
                      ]}
                    >
                      {user?.user_metadata?.avatar_url ? (
                        <Image
                          source={{ uri: user.user_metadata.avatar_url }}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            backgroundColor: "#DCFCE7",
                          }}
                        />
                      ) : (
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 16,
                            backgroundColor: "#16A34A",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text
                            style={{
                              color: "#FFFFFF",
                              fontWeight: "900",
                              fontSize: 14,
                            }}
                          >
                            {(user?.user_metadata?.display_name || "M")
                              .slice(0, 1)
                              .toUpperCase()}
                          </Text>
                        </View>
                      )}

                      <View style={{ flex: 1 }}>
                        <Text
                          numberOfLines={1}
                          style={{
                            color: "#166534",
                            fontWeight: "900",
                            fontSize: 12,
                          }}
                        >
                          {user?.user_metadata?.display_name || "Member"}
                        </Text>

                        <Text
                          numberOfLines={1}
                          style={{
                            color: "#15803D",
                            fontWeight: "700",
                            fontSize: 10,
                          }}
                        >
                          โปรไฟล์
                        </Text>
                      </View>
                    </Pressable>

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
                disabled={loading || batchLoading}
                style={{
                  backgroundColor: loading || batchLoading ? "#86EFAC" : "#16A34A",
                  borderRadius: 20,
                  paddingVertical: 20,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: "#FFFFFF", fontSize: 24, fontWeight: "900" }}>
                  {loading ? "กำลังทำงาน..." : "Detect 🍌"}
                </Text>
              </Pressable>

              {selectedImages.length > 1 && (
                <Pressable
                  onPress={detectAllSelectedImages}
                  disabled={loading || batchLoading}
                  style={({ pressed }) => [
                    {
                      backgroundColor: batchLoading ? "#FDBA74" : "#F97316",
                      borderRadius: 20,
                      paddingVertical: 18,
                      alignItems: "center",
                    },
                    pressed &&
                      !loading &&
                      !batchLoading && {
                        opacity: 0.85,
                        transform: [{ scale: 0.97 }],
                      },
                  ]}
                >
                  <Text style={{ color: "#FFFFFF", fontSize: 21, fontWeight: "900" }}>
                    {batchLoading
                      ? "กำลัง Detect หลายรูป..."
                      : `Detect รูปทั้งหมด (${selectedImages.length}) 🍌`}
                  </Text>
                </Pressable>
              )}

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

              {user && (
                <Pressable
                  onPress={() => router.push("/history" as any)}
                  android_ripple={{ color: "#D1FAE5" }}
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
                  <Text style={{ color: "#166534", fontSize: 22, fontWeight: "900" }}>
                    📜 ประวัติการตรวจ
                  </Text>
                </Pressable>
              )}
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

            {!!batchStatusText && (
              <View
                style={{
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: "#FFF7ED",
                  borderWidth: 1,
                  borderColor: "#FDBA74",
                }}
              >
                <Text style={{ color: "#9A3412", fontWeight: "800" }}>
                  {batchStatusText}
                </Text>
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

            {/* [STEP 12.1] Preview รูปที่เลือกหลายใบ */}
            {selectedImages.length > 0 && (
              <View style={{ gap: 10 }}>
                <Text
                  style={{
                    fontWeight: "900",
                    fontSize: 18,
                    color: "#111827",
                  }}
                >
                  รูปที่เลือกทั้งหมด ({selectedImages.length})
                </Text>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 10 }}
                >
                  {selectedImages.map((item, index) => {
                    const isActive = image === item.uri;

                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => {
                          setImage(item.uri);
                          resetState();
                          setZoomImageUri(item.uri);
                          setZoomImageTitle(`รูปที่ ${index + 1}`);
                        }}
                        style={({ pressed }) => [
                          {
                            width: 110,
                            height: 140,
                            borderRadius: 14,
                            overflow: "hidden",
                            backgroundColor: "#F3F4F6",
                            borderWidth: isActive ? 3 : 1,
                            borderColor: isActive ? "#16A34A" : "#E5E7EB",
                          },
                          pressed && {
                            opacity: 0.85,
                            transform: [{ scale: 0.97 }],
                          },
                        ]}
                      >
                        <Image
                          source={{ uri: item.uri }}
                          style={{
                            width: "100%",
                            height: "100%",
                          }}
                          resizeMode="cover"
                        />

                        <View
                          style={{
                            position: "absolute",
                            left: 6,
                            top: 6,
                            backgroundColor: isActive ? "#16A34A" : "rgba(17,24,39,0.75)",
                            borderRadius: 999,
                            paddingHorizontal: 8,
                            paddingVertical: 4,
                          }}
                        >
                          <Text
                            style={{
                              color: "#FFFFFF",
                              fontWeight: "900",
                              fontSize: 12,
                            }}
                          >
                            {index + 1}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Text
                  style={{
                    color: "#6B7280",
                    fontWeight: "700",
                    textAlign: "center",
                  }}
                >
                  แตะรูปเพื่อเลือกเป็นรูปหลักและซูมดูภาพ 🔍
                </Text>
              </View>
            )}

            {image && (
              <>
                <Text style={{ fontWeight: "700", fontSize: 16 }}>รูปต้นฉบับ</Text>

            <Pressable
                  onPress={() => {
                    setZoomImageUri(image);
                    setZoomImageTitle("รูปต้นฉบับ");
                }}
                style={({ pressed }) => [
                  {
                    borderRadius: 12,
                    overflow: "hidden",
                  },
                  pressed && {
                    opacity: 0.85,
                    transform: [{ scale: 0.99 }],
                  },
              ]}
            >
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
          </Pressable>

          <Text
            style={{
              color: "#6B7280",
              fontWeight: "700",
              textAlign: "center",
              marginTop: -6,
            }}
          >
            แตะรูปเพื่อซูม 🔍
          </Text>
        </>
      )}

      {annotatedUrl && (
        <>
          <Text style={{ fontWeight: "700", fontSize: 16 }}>
            ผลลัพธ์รายลูก
          </Text>

        <Pressable
          onPress={() => {
            setZoomImageUri(annotatedUrl);
            setZoomImageTitle("ผลลัพธ์รายลูก");
          }}
          style={({ pressed }) => [
            {
              borderRadius: 12,
              overflow: "hidden",
            },
            pressed && {
              opacity: 0.85,
              transform: [{ scale: 0.99 }],
            },
          ]}
        >
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
        </Pressable>

        <Text
          style={{
            color: "#6B7280",
            fontWeight: "700",
            textAlign: "center",
            marginTop: -6,
          }}
        >
          แตะรูปเพื่อซูมกรอบ AI 🔍
        </Text>
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

                {summary.detections.map((d: any, index: number) => (
                  <View
                    key={`${d.index ?? index}-${index}`}
                    style={{
                      paddingVertical: 6,
                      borderBottomWidth: 1,
                      borderBottomColor: "#EEEEEE",
                    }}
                  >
                    <Text style={{ fontWeight: "700" }}>ลูกที่ {d.index ?? index + 1}</Text>
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

            {/* [STEP 12.2] ผลลัพธ์ Detect หลายรูป */}
            {batchResults.length > 0 && (
              <View
                style={{
                  backgroundColor: "#FFFFFF",
                  borderRadius: 18,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  gap: 12,
                }}
              >
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: "900",
                    color: "#111827",
                  }}
                >
                  🍌 ผลลัพธ์ Detect หลายรูป
                </Text>

                <Text
                  style={{
                    color: "#6B7280",
                    fontWeight: "700",
                  }}
                >
                  แต่ละรูปถูกบันทึกเป็น scan_id แยกกัน กดดูรายละเอียดเพื่อดูรายลูกของรูปนั้น
                </Text>

                {batchResults.map((item) => {
                  const green = Number(item.summary?.green ?? 0);
                  const breaker = Number(item.summary?.breaker ?? 0);
                  const ripe = Number(item.summary?.ripe ?? 0);
                  const overripe = Number(item.summary?.overripe ?? 0);

                  return (
                    <View
                      key={item.id}
                      style={{
                        backgroundColor: "#F9FAFB",
                        borderRadius: 16,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: item.ok ? "#BBF7D0" : "#FCA5A5",
                        gap: 10,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 18,
                          fontWeight: "900",
                          color: "#111827",
                        }}
                      >
                        รูปที่ {item.order}
                      </Text>

                      {item.ok ? (
                        <>
                          {item.annotatedUrl && (
                            <Pressable
                              onPress={() => {
                                setZoomImageUri(item.annotatedUrl ?? null);
                                setZoomImageTitle(`ผลลัพธ์รูปที่ ${item.order}`);
                              }}
                              style={({ pressed }) => [
                                {
                                  borderRadius: 12,
                                  overflow: "hidden",
                                  backgroundColor: "#F3F4F6",
                                },
                                pressed && {
                                  opacity: 0.85,
                                  transform: [{ scale: 0.99 }],
                                },
                              ]}
                            >
                              <Image
                                source={{ uri: item.annotatedUrl }}
                                style={{
                                  width: "100%",
                                  height: 260,
                                  borderRadius: 12,
                                  backgroundColor: "#F3F4F6",
                                }}
                                resizeMode="contain"
                              />
                            </Pressable>
                          )}

                          <Text style={{ color: "#374151", fontWeight: "800" }}>
                            ตรวจเจอ: {item.count ?? 0} ลูก • {item.inferenceMs ?? 0} ms
                          </Text>

                          <Text style={{ color: "#6B7280", fontWeight: "700" }}>
                            ดิบ {green} • ห่าม {breaker} • สุก {ripe} • งอม {overripe}
                          </Text>

                          <View style={{ flexDirection: "row", gap: 10 }}>
                            <Pressable
                              onPress={() => {
                                setImage(item.sourceUri);
                                setResult(item.rawResult ?? null);
                                setAnnotatedUrl(item.annotatedUrl ?? null);
                                setStatusText(
                                  `เปิดผลลัพธ์รูปที่ ${item.order} • พบ ${item.count ?? 0} ลูก`
                                );

                                if (item.scanId) {
                                  loadScanDetailsForFeedback(item.scanId);
                                }
                              }}
                              style={({ pressed }) => [
                                {
                                  flex: 1,
                                  backgroundColor: "#16A34A",
                                  borderRadius: 12,
                                  paddingVertical: 12,
                                  alignItems: "center",
                                },
                                pressed && {
                                  opacity: 0.85,
                                  transform: [{ scale: 0.97 }],
                                },
                              ]}
                            >
                              <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
                                เปิดเป็นรูปหลัก
                              </Text>
                            </Pressable>

                            {!!item.scanId && (
                              <Pressable
                                onPress={() =>
                                  router.push({
                                    pathname: "/scan-detail",
                                    params: { scanId: item.scanId },
                                  } as any)
                                }
                                style={({ pressed }) => [
                                  {
                                    flex: 1,
                                    backgroundColor: "#111827",
                                    borderRadius: 12,
                                    paddingVertical: 12,
                                    alignItems: "center",
                                  },
                                  pressed && {
                                    opacity: 0.85,
                                    transform: [{ scale: 0.97 }],
                                  },
                                ]}
                              >
                                <Text style={{ color: "#FFFFFF", fontWeight: "900" }}>
                                  ดูรายละเอียด
                                </Text>
                              </Pressable>
                            )}
                          </View>
                        </>
                      ) : (
                        <Text style={{ color: "#B91C1C", fontWeight: "800" }}>
                          ❌ {item.error}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* [STEP 11] ให้คะแนน + คอมเมนต์รายลูกบนหน้า Home หลัง Detect */}
            {scanDetails.length > 0 && (
              <View
                style={{
                  backgroundColor: "#FFFFFF",
                  borderRadius: 18,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  gap: 12,
                }}
              >
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: "900",
                    color: "#111827",
                  }}
                >
                  ⭐ ให้คะแนนและคอมเมนต์รายลูก
                </Text>

                <Text
                  style={{
                    color: "#6B7280",
                    fontWeight: "700",
                  }}
                >
                  เลือกดาวและเขียนคอมเมนต์แยกตามกล้วยแต่ละลูกที่ AI ตรวจเจอ
                </Text>

                {scanDetails.map((row, index) => {
                  const key = String(row.id ?? index);
                  const bananaNo = Number(row.banana_index ?? index + 1);
                  const isSavingThisRow = savingBananaId === key;
                  const confidenceText = formatConfidence(row.confidence);
                  const label = row.ripeness_th ?? row.ripeness_label ?? "-";

                  return (
                    <View
                      key={key}
                      style={{
                        backgroundColor: "#F9FAFB",
                        borderRadius: 16,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: "#E5E7EB",
                        gap: 10,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 18,
                            fontWeight: "900",
                            color: "#111827",
                          }}
                        >
                          กล้วยลูกที่ {bananaNo}
                        </Text>

                        <View
                          style={{
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                            borderRadius: 999,
                            backgroundColor: "#FFFFFF",
                            borderWidth: 1,
                            borderColor: "#E5E7EB",
                          }}
                        >
                          <Text
                            style={{
                              fontWeight: "900",
                              color: getRipenessColor(label),
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
                        ความมั่นใจความสุก: {confidenceText}
                      </Text>

                      <Text
                        style={{
                          color: "#111827",
                          fontWeight: "900",
                          fontSize: 15,
                        }}
                      >
                        ⭐ ให้คะแนนกล้วยลูกนี้
                      </Text>

                      <StarRating
                        value={bananaRatings[key] ?? 0}
                        disabled={isSavingThisRow}
                        onChange={(value) => {
                          setBananaRatings((prev) => ({
                            ...prev,
                            [key]: value,
                          }));
                        }}
                      />

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
                        value={bananaComments[key] ?? ""}
                        onChangeText={(text) => {
                          setBananaComments((prev) => ({
                            ...prev,
                            [key]: text,
                          }));
                        }}
                        placeholder={`เช่น กล้วยลูกที่ ${bananaNo} ควรเป็นสุก ไม่ใช่ห่าม`}
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

                      {!!row.user_rating && (
                        <Text
                          style={{
                            color: "#6B7280",
                            fontWeight: "700",
                            fontSize: 12,
                          }}
                        >
                          คะแนนล่าสุด: {row.user_rating} ดาว
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
                        onPress={() => handleSaveBananaFeedback(row, index)}
                        disabled={isSavingThisRow}
                        style={({ pressed }) => [
                          {
                            backgroundColor: isSavingThisRow ? "#93C5FD" : "#007AFF",
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
                          {isSavingThisRow ? "กำลังบันทึก..." : "บันทึกคอมเมนต์"}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}

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

        <ZoomImageModal
          uri={zoomImageUri}
          title={zoomImageTitle}
          onClose={() => {
            setZoomImageUri(null);
            setZoomImageTitle("");
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}