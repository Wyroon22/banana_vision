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
  Image
} from 'react-native';

const COLORS = {
  bg: '#FBF7E3',
  bg_white: '#FFFFFF',
  primary: '#4A3B32', 
  text_dark: '#000000',
  text_gray: '#757575',
  border: '#EFECE0',
  green: '#27AE60', 
};

const backIcon = require('../assets/auth/back.png');

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');

  const handleSendEmail = () => {
    if (!email.trim()) {
      Alert.alert("แจ้งเตือน", "กรุณากรอก Email Address ของคุณครับ");
      return;
    }

    const emailRegex = /\S+@\S+\.\S+/;
    if (!emailRegex.test(email)) {
      Alert.alert("ข้อผิดพลาด", "รูปแบบอีเมลไม่ถูกต้อง");
      return;
    }

    Alert.alert(
      "ส่งข้อมูลสำเร็จ", 
      `ระบบได้ส่งลิงก์กู้คืนรหัสผ่านไปยังอีเมล:\n${email} เรียบร้อยแล้ว`,
      [
        { text: "ตกลง", onPress: () => router.back() }
      ]
    );
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
            activeOpacity={0.6}
            onPress={() => router.back() }
          >
            <Image 
              source={backIcon} 
              style={styles.backIconStyle} 
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>FORGOT PASSWORD</Text>
        </View>

        <View style={styles.contentView}>
          <ScrollView 
            style={{ width: '100%' }} 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 40, paddingTop: 10 }} 
          >
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>EMAIL ADDRESS</Text>
              <View style={styles.inputFieldContainer}>
                <TextInput
                  style={styles.inputText}
                  placeholder="ENTER YOUR EMAIL ADDRESS"
                  placeholderTextColor="#BCBCBC"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType="done"
                  onSubmitEditing={handleSendEmail}
                />
              </View>
            </View>

            <View style={{ alignItems: 'center', marginTop: 35 }}>
              <TouchableOpacity style={styles.sendButton} onPress={handleSendEmail} activeOpacity={0.9}>
                <Text style={styles.sendButtonText}>SEND</Text>
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
    paddingTop: 40, 
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
  sendButton: {
    width: '45%', 
    height: 46,
    backgroundColor: COLORS.green,
    borderRadius: 23,
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
  sendButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.bg_white,
  },
});