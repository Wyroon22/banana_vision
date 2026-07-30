import { View, Text, Pressable, Alert, Platform } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

type IconName = keyof typeof Ionicons.glyphMap;

function DockButton({
  icon,
  label,
  active = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => [
        {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 4,
          paddingVertical: 10,
        },
        pressed && {
          opacity: 0.6,
          transform: [{ scale: 0.94 }],
        },
      ]}
    >
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 16,
          backgroundColor: active ? "rgba(22, 163, 74, 0.12)" : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons
          name={icon}
          size={26}
          color={active ? "#16A34A" : "#6B7280"}
        />
      </View>

      <Text
        numberOfLines={1}
        style={{
          color: active ? "#16A34A" : "#6B7280",
          fontWeight: active ? "800" : "600",
          fontSize: 11,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function HomeDock({
  takePhoto,
  pickImage,
  scrollToTop,
  user,
  activeTab = "home",
}: {
  takePhoto: () => void;
  pickImage: () => void;
  scrollToTop: () => void;
  user: any;
  activeTab?: "camera" | "image" | "home" | "history" | "profile";
}) {
  return (
    <View
      style={{
        width: "100%",
        height: Platform.OS === "ios" ? 88 : 76,
        paddingBottom: Platform.OS === "ios" ? 14 : 0,
        backgroundColor: "#FFFFFF",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 8,
        borderTopWidth: 1,
        borderColor: "#E5E7EB",
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: -3 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 8,
      }}
    >
      <DockButton
        icon="camera-outline"
        label="ถ่ายรูป"
        active={activeTab === "camera"}
        onPress={takePhoto}
      />
      <DockButton
        icon="images-outline"
        label="เลือกรูป"
        active={activeTab === "image"}
        onPress={pickImage}
      />
      <DockButton
        icon="home-outline"
        label="หน้าแรก"
        active={activeTab === "home"}
        onPress={scrollToTop}
      />
      <DockButton
        icon="clipboard-outline"
        label="ประวัติ"
        active={activeTab === "history"}
        onPress={() => {
          if (!user) {
            Alert.alert("ต้อง Login ก่อน", "กรุณา Login ก่อนดูประวัติการตรวจ");
            return;
          }
          router.push("/history" as any);
        }}
      />
      <DockButton
        icon="person-outline"
        label="โปรไฟล์"
        active={activeTab === "profile"}
        onPress={() => {
          if (!user) {
            Alert.alert("ต้อง Login ก่อน", "กรุณา Login ก่อนดูโปรไฟล์");
            return;
          }
          router.push("/profile" as any);
        }}
      />
    </View>
  );
}