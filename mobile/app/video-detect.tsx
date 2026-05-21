import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

export default function VideoDetectScreen() {
    const [permission, requestPermission] = useCameraPermissions();

  // ✅ Step 5: state คุมว่าเริ่มตรวจอยู่ไหม
    const [isRunning, setIsRunning] = useState(false);

    const startDetecting = () => {
        setIsRunning(true);
    };

    const stopDetecting = () => {
        setIsRunning(false);
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

        {/* ✅ กล้องสด */}
        <View
            style={{
            height: 440,
            borderRadius: 24,
            overflow: "hidden",
            backgroundColor: "#111827",
            position: "relative",
            }}
        >
            <CameraView style={{ flex: 1 }} facing="back" active={true} />

          {/* ✅ ป้ายสถานะบนกล้อง */}
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

        {/* ✅ Status Card */}
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
            {isRunning
                ? "กำลังตรวจแบบวิดีโอ..."
                : "ยังไม่ได้เริ่มตรวจ"}
            </Text>
            <Text style={{ fontSize: 15, color: "#666" }}>
                Step 5 ทดสอบเฉพาะปุ่ม Start / Stop ยังไม่ส่งภาพเข้า Backend
            </Text>
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
                📊 ผลลัพธ์ล่าสุด
            </Text>

            <Text style={{ fontSize: 18 }}>ตรวจเจอ: - ลูก</Text>
            <Text style={{ fontSize: 18 }}>ดิบ: - ลูก</Text>
            <Text style={{ fontSize: 18 }}>ห่าม: - ลูก</Text>
            <Text style={{ fontSize: 18 }}>สุก: - ลูก</Text>
            <Text style={{ fontSize: 18 }}>เวลา inference: - ms</Text>
        </View>

        {/* ✅ ปุ่มเริ่ม / หยุด */}
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