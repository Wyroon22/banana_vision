import React, { useState } from 'react';
import { router } from "expo-router";
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
} from 'react-native';

// [STEP 3.5] import Supabase client ที่สร้างไว้ใน mobile/lib/supabase.js
import { supabase } from "../lib/supabase";

const COLORS = {
  bg: '#FBF7E3',
  bg_white: '#FFFFFF',
  primary: '#4A3B32',
  text_dark: '#000000',
  text_gray: '#757575',
  border: '#EFECE0',
  red: '#E53935',
  green: '#27AE60',
};

const backIcon = require('../assets/auth/back.png');

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');

  // [STEP 3.5] เพิ่ม loading กันกดส่งซ้ำ
  const [loading, setLoading] = useState(false);

  // [AUTH BACK] ปุ่มย้อนกลับ
  const handleBack = () => {
    if (router.canGoBack && router.canGoBack()) {
      router.back();
    } else {
      router.replace("/login");
    }
  };

  // [STEP 3.5] ส่งอีเมล reset password จริงผ่าน Supabase
  const handleResetPassword = async () => {
    if (!email.trim()) {
      Alert.alert("แจ้งเตือน", "กรุณากรอกอีเมล");
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    const emailRegex = /\S+@\S+\.\S+/;
    if (!emailRegex.test(cleanEmail)) {
      Alert.alert("ข้อผิดพลาด", "รูปแบบอีเมลไม่ถูกต้อง");
      return;
    }

    try {
      setLoading(true);

      // [STEP 3.5] ส่ง reset password email
      // ตอนนี้ยังไม่ทำ deep link / reset screen ในแอป
      // ถ้ากดลิงก์ในเมลแล้วไป localhost ถือว่ายังไม่พัง เป็นเรื่อง redirect URL ของ Supabase
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);

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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.7}
            onPress={handleBack}
          >
            <Image source={backIcon} style={styles.backIconStyle} />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>FORGOT PASSWORD</Text>
        </View>

        <View style={styles.contentView}>
          <ScrollView
            style={{ width: '100%' }}
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
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType="done"
                  onSubmitEditing={handleResetPassword}
                />
              </View>
            </View>

            <View style={{ alignItems: 'center', marginTop: 30 }}>
              <TouchableOpacity
                // [STEP 3.5] ถ้า loading อยู่ ปิดปุ่มชั่วคราว
                style={[
                  styles.sendButton,
                  loading && styles.disabledButton,
                ]}
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
    flexDirection: 'row',
    alignItems: 'center',
    height: 60,
    marginTop: Platform.OS === 'ios' ? 5 : 10,
    paddingHorizontal: 20,
    marginBottom: 15,
  },

  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
    marginLeft: -10,
  },

  backIconStyle: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
    tintColor: COLORS.primary,
  },

  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
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
    fontWeight: '600',
    lineHeight: 24,
    marginBottom: 28,
  },

  inputGroup: {
    width: '100%',
    marginBottom: 18,
  },

  inputLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 8,
    marginLeft: 5,
  },

  inputFieldContainer: {
    width: '100%',
    height: 55,
    backgroundColor: COLORS.bg_white,
    borderRadius: 15,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  inputText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text_dark,
    fontWeight: 'bold',
  },

  sendButton: {
    width: '80%',
    height: 50,
    backgroundColor: COLORS.green,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
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

  // [STEP 3.5] style ปุ่มตอนกำลังส่งอีเมล
  disabledButton: {
    opacity: 0.6,
  },

  sendButtonText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.bg_white,
  },

  backToLoginBtn: {
    marginTop: 28,
    alignItems: 'center',
  },

  backToLoginText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text_dark,
  },
});