// [STEP 3.2] Supabase Client สำหรับ Mobile App
// ไฟล์นี้ใช้ร่วมกันใน login.js, register.js, forgot-password.js

import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// [STEP 3.2] ใส่ Project URL จาก Supabase
// ต้องเป็นแบบ https://xxxxx.supabase.co
const SUPABASE_URL = "https://ntkhwxhrlbqbjjvxgnup.supabase.co";

// [STEP 3.2] ใส่ Publishable key / anon key
const SUPABASE_ANON_KEY = "sb_publishable_OYHekLHFT8lx51no551jiQ_fWi3X7Jk";

// [STEP 3.2] สร้าง Supabase client สำหรับ React Native
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
auth: {
    // [STEP 3.2] ใช้ AsyncStorage เพื่อจำ session ในมือถือ
    storage: AsyncStorage,

    // [STEP 3.2] ให้ Supabase จำ session ไว้
    persistSession: true,

    // [STEP 3.2] ต่ออายุ token อัตโนมัติ
    autoRefreshToken: true,

    // [STEP 3.2] React Native ไม่มี browser URL session แบบเว็บ
    detectSessionInUrl: false,
},
});