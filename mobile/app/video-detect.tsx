import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
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

// หน่วงหลังประมวลผลเสร็จ ก่อนยิงเฟรมถัดไป
const LOOP_DELAY_MS = 700;

type DetectionBox = {
    index?: number;
    bbox_xyxy?: number[];
    box_xyxy?: number[];
    bbox?: number[];
    xyxy?: number[];
    ripeness?: string;
    ripeness_th?: string;
    ripeness_conf?: number;
    det_conf?: number;
    conf?: number;
};

export default function VideoDetectScreen() {
    const [permission, requestPermission] = useCameraPermissions();

    const cameraRef = useRef<CameraView | null>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isRunningRef = useRef(false);
    const isProcessingRef = useRef(false);

    const [isRunning, setIsRunning] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);

    const [latestFrameUri, setLatestFrameUri] = useState<string | null>(null);
    const [annotatedUrl, setAnnotatedUrl] = useState<string | null>(null);

    const [captureStatus, setCaptureStatus] = useState("");
    const [backendStatus, setBackendStatus] = useState("");

    const [previewSize, setPreviewSize] = useState({
    width: 0,
    height: 0,
    });

    const [frameInfo, setFrameInfo] = useState<{
        width?: number;
        height?: number;
        uri?: string;
    } | null>(null);

    const [detectResult, setDetectResult] = useState<any>(null);
    const [frameCount, setFrameCount] = useState(0);

    useEffect(() => {
        return () => {
        stopDetecting();
    };
    }, []);

    const buildBackendImageUrl = (path: string) => {
        const normalizedPath = path.replace(/\\/g, "/");

    if (normalizedPath.startsWith("http")) {
        return `${normalizedPath}?t=${Date.now()}`;
    }

    return `${API_BASE}${normalizedPath}?t=${Date.now()}`;
    };

    const getDetections = (): DetectionBox[] => {
        if (!Array.isArray(detectResult?.detections)) return [];
    return detectResult.detections;
    };

    const renderLiveOverlayBoxes = () => {
        const detections = getDetections();

    if (!frameInfo?.width || !frameInfo?.height) return null;
    if (!previewSize.width || !previewSize.height) return null;
    if (detections.length === 0) return null;

    const scaleX = previewSize.width / frameInfo.width;
    const scaleY = previewSize.height / frameInfo.height;

    return (
        <View
            pointerEvents="none"
            style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: previewSize.width,
            height: previewSize.height,
        }}
        >
        {detections.map((d, idx) => {
            const box = d.bbox_xyxy ?? d.box_xyxy ?? d.bbox ?? d.xyxy;

            if (!Array.isArray(box) || box.length < 4) {
                return null;
            }

            const [x1, y1, x2, y2] = box.map((v) => Number(v));

          const left = x1 * scaleX;
          const top = y1 * scaleY;
          const width = Math.max((x2 - x1) * scaleX, 1);
          const height = Math.max((y2 - y1) * scaleY, 1);

            const label =
                d.ripeness_th ??
                d.ripeness?.toUpperCase() ??
                "banana";

            const conf = Number(d.ripeness_conf ?? d.det_conf ?? d.conf ?? 0);

            return (
                <View
                key={`${d.index ?? idx}-${idx}`}
                style={{
                position: "absolute",
                left,
                top,
                width,
                height,
                borderWidth: 2,
                borderColor: "#f97316",
                backgroundColor: "transparent",
                }}
            >
                <View
                style={{
                    position: "absolute",
                    top: -24,
                    left: 0,
                    backgroundColor: "#f97316",
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                }}
                >
                <Text
                    style={{
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: "900",
                    }}
                >
                    {d.index ?? idx + 1}. {label} {conf ? conf.toFixed(2) : ""}
                </Text>
                </View>
            </View>
            );
        })}
        </View>
    );
    };

    const detectOneFrame = async () => {
    if (!cameraRef.current) {
        setCaptureStatus("❌ ยังไม่พบกล้อง");
        return;
    }

    if (!cameraReady) {
        setCaptureStatus("⏳ กล้องยังไม่พร้อม");
        return;
    }

    if (isProcessingRef.current) {
        return;
    }

    try {
        isProcessingRef.current = true;
        setIsProcessing(true);

        setCaptureStatus("กำลังจับภาพและเตรียมเฟรม...");
        setBackendStatus("กำลังส่งเฟรมเข้า Backend /detect...");

        const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
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

        const formData = new FormData();

        formData.append("file", {
            uri: prepared.uri,
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

        setFrameCount((prev) => prev + 1);
        setBackendStatus(`✅ ส่งสำเร็จ • ตรวจเจอ ${total} ลูก • ${ms} ms`);
        } catch (err: any) {
        setBackendStatus(
        `❌ ส่ง Backend ไม่สำเร็จ: ${String(err?.message || err)}`
        );
    } finally {
        isProcessingRef.current = false;
        setIsProcessing(false);
    }
    };

    const runDetectLoop = async () => {
        if (!isRunningRef.current) return;

    await detectOneFrame();

    if (!isRunningRef.current) return;

    timerRef.current = setTimeout(() => {
        runDetectLoop();
    }, LOOP_DELAY_MS);
    };

    const startDetecting = () => {
        if (!cameraReady) {
        setCaptureStatus("⏳ กล้องยังไม่พร้อม");
        return;
    }

    if (isRunningRef.current) return;

    setFrameCount(0);
    setDetectResult(null);
    setAnnotatedUrl(null);

    isRunningRef.current = true;
    setIsRunning(true);
    setBackendStatus("เริ่มตรวจแบบวิดีโอ Near Real-time...");

    runDetectLoop();
    };

    const stopDetecting = () => {
        isRunningRef.current = false;
        setIsRunning(false);

    if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
    }

    setBackendStatus("หยุดตรวจแล้ว");
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
            กดเริ่มตรวจ แล้วระบบจะจับภาพจากกล้องเป็นเฟรมต่อเนื่อง ส่งให้ AI
            วิเคราะห์แบบ Near Real-time
        </Text>

        <View
            onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setPreviewSize({ width, height });
            }}
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

            {renderLiveOverlayBoxes()}

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

            {isProcessing && (
            <View
                style={{
                position: "absolute",
                bottom: 14,
                left: 14,
                right: 14,
                backgroundColor: "#00000099",
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 14,
                }}
            >
                <Text
                style={{
                    color: "#fff",
                    fontWeight: "800",
                    textAlign: "center",
                }}
                >
                กำลังวิเคราะห์เฟรมล่าสุด...
                </Text>
            </View>
            )}
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

            <Text style={{ fontSize: 16, color: "#666" }}>
                จำนวนเฟรมที่วิเคราะห์: {frameCount}
            </Text>

            <Text style={{ fontSize: 16, color: "#666" }}>
                กล่องบนกล้องสด: {getDetections().length} กล่อง
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
                เฟรมล่าสุด: {frameInfo.width} x {frameInfo.height}px
                </Text>
            )}

            <Text style={{ fontSize: 15, color: "#666" }}>
                Live Overlay Prototype: วาด bounding box ล่าสุดทับบนกล้องสด
            </Text>
        </View>

        <View style={{ flexDirection: "row", gap: 12 }}>
            <TouchableOpacity
            onPress={startDetecting}
            disabled={isRunning || !cameraReady}
            style={{
                flex: 1,
                backgroundColor: isRunning || !cameraReady ? "#86efac" : "#22c55e",
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

        {annotatedUrl && (
            <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 22, fontWeight: "900" }}>
                ✅ ผลลัพธ์ตีกรอบล่าสุดจาก Backend
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

        {latestFrameUri && (
            <View style={{ gap: 10 }}>
                <Text style={{ fontSize: 22, fontWeight: "900" }}>
                    🖼 เฟรมล่าสุดที่ส่งตรวจ
                </Text>

            <Image
                source={{ uri: latestFrameUri }}
                style={{
                width: "100%",
                height: 300,
                borderRadius: 18,
                backgroundColor: "#F3F4F6",
                }}
                resizeMode="contain"
            />
            </View>
        )}

        <TouchableOpacity
            onPress={() => {
                stopDetecting();
                router.back();
            }}
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