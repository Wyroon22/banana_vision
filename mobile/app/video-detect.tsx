import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import { router } from "expo-router";
import { useRef, useState } from "react";
import {
    Image,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

const TARGET_WIDTH = 1280;

// ถ้า IP Hotspot เปลี่ยน ให้แก้ตรงนี้
const API_BASE = "http://172.20.10.2:8000";

export default function VideoDetectScreen() {
    const [permission, requestPermission] = useCameraPermissions();

    const cameraRef = useRef<CameraView | null>(null);

    const [isRunning, setIsRunning] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [isCapturing, setIsCapturing] = useState(false);
    const [isSending, setIsSending] = useState(false);

    const [latestFrameUri, setLatestFrameUri] = useState<string | null>(null);
    const [annotatedUrl, setAnnotatedUrl] = useState<string | null>(null);

    const [captureStatus, setCaptureStatus] = useState("");
    const [backendStatus, setBackendStatus] = useState("");

    const [frameInfo, setFrameInfo] = useState<{
        width?: number;
        height?: number;
        uri?: string;
    } | null>(null);

    const [detectResult, setDetectResult] = useState<any>(null);

    const buildBackendImageUrl = (path: string) => {
        const normalizedPath = path.replace(/\\/g, "/");

    if (normalizedPath.startsWith("http")) {
        return `${normalizedPath}?t=${Date.now()}`;
    }

    return `${API_BASE}${normalizedPath}?t=${Date.now()}`;
    };

    const startDetecting = () => {
        setIsRunning(true);
    };

    const stopDetecting = () => {
        setIsRunning(false);
    };

    const captureFrameOnce = async () => {
        if (!cameraRef.current) {
        setCaptureStatus("❌ ยังไม่พบกล้อง");
        return;
    }

    if (!cameraReady) {
        setCaptureStatus("⏳ กล้องยังไม่พร้อม");
        return;
    }

    try {
        setIsCapturing(true);
        setCaptureStatus("กำลังจับภาพและเตรียมเฟรม...");
        setBackendStatus("");
        setDetectResult(null);
        setAnnotatedUrl(null);

        const photo = await cameraRef.current.takePictureAsync({
            quality: 0.8,
            base64: false,
            skipProcessing: false,
        });

        if (!photo?.uri) {
            setCaptureStatus("❌ ถ่ายเฟรมไม่สำเร็จ");
            return;
        }

        const prepared = await ImageManipulator.manipulateAsync(
            photo.uri,
            [{ resize: { width: TARGET_WIDTH } }],
            {
            compress: 0.85,
            format: ImageManipulator.SaveFormat.JPEG,
            }
        );

        setLatestFrameUri(prepared.uri);
        setFrameInfo({
            width: prepared.width,
            height: prepared.height,
            uri: prepared.uri,
        });

        setCaptureStatus("✅ จับภาพและเตรียมเฟรมสำเร็จ");
    } catch (err: any) {
        setCaptureStatus(`❌ ${String(err?.message || err)}`);
    } finally {
        setIsCapturing(false);
    }
    };

    const sendFrameToBackend = async () => {
    if (!latestFrameUri) {
        setBackendStatus("❌ ยังไม่มีเฟรมที่เตรียมแล้ว");
        return;
    }

    try {
        setIsSending(true);
        setBackendStatus("กำลังส่งเฟรมเข้า Backend /detect...");
        setDetectResult(null);
        setAnnotatedUrl(null);

        const formData = new FormData();

        formData.append("file", {
            uri: latestFrameUri,
            name: `video_frame_${Date.now()}.jpg`,
            type: "image/jpeg",
        } as any);

        const res = await fetch(`${API_BASE}/detect`, {
            method: "POST",
            body: formData,
        });

        const json = await res.json();

        if (!res.ok) {
            throw new Error(json?.detail ?? "Detect failed");
        }

        setDetectResult(json);

        if (json?.result_url) {
            setAnnotatedUrl(buildBackendImageUrl(json.result_url));
        } else {
            setAnnotatedUrl(null);
        }

        const total =
            json?.count ??
            json?.total_detections ??
            json?.detections?.length ??
            0;

        const ms = json?.inference_ms ?? "-";

        setBackendStatus(`✅ ส่งสำเร็จ • ตรวจเจอ ${total} ลูก • ${ms} ms`);
    } catch (err: any) {
        setBackendStatus(
        `❌ ส่ง Backend ไม่สำเร็จ: ${String(err?.message || err)}`
        );
    } finally {
        setIsSending(false);
    }
    };

    if (!permission) {
    return (
        <View
        style={{
            flex: 1,
            backgroundColor: "#fff",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
        }}
        >
        <Text style={{ fontSize: 22, fontWeight: "800" }}>
            กำลังตรวจสอบสิทธิ์กล้อง...
        </Text>
        </View>
    );
    }

    if (!permission.granted) {
    return (
        <View
        style={{
            flex: 1,
            backgroundColor: "#fff",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
            gap: 16,
        }}
        >
        <Text style={{ fontSize: 28, fontWeight: "800", textAlign: "center" }}>
            📷 ต้องอนุญาตใช้กล้องก่อน
        </Text>

        <Text style={{ fontSize: 16, color: "#666", textAlign: "center" }}>
            BananaVision ต้องใช้กล้องเพื่อจับภาพกล้วยแบบต่อเนื่อง
        </Text>

        <TouchableOpacity
            onPress={requestPermission}
            style={{
                backgroundColor: "#22c55e",
                paddingVertical: 14,
                paddingHorizontal: 24,
                borderRadius: 14,
            }}
        >
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800" }}>
                อนุญาตใช้กล้อง
            </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()}>
            <Text style={{ color: "#2563eb", fontSize: 18, fontWeight: "700" }}>
            ← กลับ
            </Text>
        </TouchableOpacity>
        </View>
    );
    }

    const total =
        detectResult?.count ??
        detectResult?.total_detections ??
        detectResult?.detections?.length ??
        "-";

    const green = detectResult?.summary?.green ?? "-";
    const breaker = detectResult?.summary?.breaker ?? "-";
    const ripe = detectResult?.summary?.ripe ?? "-";
    const inferenceMs = detectResult?.inference_ms ?? "-";

    return (
        <ScrollView style={{ flex: 1, backgroundColor: "#fff" }}>
            <View style={{ padding: 16, gap: 18 }}>
        <Text style={{ fontSize: 30, fontWeight: "900", textAlign: "center" }}>
            📹 ตรวจแบบวิดีโอ
        </Text>

        <Text
                style={{
                color: "#666",
                fontSize: 16,
                textAlign: "center",
                lineHeight: 24,
            }}
        >
            โหมดนี้จะใช้กล้องเพื่อจับภาพเป็นเฟรมต่อเนื่อง แล้วส่งให้ AI
            วิเคราะห์แบบใกล้เคียงเรียลไทม์
        </Text>

        <View
            style={{
                height: 440,
                borderRadius: 24,
                overflow: "hidden",
                backgroundColor: "#111827",
                position: "relative",
            }}
        >
            <CameraView
            ref={cameraRef}
            style={{ flex: 1 }}
            facing="back"
            active={true}
            onCameraReady={() => {
                setCameraReady(true);
                setCaptureStatus("✅ กล้องพร้อมใช้งาน");
            }}
            />

            <View
            style={{
                position: "absolute",
                top: 14,
                left: 14,
                backgroundColor: isRunning ? "#dc2626" : "#111827",
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 999,
                opacity: 0.9,
            }}
            >
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>
                {isRunning ? "● กำลังตรวจ" : "หยุดอยู่"}
            </Text>
            </View>
        </View>

        <View
            style={{
                padding: 16,
                borderRadius: 18,
                backgroundColor: isRunning ? "#ECFDF5" : "#F3F4F6",
                gap: 8,
            }}
        >
            <Text style={{ fontSize: 22, fontWeight: "900" }}>สถานะระบบ</Text>

            <Text style={{ fontSize: 18 }}>
                {isRunning ? "กำลังตรวจแบบวิดีโอ..." : "ยังไม่ได้เริ่มตรวจ"}
            </Text>

            <Text style={{ fontSize: 16, color: "#666" }}>
                กล้อง: {cameraReady ? "พร้อม" : "กำลังโหลด..."}
            </Text>

            {!!captureStatus && (
                <Text style={{ fontSize: 16, color: "#555", fontWeight: "700" }}>
                {captureStatus}
                </Text>
            )}

            {!!backendStatus && (
            <Text style={{ fontSize: 16, color: "#555", fontWeight: "700" }}>
                {backendStatus}
            </Text>
            )}

            {frameInfo && (
                <Text style={{ fontSize: 15, color: "#666" }}>
                    เฟรมที่เตรียมแล้ว: {frameInfo.width} x {frameInfo.height}px
                </Text>
            )}

            <Text style={{ fontSize: 15, color: "#666" }}>
                Step 9 ส่งเฟรมเข้า Backend และแสดงภาพผลลัพธ์ตีกรอบ
            </Text>
        </View>

        <TouchableOpacity
            onPress={captureFrameOnce}
            disabled={isCapturing || !cameraReady || isSending}
            style={{
            backgroundColor:
                isCapturing || !cameraReady || isSending ? "#93c5fd" : "#2563eb",
            paddingVertical: 16,
            borderRadius: 16,
            alignItems: "center",
            }}
        >
            <Text style={{ color: "#fff", fontSize: 20, fontWeight: "900" }}>
                {isCapturing
                ? "กำลังเตรียมเฟรม..."
                : "📸 ถ่ายและเตรียมเฟรมทดสอบ"}
            </Text>
        </TouchableOpacity>

        <TouchableOpacity
            onPress={sendFrameToBackend}
            disabled={!latestFrameUri || isSending || isCapturing}
            style={{
            backgroundColor:
                !latestFrameUri || isSending || isCapturing
                ? "#86efac"
                : "#16a34a",
            paddingVertical: 16,
            borderRadius: 16,
            alignItems: "center",
            }}
        >
            <Text style={{ color: "#fff", fontSize: 20, fontWeight: "900" }}>
            {isSending
                ? "กำลังส่งเข้า Backend..."
                : "📡 ส่งเฟรมเข้า Backend /detect"}
            </Text>
        </TouchableOpacity>

        {latestFrameUri && (
            <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 22, fontWeight: "900" }}>
                🖼 เฟรมล่าสุดที่เตรียมแล้ว
            </Text>

            <Image
                source={{ uri: latestFrameUri }}
                style={{
                    width: "100%",
                    height: 320,
                    borderRadius: 18,
                    backgroundColor: "#F3F4F6",
                }}
                resizeMode="contain"
            />
            </View>
        )}

        {annotatedUrl && (
            <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 22, fontWeight: "900" }}>
                ✅ ผลลัพธ์ตีกรอบจาก Backend
            </Text>

            <Image
                source={{ uri: annotatedUrl }}
                style={{
                    width: "100%",
                    height: 360,
                    borderRadius: 18,
                    backgroundColor: "#F3F4F6",
                }}
                resizeMode="contain"
            />
            </View>
        )}

        <View
            style={{
                padding: 18,
                borderRadius: 18,
                backgroundColor: "#F3F4F6",
                gap: 8,
            }}
        >
            <Text style={{ fontSize: 24, fontWeight: "900" }}>
                📊 ผลลัพธ์ล่าสุดจาก Backend
            </Text>

            <Text style={{ fontSize: 18 }}>ตรวจเจอ: {total} ลูก</Text>
            <Text style={{ fontSize: 18 }}>ดิบ: {green} ลูก</Text>
            <Text style={{ fontSize: 18 }}>ห่าม: {breaker} ลูก</Text>
            <Text style={{ fontSize: 18 }}>สุก: {ripe} ลูก</Text>
            <Text style={{ fontSize: 18 }}>เวลา inference: {inferenceMs} ms</Text>
        </View>

        <View style={{ flexDirection: "row", gap: 12 }}>
            <TouchableOpacity
            onPress={startDetecting}
            disabled={isRunning}
            style={{
                flex: 1,
                backgroundColor: isRunning ? "#86efac" : "#22c55e",
                paddingVertical: 16,
                borderRadius: 16,
                alignItems: "center",
            }}
            >
            <Text style={{ color: "#fff", fontSize: 20, fontWeight: "900" }}>
                เริ่มตรวจ
            </Text>
            </TouchableOpacity>

            <TouchableOpacity
            onPress={stopDetecting}
            disabled={!isRunning}
            style={{
                flex: 1,
                backgroundColor: isRunning ? "#ef4444" : "#fecaca",
                paddingVertical: 16,
                borderRadius: 16,
                alignItems: "center",
            }}
            >
            <Text style={{ color: "#fff", fontSize: 20, fontWeight: "900" }}>
                หยุดตรวจ
            </Text>
            </TouchableOpacity>
        </View>

        <TouchableOpacity
            onPress={() => router.back()}
            style={{
                paddingVertical: 14,
                alignItems: "center",
            }}
        >
            <Text style={{ color: "#2563eb", fontSize: 20, fontWeight: "800" }}>
                ← กลับ
            </Text>
            </TouchableOpacity>
        </View>
        </ScrollView>
    );
}