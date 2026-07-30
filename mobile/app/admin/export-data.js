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

  /*
   * ป้องกัน Formula Injection
   * เมื่อเปิดไฟล์ CSV ด้วย Excel
   */
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
// GENERAL HELPERS
// ======================================================

function hasText(value) {
  return (
    value !== null &&
    value !== undefined &&
    String(value).trim() !== ""
  );
}

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

function getProfileName(profile) {
  if (!profile) {
    return "";
  }

  return (
    profile.display_name ||
    profile.email?.split("@")?.[0] ||
    ""
  );
}

// ======================================================
// RIPENESS HELPERS
// ======================================================

function normalizeRipeness(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();

  if (
    raw === "green" ||
    raw.includes("ดิบ")
  ) {
    return "green";
  }

  if (
    raw === "breaker" ||
    raw.includes("ห่าม")
  ) {
    return "breaker";
  }

  if (
    raw === "overripe" ||
    raw === "over-ripe" ||
    raw.includes("งอม")
  ) {
    return "overripe";
  }

  if (
    raw === "ripe" ||
    raw.includes("สุก")
  ) {
    return "ripe";
  }

  return raw;
}

function toThaiRipeness(value) {
  const normalized = normalizeRipeness(value);

  switch (normalized) {
    case "green":
      return "ดิบ";

    case "breaker":
      return "ห่าม";

    case "ripe":
      return "สุก";

    case "overripe":
      return "งอม";

    default:
      return value || "";
  }
}

function formatConfidencePercent(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "";
  }

  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return "";
  }

  const percent =
    numberValue <= 1
      ? numberValue * 100
      : numberValue;

  return `${Math.round(percent)}%`;
}

function getAiRipenessRaw(detail) {
  return (
    detail?.ripeness_th ||
    detail?.ripeness_label ||
    ""
  );
}

function getReviewStatus(detail) {
  /*
   * ผู้ใช้กดยืนยันว่า AI ทำนายถูกต้อง
   */
  if (detail?.is_ai_correct === true) {
    return "ยืนยันว่า AI ถูกต้อง";
  }

  /*
   * ผู้ใช้ระบุว่า AI ผิด
   * และเลือกระดับความสุกใหม่
   */
  if (
    detail?.is_ai_correct === false &&
    hasText(detail?.user_selected_ripeness)
  ) {
    return "แก้ไขผล AI";
  }

  /*
   * ผู้ใช้ระบุว่า AI ผิด
   * แต่ยังไม่มีค่าระดับใหม่
   */
  if (detail?.is_ai_correct === false) {
    return "ระบุว่า AI ไม่ถูกต้อง";
  }

  /*
   * รองรับข้อมูลเก่าที่มีค่าการแก้ไข
   * แต่ยังไม่มี is_ai_correct
   */
  if (hasText(detail?.user_selected_ripeness)) {
    return "แก้ไขระดับความสุก";
  }

  return "ยังไม่ได้ตรวจสอบ";
}

function getFinalRipenessRaw(detail) {
  const aiValue = getAiRipenessRaw(detail);

  /*
   * ผู้ใช้ยืนยันว่า AI ถูกต้อง
   * ผลสุดท้ายจึงเท่ากับผล AI
   */
  if (detail?.is_ai_correct === true) {
    return aiValue;
  }

  /*
   * ผู้ใช้เลือกผลใหม่
   * ผลสุดท้ายจึงเป็นค่าที่ผู้ใช้เลือก
   */
  if (hasText(detail?.user_selected_ripeness)) {
    return detail.user_selected_ripeness;
  }

  return "";
}

function getAiCorrectDisplay(value) {
  if (value === true) {
    return "ถูกต้อง";
  }

  if (value === false) {
    return "ไม่ถูกต้อง";
  }

  return "ไม่ได้ระบุ";
}

function getFeedbackCorrectDisplay(value) {
  if (value === true || value === "true") {
    return "ถูกต้อง";
  }

  if (value === false || value === "false") {
    return "ไม่ถูกต้อง";
  }

  return "ไม่ได้ระบุ";
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
  const [
    selectedTypes,
    setSelectedTypes,
  ] = useState({
    profiles: true,
    corrections: true,
    feedbacks: true,
  });

  const [
    loadingType,
    setLoadingType,
  ] = useState(null);

  const isLoading =
    loadingType !== null;

  const toggleSelectOption = (key) => {
    setSelectedTypes((previous) => ({
      ...previous,

      [key]: !previous[key],
    }));
  };

  const hasSelectedType =
    selectedTypes.profiles ||
    selectedTypes.corrections ||
    selectedTypes.feedbacks;

  // ====================================================
  // LOAD EXPORT DATA
  // ====================================================

  const loadExportRows = async () => {
    /*
     * profiles จำเป็นต่อการหาชื่อผู้ใช้
     * แม้ไม่ได้เลือกส่งออกตาราง Profiles โดยตรง
     */
    const shouldLoadProfiles =
      selectedTypes.profiles ||
      selectedTypes.corrections ||
      selectedTypes.feedbacks;

    const profilesPromise =
      shouldLoadProfiles
        ? fetchAllRows(
            "profiles",
            `
              id,
              email,
              display_name,
              role,
              created_at
            `
          )
        : Promise.resolve([]);

    const scansPromise =
      selectedTypes.corrections
        ? fetchAllRows(
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
          )
        : Promise.resolve([]);

    const detailsPromise =
      selectedTypes.corrections
        ? fetchAllRows(
            "scan_details",
            `
              id,
              scan_id,
              banana_index,
              ripeness_th,
              ripeness_label,
              confidence,
              is_ai_correct,
              user_selected_ripeness,
              user_selected_color_level,
              feedback_updated_at,
              created_at
            `
          )
        : Promise.resolve([]);

    const feedbacksPromise =
      selectedTypes.feedbacks
        ? fetchAllRows(
            "feedback",
            `
              id,
              user_id,
              scan_id,
              comment,
              rating,
              is_correct,
              created_at,
              updated_at
            `
          )
        : Promise.resolve([]);

    const [
      profiles,
      scans,
      details,
      feedbacks,
    ] = await Promise.all([
      profilesPromise,
      scansPromise,
      detailsPromise,
      feedbacksPromise,
    ]);

    const profileMap = new Map(
      (profiles || []).map((profile) => [
        String(profile.id),
        profile,
      ])
    );

    const scanMap = new Map(
      (scans || []).map((scan) => [
        String(scan.id),
        scan,
      ])
    );

    /*
     * เลือกทั้ง:
     * 1. รายการที่ผู้ใช้ยืนยันว่า AI ถูกต้อง
     * 2. รายการที่ผู้ใช้บอกว่า AI ผิด
     * 3. รายการที่ผู้ใช้เลือกระดับความสุกใหม่
     */
    const reviewedDetails = (details || []).filter(
      (detail) =>
        typeof detail.is_ai_correct === "boolean" ||
        hasText(detail.user_selected_ripeness)
    );

    const correctionRows =
      reviewedDetails.map((detail) => {
        const scan =
          scanMap.get(
            String(detail.scan_id)
          ) || {};

        const profile =
          scan.user_id
            ? profileMap.get(
                String(scan.user_id)
              ) || {}
            : {};

        const aiRawValue =
          getAiRipenessRaw(detail);

        const userSelectedRaw =
          detail.user_selected_ripeness || "";

        const finalRipenessRaw =
          getFinalRipenessRaw(detail);

        const userDisplayName =
          getProfileName(profile) ||
          (
            scan.guest_id
              ? `Guest (${String(scan.guest_id).slice(0, 8)})`
              : "ไม่พบชื่อผู้ใช้"
          );

        return {
          scan_id:
            detail.scan_id || "",

          scan_created_at:
            scan.created_at || "",

          user_id:
            scan.user_id || "",

          user_email:
            profile.email || "",

          user_display_name:
            userDisplayName,

          user_role:
            profile.role || "",

          guest_id:
            scan.guest_id || "",

          banana_detail_id:
            detail.id || "",

          banana_index:
            detail.banana_index ?? "",

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

          is_ai_correct:
            typeof detail.is_ai_correct ===
            "boolean"
              ? String(detail.is_ai_correct)
              : "",

          is_ai_correct_display:
            getAiCorrectDisplay(
              detail.is_ai_correct
            ),

          review_status:
            getReviewStatus(detail),

          user_selected_ripeness:
            userSelectedRaw,

          user_selected_ripeness_display:
            toThaiRipeness(
              userSelectedRaw
            ),

          user_selected_color_level:
            detail.user_selected_color_level ||
            "",

          final_ripeness:
            finalRipenessRaw,

          final_ripeness_display:
            toThaiRipeness(
              finalRipenessRaw
            ),

          is_confirmed:
            detail.is_ai_correct === true
              ? "true"
              : "false",

          is_corrected:
            hasText(
              detail.user_selected_ripeness
            )
              ? "true"
              : "false",

          feedback_updated_at:
            detail.feedback_updated_at || "",

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

          original_image_url:
            scan.original_image_url || "",

          result_image_url:
            scan.result_image_url || "",

          detail_created_at:
            detail.created_at || "",
        };
      });

    const feedbackRows =
      (feedbacks || []).map(
        (feedback) => {
          const profile =
            feedback.user_id
              ? profileMap.get(
                  String(feedback.user_id)
                ) || {}
              : {};

          const userDisplayName =
            getProfileName(profile) ||
            "ไม่พบชื่อผู้ใช้";

          return {
            feedback_id:
              feedback.id || "",

            user_id:
              feedback.user_id || "",

            user_email:
              profile.email || "",

            user_display_name:
              userDisplayName,

            scan_id:
              feedback.scan_id || "",

            comment:
              feedback.comment || "",

            rating:
              feedback.rating ?? "",

            is_correct:
              typeof feedback.is_correct ===
              "boolean"
                ? String(feedback.is_correct)
                : "",

            is_correct_display:
              getFeedbackCorrectDisplay(
                feedback.is_correct
              ),

            created_at:
              feedback.created_at || "",

            updated_at:
              feedback.updated_at || "",
          };
        }
      );

    return {
      profiles: profiles || [],
      scans: scans || [],
      details: details || [],
      feedbacks: feedbacks || [],

      correctionRows,
      feedbackRows,
    };
  };

  function hasExportData({
    profiles,
    correctionRows,
    feedbackRows,
  }) {
    if (
      selectedTypes.profiles &&
      profiles.length > 0
    ) {
      return true;
    }

    if (
      selectedTypes.corrections &&
      correctionRows.length > 0
    ) {
      return true;
    }

    if (
      selectedTypes.feedbacks &&
      feedbackRows.length > 0
    ) {
      return true;
    }

    return false;
  }

  // ====================================================
  // PDF EXPORT
  // ====================================================

  const handleExportPDF = async () => {
    try {
      if (isLoading) {
        return;
      }

      if (!hasSelectedType) {
        Alert.alert(
          "กรุณาเลือกข้อมูล",
          "โปรดเลือกอย่างน้อย 1 รายการที่ต้องการส่งออก"
        );

        return;
      }

      setLoadingType("pdf");

      const exportData =
        await loadExportRows();

      const {
        profiles,
        correctionRows,
        feedbackRows,
      } = exportData;

      if (!hasExportData(exportData)) {
        Alert.alert(
          "ยังไม่มีข้อมูล",
          "ไม่พบข้อมูลในตัวเลือกที่เลือกสำหรับส่งออก"
        );

        return;
      }

      /*
       * PDF จำกัด 100 แถวต่อหัวข้อ
       * เพื่อไม่ให้ไฟล์มีขนาดใหญ่เกินไป
       */
      const pdfProfiles =
        profiles.slice(0, 100);

      const pdfCorrections =
        correctionRows.slice(0, 100);

      const pdfFeedbacks =
        feedbackRows.slice(0, 100);

      // ----------------------------------------------
      // PROFILES HTML
      // ----------------------------------------------

      const profilesHtml =
        selectedTypes.profiles
          ? `
            <h2>
              บัญชีผู้ใช้งานระบบ
              (${profiles.length} รายการ)
            </h2>

            <table>
              <thead>
                <tr>
                  <th>วันที่ลงทะเบียน</th>
                  <th>ชื่อผู้ใช้</th>
                  <th>อีเมล</th>
                  <th>สิทธิ์</th>
                </tr>
              </thead>

              <tbody>
                ${
                  pdfProfiles.length > 0
                    ? pdfProfiles
                        .map(
                          (profile) => `
                            <tr>
                              <td>
                                ${escapeHtml(
                                  formatThaiDate(
                                    profile.created_at
                                  )
                                )}
                              </td>

                              <td>
                                ${escapeHtml(
                                  profile.display_name ||
                                  "-"
                                )}
                              </td>

                              <td>
                                ${escapeHtml(
                                  profile.email ||
                                  "-"
                                )}
                              </td>

                              <td>
                                ${escapeHtml(
                                  profile.role ||
                                  "-"
                                )}
                              </td>
                            </tr>
                          `
                        )
                        .join("")
                    : `
                      <tr>
                        <td
                          colspan="4"
                          class="empty-cell"
                        >
                          ไม่มีข้อมูลผู้ใช้งาน
                        </td>
                      </tr>
                    `
                }
              </tbody>
            </table>
          `
          : "";

      // ----------------------------------------------
      // USER AI REVIEW HTML
      // ----------------------------------------------

      const correctionsHtml =
        selectedTypes.corrections
          ? `
            <h2>
              ผลตรวจสอบจากผู้ใช้
              (${correctionRows.length} รายการ)
            </h2>

            <table>
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>Scan-ID</th>
                  <th>ผู้ใช้</th>
                  <th>ลูกที่</th>
                  <th>ผล AI</th>
                  <th>คะแนน</th>
                  <th>สถานะตรวจสอบ</th>
                  <th>ผลสุดท้าย</th>
                </tr>
              </thead>

              <tbody>
                ${
                  pdfCorrections.length > 0
                    ? pdfCorrections
                        .map(
                          (item) => `
                            <tr>
                              <td>
                                ${escapeHtml(
                                  formatThaiDate(
                                    item.feedback_updated_at ||
                                    item.scan_created_at
                                  )
                                )}
                              </td>

                              <td class="scan-id">
                                ${escapeHtml(
                                  item.scan_id ||
                                  "-"
                                )}
                              </td>

                              <td>
                                ${escapeHtml(
                                  item.user_display_name ||
                                  item.user_email ||
                                  "-"
                                )}
                              </td>

                              <td>
                                ${escapeHtml(
                                  item.banana_index ||
                                  "-"
                                )}
                              </td>

                              <td>
                                ${escapeHtml(
                                  item.ai_ripeness_display ||
                                  "-"
                                )}
                              </td>

                              <td>
                                ${escapeHtml(
                                  item.confidence_percent ||
                                  "-"
                                )}
                              </td>

                              <td>
                                ${escapeHtml(
                                  item.review_status ||
                                  "-"
                                )}
                              </td>

                              <td>
                                ${escapeHtml(
                                  item.final_ripeness_display ||
                                  "-"
                                )}
                              </td>
                            </tr>
                          `
                        )
                        .join("")
                    : `
                      <tr>
                        <td
                          colspan="8"
                          class="empty-cell"
                        >
                          ไม่มีผลตรวจสอบจากผู้ใช้
                        </td>
                      </tr>
                    `
                }
              </tbody>
            </table>
          `
          : "";

      // ----------------------------------------------
      // FEEDBACK HTML
      // ----------------------------------------------

      const feedbacksHtml =
        selectedTypes.feedbacks
          ? `
            <h2>
              ความคิดเห็นและฟีดแบ็กจากผู้ใช้งาน
              (${feedbackRows.length} รายการ)
            </h2>

            <table>
              <thead>
                <tr>
                  <th>วันที่</th>
                  <th>Scan-ID</th>
                  <th>ผู้ใช้งาน</th>
                  <th>คะแนน</th>
                  <th>ความถูกต้อง</th>
                  <th>ความคิดเห็น</th>
                </tr>
              </thead>

              <tbody>
                ${
                  pdfFeedbacks.length > 0
                    ? pdfFeedbacks
                        .map(
                          (feedback) => `
                            <tr>
                              <td>
                                ${escapeHtml(
                                  formatThaiDate(
                                    feedback.updated_at ||
                                    feedback.created_at
                                  )
                                )}
                              </td>

                              <td class="scan-id">
                                ${escapeHtml(
                                  feedback.scan_id ||
                                  "-"
                                )}
                              </td>

                              <td>
                                ${escapeHtml(
                                  feedback.user_display_name ||
                                  feedback.user_email ||
                                  "-"
                                )}
                              </td>

                              <td>
                                ${escapeHtml(
                                  feedback.rating ||
                                  "-"
                                )}
                                ดาว
                              </td>

                              <td>
                                ${escapeHtml(
                                  feedback.is_correct_display
                                )}
                              </td>

                              <td>
                                ${escapeHtml(
                                  feedback.comment ||
                                  "-"
                                )}
                              </td>
                            </tr>
                          `
                        )
                        .join("")
                    : `
                      <tr>
                        <td
                          colspan="6"
                          class="empty-cell"
                        >
                          ไม่มีความคิดเห็น
                        </td>
                      </tr>
                    `
                }
              </tbody>
            </table>
          `
          : "";

      const reportDate =
        new Date().toLocaleString(
          "th-TH",
          {
            dateStyle: "long",
            timeStyle: "short",
          }
        );

      const htmlContent = `
        <!DOCTYPE html>

        <html lang="th">
          <head>
            <meta charset="utf-8" />

            <meta
              name="viewport"
              content="width=device-width, initial-scale=1"
            />

            <style>
              * {
                box-sizing: border-box;
              }

              body {
                margin: 0;
                padding: 24px;
                font-family: Helvetica, Arial, sans-serif;
                color: #1e293b;
                background: #ffffff;
              }

              h1 {
                margin: 0;
                color: #0f172a;
                text-align: center;
                font-size: 25px;
              }

              .subtitle {
                margin-top: 7px;
                margin-bottom: 24px;
                color: #64748b;
                text-align: center;
                font-size: 12px;
                line-height: 18px;
              }

              .summary {
                display: flex;
                gap: 10px;
                margin-bottom: 20px;
              }

              .summary-card {
                flex: 1;
                padding: 12px;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                background: #f8fafc;
              }

              .summary-label {
                color: #64748b;
                font-size: 11px;
              }

              .summary-value {
                margin-top: 4px;
                color: #0f172a;
                font-size: 18px;
                font-weight: bold;
              }

              h2 {
                margin-top: 25px;
                margin-bottom: 8px;
                padding-bottom: 5px;
                border-bottom: 2px solid #e2e8f0;
                color: #0f172a;
                font-size: 15px;
              }

              table {
                width: 100%;
                margin-top: 7px;
                border-collapse: collapse;
                table-layout: fixed;
              }

              th {
                padding: 6px;
                border: 1px solid #cbd5e1;
                background: #f8fafc;
                color: #334155;
                text-align: left;
                font-size: 9px;
                word-break: break-word;
              }

              td {
                padding: 6px;
                border: 1px solid #e2e8f0;
                color: #334155;
                font-size: 8.5px;
                line-height: 12px;
                vertical-align: top;
                word-break: break-word;
                overflow-wrap: anywhere;
              }

              .scan-id {
                font-family: monospace;
                font-size: 7.5px;
              }

              .empty-cell {
                padding: 16px;
                color: #94a3b8;
                text-align: center;
              }

              .note {
                margin-top: 18px;
                color: #64748b;
                font-size: 9px;
                line-height: 14px;
              }
            </style>
          </head>

          <body>
            <h1>BananaVision</h1>

            <div class="subtitle">
              รายงานสรุปข้อมูลตามตัวเลือก<br />
              รวมการยืนยันว่า AI ถูกต้องและการแก้ไขผล AI<br />
              วันที่ออกรายงาน:
              ${escapeHtml(reportDate)}
            </div>

            <div class="summary">
              ${
                selectedTypes.profiles
                  ? `
                    <div class="summary-card">
                      <div class="summary-label">
                        บัญชีผู้ใช้
                      </div>

                      <div class="summary-value">
                        ${profiles.length}
                      </div>
                    </div>
                  `
                  : ""
              }

              ${
                selectedTypes.corrections
                  ? `
                    <div class="summary-card">
                      <div class="summary-label">
                        ผลตรวจสอบจากผู้ใช้
                      </div>

                      <div class="summary-value">
                        ${correctionRows.length}
                      </div>
                    </div>
                  `
                  : ""
              }

              ${
                selectedTypes.feedbacks
                  ? `
                    <div class="summary-card">
                      <div class="summary-label">
                        ความคิดเห็น
                      </div>

                      <div class="summary-value">
                        ${feedbackRows.length}
                      </div>
                    </div>
                  `
                  : ""
              }
            </div>

            ${profilesHtml}

            ${correctionsHtml}

            ${feedbacksHtml}

            <div class="note">
              หมายเหตุ:
              ตารางผลตรวจสอบจากผู้ใช้รวมทั้งรายการที่ผู้ใช้
              ยืนยันว่าผล AI ถูกต้อง และรายการที่ผู้ใช้
              แก้ไขระดับความสุกเป็นค่าใหม่

              ${
                profiles.length > 100 ||
                correctionRows.length > 100 ||
                feedbackRows.length > 100
                  ? "<br />เอกสาร PDF แสดงสูงสุด 100 รายการต่อหัวข้อ ส่วนไฟล์ CSV จะแสดงข้อมูลทั้งหมด"
                  : ""
              }
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
          "สร้างไฟล์ PDF แล้ว แต่อุปกรณ์นี้ไม่รองรับเมนูแชร์ไฟล์"
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
          "เกิดข้อผิดพลาด กรุณาลองใหม่"
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

      if (!hasSelectedType) {
        Alert.alert(
          "กรุณาเลือกข้อมูล",
          "โปรดเลือกอย่างน้อย 1 รายการที่ต้องการส่งออก"
        );

        return;
      }

      setLoadingType("csv");

      const exportData =
        await loadExportRows();

      const {
        profiles,
        correctionRows,
        feedbackRows,
      } = exportData;

      if (!hasExportData(exportData)) {
        Alert.alert(
          "ยังไม่มีข้อมูล",
          "ไม่พบข้อมูลในตัวเลือกที่เลือกสำหรับส่งออก"
        );

        return;
      }

      /*
       * ใส่ UTF-8 BOM เพื่อให้ Excel
       * แสดงภาษาไทยถูกต้อง
       */
      const csvSections = [
        "\uFEFF",
      ];

      // ----------------------------------------------
      // PROFILES CSV
      // ----------------------------------------------

      if (selectedTypes.profiles) {
        const profileHeader = [
          "user_id",
          "email",
          "display_name",
          "role",
          "created_at",
        ];

        const profileCsvLines = [
          profileHeader
            .map(csvEscape)
            .join(","),

          ...profiles.map((profile) =>
            [
              profile.id,
              profile.email,
              profile.display_name,
              profile.role,
              profile.created_at,
            ]
              .map(csvEscape)
              .join(",")
          ),
        ];

        csvSections.push(
          "=== USERS & PROFILES ===\r\n" +
            profileCsvLines.join("\r\n")
        );
      }

      // ----------------------------------------------
      // AI REVIEWS AND CORRECTIONS CSV
      // ----------------------------------------------

      if (selectedTypes.corrections) {
        const correctionHeader = [
          "scan_id",
          "scan_created_at",

          "user_id",
          "user_email",
          "user_display_name",
          "user_role",
          "guest_id",

          "banana_detail_id",
          "banana_index",

          "model_ripeness_label",
          "model_ripeness_th",
          "model_ripeness_display",

          "confidence_raw",
          "confidence_percent",

          "is_ai_correct",
          "is_ai_correct_display",
          "review_status",

          "user_selected_ripeness",
          "user_selected_ripeness_display",
          "user_selected_color_level",

          "final_ripeness",
          "final_ripeness_display",

          "is_confirmed",
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

        const correctionCsvLines = [
          correctionHeader
            .map(csvEscape)
            .join(","),

          ...correctionRows.map((row) =>
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

              row.is_ai_correct,
              row.is_ai_correct_display,
              row.review_status,

              row.user_selected_ripeness,
              row.user_selected_ripeness_display,
              row.user_selected_color_level,

              row.final_ripeness,
              row.final_ripeness_display,

              row.is_confirmed,
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

        if (csvSections.length > 1) {
          csvSections.push(
            "\r\n\r\n"
          );
        }

        csvSections.push(
          "=== USER AI REVIEWS AND CORRECTIONS ===\r\n" +
            correctionCsvLines.join(
              "\r\n"
            )
        );
      }

      // ----------------------------------------------
      // FEEDBACK CSV
      // ----------------------------------------------

      if (selectedTypes.feedbacks) {
        const feedbackHeader = [
          "feedback_id",
          "user_id",
          "user_email",
          "user_display_name",
          "scan_id",
          "comment",
          "rating",
          "is_correct",
          "is_correct_display",
          "created_at",
          "updated_at",
        ];

        const feedbackCsvLines = [
          feedbackHeader
            .map(csvEscape)
            .join(","),

          ...feedbackRows.map(
            (feedback) =>
              [
                feedback.feedback_id,
                feedback.user_id,
                feedback.user_email,
                feedback.user_display_name,
                feedback.scan_id,
                feedback.comment,
                feedback.rating,
                feedback.is_correct,
                feedback.is_correct_display,
                feedback.created_at,
                feedback.updated_at,
              ]
                .map(csvEscape)
                .join(",")
          ),
        ];

        if (csvSections.length > 1) {
          csvSections.push(
            "\r\n\r\n"
          );
        }

        csvSections.push(
          "=== USER COMMENTS & FEEDBACK ===\r\n" +
            feedbackCsvLines.join(
              "\r\n"
            )
        );
      }

      const combinedCsvContent =
        csvSections.join("");

      const fileName =
        `BananaVision_Export_` +
        `${createTimestamp()}.csv`;

      if (!FileSystem.documentDirectory) {
        throw new Error(
          "ไม่พบพื้นที่จัดเก็บไฟล์ของแอป"
        );
      }

      const fileUri =
        `${FileSystem.documentDirectory}` +
        `${fileName}`;

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

      await Sharing.shareAsync(
        fileUri,
        {
          mimeType:
            "text/csv",

          dialogTitle:
            "ส่งออกข้อมูล BananaVision",

          UTI:
            "public.comma-separated-values-text",
        }
      );
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
      {/* Header */}
      <View style={styles.centerIcon}>
        <View style={styles.iconCircle}>
          <Ionicons
            name="cloud-download-outline"
            size={27}
            color="#16A34A"
          />
        </View>

        <Text style={styles.title}>
          ศูนย์ส่งออกข้อมูล
        </Text>

        <Text style={styles.subtitle}>
          ส่งออกข้อมูลผู้ใช้ ผลตรวจสอบจากผู้ใช้
          และความคิดเห็น โดยรวมทั้งการยืนยันว่า
          AI ถูกต้องและการแก้ไขผล AI
        </Text>
      </View>

      {/* Options */}
      <View style={styles.optionsCard}>
        <Text
          style={
            styles.optionsHeaderLabel
          }
        >
          เลือกประเภทข้อมูลที่จะส่งออก
        </Text>

        {/* Profiles */}
        <TouchableOpacity
          style={styles.optionRow}
          activeOpacity={0.8}
          disabled={isLoading}
          onPress={() =>
            toggleSelectOption(
              "profiles"
            )
          }
        >
          <View style={styles.optionLeft}>
            <View
              style={[
                styles.checkboxBox,

                selectedTypes.profiles &&
                  styles.checkboxBoxChecked,
              ]}
            >
              {selectedTypes.profiles && (
                <Ionicons
                  name="checkmark"
                  size={13}
                  color="#FFFFFF"
                />
              )}
            </View>

            <View style={styles.optionTextBox}>
              <Text style={styles.optionText}>
                1. บัญชีผู้ใช้งาน
              </Text>

              <Text
                style={
                  styles.optionDescription
                }
              >
                ชื่อผู้ใช้ อีเมล สิทธิ์
                และวันที่สมัคร
              </Text>
            </View>
          </View>

          <Ionicons
            name="people-outline"
            size={18}
            color="#64748B"
          />
        </TouchableOpacity>

        {/* Corrections */}
        <TouchableOpacity
          style={styles.optionRow}
          activeOpacity={0.8}
          disabled={isLoading}
          onPress={() =>
            toggleSelectOption(
              "corrections"
            )
          }
        >
          <View style={styles.optionLeft}>
            <View
              style={[
                styles.checkboxBox,

                selectedTypes.corrections &&
                  styles.checkboxBoxChecked,
              ]}
            >
              {selectedTypes.corrections && (
                <Ionicons
                  name="checkmark"
                  size={13}
                  color="#FFFFFF"
                />
              )}
            </View>

            <View style={styles.optionTextBox}>
              <Text style={styles.optionText}>
                2. ผลตรวจสอบจากผู้ใช้
              </Text>

              <Text
                style={
                  styles.optionDescription
                }
              >
                รวมการยืนยันว่า AI ถูกต้อง
                และการแก้ไขระดับความสุก
              </Text>
            </View>
          </View>

          <Ionicons
            name="shield-checkmark-outline"
            size={18}
            color="#64748B"
          />
        </TouchableOpacity>

        {/* Feedback */}
        <TouchableOpacity
          style={[
            styles.optionRow,
            styles.lastOptionRow,
          ]}
          activeOpacity={0.8}
          disabled={isLoading}
          onPress={() =>
            toggleSelectOption(
              "feedbacks"
            )
          }
        >
          <View style={styles.optionLeft}>
            <View
              style={[
                styles.checkboxBox,

                selectedTypes.feedbacks &&
                  styles.checkboxBoxChecked,
              ]}
            >
              {selectedTypes.feedbacks && (
                <Ionicons
                  name="checkmark"
                  size={13}
                  color="#FFFFFF"
                />
              )}
            </View>

            <View style={styles.optionTextBox}>
              <Text style={styles.optionText}>
                3. ความคิดเห็นและรีวิว
              </Text>

              <Text
                style={
                  styles.optionDescription
                }
              >
                คะแนน ความถูกต้อง
                ความคิดเห็น และ Scan-ID
              </Text>
            </View>
          </View>

          <Ionicons
            name="chatbubbles-outline"
            size={18}
            color="#64748B"
          />
        </TouchableOpacity>
      </View>

      {/* Export Buttons */}
      <View style={styles.buttonLayout}>
        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.pdfButton,

            isLoading &&
              styles.disabledButton,
          ]}
          activeOpacity={0.85}
          disabled={isLoading}
          onPress={handleExportPDF}
        >
          {loadingType === "pdf" ? (
            <View style={styles.buttonInner}>
              <ActivityIndicator
                size="small"
                color="#FFFFFF"
              />

              <Text style={styles.buttonText}>
                กำลังสร้างเอกสาร PDF...
              </Text>
            </View>
          ) : (
            <View style={styles.buttonInner}>
              <Ionicons
                name="document-text-outline"
                size={20}
                color="#FFFFFF"
              />

              <Text style={styles.buttonText}>
                ส่งออกรายงานรูปแบบ PDF
              </Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.actionButton,
            styles.csvButton,

            isLoading &&
              styles.disabledButton,
          ]}
          activeOpacity={0.85}
          disabled={isLoading}
          onPress={handleExportCSV}
        >
          {loadingType === "csv" ? (
            <View style={styles.buttonInner}>
              <ActivityIndicator
                size="small"
                color="#FFFFFF"
              />

              <Text style={styles.buttonText}>
                กำลังสร้างไฟล์ CSV...
              </Text>
            </View>
          ) : (
            <View style={styles.buttonInner}>
              <Ionicons
                name="grid-outline"
                size={20}
                color="#FFFFFF"
              />

              <Text style={styles.buttonText}>
                ส่งออกฐานข้อมูลรูปแบบ CSV
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.noteBox}>
        <Ionicons
          name="information-circle-outline"
          size={17}
          color="#64748B"
        />

        <Text style={styles.noteText}>
          PDF แสดงสูงสุด 100 รายการต่อหัวข้อ
          ส่วน CSV จะส่งออกข้อมูลที่เลือกทั้งหมด
        </Text>
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
    paddingHorizontal: 20,
    paddingVertical: 24,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
  },

  centerIcon: {
    alignItems: "center",
    marginBottom: 22,
  },

  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 20,

    backgroundColor: "#FFFFFF",

    justifyContent: "center",
    alignItems: "center",

    borderWidth: 1,
    borderColor: "#E2E8F0",

    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.05,
    shadowRadius: 8,

    elevation: 2,
  },

  title: {
    marginTop: 12,

    color: "#0F172A",

    fontSize: 21,
    fontWeight: "900",
  },

  subtitle: {
    maxWidth: 340,
    marginTop: 5,
    paddingHorizontal: 8,

    color: "#64748B",

    fontSize: 12.5,
    lineHeight: 19,
    fontWeight: "600",
    textAlign: "center",
  },

  optionsCard: {
    marginBottom: 20,
    paddingHorizontal: 16,
    paddingVertical: 9,

    backgroundColor: "#FFFFFF",

    borderRadius: 21,
    borderWidth: 1,
    borderColor: "#E2E8F0",

    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.03,
    shadowRadius: 6,

    elevation: 2,
  },

  optionsHeaderLabel: {
    marginTop: 7,
    marginBottom: 7,

    color: "#1E293B",

    fontSize: 13.5,
    fontWeight: "900",
  },

  optionRow: {
    minHeight: 66,

    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",

    paddingVertical: 10,

    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },

  lastOptionRow: {
    borderBottomWidth: 0,
  },

  optionLeft: {
    flex: 1,

    flexDirection: "row",
    alignItems: "center",

    marginRight: 10,
    gap: 11,
  },

  optionTextBox: {
    flex: 1,
  },

  checkboxBox: {
    width: 21,
    height: 21,

    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#CBD5E1",

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: "#FFFFFF",
  },

  checkboxBoxChecked: {
    backgroundColor: "#16A34A",
    borderColor: "#16A34A",
  },

  optionText: {
    color: "#334155",

    fontSize: 13,
    fontWeight: "800",
  },

  optionDescription: {
    marginTop: 2,

    color: "#94A3B8",

    fontSize: 10.5,
    lineHeight: 15,
    fontWeight: "600",
  },

  buttonLayout: {
    gap: 12,
  },

  actionButton: {
    minHeight: 53,

    borderRadius: 17,

    justifyContent: "center",
    alignItems: "center",

    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.1,
    shadowRadius: 5,

    elevation: 2,
  },

  pdfButton: {
    backgroundColor: "#DC2626",
    shadowColor: "#DC2626",
  },

  csvButton: {
    backgroundColor: "#16A34A",
    shadowColor: "#16A34A",
  },

  disabledButton: {
    opacity: 0.58,
  },

  buttonInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",

    gap: 9,
    paddingHorizontal: 12,
  },

  buttonText: {
    color: "#FFFFFF",

    fontSize: 13.5,
    fontWeight: "900",
    textAlign: "center",
  },

  noteBox: {
    marginTop: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,

    flexDirection: "row",
    alignItems: "flex-start",

    gap: 7,

    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#E2E8F0",

    backgroundColor: "#F1F5F9",
  },

  noteText: {
    flex: 1,

    color: "#64748B",

    fontSize: 10.5,
    lineHeight: 16,
    fontWeight: "600",
  },
});