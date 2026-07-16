import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';

// ======================================================
// THEME CONFIG
// ======================================================
const THEME = {
  bg: '#f8fafc',
  surface: '#ffffff',
  border: '#e2e8f0',
  textMain: '#0f172a',
  textMuted: '#64748b',
  accent: '#10b981',
  red: '#ef4444',
};

export default function ManageCommentsScreen() {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchComments = useCallback(async () => {
    try {
      setLoading(true);

      // 1. ดึงข้อมูลจากตาราง feedback ทั้งหมดเรียงตามล่าสุด
      const { data: feedbackData, error: feedbackError } = await supabase
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false });

      if (feedbackError) throw feedbackError;

      if (!feedbackData || feedbackData.length === 0) {
        setComments([]);
        return;
      }

      // 2. ดึงข้อมูล profiles ทั้งหมดเพื่อนำมาจับคู่ชื่อ display_name
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, display_name, email');

      if (profilesError) throw profilesError;

      const profileMap = new Map();
      if (profilesData) {
        profilesData.forEach(p => profileMap.set(p.id, p));
      }

      // 3. ผสานข้อมูล feedback เข้ากับ profile ของผู้ใช้แต่ละคน
      const mergedData = feedbackData.map(item => {
        const prof = profileMap.get(item.user_id);
        return {
          ...item,
          author_name: prof?.display_name || prof?.email?.split('@')[0] || 'ผู้ใช้งานทั่วไป',
        };
      });

      setComments(mergedData);
    } catch (error) {
      Alert.alert("โหลดข้อมูลไม่สำเร็จ", error?.message || "กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // ฟังก์ชันลบฟีดแบ็กออกจากตาราง feedback
  const handleDelete = (id, displayName) => {
    Alert.alert(
      "ยืนยันการลบความคิดเห็น",
      `ต้องการลบความคิดเห็นของ "${displayName}" ใช่หรือไม่?`,
      [
        { text: "ยกเลิก", style: "cancel" },
        { 
          text: "ลบ", 
          style: "destructive", 
          onPress: async () => {
            try {
              setLoading(true);
              const { error } = await supabase
                .from('feedback')
                .delete()
                .eq('id', id);

              if (error) throw error;
              await fetchComments();
            } catch (error) {
              Alert.alert("ลบไม่สำเร็จ", error?.message || "กรุณาลองใหม่");
            } finally {
              setLoading(false);
            }
          } 
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* HEADER SECTION */}
      <View style={styles.headerContainer}>
        <View style={styles.headerIconBox}>
          <Ionicons name="chatbubbles" size={22} color={THEME.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>กล่องข้อความความคิดเห็น</Text>
          <Text style={styles.headerSubtitle}>ตรวจสอบและจัดการฟีดแบ็กจากผู้ใช้งาน ({comments.length} รายการ)</Text>
        </View>
      </View>

      {/* COMMENTS LIST */}
      <FlatList
        data={comments}
        keyExtractor={item => String(item.id)}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchComments} tintColor={THEME.accent} />}
        ListEmptyComponent={
          !loading && (
            <View style={styles.emptyCard}>
              <Ionicons name="chatbubble-ellipses-outline" size={48} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>ไม่มีความคิดเห็นในระบบ</Text>
              <Text style={styles.emptySubtitle}>รีวิวและความคิดเห็นจากผู้ใช้จะแสดงที่นี่</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const userName = item.author_name || 'ผู้ใช้งานทั่วไป';
          const commentText = item.comment || 'ไม่มีข้อความรีวิว';
          const isCorrect = item.is_correct;

          return (
            <View style={[styles.commentCard, { borderLeftColor: isCorrect ? '#10b981' : '#ef4444' }]}>
              <View style={styles.cardHeader}>
                <View style={styles.userSection}>
                  <View style={[styles.avatarBox, { backgroundColor: isCorrect ? '#f0fdf4' : '#fef2f2' }]}>
                    <Text style={[styles.avatarText, { color: isCorrect ? '#059669' : '#dc2626' }]}>
                      {userName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName} numberOfLines={1}>{userName}</Text>
                    <Text style={styles.dateText}>
                      {item.created_at ? new Date(item.created_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : 'ล่าสุด'}
                    </Text>
                  </View>
                </View>

                <View style={[styles.statusBadge, { backgroundColor: isCorrect ? '#f0fdf4' : '#fef2f2' }]}>
                  <Ionicons 
                    name={isCorrect ? "checkmark-circle" : "close-circle"} 
                    size={13} 
                    color={isCorrect ? '#059669' : '#dc2626'} 
                  />
                  <Text style={[styles.statusText, { color: isCorrect ? '#059669' : '#dc2626' }]}>
                    {isCorrect ? 'ถูกต้อง' : 'ไม่ถูกต้อง'}
                  </Text>
                </View>
              </View>

              <Text style={styles.commentBody}>“{commentText}”</Text>

              <View style={styles.footerRow}>
                <TouchableOpacity 
                  style={styles.delButton} 
                  onPress={() => handleDelete(item.id, userName)} 
                  activeOpacity={0.75}
                >
                  <Ionicons name="trash-outline" size={14} color={THEME.red} />
                  <Text style={styles.delText}>ลบรายการนี้</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    padding: 20, 
    backgroundColor: THEME.bg 
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.surface,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: THEME.border,
    marginBottom: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  headerIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#f0fdf4',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dcfce7',
  },
  headerTitle: { 
    fontSize: 16, 
    fontWeight: '900', 
    color: THEME.textMain 
  },
  headerSubtitle: { 
    fontSize: 12, 
    fontWeight: '600', 
    color: THEME.textMuted,
    marginTop: 2 
  },
  listContent: { 
    paddingBottom: 30, 
    gap: 14 
  },
  commentCard: { 
    backgroundColor: THEME.surface, 
    padding: 18, 
    borderRadius: 20, 
    borderLeftWidth: 4, 
    borderWidth: 1, 
    borderColor: THEME.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 12 
  },
  userSection: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 12,
    flex: 1,
    marginRight: 8
  },
  avatarBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 15,
    fontWeight: '900',
  },
  userName: { 
    fontSize: 15, 
    fontWeight: '900', 
    color: THEME.textMain 
  },
  dateText: { 
    fontSize: 11, 
    color: THEME.textMuted, 
    fontWeight: '600',
    marginTop: 2
  },
  statusBadge: { 
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10, 
    paddingVertical: 5, 
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)'
  },
  statusText: { 
    fontSize: 11, 
    fontWeight: '800' 
  },
  commentBody: { 
    fontSize: 14, 
    color: '#334155', 
    lineHeight: 22,
    fontWeight: '500',
    paddingLeft: 2,
    marginBottom: 4
  },
  footerRow: { 
    borderTopWidth: 1, 
    borderTopColor: '#f1f5f9', 
    marginTop: 14, 
    paddingTop: 10, 
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center'
  },
  delButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 6, 
    backgroundColor: '#fef2f2',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fee2e2'
  },
  delText: { 
    color: THEME.red, 
    fontSize: 12, 
    fontWeight: '800' 
  },
  emptyCard: {
    backgroundColor: THEME.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: THEME.border,
    padding: 48,
    alignItems: "center",
    gap: 8,
    marginTop: 20,
  },
  emptyTitle: { 
    fontSize: 16, 
    fontWeight: "900", 
    color: THEME.textMain,
    marginTop: 4
  },
  emptySubtitle: {
    fontSize: 13,
    fontWeight: "600",
    color: THEME.textMuted,
  }
});