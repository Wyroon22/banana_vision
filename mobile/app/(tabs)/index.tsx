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
} from "react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { router } from "expo-router";
import ImageView from "react-native-image-viewing";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../../lib/supabase";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { HomeDock } from "../../components/HomeDock";

const API_BASE = "http://172.20.10.2:8000";
const TARGET_WIDTH = 1280;

function getModelLabel(
  modelType?: string | null
): string {
  if (modelType === "yolo_segmentation_4cls") {
    return " • Segmentation V1";
  }

  if (modelType === "yolo_detection_4cls") {
    return " • Detection V2";
  }

  return "";
}

function buildImageUrl(
  value?: string | null
): string | null {
  if (!value) {
    return null;
  }

  const path = String(value)
    .trim()
    .replace(/\\/g, "/");

  if (!path) {
    return null;
  }

  if (
    path.startsWith("http://") ||
    path.startsWith("https://")
  ) {
    return path;
  }

  if (path.startsWith("/")) {
    return `${API_BASE}${path}`;
  }

  return `${API_BASE}/${path}`;
}

/**
 * เพิ่ม timestamp ต่อท้าย URL เพื่อไม่ให้มือถือใช้ภาพเก่าจาก Cache
 */
function appendCacheBuster(
  url?: string | null,
  suffix?: string | number
): string | null {
  if (!url) {
    return null;
  }

  const separator = url.includes("?")
    ? "&"
    : "?";

  const suffixText =
    suffix !== undefined
      ? `-${suffix}`
      : "";

  return `${url}${separator}t=${Date.now()}${suffixText}`;
}

function safeJson(value: any) {
  if (!value) {
    return {};
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function pickNumber(
  row: any,
  keys: string[],
  fallback = 0
): number {
  for (const key of keys) {
    const value = row?.[key];

    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      const numberValue = Number(value);

      return Number.isFinite(numberValue)
        ? numberValue
        : fallback;
    }
  }

  return fallback;
}

function formatDate(
  value?: string | null
): string {
  if (!value) {
    return "-";
  }

  try {
    return new Date(value).toLocaleString(
      "th-TH",
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    );
  } catch {
    return value;
  }
}

function getScanId(
  json: any
): string | null {
  const rawScanId = json?.scan_id;

  if (
    rawScanId === undefined ||
    rawScanId === null
  ) {
    return null;
  }

  const scanId = String(rawScanId).trim();

  return scanId || null;
}

function getAnnotatedImageUrl(
  json: any,
  suffix?: string | number
): string | null {
  const rawUrl =
    json?.supabase_result_url ||
    json?.result_url ||
    json?.result_image_url ||
    json?.annotated_image_url ||
    null;

  const fullUrl = buildImageUrl(rawUrl);

  return appendCacheBuster(
    fullUrl,
    suffix
  );
}

function ZoomImageModal({
  uri,
  title,
  imageKey,
  onClose,
}: {
  uri: string | null;
  title: string;
  imageKey: number;
  onClose: () => void;
}) {
  const images = useMemo(() => {
    if (!uri) {
      return [];
    }

    return [{ uri }];
  }, [uri]);

  return (
    <ImageView
      key={`image-viewer-${imageKey}-${uri ?? "empty"}`}
      images={images}
      imageIndex={0}
      visible={!!uri}
      onRequestClose={onClose}
      swipeToCloseEnabled
      doubleTapToZoomEnabled
      HeaderComponent={() => (
        <View
          style={{
            paddingTop: 54,
            paddingHorizontal: 20,
            paddingBottom: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor:
              "rgba(15, 23, 42, 0.95)",
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              color: "#FFFFFF",
              fontSize: 17,
              fontWeight: "700",
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
                paddingVertical: 7,
                paddingHorizontal: 16,
              },
              pressed && {
                opacity: 0.75,
                transform: [
                  {
                    scale: 0.96,
                  },
                ],
              },
            ]}
          >
            <Text
              style={{
                color: "#0F172A",
                fontWeight: "700",
                fontSize: 13,
              }}
            >
              ปิด
            </Text>
          </Pressable>
        </View>
      )}
      FooterComponent={() => (
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 32,
            backgroundColor:
              "rgba(15, 23, 42, 0.95)",
          }}
        >
          <Text
            style={{
              color: "#94A3B8",
              textAlign: "center",
              fontWeight: "500",
              fontSize: 12,
            }}
          >
            บีบนิ้วเพื่อซูม / ลากเพื่อดูรายละเอียด 🔍
          </Text>
        </View>
      )}
    />
  );
}

type BatchDetectResult = {
  id: string;
  order: number;
  sourceUri: string;
  ok: boolean;

  scanId?: string | null;
  annotatedUrl?: string | null;

  count?: number;
  inferenceMs?: number;
  summary?: any;
  rawResult?: any;

  databaseSaved?: boolean;
  error?: string;
};

export default function HomeScreen() {
  const scrollRef =
    useRef<ScrollView>(null);

  const [image, setImage] =
    useState<string | null>(null);

  const [result, setResult] =
    useState<any>(null);

  const [
    latestScanId,
    setLatestScanId,
  ] = useState<string | null>(null);

  const [user, setUser] =
    useState<any>(null);

  const [
    authLoading,
    setAuthLoading,
  ] = useState(true);

  const [
    annotatedUrl,
    setAnnotatedUrl,
  ] = useState<string | null>(null);

  const [
    statusText,
    setStatusText,
  ] = useState("");

  const [loading, setLoading] =
    useState(false);

  const [errorMsg, setErrorMsg] =
    useState("");

  const [showDebug, setShowDebug] =
    useState(false);

  const [
    zoomImageUri,
    setZoomImageUri,
  ] = useState<string | null>(null);

  const [
    zoomImageTitle,
    setZoomImageTitle,
  ] = useState("");

  const [
    zoomImageKey,
    setZoomImageKey,
  ] = useState(0);

  const [activeTab, setActiveTab] =
    useState<
      | "camera"
      | "image"
      | "home"
      | "history"
      | "profile"
    >("home");

  const [
    selectedImages,
    setSelectedImages,
  ] = useState<
    {
      id: string;
      uri: string;
    }[]
  >([]);

  const [
    batchResults,
    setBatchResults,
  ] = useState<BatchDetectResult[]>([]);

  const [
    batchLoading,
    setBatchLoading,
  ] = useState(false);

  const [
    batchStatusText,
    setBatchStatusText,
  ] = useState("");

  const [scanRows, setScanRows] =
    useState<any[]>([]);

  const resetResultState = () => {
    setResult(null);
    setLatestScanId(null);
    setAnnotatedUrl(null);

    setStatusText("");
    setErrorMsg("");
    setShowDebug(false);

    setBatchResults([]);
    setBatchStatusText("");
  };

  const clearScanState = () => {
    setImage(null);
    setSelectedImages([]);

    setResult(null);
    setLatestScanId(null);
    setAnnotatedUrl(null);

    setStatusText("");
    setErrorMsg("");
    setShowDebug(false);

    setBatchResults([]);
    setBatchLoading(false);
    setBatchStatusText("");
  };

  const loadUserHistory =
    useCallback(
      async (userId: string) => {
        try {
          const {
            data,
            error,
          } = await supabase
            .from("scan_history")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", {
              ascending: false,
            });

          if (error) {
            console.log(
              "[history] load error:",
              error.message
            );

            return;
          }

          if (Array.isArray(data)) {
            setScanRows(data);
          }
        } catch (error) {
          console.log(
            "[history] load failed:",
            error
          );
        }
      },
      []
    );

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      try {
        const {
          data,
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.log(
            "[auth] getSession error:",
            error.message
          );
        }

        if (!mounted) {
          return;
        }

        const currentUser =
          data?.session?.user ?? null;

        setUser(currentUser);

        if (currentUser?.id) {
          loadUserHistory(
            currentUser.id
          );
        }

        setAuthLoading(false);
      } catch (error) {
        console.log(
          "[auth] load session failed:",
          error
        );

        if (mounted) {
          setUser(null);
          setAuthLoading(false);
        }
      }
    };

    loadSession();

    const {
      data: authListener,
    } =
      supabase.auth.onAuthStateChange(
        (_event, session) => {
          clearScanState();

          const currentUser =
            session?.user ?? null;

          setUser(currentUser);

          if (currentUser?.id) {
            loadUserHistory(
              currentUser.id
            );
          } else {
            setScanRows([]);
          }

          setAuthLoading(false);
        }
      );

    return () => {
      mounted = false;

      authListener
        ?.subscription
        ?.unsubscribe();
    };
  }, [loadUserHistory]);

  const handleLogout = async () => {
    try {
      const { error } =
        await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      clearScanState();

      setUser(null);
      setScanRows([]);

      router.replace(
        "/login" as any
      );
    } catch (error: any) {
      Alert.alert(
        "Logout ไม่สำเร็จ",
        error?.message ||
          "เกิดข้อผิดพลาดระหว่างออกจากระบบ"
      );
    }
  };

  const stats = useMemo(() => {
    let totalBananas = 0;

    for (const row of scanRows) {
      const summaryJson =
        safeJson(row.summary);

      totalBananas +=
        pickNumber(
          row,
          [
            "total_detections",
            "count",
            "total",
            "total_bananas",
            "banana_count",
          ]
        ) ||
        Number(
          summaryJson.total ?? 0
        );
    }

    return {
      totalScans:
        scanRows.length,

      totalBananas,

      latestScanDate:
        scanRows[0]?.created_at ??
        null,
    };
  }, [scanRows]);

  const summary = useMemo(() => {
    if (!result?.ok) {
      return null;
    }

    const detections =
      Array.isArray(result.detections)
        ? result.detections
        : [];

    const green = Number(
      result.summary?.green ?? 0
    );

    const breaker = Number(
      result.summary?.breaker ?? 0
    );

    const ripe = Number(
      result.summary?.ripe ?? 0
    );

    const overripe = Number(
      result.summary?.overripe ?? 0
    );

    const totalRipeness =
      green +
      breaker +
      ripe +
      overripe;

    let overall =
      "ยังสรุปไม่ได้";

    if (totalRipeness > 0) {
      const maximum = Math.max(
        green,
        breaker,
        ripe,
        overripe
      );

      if (green === maximum) {
        overall =
          "ดิบเป็นส่วนใหญ่";
      }

      if (breaker === maximum) {
        overall =
          "ห่ามเป็นส่วนใหญ่";
      }

      if (ripe === maximum) {
        overall =
          "สุกเป็นส่วนใหญ่";
      }

      if (overripe === maximum) {
        overall =
          "งอมเป็นส่วนใหญ่";
      }
    }

    return {
      total:
        result.count ??
        result.total_detections ??
        detections.length,

      ms:
        result.inference_ms ?? 0,

      green,
      breaker,
      ripe,
      overripe,
      overall,
      detections,
    };
  }, [result]);

  const openZoomImage = (
    uri:
      | string
      | null
      | undefined,
    title: string
  ) => {
    if (!uri) {
      return;
    }

    setZoomImageUri(null);
    setZoomImageTitle("");

    requestAnimationFrame(() => {
      setZoomImageKey(
        Date.now()
      );

      setZoomImageUri(uri);
      setZoomImageTitle(title);
    });
  };

  const takePhoto = async () => {
    setActiveTab("camera");
    resetResultState();

    const permission =
      await ImagePicker
        .requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "ต้องอนุญาตกล้อง",
        "กรุณาอนุญาตให้แอปใช้กล้องก่อน"
      );

      return;
    }

    const shot =
      await ImagePicker
        .launchCameraAsync({
          quality: 1,
        });

    if (!shot.canceled) {
      const uri =
        shot.assets[0].uri;

      setImage(uri);

      setSelectedImages([
        {
          id:
            `${Date.now()}-camera`,
          uri,
        },
      ]);
    }
  };

  const pickImage = async () => {
    setActiveTab("image");
    resetResultState();

    const picked =
      await ImagePicker
        .launchImageLibraryAsync({
          mediaTypes:
            ImagePicker
              .MediaTypeOptions
              .Images,

          quality: 1,

          allowsMultipleSelection:
            true,

          selectionLimit: 10,
        });

    if (!picked.canceled) {
      const now = Date.now();

      const images =
        picked.assets.map(
          (asset, index) => ({
            id:
              `${now}-${index}`,
            uri: asset.uri,
          })
        );

      setSelectedImages(images);

      setImage(
        images[0]?.uri ?? null
      );
    }
  };

  const checkBackend = async () => {
    setLoading(true);
    resetResultState();

    try {
      const response = await fetch(
        `${API_BASE}/health`
      );

      const json =
        await response.json();

      if (!response.ok) {
        throw new Error(
          json?.detail ??
            "Backend error"
        );
      }

      setStatusText(
        "✅ Backend พร้อมใช้งาน"
      );

      setResult(json);
    } catch (error: any) {
      setErrorMsg(
        String(
          error?.message ||
            error
        )
      );

      setStatusText(
        "❌ Backend เข้าไม่ถึง"
      );
    } finally {
      setLoading(false);
    }
  };

  const detectSingleImageForBatch =
    async (
      uri: string,
      order: number
    ): Promise<BatchDetectResult> => {
      try {
        const converted =
          await ImageManipulator
            .manipulateAsync(
              uri,
              [
                {
                  resize: {
                    width:
                      TARGET_WIDTH,
                  },
                },
              ],
              {
                compress: 0.85,

                format:
                  ImageManipulator
                    .SaveFormat
                    .JPEG,
              }
            );

        const formData =
          new FormData();

        formData.append(
          "file",
          {
            uri:
              converted.uri,

            name:
              `banana-${order}.jpg`,

            type:
              "image/jpeg",
          } as any
        );

        if (user?.id) {
          formData.append(
            "user_id",
            String(user.id)
          );
        } else {
          formData.append(
            "guest_id",
            "guest"
          );
        }

        const response = await fetch(
          `${API_BASE}/detect`,
          {
            method: "POST",
            body: formData,
          }
        );

        let json: any = null;

        try {
          json =
            await response.json();
        } catch {
          throw new Error(
            `Backend ตอบกลับไม่ใช่ JSON (${response.status})`
          );
        }

        if (!response.ok) {
          throw new Error(
            json?.detail ??
              `Detect รูปที่ ${order} ไม่สำเร็จ`
          );
        }

        const scanId =
          getScanId(json);

        const resultUrl =
          getAnnotatedImageUrl(
            json,
            order
          );

        const databaseSaved =
          !!scanId &&
          json?.supabase_saved !== false;

        let saveError:
          | string
          | undefined;

        if (!databaseSaved) {
          saveError =
            String(
              json?.supabase_error ||
              json?.supabase_details_error ||
              "วิเคราะห์สำเร็จ แต่ไม่สามารถบันทึกประวัติได้"
            );
        }

        return {
          id:
            `${Date.now()}-${order}`,

          order,

          sourceUri: uri,

          ok: true,

          scanId,

          annotatedUrl:
            resultUrl,

          count:
            Number(
              json?.count ??
                json?.total_detections ??
                json?.detections?.length ??
                0
            ) || 0,

          inferenceMs:
            Number(
              json?.inference_ms ??
                0
            ) || 0,

          summary:
            json?.summary ?? {},

          rawResult: json,

          databaseSaved,

          error: saveError,
        };
      } catch (error: any) {
        return {
          id:
            `${Date.now()}-${order}-error`,

          order,

          sourceUri: uri,

          ok: false,

          scanId: null,

          annotatedUrl: null,

          databaseSaved: false,

          error:
            String(
              error?.message ||
                error ||
                "Detect ไม่สำเร็จ"
            ),
        };
      }
    };

  const detectAllSelectedImages =
    async () => {
      if (
        selectedImages.length === 0
      ) {
        Alert.alert(
          "ยังไม่มีรูป",
          "กรุณาเลือกรูปก่อน"
        );

        return;
      }

      setBatchLoading(true);
      setBatchResults([]);

      setResult(null);
      setLatestScanId(null);
      setAnnotatedUrl(null);

      setErrorMsg("");
      setStatusText("");
      setShowDebug(false);

      setBatchStatusText(
        `กำลังตรวจรูปทั้งหมด ${selectedImages.length} รูป...`
      );

      try {
        const collectedResults:
          BatchDetectResult[] = [];

        for (
          let index = 0;
          index <
          selectedImages.length;
          index += 1
        ) {
          const selected =
            selectedImages[index];

          setBatchStatusText(
            `กำลังตรวจรูปที่ ` +
              `${index + 1} จาก ` +
              `${selectedImages.length}...`
          );

          const batchResult =
            await detectSingleImageForBatch(
              selected.uri,
              index + 1
            );

          collectedResults.push(
            batchResult
          );
        }

        setBatchResults(
          collectedResults
        );

        const successfulResults =
          collectedResults.filter(
            (item) => item.ok
          );

        const failedResults =
          collectedResults.filter(
            (item) => !item.ok
          );

        const savedResults =
          successfulResults.filter(
            (item) =>
              !!item.scanId &&
              item.databaseSaved
          );

        if (
          failedResults.length === 0
        ) {
          setBatchStatusText(
            `✅ ตรวจครบ ${successfulResults.length} ภาพแล้ว` +
              ` • บันทึกประวัติ ${savedResults.length} ภาพ`
          );
        } else {
          setBatchStatusText(
            `⚠️ ตรวจสำเร็จ ${successfulResults.length} ภาพ` +
              ` • ไม่สำเร็จ ${failedResults.length} ภาพ` +
              ` • บันทึกประวัติ ${savedResults.length} ภาพ`
          );
        }

        const firstSuccess =
          successfulResults[0];

        if (
          firstSuccess?.rawResult
        ) {
          setResult(
            firstSuccess.rawResult
          );

          setLatestScanId(
            firstSuccess.scanId ??
              null
          );

          setAnnotatedUrl(
            firstSuccess.annotatedUrl ??
              null
          );
        }

        if (user?.id) {
          await loadUserHistory(
            user.id
          );
        }

        setTimeout(() => {
          scrollRef.current
            ?.scrollToEnd({
              animated: true,
            });
        }, 200);
      } catch (error: any) {
        setErrorMsg(
          String(
            error?.message ||
              error ||
              "Detect หลายรูปไม่สำเร็จ"
          )
        );

        setBatchStatusText(
          "❌ วิเคราะห์หลายรูปไม่สำเร็จ"
        );
      } finally {
        setBatchLoading(false);
      }
    };

  const detect = async () => {
    if (!image) {
      setErrorMsg(
        "ยังไม่ได้เลือกรูป"
      );

      return;
    }

    setLoading(true);
    resetResultState();

    setStatusText(
      "กำลังตรวจจับ... 🔍"
    );

    try {
      const converted =
        await ImageManipulator
          .manipulateAsync(
            image,
            [
              {
                resize: {
                  width:
                    TARGET_WIDTH,
                },
              },
            ],
            {
              compress: 0.85,

              format:
                ImageManipulator
                  .SaveFormat
                  .JPEG,
            }
          );

      const formData =
        new FormData();

      formData.append(
        "file",
        {
          uri: converted.uri,
          name: "banana.jpg",
          type: "image/jpeg",
        } as any
      );

      if (user?.id) {
        formData.append(
          "user_id",
          String(user.id)
        );
      } else {
        formData.append(
          "guest_id",
          "guest"
        );
      }

      const response = await fetch(
        `${API_BASE}/detect`,
        {
          method: "POST",
          body: formData,
        }
      );

      let json: any = null;

      try {
        json =
          await response.json();
      } catch {
        throw new Error(
          `Backend ตอบกลับไม่ใช่ JSON (${response.status})`
        );
      }

      if (!response.ok) {
        throw new Error(
          json?.detail ??
            "Detect failed"
        );
      }

      setResult(json);

      const scanId =
        getScanId(json);

      setLatestScanId(scanId);

      const resultImageUrl =
        getAnnotatedImageUrl(json);

      setAnnotatedUrl(
        resultImageUrl
      );

      const total =
        Number(
          json?.count ??
            json?.total_detections ??
            json?.detections?.length ??
            0
        ) || 0;

      const inferenceMs =
        Number(
          json?.inference_ms ??
            0
        ) || 0;

      const modelLabel =
        getModelLabel(
          json?.model_type
        );

      setStatusText(
        `✅ ตรวจจับสำเร็จ` +
          `${modelLabel}` +
          ` • พบ ${total} ลูก` +
          ` • ${inferenceMs} ms`
      );

      if (
        json?.supabase_saved === false ||
        !scanId
      ) {
        setErrorMsg(
          "วิเคราะห์สำเร็จ แต่บันทึกประวัติไม่สำเร็จ\n" +
            String(
              json?.supabase_error ||
              json?.supabase_details_error ||
              "Backend ไม่ได้ส่ง scan_id กลับมา"
            )
        );
      } else {
        setErrorMsg("");
      }

      if (user?.id) {
        await loadUserHistory(
          user.id
        );
      }
    } catch (error: any) {
      setErrorMsg(
        String(
          error?.message ||
            error
        )
      );

      setStatusText(
        "❌ ตรวจจับไม่สำเร็จ"
      );
    } finally {
      setLoading(false);
    }
  };

  const openBatchScanDetail = (
    batchItem: BatchDetectResult
  ) => {
    if (!batchItem.scanId) {
      Alert.alert(
        "ยังเปิดรายละเอียดไม่ได้",
        batchItem.error ||
          "Backend ไม่ได้ส่ง scan_id กลับมา"
      );

      return;
    }

    router.push({
      pathname:
        "/scan-detail" as any,

      params: {
        scanId:
          batchItem.scanId,

        openReview:
          "true",
      },
    });
  };

  if (authLoading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor:
            "#F8FAFC",
          justifyContent:
            "center",
          alignItems:
            "center",
        }}
      >
        <Text
          style={{
            color: "#64748B",
            fontWeight: "600",
            fontSize: 15,
          }}
        >
          กำลังโหลดข้อมูล...
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor:
          "#F8FAFC",
      }}
    >
      <KeyboardAvoidingView
        style={{
          flex: 1,
        }}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : "height"
        }
        keyboardVerticalOffset={90}
      >
        <ScrollView
          ref={scrollRef}
          style={{
            flex: 1,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 130,
            gap: 16,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent:
                "space-between",
              backgroundColor:
                "#FFFFFF",
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderRadius: 24,
              borderWidth: 1,
              borderColor:
                "#E2E8F0",
              shadowColor:
                "#0F172A",
              shadowOffset: {
                width: 0,
                height: 6,
              },
              shadowOpacity: 0.08,
              shadowRadius: 12,
              elevation: 3,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                flex: 1,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor:
                    "#DCFCE7",
                  alignItems: "center",
                  justifyContent:
                    "center",
                }}
              >
                <Ionicons
                  name="scan-circle"
                  size={26}
                  color="#16A34A"
                />
              </View>

              <View
                style={{
                  flex: 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: "800",
                    color: "#0F172A",
                  }}
                >
                  Banana Vision
                </Text>

                <Text
                  style={{
                    color: "#16A34A",
                    fontSize: 10,
                    fontWeight: "700",
                    marginTop: 1,
                  }}
                >
                  AI ตรวจความสุก • พร้อมใช้งาน
                </Text>
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                gap: 6,
                alignItems: "center",
              }}
            >
              <Pressable
                onPress={() => {
                  setActiveTab(
                    "profile"
                  );

                  router.push(
                    "/profile" as any
                  );
                }}
                style={({ pressed }) => [
                  {
                    flexDirection:
                      "row",
                    alignItems:
                      "center",
                    gap: 6,
                    paddingVertical:
                      5,
                    paddingHorizontal:
                      10,
                    borderRadius:
                      999,
                    backgroundColor:
                      "#F8FAFC",
                    borderWidth: 1,
                    borderColor:
                      "#E2E8F0",
                  },
                  pressed && {
                    opacity: 0.8,
                  },
                ]}
              >
                {user
                  ?.user_metadata
                  ?.avatar_url ? (
                  <Image
                    source={{
                      uri:
                        user
                          .user_metadata
                          .avatar_url,
                    }}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                    }}
                  />
                ) : (
                  <Ionicons
                    name="person-circle"
                    size={20}
                    color="#475569"
                  />
                )}

                <Text
                  numberOfLines={1}
                  style={{
                    color: "#334155",
                    fontWeight: "700",
                    fontSize: 11,
                    maxWidth: 78,
                  }}
                >
                  {user
                    ?.user_metadata
                    ?.display_name ||
                    user?.email
                      ?.split("@")[0] ||
                    "ผู้ใช้งาน"}
                </Text>
              </Pressable>

              <Pressable
                onPress={handleLogout}
                style={({ pressed }) => [
                  {
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    alignItems: "center",
                    justifyContent:
                      "center",
                    backgroundColor:
                      "#FEF2F2",
                    borderWidth: 1,
                    borderColor:
                      "#FECACA",
                  },
                  pressed && {
                    opacity: 0.8,
                  },
                ]}
              >
                <Ionicons
                  name="log-out-outline"
                  size={15}
                  color="#EF4444"
                />
              </Pressable>
            </View>
          </View>

          {/* Banner */}
          <View
            style={{
              backgroundColor:
                "#F0FDF4",
              borderRadius: 24,
              padding: 16,
              borderWidth: 1,
              borderColor:
                "#DCFCE7",
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
            }}
          >
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 15,
                backgroundColor:
                  "#DCFCE7",
                alignItems: "center",
                justifyContent:
                  "center",
              }}
            >
              <Text
                style={{
                  fontSize: 23,
                }}
              >
                🍌
              </Text>
            </View>

            <View
              style={{
                flex: 1,
              }}
            >
              <Text
                style={{
                  color: "#14532D",
                  fontSize: 14,
                  fontWeight: "800",
                }}
              >
                เริ่มต้นตรวจสอบกล้วย
              </Text>

              <Text
                style={{
                  color: "#166534",
                  fontSize: 11.5,
                  fontWeight: "500",
                  lineHeight: 17,
                  marginTop: 3,
                }}
              >
                ถ่ายภาพหรือเลือกรูปภาพเพื่อประเมินความสุกแบบรายลูกด้วยระบบ AI
              </Text>
            </View>
          </View>

          {/* สถิติ */}
          <View
            style={{
              backgroundColor:
                "#FFFFFF",
              borderRadius: 24,
              padding: 16,
              borderWidth: 1,
              borderColor:
                "#E2E8F0",
              gap: 12,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent:
                  "space-between",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: "#0F172A",
                  fontWeight: "800",
                  fontSize: 14,
                }}
              >
                สถิติการตรวจ
              </Text>

              <Text
                style={{
                  color: "#64748B",
                  fontSize: 10.5,
                  fontWeight: "600",
                }}
              >
                อัปเดตล่าสุด:{" "}
                {formatDate(
                  stats.latestScanDate
                )}
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                gap: 8,
              }}
            >
              <View
                style={{
                  flex: 1,
                  backgroundColor:
                    "#F0FDF4",
                  padding: 12,
                  borderRadius: 16,
                }}
              >
                <Text
                  style={{
                    color: "#15803D",
                    fontSize: 10,
                    fontWeight: "700",
                  }}
                >
                  จำนวนครั้งที่ตรวจ
                </Text>

                <Text
                  style={{
                    color: "#14532D",
                    fontWeight: "900",
                    fontSize: 18,
                    marginTop: 4,
                  }}
                >
                  {stats.totalScans}
                </Text>
              </View>

              <View
                style={{
                  flex: 1,
                  backgroundColor:
                    "#EFF6FF",
                  padding: 12,
                  borderRadius: 16,
                }}
              >
                <Text
                  style={{
                    color: "#1D4ED8",
                    fontSize: 10,
                    fontWeight: "700",
                  }}
                >
                  กล้วยที่ตรวจทั้งหมด
                </Text>

                <Text
                  style={{
                    color: "#1E3A8A",
                    fontWeight: "900",
                    fontSize: 18,
                    marginTop: 4,
                  }}
                >
                  {stats.totalBananas}
                </Text>
              </View>
            </View>
          </View>

          {/* Action */}
          <View
            style={{
              gap: 8,
            }}
          >
            <Pressable
              onPress={checkBackend}
              style={({ pressed }) => [
                {
                  backgroundColor:
                    "#FFFFFF",
                  borderRadius: 18,
                  padding: 12,
                  borderWidth: 1,
                  borderColor:
                    "#E2E8F0",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent:
                    "space-between",
                },
                pressed && {
                  opacity: 0.8,
                },
              ]}
            >
              <Text
                style={{
                  color: "#007AFF",
                  fontSize: 13,
                  fontWeight: "700",
                }}
              >
                เช็กสถานะ Backend
              </Text>

              <Ionicons
                name="chevron-forward"
                size={15}
                color="#94A3B8"
              />
            </Pressable>

            <Pressable
              onPress={detect}
              disabled={
                loading ||
                batchLoading
              }
              style={({ pressed }) => [
                {
                  backgroundColor:
                    loading ||
                    batchLoading
                      ? "#86EFAC"
                      : "#16A34A",
                  borderRadius: 20,
                  paddingVertical: 15,
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent:
                    "center",
                  gap: 8,
                },
                pressed && {
                  opacity: 0.85,
                },
              ]}
            >
              <Ionicons
                name="sparkles"
                size={17}
                color="#FFFFFF"
              />

              <Text
                style={{
                  color: "#FFFFFF",
                  fontSize: 15,
                  fontWeight: "800",
                }}
              >
                {loading
                  ? "กำลังวิเคราะห์..."
                  : "เริ่มวิเคราะห์ (Detect) 🍌"}
              </Text>
            </Pressable>

            {selectedImages.length >
              1 && (
              <Pressable
                onPress={
                  detectAllSelectedImages
                }
                disabled={
                  loading ||
                  batchLoading
                }
                style={({ pressed }) => [
                  {
                    backgroundColor:
                      batchLoading
                        ? "#FDBA74"
                        : "#F97316",
                    borderRadius: 16,
                    paddingVertical: 13,
                    alignItems:
                      "center",
                    flexDirection:
                      "row",
                    justifyContent:
                      "center",
                    gap: 8,
                  },
                  pressed && {
                    opacity: 0.85,
                  },
                ]}
              >
                <Ionicons
                  name="layers"
                  size={16}
                  color="#FFFFFF"
                />

                <Text
                  style={{
                    color: "#FFFFFF",
                    fontSize: 14,
                    fontWeight: "800",
                  }}
                >
                  {batchLoading
                    ? "กำลังประมวลผลหลายรูป..."
                    : `วิเคราะห์ทั้งหมด (${selectedImages.length} รูป)`}
                </Text>
              </Pressable>
            )}
          </View>

          {/* ระดับความสุก */}
          <View
            style={{
              backgroundColor:
                "#FFFFFF",
              borderRadius: 16,
              paddingVertical: 12,
              paddingHorizontal: 16,
              borderWidth: 1,
              borderColor:
                "#E2E8F0",
              flexDirection: "row",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <Text
              style={{
                fontWeight: "800",
                color: "#1E293B",
                fontSize: 13,
              }}
            >
              🏷️ ระดับความสุก:
            </Text>

            <Text
              style={{
                color: "#15803D",
                fontWeight: "700",
                fontSize: 13,
              }}
            >
              ดิบ
            </Text>

            <Text
              style={{
                color: "#B45309",
                fontWeight: "700",
                fontSize: 13,
              }}
            >
              • ห่าม
            </Text>

            <Text
              style={{
                color: "#C2410C",
                fontWeight: "700",
                fontSize: 13,
              }}
            >
              • สุก
            </Text>

            <Text
              style={{
                color: "#DC2626",
                fontWeight: "700",
                fontSize: 13,
              }}
            >
              • งอม
            </Text>
          </View>

          {!!statusText && (
            <View
              style={{
                padding: 14,
                borderRadius: 16,
                backgroundColor:
                  "#F8FAFC",
                borderWidth: 1,
                borderColor:
                  "#E2E8F0",
              }}
            >
              <Text
                style={{
                  fontWeight: "700",
                  fontSize: 12,
                  color: "#334155",
                }}
              >
                {statusText}
              </Text>
            </View>
          )}

          {!!batchStatusText && (
            <View
              style={{
                padding: 14,
                borderRadius: 16,
                backgroundColor:
                  "#FFF7ED",
                borderWidth: 1,
                borderColor:
                  "#FED7AA",
              }}
            >
              <Text
                style={{
                  color: "#9A3412",
                  fontWeight: "700",
                  fontSize: 12,
                }}
              >
                {batchStatusText}
              </Text>
            </View>
          )}

          {!!errorMsg && (
            <View
              style={{
                padding: 14,
                borderRadius: 16,
                backgroundColor:
                  "#FEF2F2",
                borderWidth: 1,
                borderColor:
                  "#FEE2E2",
              }}
            >
              <Text
                style={{
                  color: "#991B1B",
                  fontWeight: "700",
                  fontSize: 12,
                }}
              >
                เกิดข้อผิดพลาด
              </Text>

              <Text
                selectable
                style={{
                  color: "#B91C1C",
                  marginTop: 4,
                  fontSize: 11,
                  lineHeight: 16,
                }}
              >
                {errorMsg}
              </Text>
            </View>
          )}

          {/* รูปที่เลือก */}
          {selectedImages.length >
            0 && (
            <View
              style={{
                gap: 8,
              }}
            >
              <Text
                style={{
                  fontWeight: "800",
                  fontSize: 14,
                  color: "#0F172A",
                }}
              >
                รูปที่เลือก (
                {selectedImages.length})
              </Text>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={
                  false
                }
                contentContainerStyle={{
                  gap: 8,
                }}
              >
                {selectedImages.map(
                  (item, index) => {
                    const isActive =
                      image ===
                      item.uri;

                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => {
                          setImage(
                            item.uri
                          );

                          openZoomImage(
                            item.uri,
                            `รูปต้นฉบับที่ ${index + 1}`
                          );
                        }}
                        style={({ pressed }) => [
                          {
                            width: 94,
                            height: 124,
                            borderRadius: 16,
                            overflow:
                              "hidden",
                            backgroundColor:
                              "#F8FAFC",
                            borderWidth:
                              isActive
                                ? 2.4
                                : 1,
                            borderColor:
                              isActive
                                ? "#16A34A"
                                : "#CBD5E1",
                            padding: 3,
                          },
                          pressed && {
                            opacity: 0.85,
                          },
                        ]}
                      >
                        <Image
                          source={{
                            uri: item.uri,
                          }}
                          style={{
                            width: "100%",
                            height: "100%",
                            borderRadius: 12,
                          }}
                          resizeMode="cover"
                        />

                        <View
                          style={{
                            position:
                              "absolute",
                            left: 8,
                            top: 8,
                            backgroundColor:
                              isActive
                                ? "#16A34A"
                                : "rgba(15,23,42,0.75)",
                            borderRadius: 999,
                            paddingHorizontal: 7,
                            paddingVertical: 2,
                          }}
                        >
                          <Text
                            style={{
                              color: "#FFFFFF",
                              fontWeight: "800",
                              fontSize: 10,
                            }}
                          >
                            {index + 1}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  }
                )}
              </ScrollView>
            </View>
          )}

          {/* รูปต้นฉบับสำหรับโหมดรูปเดียว */}
          {image &&
            batchResults.length === 0 && (
            <View
              style={{
                gap: 6,
              }}
            >
              <Text
                style={{
                  fontWeight: "700",
                  fontSize: 13,
                  color: "#334155",
                }}
              >
                รูปต้นฉบับ
              </Text>

              <Pressable
                onPress={() =>
                  openZoomImage(
                    image,
                    "รูปต้นฉบับ"
                  )
                }
                style={{
                  backgroundColor:
                    "#FFFFFF",
                  borderRadius: 18,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor:
                    "#E2E8F0",
                  padding: 4,
                }}
              >
                <Image
                  source={{
                    uri: image,
                  }}
                  style={{
                    width: "100%",
                    height: 240,
                  }}
                  resizeMode="contain"
                />
              </Pressable>
            </View>
          )}

          {/* ผลลัพธ์รูปเดียว */}
          {annotatedUrl &&
            batchResults.length === 0 && (
            <View
              style={{
                gap: 8,
              }}
            >
              <Text
                style={{
                  fontWeight: "700",
                  fontSize: 13,
                  color: "#334155",
                }}
              >
                ผลลัพธ์ Segmentation รายลูก
              </Text>

              <Pressable
                onPress={() =>
                  openZoomImage(
                    annotatedUrl,
                    "ผลลัพธ์ Segmentation รายลูก"
                  )
                }
                style={{
                  backgroundColor:
                    "#FFFFFF",
                  borderRadius: 18,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor:
                    "#E2E8F0",
                  padding: 4,
                }}
              >
                <Image
                  source={{
                    uri:
                      annotatedUrl,
                  }}
                  style={{
                    width: "100%",
                    height: 300,
                  }}
                  resizeMode="contain"
                />
              </Pressable>

              {result?.model_type ===
                "yolo_segmentation_4cls" && (
                <View
                  style={{
                    flexDirection:
                      "row",
                    alignItems:
                      "center",
                    gap: 8,
                    backgroundColor:
                      "#F0FDF4",
                    borderWidth: 1,
                    borderColor:
                      "#BBF7D0",
                    borderRadius: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                  }}
                >
                  <Ionicons
                    name="scan-outline"
                    size={18}
                    color="#16A34A"
                  />

                  <Text
                    style={{
                      flex: 1,
                      color: "#166534",
                      fontWeight: "700",
                      fontSize: 12,
                      lineHeight: 18,
                    }}
                  >
                    เส้นสีคือขอบเขต Polygon
                    ที่โมเดลแยกตามรูปร่างกล้วยแต่ละลูก
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ผลลัพธ์หลายรูป */}
          {batchResults.length >
            0 && (
            <View
              style={{
                gap: 14,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent:
                    "space-between",
                }}
              >
                <Text
                  style={{
                    color: "#0F172A",
                    fontSize: 17,
                    fontWeight: "900",
                  }}
                >
                  ผลการวิเคราะห์หลายรูป
                </Text>

                <View
                  style={{
                    backgroundColor:
                      "#DCFCE7",
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 999,
                  }}
                >
                  <Text
                    style={{
                      color: "#15803D",
                      fontSize: 11,
                      fontWeight: "800",
                    }}
                  >
                    {batchResults.length} รูป
                  </Text>
                </View>
              </View>

              {batchResults.map(
                (batchItem) => {
                  const itemSummary =
                    batchItem.summary ??
                    {};

                  const green =
                    Number(
                      itemSummary.green ??
                        0
                    );

                  const breaker =
                    Number(
                      itemSummary.breaker ??
                        0
                    );

                  const ripe =
                    Number(
                      itemSummary.ripe ??
                        0
                    );

                  const overripe =
                    Number(
                      itemSummary.overripe ??
                        0
                    );

                  return (
                    <View
                      key={
                        batchItem.id
                      }
                      style={{
                        backgroundColor:
                          "#FFFFFF",
                        borderRadius: 22,
                        padding: 14,
                        borderWidth: 1,
                        borderColor:
                          batchItem.ok
                            ? "#E2E8F0"
                            : "#FECACA",
                        gap: 12,
                      }}
                    >
                      <View
                        style={{
                          flexDirection:
                            "row",
                          alignItems:
                            "center",
                          justifyContent:
                            "space-between",
                        }}
                      >
                        <View
                          style={{
                            flexDirection:
                              "row",
                            alignItems:
                              "center",
                            gap: 9,
                          }}
                        >
                          <View
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: 10,
                              backgroundColor:
                                batchItem.ok
                                  ? "#DCFCE7"
                                  : "#FEE2E2",
                              alignItems:
                                "center",
                              justifyContent:
                                "center",
                            }}
                          >
                            <Text
                              style={{
                                color:
                                  batchItem.ok
                                    ? "#15803D"
                                    : "#DC2626",
                                fontWeight:
                                  "900",
                              }}
                            >
                              {
                                batchItem.order
                              }
                            </Text>
                          </View>

                          <View>
                            <Text
                              style={{
                                color:
                                  "#0F172A",
                                fontSize: 14,
                                fontWeight:
                                  "800",
                              }}
                            >
                              รูปที่{" "}
                              {
                                batchItem.order
                              }
                            </Text>

                            <Text
                              style={{
                                color:
                                  batchItem.ok
                                    ? "#15803D"
                                    : "#DC2626",
                                fontSize:
                                  10.5,
                                fontWeight:
                                  "700",
                              }}
                            >
                              {batchItem.ok
                                ? "วิเคราะห์สำเร็จ"
                                : "วิเคราะห์ไม่สำเร็จ"}
                            </Text>
                          </View>
                        </View>

                        {batchItem.ok && (
                          <Text
                            style={{
                              color:
                                "#2563EB",
                              fontWeight:
                                "800",
                              fontSize:
                                10.5,
                            }}
                          >
                            {batchItem
                              .inferenceMs ??
                              0}{" "}
                            ms
                          </Text>
                        )}
                      </View>

                      <Text
                        style={{
                          color: "#64748B",
                          fontSize: 11,
                          fontWeight: "700",
                        }}
                      >
                        ภาพต้นฉบับ
                      </Text>

                      <Pressable
                        onPress={() =>
                          openZoomImage(
                            batchItem.sourceUri,
                            `ภาพต้นฉบับ รูปที่ ${batchItem.order}`
                          )
                        }
                      >
                        <Image
                          source={{
                            uri:
                              batchItem.sourceUri,
                          }}
                          style={{
                            width: "100%",
                            height: 210,
                            borderRadius: 16,
                            backgroundColor:
                              "#F8FAFC",
                          }}
                          resizeMode="contain"
                        />
                      </Pressable>

                      {batchItem.ok &&
                        batchItem.annotatedUrl && (
                        <>
                          <Text
                            style={{
                              color:
                                "#64748B",
                              fontSize: 11,
                              fontWeight:
                                "700",
                            }}
                          >
                            ผลลัพธ์ Segmentation
                          </Text>

                          <Pressable
                            onPress={() =>
                              openZoomImage(
                                batchItem.annotatedUrl,
                                `ผลลัพธ์รูปที่ ${batchItem.order}`
                              )
                            }
                          >
                            <Image
                              source={{
                                uri:
                                  batchItem.annotatedUrl,
                              }}
                              style={{
                                width:
                                  "100%",
                                height:
                                  260,
                                borderRadius:
                                  16,
                                backgroundColor:
                                  "#F8FAFC",
                              }}
                              resizeMode="contain"
                            />
                          </Pressable>
                        </>
                      )}

                      {batchItem.ok &&
                        !batchItem.annotatedUrl && (
                        <View
                          style={{
                            backgroundColor:
                              "#FFF7ED",
                            borderRadius: 14,
                            padding: 12,
                          }}
                        >
                          <Text
                            style={{
                              color:
                                "#9A3412",
                              fontSize: 11,
                              fontWeight:
                                "700",
                            }}
                          >
                            Backend ไม่ได้ส่ง URL
                            ของภาพผลลัพธ์กลับมา
                          </Text>
                        </View>
                      )}

                      {batchItem.ok && (
                        <View
                          style={{
                            backgroundColor:
                              "#F8FAFC",
                            borderRadius: 16,
                            padding: 12,
                            gap: 5,
                          }}
                        >
                          <Text
                            style={{
                              color:
                                "#0F172A",
                              fontSize: 13,
                              fontWeight:
                                "800",
                            }}
                          >
                            สรุปรูปที่{" "}
                            {batchItem.order}
                          </Text>

                          <Text
                            style={{
                              color:
                                "#475569",
                              fontSize:
                                11.5,
                            }}
                          >
                            • ตรวจพบทั้งหมด:{" "}
                            {batchItem.count ??
                              0}{" "}
                            ลูก
                          </Text>

                          <Text
                            style={{
                              color:
                                "#15803D",
                              fontSize:
                                11.5,
                            }}
                          >
                            • ดิบ:{" "}
                            {green} ลูก
                          </Text>

                          <Text
                            style={{
                              color:
                                "#B45309",
                              fontSize:
                                11.5,
                            }}
                          >
                            • ห่าม:{" "}
                            {breaker} ลูก
                          </Text>

                          <Text
                            style={{
                              color:
                                "#C2410C",
                              fontSize:
                                11.5,
                            }}
                          >
                            • สุก:{" "}
                            {ripe} ลูก
                          </Text>

                          <Text
                            style={{
                              color:
                                "#DC2626",
                              fontSize:
                                11.5,
                            }}
                          >
                            • งอม:{" "}
                            {overripe} ลูก
                          </Text>
                        </View>
                      )}

                      {!!batchItem.error && (
                        <View
                          style={{
                            backgroundColor:
                              batchItem.ok
                                ? "#FFF7ED"
                                : "#FEF2F2",
                            borderRadius: 14,
                            padding: 11,
                          }}
                        >
                          <Text
                            selectable
                            style={{
                              color:
                                batchItem.ok
                                  ? "#9A3412"
                                  : "#B91C1C",
                              fontSize:
                                10.5,
                              lineHeight: 16,
                              fontWeight:
                                "600",
                            }}
                          >
                            {
                              batchItem.error
                            }
                          </Text>
                        </View>
                      )}

                      {batchItem.ok && (
                        <Pressable
                          onPress={() =>
                            openBatchScanDetail(
                              batchItem
                            )
                          }
                          style={({ pressed }) => [
                            {
                              backgroundColor:
                                batchItem.scanId
                                  ? "#16A34A"
                                  : "#CBD5E1",
                              borderRadius: 16,
                              paddingVertical: 13,
                              paddingHorizontal:
                                14,
                              flexDirection:
                                "row",
                              alignItems:
                                "center",
                              justifyContent:
                                "center",
                              gap: 8,
                            },
                            pressed && {
                              opacity: 0.84,
                            },
                          ]}
                        >
                          <Ionicons
                            name="chatbubble-ellipses-outline"
                            size={18}
                            color="#FFFFFF"
                          />

                          <Text
                            style={{
                              color:
                                "#FFFFFF",
                              fontSize: 13,
                              fontWeight:
                                "800",
                            }}
                          >
                            {batchItem.scanId
                              ? "ดูรายละเอียดและแสดงความคิดเห็น"
                              : "ยังไม่มีประวัติของรูปนี้"}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  );
                }
              )}
            </View>
          )}

          {/* Summary รูปเดียว */}
          {summary &&
            batchResults.length === 0 && (
            <View
              style={{
                padding: 16,
                borderRadius: 22,
                backgroundColor:
                  "#FFFFFF",
                borderWidth: 1,
                borderColor:
                  "#E2E8F0",
                gap: 6,
              }}
            >
              <Text
                style={{
                  fontWeight: "800",
                  fontSize: 15,
                  color: "#0F172A",
                }}
              >
                สรุปผลการวิเคราะห์
              </Text>

              <Text
                style={{
                  fontSize: 12,
                  color: "#475569",
                }}
              >
                • ตรวจพบทั้งหมด:{" "}
                {summary.total} ลูก
              </Text>

              <Text
                style={{
                  fontSize: 12,
                  color: "#15803D",
                }}
              >
                • ดิบ:{" "}
                {summary.green} ลูก
              </Text>

              <Text
                style={{
                  fontSize: 12,
                  color: "#B45309",
                }}
              >
                • ห่าม:{" "}
                {summary.breaker} ลูก
              </Text>

              <Text
                style={{
                  fontSize: 12,
                  color: "#C2410C",
                }}
              >
                • สุก:{" "}
                {summary.ripe} ลูก
              </Text>

              <Text
                style={{
                  fontSize: 12,
                  color: "#DC2626",
                }}
              >
                • งอม:{" "}
                {summary.overripe} ลูก
              </Text>

              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: "#0F172A",
                  marginTop: 4,
                }}
              >
                • ภาพรวม:{" "}
                {summary.overall}
              </Text>

              <Pressable
                onPress={() => {
                  if (
                    !latestScanId
                  ) {
                    Alert.alert(
                      "ยังเปิดรายละเอียดไม่ได้",
                      result?.supabase_error ||
                        result?.supabase_details_error ||
                        "Backend ไม่ได้ส่ง scan_id กลับมา"
                    );

                    return;
                  }

                  router.push({
                    pathname:
                      "/scan-detail" as any,

                    params: {
                      scanId:
                        latestScanId,

                      openReview:
                        "true",
                    },
                  });
                }}
                style={({ pressed }) => [
                  {
                    marginTop: 12,
                    backgroundColor:
                      latestScanId
                        ? "#16A34A"
                        : "#CBD5E1",
                    borderRadius: 16,
                    paddingVertical: 13,
                    paddingHorizontal: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent:
                      "center",
                    gap: 8,
                  },
                  pressed && {
                    opacity: 0.85,
                  },
                ]}
              >
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={18}
                  color="#FFFFFF"
                />

                <Text
                  style={{
                    color: "#FFFFFF",
                    fontSize: 14,
                    fontWeight: "800",
                  }}
                >
                  ดูรายละเอียดและแสดงความคิดเห็น
                </Text>
              </Pressable>

              {!latestScanId && (
                <Text
                  style={{
                    color: "#94A3B8",
                    textAlign: "center",
                    fontSize: 10.5,
                  }}
                >
                  ยังไม่พบ scan_id จาก Backend
                </Text>
              )}
            </View>
          )}

          {showDebug && (
            <View
              style={{
                backgroundColor:
                  "#0F172A",
                borderRadius: 18,
                padding: 14,
                gap: 8,
              }}
            >
              <Text
                style={{
                  color: "#FFFFFF",
                  fontWeight: "800",
                  fontSize: 13,
                }}
              >
                ข้อมูล Debug
              </Text>

              <Text
                selectable
                style={{
                  color: "#CBD5E1",
                  fontFamily:
                    Platform.OS === "ios"
                      ? "Menlo"
                      : "monospace",
                  fontSize: 10,
                  lineHeight: 15,
                }}
              >
                {JSON.stringify(
                  {
                    single_result:
                      result,

                    batch_results:
                      batchResults.map(
                        (item) => ({
                          order:
                            item.order,

                          ok:
                            item.ok,

                          scan_id:
                            item.scanId,

                          annotated_url:
                            item.annotatedUrl,

                          database_saved:
                            item.databaseSaved,

                          error:
                            item.error,

                          raw_result:
                            item.rawResult,
                        })
                      ),
                  },
                  null,
                  2
                )}
              </Text>
            </View>
          )}

          <Pressable
            onPress={() =>
              setShowDebug(
                (previous) =>
                  !previous
              )
            }
            style={({ pressed }) => [
              {
                alignSelf: "center",
                paddingVertical: 7,
                paddingHorizontal: 12,
                borderRadius: 999,
                backgroundColor:
                  "#F8FAFC",
                borderWidth: 1,
                borderColor:
                  "#E2E8F0",
              },
              pressed && {
                opacity: 0.8,
              },
            ]}
          >
            <Text
              style={{
                color: "#64748B",
                fontWeight: "700",
                fontSize: 11,
              }}
            >
              {showDebug
                ? "✕ ซ่อนข้อมูล Debug"
                : "▾ แสดงข้อมูล Debug"}
            </Text>
          </Pressable>
        </ScrollView>

        <HomeDock
          takePhoto={takePhoto}
          pickImage={pickImage}
          scrollToTop={() => {
            setActiveTab("home");

            scrollRef.current
              ?.scrollTo({
                y: 0,
                animated: true,
              });
          }}
          user={user}
          activeTab={activeTab}
        />

        <ZoomImageModal
          uri={zoomImageUri}
          title={zoomImageTitle}
          imageKey={zoomImageKey}
          onClose={() => {
            setZoomImageUri(null);
            setZoomImageTitle("");
          }}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}