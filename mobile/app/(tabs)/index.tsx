import { View, Text, Button, Image, Pressable, ScrollView } from "react-native";
import { useMemo, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

const API_BASE = "http://192.168.1.37:8000";
const TARGET_WIDTH = 1280; // ✅ resize กันไฟล์ใหญ่เกิน

export default function HomeScreen() {
  const [image, setImage] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [annotatedUrl, setAnnotatedUrl] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [showDebug, setShowDebug] = useState(false);

  const summary = useMemo(() => {
    if (!result?.ok) return null;

    const dets = Array.isArray(result.detections) ? result.detections : [];
    const maxConf =
      dets.length > 0 ? Math.max(...dets.map((d: any) => Number(d.conf ?? 0))) : 0;

    return {
      total: dets.length,
      ms: result.inference_ms ?? 0,
      maxConf,
    };
  }, [result]);

  const resetState = () => {
    setErrorMsg("");
    setStatusText("");
    setResult(null);
    setAnnotatedUrl(null);
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

      const total = json?.detections?.length ?? 0;
      const ms = json?.inference_ms ?? 0;
      setStatusText(`✅ ตรวจจับสำเร็จ • พบ ${total} วัตถุ • ${ms} ms`);
    } catch (err: any) {
      setErrorMsg(String(err?.message || err));
      setStatusText("❌ ตรวจจับไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 28, fontWeight: "800" }}>🍌 BananaVision</Text>
        <Text style={{ color: "#666" }}>
          ถ่ายรูป/เลือกรูป → Detect → ดูผลลัพธ์ที่ตีกรอบ
        </Text>

        <View style={{ gap: 10 }}>
          <Button title="เช็ก Backend" onPress={checkBackend} />
          <Button title="📸 ถ่ายรูป" onPress={takePhoto} />
          <Button title="🖼 เลือกรูป" onPress={pickImage} />
          <Button
            title={loading ? "กำลังทำงาน..." : "Detect 🍌"}
            onPress={detect}
            disabled={loading}
          />
        </View>

        {!!statusText && (
          <View style={{ padding: 12, borderRadius: 12, backgroundColor: "#F3F3F3" }}>
            <Text style={{ fontWeight: "600" }}>{statusText}</Text>
          </View>
        )}

        {!!errorMsg && (
          <View style={{ padding: 12, borderRadius: 12, backgroundColor: "#FFF0F0" }}>
            <Text style={{ color: "#B00020", fontWeight: "700" }}>
              เกิดข้อผิดพลาด
            </Text>
            <Text style={{ color: "#B00020", marginTop: 6 }}>{errorMsg}</Text>
          </View>
        )}

        {image && (
          <>
            <Text style={{ fontWeight: "700" }}>รูปต้นฉบับ</Text>
            <Image
              source={{ uri: image }}
              style={{ width: "100%", height: 280, borderRadius: 12 }}
              resizeMode="contain"
            />
          </>
        )}

        {annotatedUrl && (
          <>
            <Text style={{ fontWeight: "700" }}>ผลลัพธ์ (ตีกรอบแล้ว)</Text>
            <Image
              source={{ uri: annotatedUrl }}
              style={{ width: "100%", height: 320, borderRadius: 12 }}
              resizeMode="contain"
            />
          </>
        )}

        {summary && (
          <View style={{ padding: 12, borderRadius: 12, backgroundColor: "#F6F6F6" }}>
            <Text style={{ fontWeight: "800", marginBottom: 8 }}>สรุปผล</Text>
            <Text>• ตรวจเจอ: {summary.total}</Text>
            <Text>• เวลา inference: {summary.ms} ms</Text>
            <Text>• ความมั่นใจสูงสุด: {summary.maxConf.toFixed(2)}</Text>
          </View>
        )}

        <Pressable onPress={() => setShowDebug((v) => !v)}>
          <Text style={{ textDecorationLine: "underline" }}>
            {showDebug ? "ซ่อนรายละเอียด (Debug)" : "ดูรายละเอียด (Debug)"}
          </Text>
        </Pressable>

        {showDebug && result && (
          <View style={{ padding: 12, borderRadius: 12, backgroundColor: "#111" }}>
            <Text style={{ color: "#fff", fontFamily: "monospace" }}>
              {JSON.stringify(result, null, 2)}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}