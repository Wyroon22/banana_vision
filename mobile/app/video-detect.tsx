// app/video-detect.tsx

import { router } from "expo-router";
import React from "react";
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

export default function VideoDetectScreen() {
    return (
        <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>📹 ตรวจแบบวิดีโอ</Text>

        <Text style={styles.subtitle}>
            โหมดนี้จะใช้กล้องเพื่อจับภาพเป็นเฟรมต่อเนื่อง แล้วส่งให้ AI วิเคราะห์แบบใกล้เคียงเรียลไทม์
        </Text>

        <View style={styles.mockCameraBox}>
            <Text style={styles.mockCameraText}>พื้นที่กล้องสด</Text>
            <Text style={styles.mockCameraSubText}>Step 4 จะใส่กล้องจริงตรงนี้</Text>
        </View>

        <View style={styles.card}>
            <Text style={styles.cardTitle}>📊 ผลลัพธ์ล่าสุด</Text>
            <Text style={styles.text}>ตรวจเจอ: - ลูก</Text>
            <Text style={styles.text}>ดิบ: - ลูก</Text>
            <Text style={styles.text}>ห่าม: - ลูก</Text>
            <Text style={styles.text}>สุก: - ลูก</Text>
            <Text style={styles.text}>เวลา inference: - ms</Text>
        </View>

        <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.startButton}>
                <Text style={styles.buttonText}>เริ่มตรวจ</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.stopButton}>
                <Text style={styles.buttonText}>หยุดตรวจ</Text>
            </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>← กลับ</Text>
        </TouchableOpacity>
    </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
    padding: 20,
    backgroundColor: "#ffffff",
    minHeight: "100%",
    },
    title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
    },
    subtitle: {
    fontSize: 16,
    color: "#555",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 24,
    },
    mockCameraBox: {
    height: 420,
    backgroundColor: "#111827",
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
    },
    mockCameraText: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "bold",
    },
    mockCameraSubText: {
    color: "#d1d5db",
    fontSize: 15,
    marginTop: 8,
    },
    card: {
    backgroundColor: "#f3f4f6",
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
    },
    cardTitle: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 12,
    },
    text: {
    fontSize: 18,
    marginBottom: 6,
    },
    buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
    },
    startButton: {
    flex: 1,
    backgroundColor: "#22c55e",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    },
    stopButton: {
    flex: 1,
    backgroundColor: "#ef4444",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    },
    buttonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "bold",
    },
    backButton: {
    paddingVertical: 14,
    alignItems: "center",
    },
    backButtonText: {
    color: "#2563eb",
    fontSize: 18,
        fontWeight: "bold",
    },
});