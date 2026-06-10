import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Linking from "expo-linking";
import { router } from "expo-router";

import { supabase } from "../lib/supabase";

const COLORS = {
  bg: "#FBF7E3",
  white: "#FFFFFF",
  primary: "#4A3B32",
  green: "#27AE60",
  red: "#E53935",
  gray: "#757575",
  border: "#EFECE0",
};

export default function ResetPasswordScreen() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [secureText, setSecureText] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [statusText, setStatusText] = useState(
    "กำลังตรวจสอบลิงก์รีเซ็ตรหัสผ่าน..."
  );

  // ใช้กันไม่ให้ verify token ซ้ำ
  const handledSuccessRef = useRef(false);
  const verifyingRef = useRef(false);
  const processedTokenRef = useRef("");

  const getSingleParam = (value) => {
    if (Array.isArray(value)) {
      return value[0];
    }

    if (value === undefined || value === null) {
      return "";
    }

    return String(value);
  };

  const parseParamsFromUrl = useCallback((url) => {
    const params = {};

    const queryPart = url.includes("?")
      ? url.split("?")[1]?.split("#")[0]
      : "";

    const hashPart = url.includes("#") ? url.split("#")[1] : "";

    const collectParams = (part) => {
      if (!part) return;

      part.split("&").forEach((item) => {
        if (!item) return;

        const equalIndex = item.indexOf("=");

        const rawKey =
          equalIndex >= 0 ? item.slice(0, equalIndex) : item;

        const rawValue =
          equalIndex >= 0 ? item.slice(equalIndex + 1) : "";

        if (!rawKey) return;

        const key = decodeURIComponent(rawKey);
        const value = decodeURIComponent(rawValue || "");

        params[key] = value;
      });
    };

    collectParams(queryPart);
    collectParams(hashPart);

    return params;
  }, []);

  const markSessionReady = useCallback(() => {
    handledSuccessRef.current = true;
    verifyingRef.current = false;

    setSessionReady(true);
    setStatusText("ลิงก์พร้อมใช้งาน ตั้งรหัสผ่านใหม่ได้เลย");
  }, []);

  const handleResetParams = useCallback(
    async (rawParams, source = "unknown") => {
      try {
        if (handledSuccessRef.current) {
          console.log("[reset-password] already success, skip");
          return;
        }

        console.log(`[reset-password] source: ${source}`);
        console.log("[reset-password] raw params:", rawParams);

        const params = {
          token: getSingleParam(rawParams?.token),
          token_hash: getSingleParam(rawParams?.token_hash),
          type: getSingleParam(rawParams?.type),
          code: getSingleParam(rawParams?.code),
          access_token: getSingleParam(rawParams?.access_token),
          refresh_token: getSingleParam(rawParams?.refresh_token),
          error: getSingleParam(rawParams?.error),
          error_description: getSingleParam(rawParams?.error_description),
        };

        console.log("[reset-password] normalized params:", params);

        if (params.error || params.error_description) {
          throw new Error(params.error_description || params.error);
        }

        const tokenHash = params.token_hash || params.token;
        const code = params.code;
        const accessToken = params.access_token;
        const refreshToken = params.refresh_token;

        /**
         * ถ้า URL ไม่มี token/code เลย
         * แปลว่าเปิดหน้า reset-password ตรง ๆ หรือ Expo เปิด root url
         */
        if (!tokenHash && !code && !(accessToken && refreshToken)) {
          const { data } = await supabase.auth.getSession();

          if (data?.session) {
            markSessionReady();
            return;
          }

          setSessionReady(false);
          setStatusText(
            "ยังไม่พบ session จากลิงก์ กรุณาเปิดจากอีเมล reset password ใหม่"
          );
          return;
        }

        /**
         * Flow หลักของเรา:
         * Backend bridge ส่ง token_hash เข้า Expo Go
         */
        if (tokenHash) {
          if (processedTokenRef.current === tokenHash) {
            console.log("[reset-password] duplicated token_hash, skip");
            return;
          }

          if (verifyingRef.current) {
            console.log("[reset-password] verifying in progress, skip");
            return;
          }

          processedTokenRef.current = tokenHash;
          verifyingRef.current = true;

          console.log("[reset-password] using token_hash recovery flow");

          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });

          if (error) {
            verifyingRef.current = false;
            throw error;
          }

          if (data?.session) {
            markSessionReady();
            return;
          }

          const { data: sessionData } = await supabase.auth.getSession();

          if (sessionData?.session) {
            markSessionReady();
            return;
          }

          verifyingRef.current = false;

          throw new Error(
            "ยืนยัน token สำเร็จ แต่ยังไม่พบ session กรุณาขอ reset password ใหม่"
          );
        }

        /**
         * เผื่อบาง flow ส่ง code กลับมาแทน token_hash
         */
        if (code) {
          if (processedTokenRef.current === code) {
            console.log("[reset-password] duplicated code, skip");
            return;
          }

          if (verifyingRef.current) {
            console.log("[reset-password] verifying in progress, skip");
            return;
          }

          processedTokenRef.current = code;
          verifyingRef.current = true;

          console.log("[reset-password] using code exchange flow");

          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            verifyingRef.current = false;
            throw error;
          }

          markSessionReady();
          return;
        }

        /**
         * เผื่อบาง flow ส่ง access_token + refresh_token มาใน hash
         */
        if (accessToken && refreshToken) {
          if (verifyingRef.current) {
            console.log("[reset-password] verifying in progress, skip");
            return;
          }

          verifyingRef.current = true;

          console.log("[reset-password] using access_token flow");

          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            verifyingRef.current = false;
            throw error;
          }

          markSessionReady();
          return;
        }
      } catch (err) {
        console.log("[reset-password] handle params error:", err);

        verifyingRef.current = false;

        // ถ้าสำเร็จไปแล้ว ไม่ให้ error รอบหลังมาทับหน้าเขียว
        if (handledSuccessRef.current) {
          return;
        }

        setSessionReady(false);
        setStatusText(
          err?.message || "ลิงก์รีเซ็ตรหัสผ่านไม่ถูกต้องหรือหมดอายุ"
        );
      }
    },
    [markSessionReady]
  );

  const handleResetUrl = useCallback(
    async (url) => {
      console.log("[reset-password] incoming url:", url);

      const params = parseParamsFromUrl(url);

      console.log("[reset-password] params from url:", params);

      await handleResetParams(params, "Linking URL");
    },
    [handleResetParams, parseParamsFromUrl]
  );

  useEffect(() => {
    let mounted = true;

    const loadInitialUrl = async () => {
      const url = await Linking.getInitialURL();

      if (mounted && url) {
        await handleResetUrl(url);
      }
    };

    loadInitialUrl();

    const subscription = Linking.addEventListener("url", ({ url }) => {
      handleResetUrl(url);
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, [handleResetUrl]);

  const handleUpdatePassword = async () => {
    if (!newPassword.trim() || !confirmPassword.trim()) {
      Alert.alert("แจ้งเตือน", "กรุณากรอกรหัสผ่านใหม่ให้ครบ");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert("แจ้งเตือน", "รหัสผ่านควรมีอย่างน้อย 6 ตัวอักษร");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("แจ้งเตือน", "รหัสผ่านทั้งสองช่องไม่ตรงกัน");
      return;
    }

    try {
      setLoading(true);

      const { data } = await supabase.auth.getSession();

      if (!data?.session) {
        throw new Error(
          "ลิงก์รีเซ็ตยังไม่พร้อม กรุณากดลิงก์จากอีเมลใหม่อีกครั้ง"
        );
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        throw error;
      }

      Alert.alert(
        "เปลี่ยนรหัสผ่านสำเร็จ",
        "กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่",
        [
          {
            text: "ไปหน้า Login",
            onPress: async () => {
              await supabase.auth.signOut();
              router.replace("/login");
            },
          },
        ]
      );
    } catch (err) {
      Alert.alert(
        "เปลี่ยนรหัสผ่านไม่สำเร็จ",
        err?.message || "เกิดข้อผิดพลาด"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.backButtonPressed,
            ]}
            onPress={() => router.replace("/login")}
          >
            <Text style={styles.backText}>‹</Text>
          </Pressable>

          <Text style={styles.title}>RESET PASSWORD</Text>

          <View style={styles.card}>
            <Text style={styles.description}>
              ตั้งรหัสผ่านใหม่สำหรับบัญชีของคุณ
            </Text>

            <View
              style={[
                styles.statusBox,
                sessionReady ? styles.statusReady : styles.statusWarning,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  sessionReady
                    ? styles.statusReadyText
                    : styles.statusWarningText,
                ]}
              >
                {sessionReady ? "✅ " : "⚠️ "}
                {statusText}
              </Text>
            </View>

            <Text style={styles.label}>NEW PASSWORD</Text>
            <View style={styles.inputBox}>
              <TextInput
                style={styles.input}
                placeholder="NEW PASSWORD"
                placeholderTextColor={COLORS.gray}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={secureText}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <Text style={styles.label}>CONFIRM PASSWORD</Text>
            <View style={styles.inputBox}>
              <TextInput
                style={styles.input}
                placeholder="CONFIRM PASSWORD"
                placeholderTextColor={COLORS.gray}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={secureText}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <Pressable
              style={styles.showButton}
              onPress={() => setSecureText((v) => !v)}
            >
              <Text style={styles.showText}>
                {secureText ? "แสดงรหัสผ่าน" : "ซ่อนรหัสผ่าน"}
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.submitButton,
                (!sessionReady || loading) && styles.submitDisabled,
              ]}
              onPress={handleUpdatePassword}
              disabled={!sessionReady || loading}
            >
              <Text style={styles.submitText}>
                {loading ? "กำลังเปลี่ยนรหัส..." : "UPDATE PASSWORD"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },

  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: Platform.OS === "ios" ? 44 : 52,
    paddingBottom: 60,
  },

  backButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.white,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 34,
    alignSelf: "flex-start",

    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  },

  backButtonPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.96 }],
  },

  backText: {
    fontSize: 52,
    color: COLORS.primary,
    lineHeight: 52,
    marginTop: -4,
    marginLeft: -2,
  },

  title: {
    fontSize: 34,
    fontWeight: "900",
    color: COLORS.primary,
    marginBottom: 28,
  },

  card: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    borderRadius: 28,
    padding: 26,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  description: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.gray,
    lineHeight: 28,
    marginBottom: 18,
  },

  statusBox: {
    borderRadius: 16,
    padding: 14,
    marginBottom: 22,
    borderWidth: 1,
  },

  statusReady: {
    backgroundColor: "#DCFCE7",
    borderColor: "#22C55E",
  },

  statusWarning: {
    backgroundColor: "#FFF7ED",
    borderColor: "#FDBA74",
  },

  statusText: {
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 22,
  },

  statusReadyText: {
    color: "#166534",
  },

  statusWarningText: {
    color: "#9A3412",
  },

  label: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.primary,
    marginBottom: 10,
    marginTop: 10,
  },

  inputBox: {
    height: 58,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    justifyContent: "center",
    marginBottom: 12,
  },

  input: {
    fontSize: 17,
    fontWeight: "800",
    color: "#000",
  },

  showButton: {
    alignSelf: "flex-end",
    marginTop: 4,
    marginBottom: 24,
  },

  showText: {
    color: COLORS.red,
    fontWeight: "900",
  },

  submitButton: {
    height: 58,
    borderRadius: 999,
    backgroundColor: COLORS.green,
    justifyContent: "center",
    alignItems: "center",
  },

  submitDisabled: {
    opacity: 0.55,
  },

  submitText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "900",
  },
});