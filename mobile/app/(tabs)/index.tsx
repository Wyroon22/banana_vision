import { View, Text, Button, Image, Pressable, ScrollView } from "react-native";
import { useMemo, useState } from "react";
import { router } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";


const API_BASE = "http://172.20.10.2:8000";
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

    let overall = "ยังสรุปไม่ได้";
    if (green >= breaker && green >= ripe) overall = "ดิบเป็นส่วนใหญ่";
    if (breaker >= green && breaker >= ripe) overall = "ห่ามเป็นส่วนใหญ่";
    if (ripe >= green && ripe >= breaker) overall = "สุกเป็นส่วนใหญ่";

    return {
      total: result.count ?? result.total_detections ?? dets.length,
      ms: result.inference_ms ?? 0,
      green,
      breaker,
      ripe,
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
    <ScrollView style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ padding: 16, gap: 12 }}>
        <Text style={{ fontSize: 28, fontWeight: "800" }}>🍌 BananaVision</Text>

        <Text style={{ color: "#666" }}>
          ถ่ายรูป/เลือกรูป → Detect → ดูผลความสุกของกล้วยรายลูก
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

        <Button
          title="📹 ตรวจแบบวิดีโอ"
          onPress={() => router.push("/video-detect" as any)}
          />
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
  );
}