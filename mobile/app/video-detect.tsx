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

export default function VideoDetectScreen() {
    const [permission, requestPermission] = useCameraPermissions();

    const cameraRef = useRef<CameraView | null>(null);

    const [isRunning, setIsRunning] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [isCapturing, setIsCapturing] = useState(false);
    const [latestFrameUri, setLatestFrameUri] = useState<string | null>(null);
    const [captureStatus, setCaptureStatus] = useState("");
    const [frameInfo, setFrameInfo] = useState<{
        width?: number;
        height?: number;
        uri?: string;
    } | null>(null);

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

      // 1) ถ่ายภาพจากกล้อง 1 เฟรม
        const photo = await cameraRef.current.takePictureAsync({
            quality: 0.8,
            base64: false,
            skipProcessing: false,
        });

        if (!photo?.uri) {
            setCaptureStatus("❌ ถ่ายเฟรมไม่สำเร็จ");
            return;
        }

      // 2) Resize + Compress + แปลงเป็น JPEG
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

        {/* กล้องสด */}
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

        {/* Status Card */}
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

            {frameInfo && (
                <Text style={{ fontSize: 15, color: "#666" }}>
                เฟรมที่เตรียมแล้ว: {frameInfo.width} x {frameInfo.height}px
            </Text>
            )}

            <Text style={{ fontSize: 15, color: "#666" }}>
            Step 7 ย่อภาพ + บีบอัด + แปลงเป็น JPEG ยังไม่ส่งเข้า Backend
            </Text>
        </View>

        {/* ปุ่ม Capture + Prepare Frame */}
        <TouchableOpacity
            onPress={captureFrameOnce}
            disabled={isCapturing || !cameraReady}
            style={{
            backgroundColor: isCapturing || !cameraReady ? "#93c5fd" : "#2563eb",
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

        {/* แสดงเฟรมล่าสุดที่เตรียมแล้ว */}
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

        <View
            style={{
                padding: 18,
                borderRadius: 18,
                backgroundColor: "#F3F4F6",
                gap: 8,
            }}
        >
            <Text style={{ fontSize: 24, fontWeight: "900" }}>
                📊 ผลลัพธ์ล่าสุด
            </Text>

            <Text style={{ fontSize: 18 }}>ตรวจเจอ: - ลูก</Text>
            <Text style={{ fontSize: 18 }}>ดิบ: - ลูก</Text>
            <Text style={{ fontSize: 18 }}>ห่าม: - ลูก</Text>
            <Text style={{ fontSize: 18 }}>สุก: - ลูก</Text>
            <Text style={{ fontSize: 18 }}>เวลา inference: - ms</Text>
        </View>

        {/* ปุ่มเริ่ม / หยุด */}
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