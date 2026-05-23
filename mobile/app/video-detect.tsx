import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImageManipulator from "expo-image-manipulator";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
    Image,
    SafeAreaView,
    StyleSheet,
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
    isRunningRef.current = false;

    if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
    }
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
        style={[
            styles.overlayLayer,
            {
            width: previewSize.width,
            height: previewSize.height,
            },
        ]}
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

            const label = d.ripeness_th ?? d.ripeness?.toUpperCase() ?? "banana";

            const conf = Number(d.ripeness_conf ?? d.det_conf ?? d.conf ?? 0);

            return (
            <View
                key={`${d.index ?? idx}-${idx}`}
                style={[
                styles.box,
                {
                    left,
                    top,
                    width,
                    height,
                },
                ]}
            >
                <View style={styles.boxLabel}>
                <Text style={styles.boxLabelText}>
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

        setCaptureStatus("กำลังจับภาพ...");
        setBackendStatus("กำลังส่งเข้า Backend...");

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
        setBackendStatus(`✅ ตรวจเจอ ${total} ลูก • ${ms} ms`);
        } catch (err: any) {
            setBackendStatus(`❌ Backend ไม่สำเร็จ: ${String(err?.message || err)}`);
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
    setLatestFrameUri(null);

    isRunningRef.current = true;
    setIsRunning(true);
    setBackendStatus("เริ่มตรวจแบบ Near Real-time...");

    runDetectLoop();
    };

    const stopDetecting = () => {
        isRunningRef.current = false;
        setIsRunning(false);

    if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
    }

    if (cameraReady) {
        setBackendStatus("หยุดตรวจแล้ว");
    }
    };

    if (!permission) {
    return (
        <SafeAreaView style={styles.centerScreen}>
            <Text style={styles.permissionTitle}>กำลังตรวจสอบสิทธิ์กล้อง...</Text>
        </SafeAreaView>
    );
    }

    if (!permission.granted) {
    return (
        <SafeAreaView style={styles.centerScreen}>
        <Text style={styles.permissionTitle}>📷 ต้องอนุญาตใช้กล้องก่อน</Text>

        <Text style={styles.permissionText}>
            BananaVision ต้องใช้กล้องเพื่อจับภาพกล้วยแบบต่อเนื่อง
        </Text>

        <TouchableOpacity style={styles.allowButton} onPress={requestPermission}>
            <Text style={styles.allowButtonText}>อนุญาตใช้กล้อง</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backText}>← กลับ</Text>
        </TouchableOpacity>
        </SafeAreaView>
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
    <SafeAreaView style={styles.screen}>
        <View style={styles.header}>
            <Text style={styles.title}>🎥 ตรวจแบบวิดีโอ</Text>
            <Text style={styles.subtitle}>AI วิเคราะห์แบบ Near Real-time</Text>
        </View>

        <View
            style={styles.cameraPanel}
            onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setPreviewSize({ width, height });
        }}
        >
        <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            active={true}
            onCameraReady={() => {
                setCameraReady(true);
                setCaptureStatus("✅ กล้องพร้อมใช้งาน");
            }}
        />

        {renderLiveOverlayBoxes()}

        <View
            style={[
                styles.liveBadge,
                { backgroundColor: isRunning ? "#ef4444" : "#111827" },
            ]}
        >
            <Text style={styles.liveBadgeText}>
                {isRunning ? "● กำลังตรวจ" : "หยุดอยู่"}
            </Text>
        </View>

        <View style={styles.fpsBadge}>
            <Text style={styles.fpsText}>FPS ~ 0.6-1.5 วิ/เฟรม</Text>
        </View>

        {isProcessing && (
            <View style={styles.processingBox}>
                <Text style={styles.processingText}>กำลังวิเคราะห์เฟรมล่าสุด...</Text>
            </View>
        )}

        <View style={styles.miniPreviewWrap}>
            <View style={styles.miniCard}>
            <Text style={styles.miniTitle}>เฟรมล่าสุด</Text>
            {latestFrameUri ? (
                <Image source={{ uri: latestFrameUri }} style={styles.miniImage} />
            ) : (
                <View style={styles.miniPlaceholder}>
                    <Text style={styles.miniPlaceholderText}>ยังไม่มี</Text>
                </View>
            )}
            </View>

            <View style={styles.miniCard}>
                <Text style={styles.miniTitle}>Backend</Text>
            {annotatedUrl ? (
                <Image source={{ uri: annotatedUrl }} style={styles.miniImage} />
            ) : (
                <View style={styles.miniPlaceholder}>
                    <Text style={styles.miniPlaceholderText}>ยังไม่มี</Text>
                </View>
            )}
            </View>
        </View>
        </View>

        <View style={styles.summaryPanel}>
            <View style={styles.topStatsRow}>
            <View style={styles.statusBlock}>
                <Text style={styles.statusIcon}>📷</Text>
                <View>
                <Text style={styles.statusLabel}>กล้อง</Text>
                <Text style={styles.statusValue}>{cameraReady ? "พร้อม" : "กำลังโหลด"}</Text>
            </View>
            </View>

            <View style={styles.statMini}>
            <Text style={styles.statLabel}>เฟรม</Text>
            <Text style={styles.statNumber}>{frameCount}</Text>
            </View>

            <View style={styles.statMini}>
                <Text style={styles.statLabel}>เวลา</Text>
                <Text style={styles.inferenceNumber}>{inferenceMs} ms</Text>
            </View>
        </View>

        <View style={styles.resultBox}>
            <Text style={styles.resultTitle}>📊 ผลลัพธ์ล่าสุด</Text>

            <View style={styles.resultRow}>
            <View style={styles.resultMain}>
                <Text style={styles.resultLabel}>ทั้งหมด</Text>
                <Text style={styles.totalNumber}>{total}</Text>
                <Text style={styles.unitText}>ลูก</Text>
            </View>

            <View style={styles.ripenessCard}>
                <Text style={styles.greenLabel}>🍃 ดิบ</Text>
                <Text style={styles.greenNumber}>{green}</Text>
                <Text style={styles.unitText}>ลูก</Text>
            </View>

            <View style={styles.ripenessCard}>
                <Text style={styles.breakerLabel}>🍌 ห่าม</Text>
                <Text style={styles.breakerNumber}>{breaker}</Text>
                <Text style={styles.unitText}>ลูก</Text>
            </View>

            <View style={styles.ripenessCard}>
                <Text style={styles.ripeLabel}>🍌 สุก</Text>
                <Text style={styles.ripeNumber}>{ripe}</Text>
                <Text style={styles.unitText}>ลูก</Text>
            </View>
            </View>
        </View>

        <Text style={styles.smallStatus} numberOfLines={1}>
            {backendStatus || captureStatus || "พร้อมเริ่มตรวจ"}
        </Text>
        </View>

        <View style={styles.buttonRow}>
        <TouchableOpacity
            onPress={startDetecting}
            disabled={isRunning || !cameraReady}
            style={[
            styles.startButton,
            { opacity: isRunning || !cameraReady ? 0.55 : 1 },
            ]}
        >
            <Text style={styles.actionButtonText}>▶ เริ่มตรวจ</Text>
        </TouchableOpacity>

        <TouchableOpacity
            onPress={stopDetecting}
            disabled={!isRunning}
            style={[styles.stopButton, { opacity: isRunning ? 1 : 0.45 }]}
        >
            <Text style={styles.actionButtonText}>■ หยุดตรวจ</Text>
        </TouchableOpacity>
        </View>

        <TouchableOpacity
        onPress={() => {
            stopDetecting();
            router.back();
        }}
        style={styles.backButton}
        >
        <Text style={styles.backText}>← กลับ</Text>
        </TouchableOpacity>
    </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: "#f8fafc",
        paddingHorizontal: 12,
        paddingTop: 6,
        paddingBottom: 8,
    },
    centerScreen: {
    flex: 1,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    padding: 22,
    gap: 16,
    },
    permissionTitle: {
    fontSize: 25,
    fontWeight: "900",
    textAlign: "center",
    },
    permissionText: {
    fontSize: 16,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 24,
    },
    allowButton: {
    backgroundColor: "#22c55e",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    },
    allowButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    },
    header: {
    alignItems: "center",
    marginBottom: 8,
    },
    title: {
    fontSize: 29,
    fontWeight: "900",
    color: "#0f172a",
    },
    subtitle: {
    fontSize: 15,
    color: "#64748b",
    fontWeight: "700",
    marginTop: 2,
    },
    cameraPanel: {
    flex: 1,
    minHeight: 330,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: "#111827",
    position: "relative",
    },
    camera: {
    flex: 1,
    },
    overlayLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    },
    box: {
    position: "absolute",
    borderWidth: 2,
    borderColor: "#f97316",
    backgroundColor: "transparent",
    },
    boxLabel: {
    position: "absolute",
    top: -24,
    left: 0,
    backgroundColor: "#f97316",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    },
    boxLabelText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "900",
    },
    liveBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 999,
    },
    liveBadgeText: {
    color: "#fff",
    fontWeight: "900",
    fontSize: 14,
    },
    fpsBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "#00000099",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    },
    fpsText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    },
    processingBox: {
    position: "absolute",
    bottom: 12,
    left: 90,
    right: 90,
    backgroundColor: "#00000099",
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: 14,
    },
    processingText: {
    color: "#fff",
    fontWeight: "800",
    textAlign: "center",
    fontSize: 13,
    },
    miniPreviewWrap: {
    position: "absolute",
    right: 10,
    bottom: 10,
    gap: 8,
    },
    miniCard: {
    width: 112,
    padding: 6,
    borderRadius: 12,
    backgroundColor: "#ffffffee",
    },
    miniTitle: {
    fontSize: 11,
    fontWeight: "900",
    marginBottom: 4,
    color: "#111827",
    },
    miniImage: {
    width: "100%",
    height: 72,
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
    },
    miniPlaceholder: {
    width: "100%",
    height: 72,
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    },
    miniPlaceholderText: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "800",
    },
    summaryPanel: {
    backgroundColor: "#ffffff",
    borderRadius: 22,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    },
    topStatsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    },
    statusBlock: {
    flex: 1.2,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    },
    statusIcon: {
    fontSize: 26,
    },
    statusLabel: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "800",
    },
    statusValue: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
    },
    statMini: {
    flex: 1,
    alignItems: "center",
    borderLeftWidth: 1,
    borderLeftColor: "#e5e7eb",
    },
    statLabel: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "800",
    },
    statNumber: {
    fontSize: 24,
    color: "#111827",
    fontWeight: "900",
    },
    inferenceNumber: {
    fontSize: 18,
    color: "#2563eb",
    fontWeight: "900",
    },
    resultBox: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 10,
    },
    resultTitle: {
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 8,
    color: "#111827",
    },
    resultRow: {
    flexDirection: "row",
    gap: 8,
    },
    resultMain: {
    flex: 1.1,
    justifyContent: "center",
    },
    resultLabel: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "900",
    },
    totalNumber: {
    fontSize: 34,
    color: "#16a34a",
    fontWeight: "900",
    },
    unitText: {
    fontSize: 11,
    color: "#475569",
    fontWeight: "800",
    },
    ripenessCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    },
    greenLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#15803d",
    },
    breakerLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#ca8a04",
    },
    ripeLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#ea580c",
    },
    greenNumber: {
    fontSize: 28,
    fontWeight: "900",
    color: "#16a34a",
    },
    breakerNumber: {
    fontSize: 28,
    fontWeight: "900",
    color: "#eab308",
    },
    ripeNumber: {
    fontSize: 28,
    fontWeight: "900",
    color: "#f97316",
    },
    smallStatus: {
    marginTop: 7,
    color: "#64748b",
    fontSize: 12,
    fontWeight: "800",
    },
    buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
    },
    startButton: {
    flex: 1,
    backgroundColor: "#22c55e",
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: "center",
    },
    stopButton: {
    flex: 1,
    backgroundColor: "#ef4444",
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: "center",
    },
    actionButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
    },
    backButton: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
    },
    backText: {
    color: "#2563eb",
    fontSize: 18,
    fontWeight: "900",
    },
});