import { useEffect, useState } from "react";
import {
    Alert,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

type FeedbackCardProps = {
    apiBase: string;
    scanId?: string | null;

    // [STEP 5.4] รับ userId จากหน้า Home / Video
    // ถ้า Login อยู่ จะมี userId
    // ถ้าเป็น Guest จะเป็น null
    userId?: string | null;

    guestId?: string;
};

export default function FeedbackCard({
    apiBase,
    scanId,

    // [STEP 5.4] รับ userId เข้ามา
    userId = null,
    guestId = "guest",
}: FeedbackCardProps) {
    const [rating, setRating] = useState(0);
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
    const [comment, setComment] = useState("");
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    // [STEP 5.4 FIX] ถ้า scanId / userId / guestId เปลี่ยน
    // ให้ reset ฟอร์มใหม่ ไม่ให้ค้างว่า "ส่ง Feedback แล้ว"
    useEffect(() => {
        setRating(0);
        setIsCorrect(null);
        setComment("");
        setSending(false);
        setSent(false);
}, [scanId, userId, guestId]);

  // [STEP 9.5] เพิ่มคำอธิบายระดับความพึงพอใจตามจำนวนดาว
    const ratingLabels: Record<number, string> = {
        1: "ควรปรับปรุง",
        2: "พอใช้",
        3: "ปานกลาง",
        4: "ดี",
        5: "ดีมาก",
    };

  // [STEP 9.5] ใช้แสดงข้อความใต้ดาว เช่น 5 ดาว = ดีมาก
    const ratingText = rating > 0 ? `${rating} ดาว = ${ratingLabels[rating]}` : "";

    if (!scanId) return null;

    async function submitFeedback() {
        if (rating === 0) {
        Alert.alert("กรุณาให้คะแนน", "เลือกจำนวนดาวก่อนส่ง Feedback");
        return;
    }

    try {
        setSending(true);

    const res = await fetch(`${apiBase}/feedback`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            scan_id: scanId,

            // [STEP 5.4] ถ้า Login อยู่ ส่ง user_id
            // ถ้าไม่ได้ Login ส่ง guest_id เหมือนเดิม
            user_id: userId || null,
            guest_id: userId ? null : guestId,

            rating,
            is_correct: isCorrect,
            comment: comment.trim() || null,
        }),
        });

    const data = await res.json();

    if (!res.ok || !data.ok) {
        throw new Error(data.detail || "ส่ง Feedback ไม่สำเร็จ");
    }

    setSent(true);
    Alert.alert("ส่งสำเร็จ", "ขอบคุณสำหรับความคิดเห็นของคุณ");
    } catch (err: any) {
        Alert.alert("เกิดข้อผิดพลาด", err?.message || "ส่ง Feedback ไม่สำเร็จ");
    } finally {
        setSending(false);
    }
    }

    return (
    <View style={styles.card}>
        <Text style={styles.title}>⭐ ให้คะแนนผลวิเคราะห์ AI</Text>

        <Text style={styles.label}>ผลวิเคราะห์นี้ถูกต้องไหม?</Text>

        <View style={styles.choiceRow}>
        <Pressable
            style={[
            styles.choiceButton,
            isCorrect === true && styles.choiceActive,
            ]}
            onPress={() => setIsCorrect(true)}
        >
            <Text style={styles.choiceText}>ถูกต้อง</Text>
        </Pressable>

        <Pressable
        style={[
            styles.choiceButton,
            isCorrect === false && styles.choiceActive,
        ]}
        onPress={() => setIsCorrect(false)}
        >
            <Text style={styles.choiceText}>ไม่ถูกต้อง</Text>
        </Pressable>
        </View>

        <Text style={styles.label}>ให้คะแนน</Text>

        <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((star) => (
            <Pressable key={star} onPress={() => setRating(star)}>
                <Text style={styles.star}>{star <= rating ? "★" : "☆"}</Text>
            </Pressable>
        ))}
        </View>

      {/* [STEP 9.5] แสดงระดับความพึงพอใจหลังเลือกดาว */}
        {rating > 0 && (
        <View style={styles.ratingHintBox}>
            <Text style={styles.ratingHintText}>
            ระดับความพึงพอใจ: {ratingText}
            </Text>
        </View>
        )}

        <TextInput
            style={styles.input}
            placeholder="เช่น ลูกที่ 2 ควรเป็นสุก ไม่ใช่ห่าม"
            placeholderTextColor="#9CA3AF"
            value={comment}
            onChangeText={setComment}
            multiline
            textAlignVertical="top"
        />

        <Pressable
        style={[
            styles.submitButton,
            (sending || sent) && styles.submitDisabled,
        ]}
        onPress={submitFeedback}
        disabled={sending || sent}
        >
            <Text style={styles.submitText}>
            {sent ? "ส่ง Feedback แล้ว" : sending ? "กำลังส่ง..." : "ส่ง Feedback"}
            </Text>
        </Pressable>
    </View>
    );
}

const styles = StyleSheet.create({
card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    marginTop: 18,
    borderWidth: 1,
    borderColor: "#E5E5E5",
},
title: {
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 14,
    color: "#111827",
},
label: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: 10,
    marginBottom: 8,
    color: "#111827",
},
choiceRow: {
    flexDirection: "row",
},
choiceButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    marginRight: 8,
},
choiceActive: {
    backgroundColor: "#DCFCE7",
    borderWidth: 1,
    borderColor: "#22C55E",
},
choiceText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
},
starRow: {
    flexDirection: "row",
    marginBottom: 8,
},
star: {
    fontSize: 38,
    color: "#F59E0B",
    marginRight: 8,
},

  // [STEP 9.5] กล่องแสดงคำอธิบายดาว เช่น 4 ดาว = ดี
ratingHintBox: {
    backgroundColor: "#FFF7ED",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#FDBA74",
},

  // [STEP 9.5] ข้อความระดับความพึงพอใจ
ratingHintText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#B45309",
},

input: {
    minHeight: 110,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    padding: 12,
    fontSize: 16,
    textAlignVertical: "top",
    backgroundColor: "#FAFAFA",
    color: "#111827",
},
submitButton: {
    marginTop: 14,
    backgroundColor: "#22C55E",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
},
submitDisabled: {
    opacity: 0.55,
},
submitText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
},
});