import React, { useState, useRef } from 'react';
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
  Image
} from 'react-native';

// [STEP 3.3] import Supabase client ที่สร้างไว้ใน mobile/lib/supabase.js
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

const eyeIcon = require('../assets/auth/eye.png');
const backIcon = require('../assets/auth/back.png');

export default function CreateAccountScreen() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [securePassword, setSecurePassword] = useState(true);
  const [secureConfirmPassword, setSecureConfirmPassword] = useState(true);

  // [STEP 3.3] เพิ่ม loading กันกด SIGN UP ซ้ำระหว่างสมัคร
  const [loading, setLoading] = useState(false);

  const emailRef = useRef();
  const passwordRef = useRef();
  const confirmPasswordRef = useRef();

  // [AUTH] ปุ่มย้อนกลับ
  // ถ้ามี history ให้กลับหน้าก่อนหน้า ถ้าไม่มีให้กลับหน้า Home
  const handleBack = () => {
    if (router.canGoBack && router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  // [STEP 3.3] สมัครสมาชิกจริงผ่าน Supabase Auth
  const handleSignUp = async () => {
    if (!username.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
      Alert.alert("แจ้งเตือน", "กรุณากรอกข้อมูลให้ครบถ้วนทุกช่องครับ");
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim();

    const emailRegex = /\S+@\S+\.\S+/;
    if (!emailRegex.test(cleanEmail)) {
      Alert.alert("ข้อผิดพลาด", "รูปแบบอีเมลไม่ถูกต้อง");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("ข้อผิดพลาด", "รหัสผ่านทั้งสองช่องไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง");
      return;
    }

    if (password.length < 6) {
      Alert.alert("แจ้งเตือน", "รหัสผ่านควรมีความยาวอย่างน้อย 6 ตัวอักษร");
      return;
    }

    try {
      setLoading(true);

      // [STEP 3.3] ยิงสมัครสมาชิกจริงเข้า Supabase
      // Supabase Auth ใช้ email/password เป็นหลัก
      // username เก็บไว้ใน user_metadata เผื่อใช้ทำ Profile ภายหลัง
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            username: cleanUsername,
          },
        },
      });

      if (error) {
        throw error;
      }

      // [STEP 3.3] ถ้า Supabase เปิด Confirm email
      // data.session อาจเป็น null จนกว่าผู้ใช้จะยืนยันอีเมล
      const hasSession = !!data?.session;

      Alert.alert(
        "สมัครสำเร็จ",
        hasSession
          ? `สร้างบัญชีสำเร็จ!\nยินดีต้อนรับคุณ ${cleanUsername}`
          : `สร้างบัญชีสำเร็จ!\nกรุณาตรวจสอบอีเมล ${cleanEmail} เพื่อยืนยันบัญชี`,
        [
          {
            text: "ตกลง",
            // [STEP 3.3] สมัครเสร็จให้กลับไปหน้า Login
            onPress: () => router.replace("/login"),
          },
        ]
      );
    } catch (err) {
      Alert.alert(
        "สมัครไม่สำเร็จ",
        err?.message || "เกิดข้อผิดพลาดระหว่างสมัครสมาชิก"
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
            <Image
              source={backIcon}
              style={styles.backIconStyle}
            />
          </TouchableOpacity>

          <Text style={styles.headerTitle}>CREATE ACCOUNT</Text>
        </View>

        <View style={styles.contentView}>
          <ScrollView
            style={{ width: '100%' }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 40, paddingTop: 10 }}
          >
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>USERNAME</Text>
              <View style={styles.inputFieldContainer}>
                <TextInput
                  style={styles.inputText}
                  placeholder="CHOOSE YOUR USERNAME"
                  placeholderTextColor="#BCBCBC"
                  value={username}
                  onChangeText={setUsername}
                  autoCapitalize="none"
                  textContentType="username"
                  returnKeyType="next"
                  onSubmitEditing={() => emailRef.current?.focus()}
                  blurOnSubmit={false}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>EMAIL</Text>
              <View style={styles.inputFieldContainer}>
                <TextInput
                  ref={emailRef}
                  style={styles.inputText}
                  placeholder="EXAMPLE@EMAIL.COM"
                  placeholderTextColor="#BCBCBC"
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
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>PASSWORD</Text>
              <View style={styles.inputFieldContainer}>
                <TextInput
                  ref={passwordRef}
                  style={styles.inputText}
                  placeholder="MINIMUM 6 CHARACTERS"
                  placeholderTextColor="#BCBCBC"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={securePassword}
                  autoCapitalize="none"
                  textContentType="password"
                  returnKeyType="next"
                  onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                  blurOnSubmit={false}
                />

                <TouchableOpacity
                  style={styles.passwordIcon}
                  onPress={() => setSecurePassword(!securePassword)}
                >
                  <Image
                    source={eyeIcon}
                    style={[
                      styles.eyeImage,
                      { opacity: securePassword ? 0.4 : 1 }
                    ]}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>CONFIRM PASSWORD</Text>
              <View style={styles.inputFieldContainer}>
                <TextInput
                  ref={confirmPasswordRef}
                  style={styles.inputText}
                  placeholder="REPEAT YOUR PASSWORD"
                  placeholderTextColor="#BCBCBC"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={secureConfirmPassword}
                  autoCapitalize="none"
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={handleSignUp}
                />

                <TouchableOpacity
                  style={styles.passwordIcon}
                  onPress={() => setSecureConfirmPassword(!secureConfirmPassword)}
                >
                  <Image
                    source={eyeIcon}
                    style={[
                      styles.eyeImage,
                      { opacity: secureConfirmPassword ? 0.4 : 1 }
                    ]}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ alignItems: 'center', marginTop: 25 }}>
              <TouchableOpacity
                // [STEP 3.3] ถ้า loading อยู่ ปิดปุ่มชั่วคราว
                style={[
                  styles.signUpButton,
                  loading && styles.disabledButton,
                ]}
                onPress={handleSignUp}
                activeOpacity={0.9}
                disabled={loading}
              >
                <Text style={styles.signUpButtonText}>
                  {loading ? "SIGNING UP..." : "SIGN UP"}
                </Text>
              </TouchableOpacity>
            </View>
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
    paddingTop: 30,
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
  passwordIcon: {
    padding: 5,
  },
  eyeImage: {
    width: 22,
    height: 22,
    resizeMode: 'contain',
    tintColor: COLORS.text_dark,
  },
  signUpButton: {
    width: '50%',
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

  // [STEP 3.3] style ปุ่มตอนกำลังสมัคร
  disabledButton: {
    opacity: 0.6,
  },

  signUpButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.bg_white,
  },
});