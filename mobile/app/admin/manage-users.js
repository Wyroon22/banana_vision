import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../../lib/supabase";

export default function ManageUsersScreen() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, display_name, role, created_at")
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      Alert.alert("โหลดสมาชิกไม่สำเร็จ", error?.message || "กรุณาลองใหม่");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const toggleRole = async (item) => {
    const nextRole = item.role === "admin" ? "member" : "admin";

    Alert.alert(
      "ยืนยันการเปลี่ยนสิทธิ์",
      `ต้องการเปลี่ยน ${item.email} เป็น ${nextRole} หรือไม่?`,
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "ยืนยัน",
          onPress: async () => {
            try {
              setLoading(true);

              const { error } = await supabase
                .from("profiles")
                .update({ role: nextRole })
                .eq("id", item.id);

              if (error) {
                throw error;
              }

              await fetchUsers();
            } catch (error) {
              Alert.alert("อัปเดตสิทธิ์ไม่สำเร็จ", error?.message || "กรุณาลองใหม่");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>สมาชิกในฐานข้อมูล ({users.length})</Text>
          <Text style={styles.sectionSubtitle}>
            ดึงจากตาราง profiles ของ Supabase
          </Text>
        </View>
        {loading && <ActivityIndicator size="small" color="#ca8a04" />}
      </View>

      <FlatList
        data={users}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchUsers} />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>ยังไม่มีข้อมูลสมาชิก</Text>
          </View>
        }
        renderItem={({ item }) => {
          const displayName = item.display_name || item.email?.split("@")?.[0] || "Member";
          const role = item.role || "member";
          const isAdmin = role === "admin";

          return (
            <View style={styles.userCard}>
              <View style={styles.userInfoBox}>
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: isAdmin ? "#fef9c3" : "#eff6ff" },
                  ]}
                >
                  <Text
                    style={[
                      styles.avatarText,
                      { color: isAdmin ? "#ca8a04" : "#3b82f6" },
                    ]}
                  >
                    {displayName.charAt(0).toUpperCase()}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.uName}>{displayName}</Text>
                  <Text style={styles.uEmail}>{item.email}</Text>
                  <View
                    style={[
                      styles.badge,
                      { backgroundColor: isAdmin ? "#fef9c3" : "#e6f4ea" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        { color: isAdmin ? "#a16207" : "#137333" },
                      ]}
                    >
                      {role}
                    </Text>
                  </View>
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.roleBtn,
                  { backgroundColor: isAdmin ? "#fef2f2" : "#f1f5f9" },
                ]}
                onPress={() => toggleRole(item)}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={isAdmin ? "shield-checkmark" : "person"}
                  size={16}
                  color={isAdmin ? "#ef4444" : "#475569"}
                />
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#f8fafc" },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 16, fontWeight: "900", color: "#0f172a" },
  sectionSubtitle: { fontSize: 12, fontWeight: "700", color: "#64748b", marginTop: 3 },
  userCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  userInfoBox: { flexDirection: "row", gap: 12, alignItems: "center", flex: 1 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { fontSize: 16, fontWeight: "900" },
  uName: { fontSize: 15, fontWeight: "900", color: "#1e293b" },
  uEmail: { fontSize: 12, color: "#64748b", marginTop: 1, fontWeight: "700" },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 6,
  },
  badgeText: { fontSize: 11, fontWeight: "900" },
  roleBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 18,
  },
  emptyTitle: { fontSize: 16, fontWeight: "900", color: "#0f172a" },
});