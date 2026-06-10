import React, { useState } from "react";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  Alert,
  StatusBar,
  KeyboardAvoidingView,
  ScrollView,
  Image,
} from "react-native";

import { supabase } from "../lib/supabase";

const COLORS = {
  bg: "#FBF7E3",
  bg_white: "#FFFFFF",
  primary: "#4A3B32",
  text_dark: "#000000",
  text_gray: "#757575",
  border: "#EFECE0",
  red: "#E53935",
  green: "#27AE60",
};

const backIcon = require("../assets/auth/back.png");

/**
 * [RESET PASSWORD DEV URL]
 * ใช้ URL จาก Terminal ตอน npm start
 *
 * ตอนนี้ Terminal ต้นขึ้นว่า:
 * exp://172.20.10.2:8081/--/reset-password
 *
 * ถ้าเปิด Expo ใหม่แล้ว IP เปลี่ยน เช่น 172.20.10.5
 * ให้แก้บรรทัดนี้ตาม Terminal ใหม่
 */
const DEV_RESET_REDIRECT_URL = "exp://172.20.10.2:8081/--/reset-password";

const getResetRedirectUrl = () => {
  /**
   * ตอนพัฒนาใน Expo Go ใช้ URL แบบ fix ไปเลย
   * เพื่อตัดปัญหา Linking.createURL สร้าง URL ไม่ตรงกับ Supabase Redirect URLs
   */
  if (__DEV__) {
    return DEV_RESET_REDIRECT_URL;
  }

  /**
   * ตอน build จริงค่อยให้ Expo สร้าง URL เอง
   */
  return Linking.createURL("/reset-password");
};

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleBack = () => {
    if (router.canGoBack && router.canGoBack()) {
      router.back();
    } else {
      router.replace("/login");
    }
  };

  const handleResetPassword = async () => {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      Alert.alert("แจ้งเตือน", "กรุณากรอกอีเมล");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(cleanEmail)) {
      Alert.alert("ข้อผิดพลาด", "รูปแบบอีเมลไม่ถูกต้อง");
      return;
    }

    try {
      setLoading(true);

      const redirectTo = getResetRedirectUrl();

      console.log("====================================");
      console.log("RESET EMAIL:", cleanEmail);
      console.log("RESET REDIRECT URL:", redirectTo);
      console.log("====================================");

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo,
      });

      if (error) {
        throw error;
      }

      Alert.alert(
        "ส่งอีเมลแล้ว",
        `กรุณาตรวจสอบอีเมล ${cleanEmail}\nเพื่อรีเซ็ตรหัสผ่าน`,
        [
          {
            text: "ตกลง",
            onPress: () => router.replace("/login"),
          },
        ]
      );
    } catch (err) {
      console.log("RESET PASSWORD ERROR:", err);

      Alert.alert(
        "ส่งอีเมลไม่สำเร็จ",
        err?.message || "เกิดข้อผิดพลาดระหว่างส่งอีเมลรีเซ็ตรหัสผ่าน"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.7}
            onPress={handleBack}
            disabled={loading}
          >
            <Image source={backIcon} style={styles.backIconStyle} />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>FORGOT PASSWORD</Text>
        </View>

        <View style={styles.contentView}>
          <ScrollView
            style={{ width: "100%" }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 40, paddingTop: 20 }}
          >
            <Text style={styles.description}>
              กรอกอีเมลที่ใช้สมัครสมาชิก แล้วระบบจะส่งลิงก์สำหรับรีเซ็ตรหัสผ่านให้
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>EMAIL</Text>

              <View style={styles.inputFieldContainer}>
                <TextInput
                  style={styles.inputText}
                  placeholder="EXAMPLE@EMAIL.COM"
                  placeholderTextColor="#BCBCBC"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType="done"
                  editable={!loading}
                  onSubmitEditing={handleResetPassword}
                />
              </View>
            </View>

            <View style={{ alignItems: "center", marginTop: 30 }}>
              <TouchableOpacity
                style={[styles.sendButton, loading && styles.disabledButton]}
                onPress={handleResetPassword}
                activeOpacity={0.9}
                disabled={loading}
              >
                <Text style={styles.sendButtonText}>
                  {loading ? "SENDING..." : "SEND RESET EMAIL"}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.backToLoginBtn}
              onPress={() => router.replace("/login")}
              disabled={loading}
            >
              <Text style={styles.backToLoginText}>BACK TO LOGIN</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 60,
    marginTop: Platform.OS === "ios" ? 5 : 10,
    paddingHorizontal: 20,
    marginBottom: 15,
  },

  backButton: {
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 4,
    marginLeft: -10,
  },

  backIconStyle: {
    width: 24,
    height: 24,
    resizeMode: "contain",
    tintColor: COLORS.primary,
  },

  headerTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.primary,
    letterSpacing: 0.5,
  },

  contentView: {
    backgroundColor: COLORS.bg_white,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    flex: 1,
    paddingHorizontal: 40,
    paddingTop: 35,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.primary,
        shadowOffset: { width: 0, height: -10 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
      },
      android: {
        elevation: 8,
      },
    }),
  },

  description: {
    fontSize: 15,
    color: COLORS.text_gray,
    fontWeight: "600",
    lineHeight: 24,
    marginBottom: 28,
  },

  inputGroup: {
    width: "100%",
    marginBottom: 18,
  },

  inputLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.primary,
    marginBottom: 8,
    marginLeft: 5,
  },

  inputFieldContainer: {
    width: "100%",
    height: 55,
    backgroundColor: COLORS.bg_white,
    borderRadius: 15,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },

  inputText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text_dark,
    fontWeight: "bold",
  },

  sendButton: {
    width: "80%",
    height: 50,
    backgroundColor: COLORS.green,
    borderRadius: 25,
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: COLORS.green,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 5,
      },
    }),
  },

  disabledButton: {
    opacity: 0.6,
  },

  sendButtonText: {
    fontSize: 15,
    fontWeight: "bold",
    color: COLORS.bg_white,
  },

  backToLoginBtn: {
    marginTop: 28,
    alignItems: "center",
  },

  backToLoginText: {
    fontSize: 14,
    fontWeight: "bold",
    color: COLORS.text_dark,
  },
});