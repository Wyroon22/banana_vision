import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

// คง legacy ไว้ เพราะโปรเจกต์เดิมใช้งานแบบนี้อยู่แล้ว
import * as FileSystem from "expo-file-system/legacy";

import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../../lib/supabase";

// ======================================================
// CSV HELPERS
// ======================================================

function sanitizeSpreadsheetValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);

  if (/^[=+\-@]/.test(text)) {
    return `'${text}`;
  }

  return text;
}

function csvEscape(value) {
  const safeText = sanitizeSpreadsheetValue(value);
  return `"${safeText.replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ======================================================
// RIPENESS HELPERS
// ======================================================

function toThaiRipeness(value) {
  if (value === "green" || value === "ดิบ") return "ดิบ";
  if (value === "breaker" || value === "ห่าม") return "ห่าม";
  if (value === "ripe" || value === "สุก") return "สุก";
  if (value === "overripe" || value === "งอม") return "งอม";

  return value || "";
}

function formatConfidencePercent(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const numberValue = Number(value);

  if (Number.isNaN(numberValue)) {
    return "";
  }

  const percent =
    numberValue <= 1
      ? numberValue * 100
      : numberValue;

  return `${Math.round(percent)}%`;
}

// ======================================================
// DATE / FILE HELPERS
// ======================================================

function createTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
}

function formatThaiDate(value) {
  if (!value) {
    return "-";
  }

  try {
    return new Date(value).toLocaleString("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "-";
  }
}

// ======================================================
// SUPABASE PAGINATION
// ======================================================

async function fetchAllRows(
  tableName,
  columns,
  orderColumn = "created_at"
) {
  const allRows = [];
  const batchSize = 1000;
  let from = 0;

  while (true) {
    const to = from + batchSize - 1;

    const { data, error } = await supabase
      .from(tableName)
      .select(columns)
      .order(orderColumn, {
        ascending: false,
      })
      .range(from, to);

    if (error) {
      throw error;
    }

    const currentRows = Array.isArray(data)
      ? data
      : [];

    allRows.push(...currentRows);

    if (currentRows.length < batchSize) {
      break;
    }

    from += batchSize;
  }

  return allRows;
}

// ======================================================
// MAIN COMPONENT
// ======================================================

export default function ExportDataScreen() {
  const [loadingType, setLoadingType] = useState(null);
  const isLoading = loadingType !== null;

  // โหลดข้อมูลรวมทั้ง profiles, scan_history, scan_details และ feedback
  const loadExportRows = async () => {
    const [
      profiles,
      scans,
      details,
      feedbacks,
    ] = await Promise.all([
      fetchAllRows(
        "profiles",
        `
          id,
          email,
          display_name,
          role,
          created_at
        `
      ),
      fetchAllRows(
        "scan_history",
        `
          id,
          user_id,
          guest_id,
          created_at,
          total_bananas,
          green_count,
          breaker_count,
          ripe_count,
          overripe_count,
          inference_ms,
          original_image_url,
          result_image_url
        `
      ),
      fetchAllRows(
        "scan_details",
        `
          id,
          scan_id,
          banana_index,
          ripeness_th,
          ripeness_label,
          confidence,
          user_selected_ripeness,
          user_selected_color_level,
          feedback_updated_at,
          created_at
        `
      ),
      fetchAllRows(
        "feedback",
        `
          id,
          user_id,
          scan_id,
          comment,
          rating,
          is_correct,
          created_at
        `
      ),
    ]);

    const profileMap = new Map(
      profiles.map((profile) => [
        profile.id,
        profile,
      ])
    );

    const scanMap = new Map(
      scans.map((scan) => [
        scan.id,
        scan,
      ])
    );

    const rows = details.map((detail) => {
      const scan =
        scanMap.get(detail.scan_id) || {};

      const profile = scan.user_id
        ? profileMap.get(scan.user_id) || {}
        : {};

      const aiRawValue =
        detail.ripeness_th ||
        detail.ripeness_label ||
        "";

      const userSelectedRaw =
        detail.user_selected_ripeness || "";

      const hasCorrection =
        Boolean(detail.user_selected_ripeness);

      return {
        scan_id: detail.scan_id || "",
        scan_created_at: scan.created_at || "",
        user_id: scan.user_id || "",
        user_email: profile.email || "",
        user_display_name: profile.display_name || "",
        user_role: profile.role || "",
        guest_id: scan.guest_id || "",
        banana_detail_id: detail.id || "",
        banana_index: detail.banana_index ?? "",
        ai_ripeness_label: detail.ripeness_label || "",
        ai_ripeness_th: detail.ripeness_th || "",
        ai_ripeness_display: toThaiRipeness(aiRawValue),
        confidence_raw: detail.confidence ?? "",
        confidence_percent: formatConfidencePercent(
          detail.confidence
        ),
        user_selected_ripeness: userSelectedRaw,
        user_selected_ripeness_display:
          toThaiRipeness(userSelectedRaw),
        user_selected_color_level:
          detail.user_selected_color_level || "",
        is_corrected: hasCorrection ? "true" : "false",
        feedback_updated_at:
          detail.feedback_updated_at || "",
        total_bananas: scan.total_bananas ?? "",
        green_count: scan.green_count ?? "",
        breaker_count: scan.breaker_count ?? "",
        ripe_count: scan.ripe_count ?? "",
        overripe_count: scan.overripe_count ?? "",
        inference_ms: scan.inference_ms ?? "",
        original_image_url:
          scan.original_image_url || "",
        result_image_url:
          scan.result_image_url || "",
        detail_created_at: detail.created_at || "",
      };
    });

    const feedbackRows = feedbacks.map((fb) => {
      const profile = fb.user_id
        ? profileMap.get(fb.user_id) || {}
        : {};

      return {
        feedback_id: fb.id || "",
        user_id: fb.user_id || "",
        user_email: profile.email || "",
        user_display_name: profile.display_name || "",
        scan_id: fb.scan_id || "",
        comment: fb.comment || "",
        rating: fb.rating ?? "",
        is_correct: fb.is_correct ? "true" : "false",
        created_at: fb.created_at || "",
      };
    });

    return {
      profiles,
      scans,
      details,
      feedbacks,
      rows,
      feedbackRows,
    };
  };

  // ====================================================
  // PDF EXPORT
  // ====================================================

  const handleExportPDF = async () => {
    try {
      if (isLoading) {
        return;
      }

      setLoadingType("pdf");

      const {
        profiles,
        scans,
        details,
        feedbacks,
        rows,
        feedbackRows,
      } = await loadExportRows();

      if (rows.length === 0 && feedbackRows.length === 0) {
        Alert.alert(
          "ยังไม่มีข้อมูล",
          "ยังไม่มีข้อมูลสำหรับส่งออกในระบบ"
        );
        return;
      }

      const pdfRows = rows.slice(0, 100);
      const pdfFeedbacks = feedbackRows.slice(0, 100);

      const rowsHtml = pdfRows
        .map(
          (item) => `
            <tr>
              <td>${escapeHtml(formatThaiDate(item.scan_created_at))}</td>
              <td>${escapeHtml(item.user_display_name || "-")}</td>
              <td>${escapeHtml(item.user_email || "-")}</td>
              <td>${escapeHtml(item.banana_index || "-")}</td>
              <td>${escapeHtml(item.ai_ripeness_display || "-")}</td>
              <td>${escapeHtml(item.confidence_percent || "-")}</td>
              <td>${escapeHtml(item.user_selected_ripeness_display || "-")}</td>
              <td>${escapeHtml(item.user_selected_color_level || "-")}</td>
            </tr>
          `
        )
        .join("");

      const feedbackRowsHtml = pdfFeedbacks
        .map(
          (fb) => `
            <tr>
              <td>${escapeHtml(formatThaiDate(fb.created_at))}</td>
              <td>${escapeHtml(fb.user_display_name || fb.user_email || "-")}</td>
              <td>${escapeHtml(fb.rating || "-")} ดาว</td>
              <td>${escapeHtml(fb.is_correct === "true" ? "ถูกต้อง" : "ไม่ถูกต้อง")}</td>
              <td>${escapeHtml(fb.comment || "-")}</td>
            </tr>
          `
        )
        .join("");

      const reportDate =
        new Date().toLocaleString("th-TH", {
          dateStyle: "long",
          timeStyle: "short",
        });

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: Helvetica, Arial, sans-serif; padding: 24px; color: #1e293b; }
              h1 { text-align: center; color: #0f172a; margin-bottom: 6px; }
              .subtitle { text-align: center; color: #64748b; margin-bottom: 24px; }
              .summary { display: flex; gap: 10px; margin-bottom: 20px; }
              .summary-card { flex: 1; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; background: #f8fafc; }
              .summary-label { font-size: 11px; color: #64748b; }
              .summary-value { margin-top: 4px; font-size: 18px; font-weight: bold; color: #0f172a; }
              h2 { margin-top: 24px; font-size: 16px; color: #0f172a; }
              table { width: 100%; border-collapse: collapse; margin-top: 10px; }
              th { background-color: #f8fafc; padding: 6px; border: 1px solid #cbd5e1; font-size: 10px; }
              td { padding: 6px; border: 1px solid #e2e8f0; font-size: 9px; }
              .note { margin-top: 16px; color: #64748b; font-size: 10px; }
            </style>
          </head>
          <body>
            <h1>BananaVision</h1>
            <div class="subtitle">
              รายงานสรุปข้อมูลระบบและข้อเสนอแนะ<br />
              วันที่ออกรายงาน: ${escapeHtml(reportDate)}
            </div>

            <div class="summary">
              <div class="summary-card">
                <div class="summary-label">ผู้ใช้ทั้งหมด</div>
                <div class="summary-value">${profiles.length}</div>
              </div>
              <div class="summary-card">
                <div class="summary-label">จำนวนสแกน</div>
                <div class="summary-value">${scans.length}</div>
              </div>
              <div class="summary-card">
                <div class="summary-label">กล้วยรายลูก</div>
                <div class="summary-value">${details.length}</div>
              </div>
              <div class="summary-card">
                <div class="summary-label">ความคิดเห็น</div>
                <div class="summary-value">${feedbacks.length}</div>
              </div>
            </div>

            <h2>รายละเอียดการตรวจสอบกล้วย (ล่าสุด)</h2>
            <table>
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>ผู้ใช้</th>
                  <th>อีเมล</th>
                  <th>ลูกที่</th>
                  <th>AI</th>
                  <th>Conf.</th>
                  <th>แก้เป็น</th>
                  <th>ระดับสี</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml || `<tr><td colspan="8" style="text-align:center;">ไม่มีข้อมูล</td></tr>`}
              </tbody>
            </table>

            <h2>ความคิดเห็นและฟีดแบ็กจากผู้ใช้งาน (ล่าสุด)</h2>
            <table>
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>ผู้ใช้งาน</th>
                  <th>คะแนน</th>
                  <th>ความถูกต้อง</th>
                  <th>ความคิดเห็น</th>
                </tr>
              </thead>
              <tbody>
                ${feedbackRowsHtml || `<tr><td colspan="5" style="text-align:center;">ไม่มีความคิดเห็น</td></tr>`}
              </tbody>
            </table>

            <div class="note">
              หมายเหตุ: PDF แสดงผลการตรวจและคอมเมนต์ล่าสุดไม่เกิน 100 รายการ เพื่อป้องกันไฟล์ขนาดใหญ่เกินไป
            </div>
          </body>
        </html>
      `;

      const { uri } =
        await Print.printToFileAsync({
          html: htmlContent,
        });

      const sharingAvailable =
        await Sharing.isAvailableAsync();

      if (!sharingAvailable) {
        Alert.alert(
          "สร้าง PDF สำเร็จ",
          "สร้างไฟล์ PDF แล้ว แต่อุปกรณ์นี้ไม่รองรับ Share Sheet"
        );
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: "ส่งออกรายงาน BananaVision",
      });
    } catch (error) {
      console.error("[PDF EXPORT ERROR]", error);
      Alert.alert(
        "ส่งออก PDF ไม่สำเร็จ",
        error?.message || "กรุณาลองใหม่"
      );
    } finally {
      setLoadingType(null);
    }
  };

  // ====================================================
  // CSV EXPORT
  // ====================================================

  const handleExportCSV = async () => {
    try {
      if (isLoading) {
        return;
      }

      setLoadingType("csv");

      const { rows, feedbackRows } =
        await loadExportRows();

      if (rows.length === 0 && feedbackRows.length === 0) {
        Alert.alert(
          "ยังไม่มีข้อมูล",
          "ยังไม่มีข้อมูลสำหรับส่งออก"
        );
        return;
      }

      const scanHeader = [
        "scan_id",
        "scan_created_at",
        "user_id",
        "user_email",
        "user_display_name",
        "user_role",
        "guest_id",
        "banana_detail_id",
        "banana_index",
        "ai_ripeness_label",
        "ai_ripeness_th",
        "ai_ripeness_display",
        "confidence_raw",
        "confidence_percent",
        "user_selected_ripeness",
        "user_selected_ripeness_display",
        "user_selected_color_level",
        "is_corrected",
        "feedback_updated_at",
        "total_bananas",
        "green_count",
        "breaker_count",
        "ripe_count",
        "overripe_count",
        "inference_ms",
        "original_image_url",
        "result_image_url",
        "detail_created_at",
      ];

      const scanCsvLines = [
        scanHeader.map(csvEscape).join(","),
        ...rows.map((row) =>
          [
            row.scan_id,
            row.scan_created_at,
            row.user_id,
            row.user_email,
            row.user_display_name,
            row.user_role,
            row.guest_id,
            row.banana_detail_id,
            row.banana_index,
            row.ai_ripeness_label,
            row.ai_ripeness_th,
            row.ai_ripeness_display,
            row.confidence_raw,
            row.confidence_percent,
            row.user_selected_ripeness,
            row.user_selected_ripeness_display,
            row.user_selected_color_level,
            row.is_corrected,
            row.feedback_updated_at,
            row.total_bananas,
            row.green_count,
            row.breaker_count,
            row.ripe_count,
            row.overripe_count,
            row.inference_ms,
            row.original_image_url,
            row.result_image_url,
            row.detail_created_at,
          ]
            .map(csvEscape)
            .join(",")
        ),
      ];

      const feedbackHeader = [
        "feedback_id",
        "user_id",
        "user_email",
        "user_display_name",
        "scan_id",
        "comment",
        "rating",
        "is_correct",
        "created_at",
      ];

      const feedbackCsvLines = [
        feedbackHeader.map(csvEscape).join(","),
        ...feedbackRows.map((fb) =>
          [
            fb.feedback_id,
            fb.user_id,
            fb.user_email,
            fb.user_display_name,
            fb.scan_id,
            fb.comment,
            fb.rating,
            fb.is_correct,
            fb.created_at,
          ]
            .map(csvEscape)
            .join(",")
        ),
      ];

      const combinedCsvContent =
        "\uFEFF" +
        "=== SCAN & CORRECTION DATA ===\r\n" +
        scanCsvLines.join("\r\n") +
        "\r\n\r\n=== USER COMMENTS & FEEDBACK ===\r\n" +
        feedbackCsvLines.join("\r\n");

      const fileName =
        `BananaVision_Export_All_${createTimestamp()}.csv`;

      if (!FileSystem.documentDirectory) {
        throw new Error(
          "ไม่พบพื้นที่จัดเก็บไฟล์ของแอป"
        );
      }

      const fileUri =
        `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(
        fileUri,
        combinedCsvContent,
        {
          encoding:
            FileSystem.EncodingType.UTF8,
        }
      );

      const sharingAvailable =
        await Sharing.isAvailableAsync();

      if (!sharingAvailable) {
        Alert.alert(
          "สร้าง CSV สำเร็จ",
          `สร้างไฟล์แล้ว:\n${fileName}`
        );
        return;
      }

      await Sharing.shareAsync(fileUri, {
        mimeType: "text/csv",
        dialogTitle:
          "ส่งออกฐานข้อมูลและคอมเมนต์ BananaVision",
      });
    } catch (error) {
      console.error("[CSV EXPORT ERROR]", error);
      Alert.alert(
        "ส่งออก CSV ไม่สำเร็จ",
        error?.message || "เกิดข้อผิดพลาด กรุณาลองใหม่"
      );
    } finally {
      setLoadingType(null);
    }
  };

  // ====================================================
  // UI
  // ====================================================

  return (
    <View style={styles.container}>
      {/* Header Section */}
      <View style={styles.centerIcon}>
        <View style={styles.iconCircle}>
          <Ionicons
            name="cloud-download-outline"
            size={28}
            color="#16a34a"
          />
        </View>

        <Text style={styles.title}>
          ศูนย์ส่งออกข้อมูล
        </Text>

        <Text style={styles.subtitle}>
          ระบบสำรองและส่งออกรายงานข้อมูลจากตาราง profiles, scan_history, scan_details และ feedback
        </Text>
      </View>

      {/* Preview Card */}
      <View style={styles.previewCard}>
        <View style={styles.previewHeaderRow}>
          <Ionicons name="document-text-outline" size={16} color="#475569" />
          <Text style={styles.previewTitle}>
            ข้อมูลที่จะถูกรวมในไฟล์ส่งออก
          </Text>
        </View>

        <View style={styles.previewList}>
          <View style={styles.previewItemRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.previewItemText}>ข้อมูลสมาชิกและสิทธิ์ (Profiles)</Text>
          </View>
          <View style={styles.previewItemRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.previewItemText}>ประวัติการตรวจสอบภาพ (Scan History)</Text>
          </View>
          <View style={styles.previewItemRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.previewItemText}>ผลวิเคราะห์รายลูกและการแก้ไข (Scan Details)</Text>
          </View>
          <View style={styles.previewItemRow}>
            <View style={styles.bulletDot} />
            <Text style={styles.previewItemText}>ข้อเสนอแนะและความคิดเห็น (Feedback)</Text>
          </View>
        </View>
      </View>

      {/* Buttons Layout */}
      <View style={styles.btnLayout}>
        {/* PDF Export Button */}
        <TouchableOpacity
          style={[
            styles.actionBtn,
            styles.pdfButton,
            isLoading && styles.disabledButton,
          ]}
          onPress={handleExportPDF}
          activeOpacity={0.85}
          disabled={isLoading}
        >
          {loadingType === "pdf" ? (
            <View style={styles.btnInnerLoading}>
              <ActivityIndicator size="small" color="#ffffff" />
              <Text style={styles.btnText}>กำลังสร้างเอกสาร PDF...</Text>
            </View>
          ) : (
            <View style={styles.btnInnerContent}>
              <Ionicons name="document-outline" size={18} color="#ffffff" />
              <Text style={styles.btnText}>ส่งออกรายงานรูปแบบ PDF</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* CSV Export Button */}
        <TouchableOpacity
          style={[
            styles.actionBtn,
            styles.csvButton,
            isLoading && styles.disabledButton,
          ]}
          onPress={handleExportCSV}
          activeOpacity={0.85}
          disabled={isLoading}
        >
          {loadingType === "csv" ? (
            <View style={styles.btnInnerLoading}>
              <ActivityIndicator size="small" color="#ffffff" />
              <Text style={styles.btnText}>กำลังประมวลผลไฟล์ CSV...</Text>
            </View>
          ) : (
            <View style={styles.btnInnerContent}>
              <Ionicons name="grid-outline" size={18} color="#ffffff" />
              <Text style={styles.btnText}>ส่งออกฐานข้อมูล CSV (รวมคอมเมนต์)</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ======================================================
// STYLES
// ======================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
  },

  centerIcon: {
    alignItems: "center",
    marginBottom: 24,
  },

  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },

  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
    marginTop: 14,
  },

  subtitle: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
    paddingHorizontal: 10,
    fontWeight: "600",
  },

  previewCard: {
    backgroundColor: "#ffffff",
    padding: 18,
    borderRadius: 20,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 2,
  },

  previewHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },

  previewTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#1e293b",
  },

  previewList: {
    gap: 8,
    paddingLeft: 4,
  },

  previewItemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#16a34a",
  },

  previewItemText: {
    fontSize: 13,
    color: "#475569",
    fontWeight: "600",
  },

  btnLayout: {
    gap: 12,
  },

  actionBtn: {
    borderRadius: 16,
    minHeight: 52,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },

  pdfButton: {
    backgroundColor: "#dc2626",
    shadowColor: "#dc2626",
  },

  csvButton: {
    backgroundColor: "#16a34a",
    shadowColor: "#16a34a",
  },

  disabledButton: {
    opacity: 0.6,
  },

  btnInnerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  btnInnerLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  btnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
});