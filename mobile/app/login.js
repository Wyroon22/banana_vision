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

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [secureText, setSecureText] = useState(true);
  
  const passwordRef = useRef();

  const handleLogin = () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert("แจ้งเตือน", "กรุณากรอก Username และ Password");
      return;
    }
    router.replace("/");
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.bg} />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          <View style={styles.logoContainer}>
            <Image source={logoImg} style={styles.logoImage} resizeMode="contain" />
          </View>

          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>USERNAME</Text>
            <View style={styles.inputFieldContainer}>
              <TextInput
                style={styles.inputText}
                placeholder="YOUR USERNAME"
                placeholderTextColor={COLORS.text_gray}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current.focus()}
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
                returnKeyType="go"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity style={styles.passwordIcon} onPress={() => setSecureText(!secureText)}>
                <Image source={eyeIcon} style={[styles.eyeImage, { opacity: secureText ? 0.5 : 1 }]} />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.forgotBtn} onPress={() => router.push("/forgot-password")}>
            <Text style={styles.forgotText}>FORGOT YOUR PASSWORD?</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin} activeOpacity={0.8}>
            <Text style={styles.loginBtnText}>LOGIN</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.createBtn} onPress={() => router.push("/register")}>
            <Text style={styles.createBtnText}>CREATE AN ACCOUNT</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: COLORS.bg },
  scrollContent: { padding: 40, flexGrow: 1, justifyContent: 'center' },
  logoContainer: { alignItems: 'center', marginBottom: 50 },
  logoImage: { width: 180, height: 180 },
  inputSection: { width: '100%', marginBottom: 10 },
  inputLabel: { fontSize: 13, fontWeight: 'bold', color: COLORS.primary, marginBottom: 8, marginLeft: 5 },
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
  inputText: { flex: 1, fontSize: 16, color: COLORS.text_dark, fontWeight: '600' },
  passwordIcon: { padding: 5 },
  eyeImage: { width: 22, height: 22, resizeMode: 'contain', tintColor: COLORS.text_dark },
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 30 },
  forgotText: { fontSize: 12, color: COLORS.red, fontWeight: 'bold' },
  loginBtn: { 
    width: '100%', height: 50, backgroundColor: COLORS.green, borderRadius: 25, 
    justifyContent: 'center', alignItems: 'center', elevation: 4,
    shadowColor: COLORS.green, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2 
  },
  loginBtnText: { fontSize: 16, fontWeight: 'bold', color: COLORS.bg_white },
  createBtn: { marginTop: 30, alignItems: 'center' },
  createBtnText: { fontSize: 14, fontWeight: 'bold', color: COLORS.text_dark },
});