import React, { useState, useRef } from 'react';
import { router } from "expo-router";
import {
  StyleSheet,
  Text,
  View,
  Image,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
  StatusBar
} from 'react-native';

// [STEP 3.4] import Supabase client ที่สร้างไว้ใน mobile/lib/supabase.js
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

const logoImg = require('../assets/auth/vision logo.png');
const eyeIcon = require('../assets/auth/eye.png');

// [AUTH BACK] เพิ่มไอคอนย้อนกลับ เพราะปิด header ของ Expo Router แล้ว
const backIcon = require('../assets/auth/back.png');

export default function LoginScreen() {
  // [STEP 3.4] เปลี่ยนจาก username เป็น email
  // เพราะ Supabase Auth ใช้ email + password เป็นหลัก
  const [email, setEmail] = useState('');

  const [password, setPassword] = useState('');
  const [secureText, setSecureText] = useState(true);

  // [STEP 3.4] เพิ่ม loading กันกด Login ซ้ำ
  const [loading, setLoading] = useState(false);

  const passwordRef = useRef();

  // [AUTH BACK] ฟังก์ชันย้อนกลับ
  // ถ้ามีหน้าก่อนหน้าให้ย้อนกลับ ถ้าไม่มีให้กลับหน้า Home
  const handleBack = () => {
    if (router.canGoBack && router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  //login 
  const handleLogin = async () => {
  if (!email.trim() || !password.trim()) {
    Alert.alert("แจ้งเตือน", "กรุณากรอก Email และ Password");
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

    // Login เข้า Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      throw error;
    }

    const userId = data?.user?.id;

    if (!userId) {
      throw new Error("ไม่พบข้อมูลผู้ใช้");
    }

    // ดึง role จากตาราง profiles
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    const role = profile?.role || "member";

    if (role === "admin") {
      Alert.alert(
        "เข้าสู่ระบบสำเร็จ",
        "ยินดีต้อนรับ Admin",
        [
          {
            text: "ตกลง",
            onPress: () => router.replace("/admin"),
          },
        ]
      );
    } else {
      Alert.alert(
        "เข้าสู่ระบบสำเร็จ",
        `ยินดีต้อนรับ\n${data.user.email}`,
        [
          {
            text: "ตกลง",
            onPress: () => router.replace("/"),
          },
        ]
      );
    }
  } catch (err) {
    Alert.alert(
      "เข้าสู่ระบบไม่สำเร็จ",
      err?.message || "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
    );
  } finally {
    setLoading(false);
  }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* [AUTH BACK] ปุ่มย้อนกลับแบบลอยมุมซ้ายบน */}
      <TouchableOpacity
        style={styles.backButton}
        activeOpacity={0.7}
        onPress={handleBack}
      >
        <Image source={backIcon} style={styles.backIconStyle} />
      </TouchableOpacity>

      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoContainer}>
            <Image source={logoImg} style={styles.logoImage} resizeMode="contain" />
          </View>

          <View style={styles.inputSection}>
            {/* [STEP 3.4] เปลี่ยนจาก USERNAME เป็น EMAIL */}
            <Text style={styles.inputLabel}>EMAIL</Text>

            <View style={styles.inputFieldContainer}>
              <TextInput
                style={styles.inputText}
                placeholder="YOUR EMAIL"
                placeholderTextColor={COLORS.text_gray}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                blurOnSubmit={false}
              />
            </View>

            <Text style={styles.inputLabel}>PASSWORD</Text>

            <View style={styles.inputFieldContainer}>
              <TextInput
                ref={passwordRef}
                style={styles.inputText}
                placeholder="YOUR PASSWORD"
                placeholderTextColor={COLORS.text_gray}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={secureText}
                autoCapitalize="none"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={handleLogin}
              />

              <TouchableOpacity
                style={styles.passwordIcon}
                onPress={() => setSecureText(!secureText)}
              >
                <Image
                  source={eyeIcon}
                  style={[
                    styles.eyeImage,
                    { opacity: secureText ? 0.5 : 1 }
                  ]}
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.forgotBtn}
            onPress={() => router.push("/forgot-password")}
          >
            <Text style={styles.forgotText}>FORGOT YOUR PASSWORD?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.loginBtn,

              // [STEP 3.4] ตอนกำลัง Login ให้ปุ่มจางลง
              loading && styles.disabledButton,
            ]}
            onPress={handleLogin}
            activeOpacity={0.8}
            disabled={loading}
          >
            <Text style={styles.loginBtnText}>
              {loading ? "LOGGING IN..." : "LOGIN"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.createBtn}
            onPress={() => router.push("/register")}
          >
            <Text style={styles.createBtnText}>CREATE AN ACCOUNT</Text>
          </TouchableOpacity>
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

  // [AUTH BACK] ปุ่มย้อนกลับแบบลอย
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 34,
    left: 22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.bg_white,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },

  // [AUTH BACK] ขนาดไอคอนย้อนกลับ
  backIconStyle: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
    tintColor: COLORS.primary,
  },

  scrollContent: {
    padding: 40,
    flexGrow: 1,
    justifyContent: 'center',
  },

  logoContainer: {
    alignItems: 'center',
    marginBottom: 50,
  },

  logoImage: {
    width: 180,
    height: 180,
  },

  inputSection: {
    width: '100%',
    marginBottom: 10,
  },

  inputLabel: {
    fontSize: 13,
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
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },

  inputText: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text_dark,
    fontWeight: '600',
  },

  passwordIcon: {
    padding: 5,
  },

  eyeImage: {
    width: 22,
    height: 22,
    resizeMode: 'contain',
    tintColor: COLORS.text_dark,
  },

  forgotBtn: {
    alignSelf: 'flex-end',
    marginBottom: 30,
  },

  forgotText: {
    fontSize: 12,
    color: COLORS.red,
    fontWeight: 'bold',
  },

  loginBtn: {
    width: '100%',
    height: 50,
    backgroundColor: COLORS.green,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: COLORS.green,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
  },

  // [STEP 3.4] ปุ่มตอนกำลัง Login
  disabledButton: {
    opacity: 0.6,
  },

  loginBtnText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.bg_white,
  },

  createBtn: {
    marginTop: 30,
    alignItems: 'center',
  },

  createBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text_dark,
  },
});