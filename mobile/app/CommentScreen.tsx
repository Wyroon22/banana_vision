import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ImageView from "react-native-image-viewing";

import { supabase } from "../lib/supabase";

const API_BASE = "http://172.20.10.2:8000";
const PREVIEW_DETAIL_LIMIT = 4;

type CorrectnessValue = true | false | null;

type FeedbackItem = {
  id: string;
  user_id: string;
  scan_id: string;
  rating: number;
  comment: string | null;
  is_correct: boolean | null;
  created_at: string;
  updated_at?: string | null;
  author_name?: string;
  author_email?: string | null;
  scan_history?: any;
  scan_image_url?: string | null;
};

type ScanDetailItem = {
  id: string;
  scan_id: string;
  banana_index?: number | null;
  index?: number | null;
  detection_index?: number | null;
  banana_number?: number | null;
  ripeness_label?: string | null;
  ripeness?: string | null;
  class_name?: string | null;
  label?: string | null;
  ripeness_th?: string | null;
  label_th?: string | null;
  confidence?: number | null;
  conf?: number | null;
  score?: number | null;
  ripeness_confidence?: number | null;
  ripeness_conf?: number | null;
  user_selected_ripeness?: string | null;
  is_ai_correct?: boolean | null;
  feedback_updated_at?: string | null;
};

function formatDate(value?: string | null): string {
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

function normalizeParam(
  value: string | string[] | undefined
): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function buildImageUrl(path?: string | null): string | null {
  if (!path) return null;

  const clean = String(path).trim().replace(/\\/g, "/");
  if (!clean) return null;

  if (
    clean.startsWith("http://") ||
    clean.startsWith("https://")
  ) {
    return clean;
  }

  return clean.startsWith("/") ? `${API_BASE}${clean}` : clean;
}

function getScanImageUrl(scan: any): string | null {
  if (!scan) return null;

  return buildImageUrl(
    scan.supabase_result_url ||
      scan.result_image_url ||
      scan.annotated_image_url ||
      scan.result_url ||
      scan.result_path ||
      scan.image_url ||
      scan.original_image_url ||
      scan.upload_url ||
      null
  );
}

function getScanTotal(scan: any): number {
  if (!scan) return 0;

  const candidates = [
    scan.total_bananas,
    scan.total_detections,
    scan.count,
    scan.total,
    scan.banana_count,
  ];

  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }

  try {
    const summary =
      typeof scan.summary === "string"
        ? JSON.parse(scan.summary)
        : scan.summary;
    const n = Number(summary?.total ?? 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function normalizeRipenessLabel(value: any): string {
  const raw = String(value ?? "").trim().toLowerCase();

  if (raw === "green" || raw.includes("ดิบ")) return "ดิบ";
  if (raw === "breaker" || raw.includes("ห่าม")) return "ห่าม";

  if (
    raw === "overripe" ||
    raw === "over-ripe" ||
    raw.includes("งอม")
  ) {
    return "งอม";
  }

  if (raw === "ripe" || raw.includes("สุก")) return "สุก";
  return "ไม่ทราบ";
}

function getDetailPrediction(row: ScanDetailItem): string {
  return normalizeRipenessLabel(
    row.ripeness_label ||
      row.ripeness ||
      row.class_name ||
      row.label ||
      row.ripeness_th ||
      row.label_th
  );
}

function getDetailFinalResult(row: ScanDetailItem): string {
  return row.user_selected_ripeness
    ? normalizeRipenessLabel(row.user_selected_ripeness)
    : getDetailPrediction(row);
}

function getDetailPredictionScore(row: ScanDetailItem): number {
  const raw =
    row.confidence ??
    row.conf ??
    row.score ??
    row.ripeness_confidence ??
    row.ripeness_conf ??
    0;

  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;

  return n <= 1 ? n * 100 : n;
}

function getBananaIndex(
  row: ScanDetailItem,
  fallback: number
): number {
  const candidates = [
    row.banana_index,
    row.index,
    row.detection_index,
    row.banana_number,
  ];

  for (const value of candidates) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }

  return fallback;
}

function getRipenessColor(label: string) {
  switch (label) {
    case "ดิบ":
      return { color: "#047857", backgroundColor: "#ECFDF5" };
    case "ห่าม":
      return { color: "#B45309", backgroundColor: "#FFFBEB" };
    case "สุก":
      return { color: "#C2410C", backgroundColor: "#FFF7ED" };
    case "งอม":
      return { color: "#B91C1C", backgroundColor: "#FEF2F2" };
    default:
      return { color: "#475569", backgroundColor: "#F1F5F9" };
  }
}

function getRatingLabel(value: number): string {
  switch (Math.round(value)) {
    case 1:
      return "ไม่พึงพอใจอย่างมาก";
    case 2:
      return "ไม่พึงพอใจ";
    case 3:
      return "พึงพอใจปานกลาง";
    case 4:
      return "พึงพอใจ";
    case 5:
      return "พึงพอใจมาก";
    default:
      return "ยังไม่ได้ให้คะแนน";
  }
}

function CorrectnessButton({
  value,
  label,
  description,
  icon,
  active,
  disabled,
  onPress,
}: {
  value: boolean;
  label: string;
  description: string;
  icon: "checkmark-circle" | "close-circle";
  active: boolean;
  disabled: boolean;
  onPress: (value: boolean) => void;
}) {
  const color = value ? "#16A34A" : "#EF4444";
  const backgroundColor = value ? "#DCFCE7" : "#FEE2E2";

  return (
    <Pressable
      disabled={disabled}
      onPress={() => onPress(value)}
      style={({ pressed }) => [
        styles.correctnessButton,
        {
          borderColor: active ? color : "#E2E8F0",
          backgroundColor: active ? backgroundColor : "#FFFFFF",
          opacity: disabled ? 0.55 : 1,
        },
        pressed && !disabled && styles.pressed,
      ]}
    >
      <View style={styles.rowBetween}>
        <Text
          style={[
            styles.correctnessTitle,
            { color: active ? color : "#0F172A" },
          ]}
        >
          {label}
        </Text>

        <Ionicons
          name={icon}
          size={21}
          color={active ? color : "#94A3B8"}
        />
      </View>

      <Text
        style={[
          styles.correctnessDescription,
          { color: active ? color : "#64748B" },
        ]}
      >
        {description}
      </Text>
    </Pressable>
  );
}

export default function CommentScreen() {
  const params = useLocalSearchParams<{
    scanId?: string | string[];
  }>();

  const scanId = normalizeParam(params.scanId);
  const autoOpenedScanIdRef = useRef<string | null>(null);

  const [user, setUser] = useState<any>(null);
  const [comments, setComments] = useState<FeedbackItem[]>([]);
  const [selectedScan, setSelectedScan] = useState<any>(null);
  const [selectedScanDetails, setSelectedScanDetails] =
    useState<ScanDetailItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formLoading, setFormLoading] = useState(false);

  const [newComment, setNewComment] = useState("");
  const [rating, setRating] = useState(5);
  const [correctness, setCorrectness] =
    useState<CorrectnessValue>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingCommentId, setEditingCommentId] =
    useState<string | null>(null);
  const [editingScanId, setEditingScanId] = useState("");

  const [showAllScanDetails, setShowAllScanDetails] =
    useState(false);

  const [zoomImageUri, setZoomImageUri] =
    useState<string | null>(null);
  const [zoomImageTitle, setZoomImageTitle] = useState("");
  const [zoomImageKey, setZoomImageKey] = useState(0);

  const selectedScanImageUrl = useMemo(
    () => getScanImageUrl(selectedScan),
    [selectedScan]
  );

  const selectedScanTotal = useMemo(() => {
    return (
      getScanTotal(selectedScan) ||
      selectedScanDetails.length
    );
  }, [selectedScan, selectedScanDetails.length]);

  const visibleScanDetails = useMemo(
    () =>
      showAllScanDetails
        ? selectedScanDetails
        : selectedScanDetails.slice(0, PREVIEW_DETAIL_LIMIT),
    [showAllScanDetails, selectedScanDetails]
  );

  const hiddenScanDetailCount = useMemo(
    () =>
      Math.max(
        selectedScanDetails.length -
          visibleScanDetails.length,
        0
      ),
    [
      selectedScanDetails.length,
      visibleScanDetails.length,
    ]
  );

  useEffect(() => {
    setShowAllScanDetails(false);
  }, [selectedScan?.id]);

  const closeZoomImage = useCallback(() => {
    setZoomImageUri(null);
    setZoomImageTitle("");
  }, []);

  const openZoomImage = (
    uri: string | null | undefined,
    title: string
  ) => {
    if (!uri) return;

    setZoomImageUri(null);
    setZoomImageTitle("");

    requestAnimationFrame(() => {
      setZoomImageKey(Date.now());
      setZoomImageUri(uri);
      setZoomImageTitle(title);
    });
  };

  const resetFormValues = useCallback(() => {
    setEditingCommentId(null);
    setEditingScanId("");
    setNewComment("");
    setRating(5);
    setCorrectness(null);
  }, []);

  const closeCommentModal = useCallback(() => {
    Keyboard.dismiss();
    closeZoomImage();
    setModalVisible(false);

    requestAnimationFrame(() => {
      resetFormValues();
      setSelectedScan(null);
      setSelectedScanDetails([]);
      setShowAllScanDetails(false);
      setFormLoading(false);
      setScanLoading(false);
      setDetailLoading(false);
      setSubmitting(false);
    });
  }, [closeZoomImage, resetFormValues]);

  const loadSelectedScan = useCallback(
    async (targetScanId?: string | null) => {
      const finalScanId = targetScanId || scanId;

      if (!finalScanId) {
        setSelectedScan(null);
        return null;
      }

      try {
        setScanLoading(true);

        const { data, error } = await supabase
          .from("scan_history")
          .select("*")
          .eq("id", finalScanId)
          .maybeSingle();

        if (error) throw error;

        setSelectedScan(data ?? null);
        return data ?? null;
      } catch (error: any) {
        console.log("[CommentScreen] load scan error:", error);
        setSelectedScan(null);
        return null;
      } finally {
        setScanLoading(false);
      }
    },
    [scanId]
  );

  const loadSelectedScanDetails = useCallback(
    async (targetScanId?: string | null) => {
      const finalScanId = targetScanId || scanId;

      if (!finalScanId) {
        setSelectedScanDetails([]);
        return [];
      }

      try {
        setDetailLoading(true);

        const { data, error } = await supabase
          .from("scan_details")
          .select("*")
          .eq("scan_id", finalScanId)
          .order("banana_index", { ascending: true });

        if (error) throw error;

        const rows = Array.isArray(data) ? data : [];
        setSelectedScanDetails(rows);
        return rows;
      } catch (error: any) {
        console.log(
          "[CommentScreen] load scan details error:",
          error
        );
        setSelectedScanDetails([]);
        return [];
      } finally {
        setDetailLoading(false);
      }
    },
    [scanId]
  );

  const loadCurrentUser = useCallback(async () => {
    const { data, error } =
      await supabase.auth.getSession();

    if (error) throw error;

    const currentUser = data?.session?.user ?? null;
    setUser(currentUser);
    return currentUser;
  }, []);

  const loadExistingFeedback = useCallback(
    async (
      targetScanId: string,
      targetUserId: string
    ) => {
      if (!targetScanId || !targetUserId) return null;

      try {
        setFormLoading(true);

        const { data, error } = await supabase
          .from("feedback")
          .select("*")
          .eq("scan_id", targetScanId)
          .eq("user_id", targetUserId)
          .maybeSingle();

        if (error) throw error;

        if (data) {
          setEditingCommentId(String(data.id));
          setEditingScanId(
            String(data.scan_id ?? targetScanId)
          );
          setNewComment(data.comment ?? "");
          setRating(Number(data.rating ?? 5));
          setCorrectness(
            typeof data.is_correct === "boolean"
              ? data.is_correct
              : null
          );
        } else {
          resetFormValues();
          setEditingScanId(targetScanId);
        }

        return data ?? null;
      } catch (error: any) {
        console.log(
          "[CommentScreen] load existing feedback error:",
          error
        );
        return null;
      } finally {
        setFormLoading(false);
      }
    },
    [resetFormValues]
  );

  const loadComments = useCallback(async () => {
    try {
      setLoading(true);

      const currentUser = await loadCurrentUser();

      if (!currentUser?.id) {
        setComments([]);
        return;
      }

      const {
        data: feedbackData,
        error: feedbackError,
      } = await supabase
        .from("feedback")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false });

      if (feedbackError) throw feedbackError;

      const feedbackRows = Array.isArray(feedbackData)
        ? feedbackData
        : [];

      if (feedbackRows.length === 0) {
        setComments([]);
        return;
      }

      const scanIds = [
        ...new Set(
          feedbackRows
            .map((item) => item.scan_id)
            .filter(
              (id): id is string => Boolean(id)
            )
        ),
      ];

      let scanRows: any[] = [];

      if (scanIds.length > 0) {
        const { data, error } = await supabase
          .from("scan_history")
          .select("*")
          .in("id", scanIds);

        if (error) throw error;

        scanRows = Array.isArray(data) ? data : [];
      }

      const scanMap = new Map<string, any>();

      scanRows.forEach((scan) => {
        scanMap.set(String(scan.id), scan);
      });

      const userName =
        currentUser?.user_metadata?.display_name ||
        currentUser?.email?.split("@")[0] ||
        "ผู้ใช้งานระบบ";

      const mergedData: FeedbackItem[] =
        feedbackRows.map((item) => {
          const scan = item.scan_id
            ? scanMap.get(String(item.scan_id))
            : null;

          return {
            ...item,
            author_name: userName,
            author_email: currentUser?.email ?? null,
            scan_history: scan ?? null,
            scan_image_url: getScanImageUrl(scan),
          };
        });

      setComments(mergedData);
    } catch (error: any) {
      console.log(
        "[CommentScreen] load comments error:",
        error
      );

      Alert.alert(
        "โหลดข้อมูลไม่สำเร็จ",
        error?.message || "กรุณาลองใหม่อีกครั้ง"
      );
    } finally {
      setLoading(false);
    }
  }, [loadCurrentUser]);

  useFocusEffect(
    useCallback(() => {
      loadComments();

      if (scanId) {
        loadSelectedScan(scanId);
        loadSelectedScanDetails(scanId);
      }
    }, [
      loadComments,
      loadSelectedScan,
      loadSelectedScanDetails,
      scanId,
    ])
  );

  useEffect(() => {
    let active = true;

    const prepareWriteForm = async () => {
      if (!scanId) return;

      if (autoOpenedScanIdRef.current === scanId) {
        return;
      }

      autoOpenedScanIdRef.current = scanId;
      setShowAllScanDetails(false);
      setModalVisible(true);

      try {
        const currentUser = await loadCurrentUser();

        if (!active) return;

        await Promise.all([
          loadSelectedScan(scanId),
          loadSelectedScanDetails(scanId),
        ]);

        if (!active) return;

        if (currentUser?.id) {
          await loadExistingFeedback(
            scanId,
            currentUser.id
          );
        } else {
          setEditingScanId(scanId);
        }
      } catch (error: any) {
        console.log(
          "[CommentScreen] prepare form error:",
          error
        );

        if (active) {
          setModalVisible(false);
          Alert.alert(
            "เปิดแบบฟอร์มไม่สำเร็จ",
            error?.message || "กรุณาลองใหม่อีกครั้ง"
          );
        }
      }
    };

    prepareWriteForm();

    return () => {
      active = false;
    };
  }, [
    scanId,
    loadCurrentUser,
    loadSelectedScan,
    loadSelectedScanDetails,
    loadExistingFeedback,
  ]);

  const toggleCorrectness = (value: boolean) => {
    setCorrectness((previous) =>
      previous === value ? null : value
    );
  };

  const openEditComment = async (
    item: FeedbackItem
  ) => {
    if (!user?.id || item.user_id !== user.id) {
      Alert.alert(
        "ไม่มีสิทธิ์แก้ไข",
        "คุณแก้ไขได้เฉพาะความคิดเห็นของตัวเอง"
      );
      return;
    }

    const targetScanId = String(item.scan_id ?? "");

    if (!targetScanId) {
      Alert.alert(
        "ไม่พบผลสแกน",
        "ความคิดเห็นนี้ไม่ได้เชื่อมกับผลสแกน"
      );
      return;
    }

    Keyboard.dismiss();
    closeZoomImage();
    setShowAllScanDetails(false);

    setEditingCommentId(String(item.id));
    setEditingScanId(targetScanId);
    setNewComment(item.comment ?? "");
    setRating(Number(item.rating ?? 5));
    setCorrectness(
      typeof item.is_correct === "boolean"
        ? item.is_correct
        : null
    );

    setSelectedScan(item.scan_history ?? null);
    setModalVisible(true);

    await Promise.all([
      item.scan_history
        ? Promise.resolve(item.scan_history)
        : loadSelectedScan(targetScanId),
      loadSelectedScanDetails(targetScanId),
    ]);
  };

  const handleSaveComment = async () => {
    const cleanComment = newComment.trim();

    if (!cleanComment) {
      Alert.alert(
        "กรอกข้อความ",
        "กรุณาพิมพ์ความคิดเห็นก่อนส่ง"
      );
      return;
    }

    if (rating < 1 || rating > 5) {
      Alert.alert(
        "คะแนนไม่ถูกต้อง",
        "กรุณาเลือกคะแนนตั้งแต่ 1 ถึง 5 ดาว"
      );
      return;
    }

    if (correctness === null) {
      Alert.alert(
        "กรุณาประเมินผล",
        "เลือกว่าผลวิเคราะห์ภาพนี้ถูกต้องหรือไม่ถูกต้อง"
      );
      return;
    }

    if (!user?.id) {
      Alert.alert(
        "กรุณาเข้าสู่ระบบ",
        "ต้องเข้าสู่ระบบก่อนแสดงความคิดเห็น"
      );
      return;
    }

    const targetScanId = editingScanId || scanId;

    if (!targetScanId) {
      Alert.alert(
        "ไม่พบผลสแกน",
        "กรุณาเปิดหน้านี้จากหน้ารายละเอียดผลสแกน"
      );
      return;
    }

    try {
      setSubmitting(true);

      const payload = {
        user_id: user.id,
        scan_id: targetScanId,
        comment: cleanComment,
        rating,
        is_correct: correctness,
        updated_at: new Date().toISOString(),
      };

      const wasEditing = Boolean(editingCommentId);

      const { data, error } = await supabase
        .from("feedback")
        .upsert(payload, {
          onConflict: "user_id,scan_id",
        })
        .select("*")
        .single();

      if (error) throw error;

      setEditingCommentId(
        data?.id
          ? String(data.id)
          : editingCommentId
      );

      await loadComments();
      closeCommentModal();

      Alert.alert(
        wasEditing
          ? "แก้ไขสำเร็จ"
          : "ส่งความคิดเห็นสำเร็จ",
        wasEditing
          ? "อัปเดตความคิดเห็นของผลสแกนนี้แล้ว"
          : "บันทึกความคิดเห็นและเชื่อมกับผลสแกนเรียบร้อยแล้ว"
      );
    } catch (error: any) {
      console.log(
        "[CommentScreen] save feedback error:",
        error
      );

      const message = String(
        error?.message ||
          "เกิดข้อผิดพลาด กรุณาลองใหม่"
      );

      Alert.alert("บันทึกไม่สำเร็จ", message);
    } finally {
      setSubmitting(false);
    }
  };

  const openScanDetail = (item: FeedbackItem) => {
    if (!item.scan_id) {
      Alert.alert(
        "ไม่พบผลสแกน",
        "ความคิดเห็นนี้ไม่ได้เชื่อมกับผลสแกน"
      );
      return;
    }

    Keyboard.dismiss();

    router.push({
      pathname: "/scan-detail" as any,
      params: { scanId: item.scan_id },
    });
  };

  const openSelectedScanDetail = () => {
    const targetScanId = editingScanId || scanId;

    if (!targetScanId) {
      Alert.alert(
        "ไม่พบผลสแกน",
        "ไม่พบผลสแกนสำหรับเปิดรายละเอียด"
      );
      return;
    }

    Keyboard.dismiss();
    closeZoomImage();
    setModalVisible(false);

    setTimeout(() => {
      router.push({
        pathname: "/scan-detail" as any,
        params: { scanId: targetScanId },
      });
    }, 350);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.headerBack,
            pressed && styles.pressed,
          ]}
        >
          <Ionicons
            name="arrow-back"
            size={22}
            color="#0F172A"
          />
          <Text style={styles.headerTitle}>
            ความคิดเห็นและรีวิว
          </Text>
        </Pressable>

        <Text style={styles.headerCount}>
          {comments.length} รายการ
        </Text>
      </View>

      {loading ? (
        <View style={styles.loadingScreen}>
          <ActivityIndicator
            size="large"
            color="#16A34A"
          />
          <Text style={styles.loadingText}>
            กำลังโหลดความคิดเห็น...
          </Text>
        </View>
      ) : (
        <FlatList
          data={comments}
          keyExtractor={(item, index) =>
            String(item.id ?? index)
          }
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.commentCard}>
              <View style={styles.rowBetween}>
                <View style={styles.authorRow}>
                  <View style={styles.avatar}>
                    <Ionicons
                      name="person"
                      size={18}
                      color="#16A34A"
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      numberOfLines={1}
                      style={styles.authorName}
                    >
                      {item.author_name || "ผู้ใช้งาน"}
                    </Text>
                    <Text style={styles.dateText}>
                      {formatDate(
                        item.updated_at ||
                          item.created_at
                      )}
                    </Text>
                  </View>
                </View>

                <View style={styles.ratingSummary}>
                  <View style={styles.starRowSmall}>
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Ionicons
                        key={star}
                        name={
                          star <=
                          Number(item.rating ?? 0)
                            ? "star"
                            : "star-outline"
                        }
                        size={14}
                        color="#FBBF24"
                      />
                    ))}
                  </View>

                  <Text style={styles.ratingLabelSmall}>
                    {getRatingLabel(
                      Number(item.rating ?? 0)
                    )}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.correctnessBadge,
                  {
                    backgroundColor:
                      item.is_correct === true
                        ? "#DCFCE7"
                        : item.is_correct === false
                          ? "#FEE2E2"
                          : "#F1F5F9",
                  },
                ]}
              >
                <Ionicons
                  name={
                    item.is_correct === true
                      ? "checkmark-circle"
                      : item.is_correct === false
                        ? "close-circle"
                        : "help-circle"
                  }
                  size={15}
                  color={
                    item.is_correct === true
                      ? "#16A34A"
                      : item.is_correct === false
                        ? "#EF4444"
                        : "#64748B"
                  }
                />

                <Text
                  style={[
                    styles.correctnessBadgeText,
                    {
                      color:
                        item.is_correct === true
                          ? "#15803D"
                          : item.is_correct === false
                            ? "#B91C1C"
                            : "#475569",
                    },
                  ]}
                >
                  {item.is_correct === true
                    ? "ผลวิเคราะห์ถูกต้อง"
                    : item.is_correct === false
                      ? "ผลวิเคราะห์ไม่ถูกต้อง"
                      : "ไม่ได้ระบุความถูกต้อง"}
                </Text>
              </View>

              <Text style={styles.commentText}>
                {item.comment ||
                  "ไม่มีข้อความความคิดเห็น"}
              </Text>

              {item.scan_image_url ? (
                <Pressable
                  onPress={() => openScanDetail(item)}
                  style={({ pressed }) => [
                    styles.scanPreviewCard,
                    pressed && styles.pressed,
                  ]}
                >
                  <Image
                    source={{ uri: item.scan_image_url }}
                    style={styles.scanPreviewImage}
                    resizeMode="contain"
                  />

                  <View style={styles.scanPreviewFooter}>
                    <Ionicons
                      name="list-outline"
                      size={16}
                      color="#16A34A"
                    />
                    <Text style={styles.scanPreviewText}>
                      แตะเพื่อดูรายละเอียดรายลูก
                    </Text>
                  </View>
                </Pressable>
              ) : (
                <View style={styles.noImageCard}>
                  <Ionicons
                    name="image-outline"
                    size={22}
                    color="#94A3B8"
                  />
                  <Text style={styles.noImageText}>
                    ไม่พบภาพของผลสแกนนี้
                  </Text>
                </View>
              )}

              {item.user_id === user?.id && (
                <Pressable
                  onPress={() => openEditComment(item)}
                  style={({ pressed }) => [
                    styles.editButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name="create-outline"
                    size={15}
                    color="#2563EB"
                  />
                  <Text style={styles.editButtonText}>
                    แก้ไขความคิดเห็น
                  </Text>
                </Pressable>
              )}
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons
                name="chatbubbles-outline"
                size={42}
                color="#CBD5E1"
              />
              <Text style={styles.emptyTitle}>
                ยังไม่มีความคิดเห็น
              </Text>
              <Text style={styles.emptyDescription}>
                เปิดผลสแกนแล้วกดแสดงความคิดเห็น
                เพื่อสร้างรีวิวรายภาพ
              </Text>
            </View>
          }
        />
      )}

      <Modal
        animationType="slide"
        transparent
        visible={modalVisible}
        onRequestClose={closeCommentModal}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          behavior={
            Platform.OS === "ios" ? "padding" : "height"
          }
          style={styles.modalOverlay}
        >
          <View style={styles.modalSheet}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalContent}
            >
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>
                    {editingCommentId
                      ? "แก้ไขความคิดเห็น"
                      : "แสดงความคิดเห็น"}
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    รีวิวผลวิเคราะห์ทั้งหมดในภาพนี้
                  </Text>
                </View>

                <Pressable
                  onPress={closeCommentModal}
                  hitSlop={10}
                  disabled={submitting}
                  style={({ pressed }) => [
                    styles.closeButton,
                    pressed &&
                      !submitting &&
                      styles.pressed,
                    submitting && { opacity: 0.5 },
                  ]}
                >
                  <Ionicons
                    name="close"
                    size={24}
                    color="#64748B"
                  />
                </Pressable>
              </View>

              {formLoading ? (
                <View style={styles.formLoading}>
                  <ActivityIndicator color="#16A34A" />
                  <Text style={styles.loadingText}>
                    กำลังโหลดความคิดเห็นเดิม...
                  </Text>
                </View>
              ) : (
                <>
                  {scanLoading ? (
                    <View style={styles.scanLoadingCard}>
                      <ActivityIndicator color="#16A34A" />
                      <Text style={styles.loadingText}>
                        กำลังโหลดผลสแกน...
                      </Text>
                    </View>
                  ) : selectedScanImageUrl ? (
                    <View style={styles.selectedScanCard}>
                      <Pressable
                        onPress={() =>
                          openZoomImage(
                            selectedScanImageUrl,
                            "ภาพผลการวิเคราะห์"
                          )
                        }
                        style={({ pressed }) => [
                          { position: "relative" },
                          pressed && styles.pressed,
                        ]}
                      >
                        <Image
                          source={{
                            uri: selectedScanImageUrl,
                          }}
                          style={styles.selectedScanImage}
                          resizeMode="contain"
                        />

                        <View style={styles.zoomBadge}>
                          <Ionicons
                            name="expand-outline"
                            size={16}
                            color="#FFFFFF"
                          />
                          <Text style={styles.zoomBadgeText}>
                            แตะเพื่อซูม
                          </Text>
                        </View>
                      </Pressable>

                      <View style={styles.selectedScanFooter}>
                        <Text style={styles.selectedScanTitle}>
                          ผลสแกนที่กำลังรีวิว
                        </Text>
                        <Text style={styles.selectedScanTotal}>
                          ตรวจพบทั้งหมด{" "}
                          {selectedScanTotal} ลูก
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.scanMissingCard}>
                      <Ionicons
                        name="image-outline"
                        size={28}
                        color="#EF4444"
                      />
                      <Text style={styles.scanMissingText}>
                        ไม่พบรูปของผลสแกนนี้
                      </Text>
                    </View>
                  )}

                  <View style={styles.detailSummaryCard}>
                    <View style={styles.detailSummaryHeader}>
                      <View style={styles.detailSummaryTitleRow}>
                        <Pressable
                          onPress={() =>
                            setShowAllScanDetails(
                              (previous) => !previous
                            )
                          }
                          disabled={
                            selectedScanDetails.length <=
                            PREVIEW_DETAIL_LIMIT
                          }
                          hitSlop={8}
                          style={({ pressed }) => [
                            styles.detailToggleButton,
                            {
                              backgroundColor:
                                showAllScanDetails
                                  ? "#D1FAE5"
                                  : "#ECFDF5",
                              opacity:
                                selectedScanDetails.length <=
                                PREVIEW_DETAIL_LIMIT
                                  ? 0.55
                                  : 1,
                            },
                            pressed &&
                              selectedScanDetails.length >
                                PREVIEW_DETAIL_LIMIT &&
                              styles.pressed,
                          ]}
                        >
                          <Ionicons
                            name="list-outline"
                            size={21}
                            color="#059669"
                          />
                        </Pressable>

                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={styles.detailSummaryTitle}>
                            สรุปรายละเอียดกล้วยรายลูก
                          </Text>

                          {selectedScanDetails.length >
                            PREVIEW_DETAIL_LIMIT && (
                            <Text
                              style={styles.detailSummaryHint}
                            >
                              {showAllScanDetails
                                ? "แตะปุ่มสามขีดอีกครั้งเพื่อย่อ"
                                : "แตะปุ่มสามขีดเพื่อดูทั้งหมด"}
                            </Text>
                          )}
                        </View>
                      </View>

                      <View style={styles.detailCountRow}>
                        <Text style={styles.detailCountText}>
                          {selectedScanDetails.length} ลูก
                        </Text>

                        {selectedScanDetails.length >
                          PREVIEW_DETAIL_LIMIT && (
                          <Ionicons
                            name={
                              showAllScanDetails
                                ? "chevron-up"
                                : "chevron-down"
                            }
                            size={15}
                            color="#64748B"
                          />
                        )}
                      </View>
                    </View>

                    {detailLoading ? (
                      <View style={styles.detailLoading}>
                        <ActivityIndicator
                          size="small"
                          color="#16A34A"
                        />
                        <Text style={styles.detailLoadingText}>
                          กำลังโหลดรายละเอียดรายลูก...
                        </Text>
                      </View>
                    ) : selectedScanDetails.length > 0 ? (
                      <>
                        {visibleScanDetails.map(
                          (detail, index) => {
                            const bananaIndex =
                              getBananaIndex(
                                detail,
                                index + 1
                              );
                            const prediction =
                              getDetailPrediction(detail);
                            const finalResult =
                              getDetailFinalResult(detail);
                            const score =
                              getDetailPredictionScore(
                                detail
                              );
                            const badge =
                              getRipenessColor(finalResult);
                            const wasCorrected = Boolean(
                              detail.user_selected_ripeness
                            );

                            return (
                              <View
                                key={String(
                                  detail.id ?? index
                                )}
                                style={styles.detailCard}
                              >
                                <View style={styles.rowBetween}>
                                  <Text
                                    style={styles.detailBananaTitle}
                                  >
                                    กล้วยลูกที่{" "}
                                    {bananaIndex}
                                  </Text>

                                  <View
                                    style={[
                                      styles.ripenessBadge,
                                      {
                                        backgroundColor:
                                          badge.backgroundColor,
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.ripenessBadgeText,
                                        { color: badge.color },
                                      ]}
                                    >
                                      {finalResult}
                                    </Text>
                                  </View>
                                </View>

                                <Text style={styles.detailMeta}>
                                  AI ทำนาย: {prediction}
                                  {" • "}
                                  คะแนนการทำนาย{" "}
                                  {score.toFixed(0)}%
                                </Text>

                                {detail.is_ai_correct === true && (
                                  <Text style={styles.confirmedText}>
                                    ✓ ผู้ใช้ยืนยันว่าผล AI ถูกต้อง
                                  </Text>
                                )}

                                {wasCorrected && (
                                  <Text style={styles.correctedText}>
                                    แก้ไขจาก {prediction}
                                    {" เป็น "}
                                    {finalResult}
                                  </Text>
                                )}

                                {detail.is_ai_correct === false &&
                                  !wasCorrected && (
                                    <Text style={styles.incorrectText}>
                                      ผู้ใช้ระบุว่าผล AI
                                      ไม่ถูกต้อง
                                    </Text>
                                  )}
                              </View>
                            );
                          }
                        )}

                        {!showAllScanDetails &&
                          hiddenScanDetailCount > 0 && (
                            <Text style={styles.moreDetailsText}>
                              และอีก{" "}
                              {hiddenScanDetailCount} ลูก
                            </Text>
                          )}

                        {showAllScanDetails &&
                          selectedScanDetails.length >
                            PREVIEW_DETAIL_LIMIT && (
                            <Text style={styles.allDetailsText}>
                              แสดงครบทั้งหมด{" "}
                              {selectedScanDetails.length}{" "}
                              ลูกแล้ว
                            </Text>
                          )}
                      </>
                    ) : (
                      <Text style={styles.noDetailsText}>
                        ไม่พบข้อมูลกล้วยรายลูก
                      </Text>
                    )}

                    <Pressable
                      onPress={openSelectedScanDetail}
                      style={({ pressed }) => [
                        styles.openDetailButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Ionicons
                        name="open-outline"
                        size={18}
                        color="#047857"
                      />
                      <Text style={styles.openDetailButtonText}>
                        ดูรายละเอียดกล้วยรายลูกทั้งหมด
                      </Text>
                    </Pressable>
                  </View>

                  <View style={{ gap: 9 }}>
                    <Text style={styles.sectionTitle}>
                      ผลคะแนนการทำนายของ AI
                      โดยรวมถูกต้องหรือไม่?
                    </Text>

                    <Text style={styles.sectionHint}>
                      แตะตัวเลือกเดิมซ้ำเพื่อยกเลิกการเลือก
                    </Text>

                    <View style={styles.correctnessRow}>
                      <CorrectnessButton
                        value={true}
                        label="ถูกต้อง"
                        description="ผลโดยรวมตรงกับสภาพกล้วยในภาพ"
                        icon="checkmark-circle"
                        active={correctness === true}
                        disabled={submitting}
                        onPress={toggleCorrectness}
                      />

                      <CorrectnessButton
                        value={false}
                        label="ไม่ถูกต้อง"
                        description="มีผลบางส่วนหรือทั้งหมดที่คลาดเคลื่อน"
                        icon="close-circle"
                        active={correctness === false}
                        disabled={submitting}
                        onPress={toggleCorrectness}
                      />
                    </View>
                  </View>

                  <View style={{ gap: 9 }}>
                    <Text style={styles.sectionTitle}>
                      คะแนนความพึงพอใจ
                    </Text>

                    <View style={styles.ratingPicker}>
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Pressable
                          key={star}
                          disabled={submitting}
                          onPress={() => setRating(star)}
                          style={({ pressed }) => [
                            pressed && {
                              transform: [{ scale: 0.9 }],
                            },
                          ]}
                        >
                          <Ionicons
                            name={
                              star <= rating
                                ? "star"
                                : "star-outline"
                            }
                            size={31}
                            color="#FBBF24"
                          />
                        </Pressable>
                      ))}
                    </View>

                    <View style={styles.ratingDescription}>
                      <Text style={styles.ratingNumber}>
                        {rating} ดาว
                      </Text>
                      <Text style={styles.ratingLabel}>
                        {getRatingLabel(rating)}
                      </Text>
                    </View>
                  </View>

                  <View style={{ gap: 8 }}>
                    <Text style={styles.sectionTitle}>
                      ความคิดเห็นรายภาพ
                    </Text>

                    <TextInput
                      value={newComment}
                      onChangeText={setNewComment}
                      editable={!submitting}
                      placeholder="พิมพ์ความคิดเห็น ข้อผิดพลาดที่พบ หรือข้อเสนอแนะ..."
                      placeholderTextColor="#94A3B8"
                      multiline
                      maxLength={500}
                      style={styles.commentInput}
                    />

                    <Text style={styles.characterCount}>
                      {newComment.length}/500
                    </Text>
                  </View>

                  <Pressable
                    onPress={handleSaveComment}
                    disabled={submitting}
                    style={({ pressed }) => [
                      styles.saveButton,
                      {
                        backgroundColor: submitting
                          ? "#86EFAC"
                          : "#16A34A",
                      },
                      pressed &&
                        !submitting &&
                        styles.pressed,
                    ]}
                  >
                    {submitting ? (
                      <ActivityIndicator
                        size="small"
                        color="#FFFFFF"
                      />
                    ) : (
                      <Ionicons
                        name="send-outline"
                        size={19}
                        color="#FFFFFF"
                      />
                    )}

                    <Text style={styles.saveButtonText}>
                      {submitting
                        ? "กำลังบันทึก..."
                        : editingCommentId
                          ? "บันทึกการแก้ไข"
                          : "ส่งความคิดเห็น"}
                    </Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ImageView
        key={`comment-viewer-${zoomImageKey}-${
          zoomImageUri ?? "empty"
        }`}
        images={
          zoomImageUri
            ? [{ uri: zoomImageUri }]
            : []
        }
        imageIndex={0}
        visible={!!zoomImageUri}
        onRequestClose={closeZoomImage}
        swipeToCloseEnabled
        doubleTapToZoomEnabled
        HeaderComponent={() => (
          <View style={styles.zoomHeader}>
            <Text
              numberOfLines={1}
              style={styles.zoomHeaderTitle}
            >
              {zoomImageTitle}
            </Text>

            <Pressable
              onPress={closeZoomImage}
              style={({ pressed }) => [
                styles.zoomCloseButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.zoomCloseText}>
                ปิด
              </Text>
            </Pressable>
          </View>
        )}
        FooterComponent={() => (
          <View style={styles.zoomFooter}>
            <Text style={styles.zoomFooterText}>
              บีบนิ้วเพื่อซูม และลากเพื่อดูหมายเลขกล้วยแต่ละลูก 🔍
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  headerBack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0F172A",
  },
  headerCount: {
    color: "#64748B",
    fontWeight: "700",
    fontSize: 12,
  },
  loadingScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 8,
    color: "#64748B",
    fontWeight: "700",
  },
  listContent: {
    padding: 20,
    gap: 14,
    paddingBottom: 40,
  },
  commentCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 12,
  },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  authorRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#DCFCE7",
    justifyContent: "center",
    alignItems: "center",
  },
  authorName: {
    fontWeight: "900",
    color: "#0F172A",
    fontSize: 14,
  },
  dateText: {
    color: "#94A3B8",
    fontSize: 10.5,
    fontWeight: "600",
  },
  ratingSummary: {
    alignItems: "flex-end",
    gap: 3,
  },
  starRowSmall: {
    flexDirection: "row",
    gap: 2,
  },
  ratingLabelSmall: {
    color: "#B45309",
    fontSize: 9.5,
    fontWeight: "700",
  },
  correctnessBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  correctnessBadgeText: {
    fontSize: 11,
    fontWeight: "900",
  },
  commentText: {
    color: "#334155",
    fontSize: 13,
    lineHeight: 20,
    fontWeight: "500",
  },
  scanPreviewCard: {
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#F8FAFC",
  },
  scanPreviewImage: {
    width: "100%",
    height: 210,
    backgroundColor: "#F1F5F9",
  },
  scanPreviewFooter: {
    padding: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  scanPreviewText: {
    color: "#166534",
    fontWeight: "900",
    fontSize: 12,
  },
  noImageCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    gap: 5,
  },
  noImageText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
  },
  editButton: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  editButtonText: {
    color: "#2563EB",
    fontSize: 11,
    fontWeight: "900",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 70,
    gap: 9,
  },
  emptyTitle: {
    color: "#64748B",
    fontWeight: "800",
    fontSize: 14,
  },
  emptyDescription: {
    color: "#94A3B8",
    fontSize: 11,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(15,23,42,0.55)",
  },
  modalSheet: {
    maxHeight: "94%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  modalContent: {
    padding: 24,
    paddingBottom: 38,
    gap: 17,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: "900",
    color: "#0F172A",
  },
  modalSubtitle: {
    marginTop: 3,
    color: "#64748B",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  formLoading: {
    paddingVertical: 30,
    alignItems: "center",
    gap: 9,
  },
  scanLoadingCard: {
    height: 180,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: "#F8FAFC",
  },
  selectedScanCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  selectedScanImage: {
    width: "100%",
    height: 280,
    backgroundColor: "#F1F5F9",
  },
  zoomBadge: {
    position: "absolute",
    right: 12,
    bottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.88)",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  zoomBadgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
  },
  selectedScanFooter: {
    padding: 13,
    gap: 4,
  },
  selectedScanTitle: {
    color: "#0F172A",
    fontSize: 13,
    fontWeight: "900",
  },
  selectedScanTotal: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
  },
  scanMissingCard: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    alignItems: "center",
    gap: 6,
  },
  scanMissingText: {
    color: "#B91C1C",
    fontWeight: "800",
    textAlign: "center",
  },
  detailSummaryCard: {
    padding: 15,
    borderRadius: 18,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 11,
  },
  detailSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  detailSummaryTitleRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  detailToggleButton: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  detailSummaryTitle: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "900",
  },
  detailSummaryHint: {
    color: "#64748B",
    fontSize: 10,
    fontWeight: "600",
  },
  detailCountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  detailCountText: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "800",
  },
  detailLoading: {
    paddingVertical: 18,
    alignItems: "center",
    gap: 7,
  },
  detailLoadingText: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
  },
  detailCard: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 5,
  },
  detailBananaTitle: {
    color: "#0F172A",
    fontSize: 12,
    fontWeight: "900",
  },
  ripenessBadge: {
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 999,
  },
  ripenessBadgeText: {
    fontSize: 11,
    fontWeight: "900",
  },
  detailMeta: {
    color: "#64748B",
    fontSize: 10.5,
    fontWeight: "600",
  },
  confirmedText: {
    color: "#15803D",
    fontSize: 10.5,
    fontWeight: "800",
  },
  correctedText: {
    color: "#C2410C",
    fontSize: 10.5,
    fontWeight: "800",
  },
  incorrectText: {
    color: "#B91C1C",
    fontSize: 10.5,
    fontWeight: "800",
  },
  moreDetailsText: {
    color: "#64748B",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  allDetailsText: {
    color: "#059669",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
  },
  noDetailsText: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    paddingVertical: 12,
  },
  openDetailButton: {
    marginTop: 2,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  openDetailButtonText: {
    color: "#047857",
    fontSize: 12.5,
    fontWeight: "900",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#0F172A",
  },
  sectionHint: {
    color: "#64748B",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
  },
  correctnessRow: {
    flexDirection: "row",
    gap: 10,
  },
  correctnessButton: {
    flex: 1,
    minHeight: 105,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    gap: 7,
  },
  correctnessTitle: {
    fontSize: 15,
    fontWeight: "900",
  },
  correctnessDescription: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
  },
  ratingPicker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 13,
    paddingVertical: 12,
    borderRadius: 17,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  ratingDescription: {
    alignItems: "center",
    gap: 3,
  },
  ratingNumber: {
    textAlign: "center",
    color: "#B45309",
    fontSize: 12,
    fontWeight: "900",
  },
  ratingLabel: {
    textAlign: "center",
    color: "#92400E",
    fontSize: 11,
    fontWeight: "700",
  },
  commentInput: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 17,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 14,
    lineHeight: 20,
    color: "#0F172A",
    minHeight: 125,
    textAlignVertical: "top",
  },
  characterCount: {
    textAlign: "right",
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
  },
  saveButton: {
    borderRadius: 17,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 15,
  },
  zoomHeader: {
    paddingTop: 54,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(15,23,42,0.95)",
  },
  zoomHeaderTitle: {
    flex: 1,
    marginRight: 12,
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  zoomCloseButton: {
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  zoomCloseText: {
    color: "#0F172A",
    fontWeight: "900",
  },
  zoomFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
    backgroundColor: "rgba(15,23,42,0.95)",
  },
  zoomFooterText: {
    color: "#CBD5E1",
    textAlign: "center",
    fontSize: 12,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});