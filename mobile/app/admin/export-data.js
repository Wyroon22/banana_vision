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

// คง legacy ไว้ เพราะโปรเจกต์เดิมของต้นใช้งานแบบนี้อยู่แล้ว
import * as FileSystem from "expo-file-system/legacy";

import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../../lib/supabase";

// ======================================================
// CSV HELPERS
// ======================================================

// ป้องกัน CSV / Excel formula injection
function sanitizeSpreadsheetValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);

  // ถ้าข้อมูลขึ้นต้นด้วยอักขระที่ Spreadsheet
  // อาจตีความเป็นสูตร ให้เติม ' ข้างหน้า
  if (/^[=+\-@]/.test(text)) {
    return `'${text}`;
  }

  return text;
}

// ป้องกัน comma, quote และ newline ทำ CSV พัง
function csvEscape(value) {
  const safeText = sanitizeSpreadsheetValue(value);

  return `"${safeText.replace(/"/g, '""')}"`;
}

// ป้องกัน HTML พังตอนสร้าง PDF
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

  // รองรับทั้งกรณี:
  // 0.58 -> 58%
  // 58   -> 58%
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
// ดึงข้อมูลครบทีละ batch
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

    // ถ้าน้อยกว่า batchSize
    // แปลว่าถึงหน้าสุดท้ายแล้ว
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
  // แยกประเภท Loading
  // null | "pdf" | "csv"
  const [loadingType, setLoadingType] = useState(null);

  const isLoading = loadingType !== null;

  // ====================================================
  // โหลดข้อมูลจริงจาก Supabase
  // profiles + scan_history + scan_details
  // ====================================================

  const loadExportRows = async () => {
    const [
      profiles,
      scans,
      details,
    ] = await Promise.all([
      // -----------------------------
      // profiles
      // -----------------------------
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

      // -----------------------------
      // scan_history
      // -----------------------------
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

      // -----------------------------
      // scan_details
      // -----------------------------
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
    ]);

    // ==================================================
    // สร้าง Map เพื่อ Join ข้อมูลใน Front-End
    // ==================================================

    // profile.id -> profile
    const profileMap = new Map(
      profiles.map((profile) => [
        profile.id,
        profile,
      ])
    );

    // scan_history.id -> scan
    const scanMap = new Map(
      scans.map((scan) => [
        scan.id,
        scan,
      ])
    );

    // ==================================================
    // 1 แถว = กล้วย 1 ลูก
    // ==================================================

    const rows = details.map((detail) => {
      const scan =
        scanMap.get(detail.scan_id) || {};

      const profile = scan.user_id
        ? profileMap.get(scan.user_id) || {}
        : {};

      // AI Label
      const aiRawValue =
        detail.ripeness_th ||
        detail.ripeness_label ||
        "";

      // User Correction
      const userSelectedRaw =
        detail.user_selected_ripeness || "";

      const hasCorrection =
        Boolean(detail.user_selected_ripeness);

      return {
        // ==========================
        // Scan
        // ==========================

        scan_id:
          detail.scan_id || "",

        scan_created_at:
          scan.created_at || "",

        // ==========================
        // User
        // ==========================

        user_id:
          scan.user_id || "",

        user_email:
          profile.email || "",

        user_display_name:
          profile.display_name || "",

        user_role:
          profile.role || "",

        guest_id:
          scan.guest_id || "",

        // ==========================
        // Banana Detail
        // ==========================

        banana_detail_id:
          detail.id || "",

        banana_index:
          detail.banana_index ?? "",

        // ==========================
        // AI Prediction
        // ==========================

        ai_ripeness_label:
          detail.ripeness_label || "",

        ai_ripeness_th:
          detail.ripeness_th || "",

        ai_ripeness_display:
          toThaiRipeness(aiRawValue),

        confidence_raw:
          detail.confidence ?? "",

        confidence_percent:
          formatConfidencePercent(
            detail.confidence
          ),

        // ==========================
        // User Correction
        // ==========================

        user_selected_ripeness:
          userSelectedRaw,

        user_selected_ripeness_display:
          toThaiRipeness(userSelectedRaw),

        user_selected_color_level:
          detail.user_selected_color_level ||
          "",

        is_corrected:
          hasCorrection
            ? "true"
            : "false",

        feedback_updated_at:
          detail.feedback_updated_at || "",

        // ==========================
        // Scan Summary
        // ==========================

        total_bananas:
          scan.total_bananas ?? "",

        green_count:
          scan.green_count ?? "",

        breaker_count:
          scan.breaker_count ?? "",

        ripe_count:
          scan.ripe_count ?? "",

        overripe_count:
          scan.overripe_count ?? "",

        inference_ms:
          scan.inference_ms ?? "",

        // ==========================
        // Images
        // ==========================

        original_image_url:
          scan.original_image_url || "",

        result_image_url:
          scan.result_image_url || "",

        // ==========================
        // Detail Date
        // ==========================

        detail_created_at:
          detail.created_at || "",
      };
    });

    return {
      profiles,
      scans,
      details,
      rows,
    };
  };

  // ====================================================
  // PDF
  // ตอนนี้ยังคง PDF เดิมไว้
  // แต่ใช้ข้อมูลจริงจาก loadExportRows
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
        rows,
      } = await loadExportRows();

      if (rows.length === 0) {
        Alert.alert(
          "ยังไม่มีข้อมูล",
          "ยังไม่มี scan_details สำหรับส่งออก"
        );

        return;
      }

      // ป้องกัน PDF หนักเกินไป
      // แสดงตัวอย่าง 200 รายการล่าสุด
      const pdfRows = rows.slice(0, 200);

      const correctionCount =
        details.filter(
          (item) =>
            Boolean(
              item.user_selected_ripeness
            )
        ).length;

      const rowsHtml = pdfRows
        .map(
          (item) => `
            <tr>
              <td>
                ${escapeHtml(
                  formatThaiDate(
                    item.scan_created_at
                  )
                )}
              </td>

              <td>
                ${escapeHtml(
                  item.user_display_name || "-"
                )}
              </td>

              <td>
                ${escapeHtml(
                  item.user_email || "-"
                )}
              </td>

              <td>
                ${escapeHtml(
                  item.banana_index || "-"
                )}
              </td>

              <td>
                ${escapeHtml(
                  item.ai_ripeness_display || "-"
                )}
              </td>

              <td>
                ${escapeHtml(
                  item.confidence_percent || "-"
                )}
              </td>

              <td>
                ${escapeHtml(
                  item.user_selected_ripeness_display ||
                    "-"
                )}
              </td>

              <td>
                ${escapeHtml(
                  item.user_selected_color_level ||
                    "-"
                )}
              </td>
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
              body {
                font-family:
                  Helvetica,
                  Arial,
                  sans-serif;

                padding: 24px;

                color: #1e293b;
              }

              h1 {
                text-align: center;

                color: #0f172a;

                margin-bottom: 6px;
              }

              .subtitle {
                text-align: center;

                color: #64748b;

                margin-bottom: 24px;
              }

              .summary {
                display: flex;

                gap: 10px;

                margin-bottom: 20px;
              }

              .summary-card {
                flex: 1;

                border: 1px solid #e2e8f0;

                border-radius: 10px;

                padding: 12px;

                background: #f8fafc;
              }

              .summary-label {
                font-size: 11px;

                color: #64748b;
              }

              .summary-value {
                margin-top: 4px;

                font-size: 20px;

                font-weight: bold;

                color: #0f172a;
              }

              table {
                width: 100%;

                border-collapse: collapse;

                margin-top: 15px;
              }

              th {
                background-color: #f8fafc;

                padding: 7px;

                border: 1px solid #cbd5e1;

                font-size: 10px;
              }

              td {
                padding: 7px;

                border: 1px solid #e2e8f0;

                font-size: 9px;
              }

              .note {
                margin-top: 16px;

                color: #64748b;

                font-size: 10px;
              }
            </style>
          </head>

          <body>
            <h1>
              BananaVision
            </h1>

            <div class="subtitle">
              รายงานสรุปข้อมูลระบบ
              <br />
              วันที่ออกรายงาน:
              ${escapeHtml(reportDate)}
            </div>

            <div class="summary">

              <div class="summary-card">
                <div class="summary-label">
                  ผู้ใช้ทั้งหมด
                </div>

                <div class="summary-value">
                  ${profiles.length}
                </div>
              </div>

              <div class="summary-card">
                <div class="summary-label">
                  จำนวนครั้งที่ตรวจ
                </div>

                <div class="summary-value">
                  ${scans.length}
                </div>
              </div>

              <div class="summary-card">
                <div class="summary-label">
                  กล้วยรายลูก
                </div>

                <div class="summary-value">
                  ${details.length}
                </div>
              </div>

              <div class="summary-card">
                <div class="summary-label">
                  Label Correction
                </div>

                <div class="summary-value">
                  ${correctionCount}
                </div>
              </div>

            </div>

            <h2>
              รายละเอียดล่าสุด
            </h2>

            <table>
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>ผู้ใช้</th>
                  <th>อีเมล</th>
                  <th>ลูกที่</th>
                  <th>AI</th>
                  <th>Confidence</th>
                  <th>ผู้ใช้แก้เป็น</th>
                  <th>ระดับสี</th>
                </tr>
              </thead>

              <tbody>
                ${rowsHtml}
              </tbody>
            </table>

            <div class="note">
              หมายเหตุ:
              PDF แสดงรายละเอียดล่าสุดไม่เกิน
              200 รายการเพื่อป้องกันไฟล์มีขนาดใหญ่เกินไป
              ส่วน CSV จะส่งออกข้อมูลทั้งหมด
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
        dialogTitle:
          "ส่งออกรายงาน BananaVision",
      });
    } catch (error) {
      console.error(
        "[PDF EXPORT ERROR]",
        error
      );

      Alert.alert(
        "ส่งออก PDF ไม่สำเร็จ",
        error?.message ||
          "กรุณาลองใหม่"
      );
    } finally {
      setLoadingType(null);
    }
  };

  // ====================================================
  // CSV จริง
  // 1 แถว = กล้วย 1 ลูก
  // ====================================================

  const handleExportCSV = async () => {
    try {
      if (isLoading) {
        return;
      }

      setLoadingType("csv");

      const { rows } =
        await loadExportRows();

      if (rows.length === 0) {
        Alert.alert(
          "ยังไม่มีข้อมูล",
          "ยังไม่มี scan_details สำหรับส่งออก"
        );

        return;
      }

      // ==================================================
      // CSV HEADER
      // ==================================================

      const header = [
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

      // ==================================================
      // CSV ROWS
      // ==================================================

      const csvLines = [
        header
          .map(csvEscape)
          .join(","),

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

      // BOM ช่วยให้ Excel อ่านภาษาไทย
      const csvContent =
        "\uFEFF" +
        csvLines.join("\r\n");

      // ==================================================
      // FILE NAME
      // ==================================================

      const fileName =
        `BananaVision_Export_${createTimestamp()}.csv`;

      // ==================================================
      // CREATE FILE
      // ==================================================

      if (!FileSystem.documentDirectory) {
        throw new Error(
          "ไม่พบพื้นที่จัดเก็บไฟล์ของแอป"
        );
      }

      const fileUri =
        `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(
        fileUri,
        csvContent,
        {
          encoding:
            FileSystem.EncodingType.UTF8,
        }
      );

      // ==================================================
      // CHECK SHARING
      // ==================================================

      const sharingAvailable =
        await Sharing.isAvailableAsync();

      if (!sharingAvailable) {
        Alert.alert(
          "สร้าง CSV สำเร็จ",
          `สร้างไฟล์แล้ว:\n${fileName}\n\nแต่อุปกรณ์นี้ไม่รองรับ Share Sheet`
        );

        return;
      }

      // ==================================================
      // SHARE
      // ==================================================

      await Sharing.shareAsync(fileUri, {
        mimeType: "text/csv",

        dialogTitle:
          "ส่งออกฐานข้อมูล BananaVision",
      });
    } catch (error) {
      console.error(
        "[CSV EXPORT ERROR]",
        error
      );

      Alert.alert(
        "ส่งออก CSV ไม่สำเร็จ",
        error?.message ||
          "เกิดข้อผิดพลาด กรุณาลองใหม่"
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
      {/* Header Icon */}
      <View style={styles.centerIcon}>
        <View style={styles.iconCircle}>
          <Ionicons
            name="cloud-download"
            size={26}
            color="#ca8a04"
          />
        </View>

        <Text style={styles.title}>
          ศูนย์ส่งออกข้อมูล
        </Text>

        <Text style={styles.subtitle}>
          ส่งออกรายงานจาก profiles,
          scan_history และ scan_details
        </Text>
      </View>

      {/* Preview */}
      <View style={styles.previewCard}>
        <Text style={styles.previewTitle}>
          📋 ข้อมูลที่จะส่งออก
        </Text>

        <Text style={styles.previewItem}>
          • ผู้ใช้งานและอีเมลจาก profiles
        </Text>

        <Text style={styles.previewItem}>
          • ประวัติการตรวจจาก scan_history
        </Text>

        <Text style={styles.previewItem}>
          • ผลรายลูกและ Label Correction
          จาก scan_details
        </Text>

        <Text style={styles.previewItem}>
          • URL รูปต้นฉบับและรูปผลลัพธ์
        </Text>
      </View>

      {/* Buttons */}
      <View style={styles.btnLayout}>
        {/* PDF */}
        <TouchableOpacity
          style={[
            styles.actionBtn,
            styles.pdfButton,
            isLoading && styles.disabledButton,
          ]}
          onPress={handleExportPDF}
          activeOpacity={0.8}
          disabled={isLoading}
        >
          {loadingType === "pdf" ? (
            <>
              <ActivityIndicator
                size="small"
                color="#ffffff"
              />

              <Text style={styles.btnText}>
                กำลังสร้าง PDF...
              </Text>
            </>
          ) : (
            <>
              <Ionicons
                name="document-text-outline"
                size={18}
                color="#ffffff"
              />

              <Text style={styles.btnText}>
                ส่งออกเอกสาร PDF
              </Text>
            </>
          )}
        </TouchableOpacity>

        {/* CSV */}
        <TouchableOpacity
          style={[
            styles.actionBtn,
            styles.csvButton,
            isLoading && styles.disabledButton,
          ]}
          onPress={handleExportCSV}
          activeOpacity={0.8}
          disabled={isLoading}
        >
          {loadingType === "csv" ? (
            <>
              <ActivityIndicator
                size="small"
                color="#ffffff"
              />

              <Text style={styles.btnText}>
                กำลังสร้าง CSV...
              </Text>
            </>
          ) : (
            <>
              <Ionicons
                name="grid-outline"
                size={18}
                color="#ffffff"
              />

              <Text style={styles.btnText}>
                ส่งออกฐานข้อมูล CSV
              </Text>
            </>
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
    marginBottom: 30,
  },

  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  title: {
    fontSize: 20,
    fontWeight: "900",
    color: "#1e293b",
    marginTop: 16,
  },

  subtitle: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
    paddingHorizontal: 15,
    fontWeight: "700",
  },

  previewCard: {
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 16,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  previewTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#475569",
    marginBottom: 8,
  },

  previewItem: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 4,
    paddingLeft: 4,
    fontWeight: "700",
    lineHeight: 20,
  },

  btnLayout: {
    gap: 12,
  },

  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    minHeight: 50,
  },

  pdfButton: {
    backgroundColor: "#ef4444",
  },

  csvButton: {
    backgroundColor: "#16a34a",
  },

  disabledButton: {
    opacity: 0.6,
  },

  btnText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
});