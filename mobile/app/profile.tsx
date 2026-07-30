import {
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { supabase } from "../lib/supabase";
import { HomeDock } from "../components/HomeDock";

function formatDate(
  value?: string | null
): string {
  if (!value) {
    return "-";
  }

  try {
    return new Date(value).toLocaleString(
      "th-TH",
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    );
  } catch {
    return value;
  }
}

function getInitial(
  text?: string | null
): string {
  if (!text) {
    return "U";
  }

  const trimmedText =
    text.trim();

  if (!trimmedText) {
    return "U";
  }

  return trimmedText
    .slice(0, 1)
    .toUpperCase();
}

export default function ProfileScreen() {
  const [
    user,
    setUser,
  ] = useState<any>(null);

  const [
    displayName,
    setDisplayName,
  ] = useState("");

  const [
    avatarUrl,
    setAvatarUrl,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    uploading,
    setUploading,
  ] = useState(false);

  const [
    errorMsg,
    setErrorMsg,
  ] = useState("");

  const loadProfile =
    useCallback(async () => {
      try {
        setLoading(true);
        setErrorMsg("");

        const {
          data: userData,
          error: userError,
        } =
          await supabase.auth
            .getUser();

        if (userError) {
          throw userError;
        }

        const currentUser =
          userData?.user ??
          null;

        if (!currentUser) {
          setUser(null);
          setDisplayName("");
          setAvatarUrl("");

          return;
        }

        setUser(currentUser);

        const {
          data: profileData,
          error: profileError,
        } =
          await supabase
            .from("profiles")
            .select(
              "display_name, avatar_url"
            )
            .eq(
              "id",
              currentUser.id
            )
            .maybeSingle();

        if (
          !profileError &&
          profileData
        ) {
          setDisplayName(
            profileData
              .display_name ||
              currentUser
                .user_metadata
                ?.display_name ||
              ""
          );

          setAvatarUrl(
            profileData
              .avatar_url ||
              currentUser
                .user_metadata
                ?.avatar_url ||
              ""
          );
        } else {
          if (profileError) {
            console.log(
              "[profile] profile query warning:",
              profileError.message
            );
          }

          setDisplayName(
            currentUser
              .user_metadata
              ?.display_name ||
              ""
          );

          setAvatarUrl(
            currentUser
              .user_metadata
              ?.avatar_url ||
              ""
          );
        }
      } catch (error: any) {
        console.log(
          "[profile] load error:",
          error
        );

        setErrorMsg(
          error?.message ||
            "ไม่สามารถโหลดข้อมูลโปรไฟล์ได้"
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSaveProfile =
    async () => {
      const trimmedName =
        displayName.trim();

      if (!trimmedName) {
        Alert.alert(
          "ข้อมูลไม่ครบถ้วน",
          "กรุณากรอกชื่อผู้ใช้งานหรือชื่อเล่นของคุณ"
        );

        return;
      }

      if (!user?.id) {
        Alert.alert(
          "ไม่พบผู้ใช้งาน",
          "กรุณาเข้าสู่ระบบใหม่อีกครั้ง"
        );

        return;
      }

      try {
        setSaving(true);

        const {
          data: authData,
          error: authError,
        } =
          await supabase.auth
            .updateUser({
              data: {
                display_name:
                  trimmedName,

                avatar_url:
                  avatarUrl ||
                  null,
              },
            });

        if (authError) {
          throw authError;
        }

        const {
          error: profileError,
        } =
          await supabase
            .from("profiles")
            .upsert(
              {
                id:
                  user.id,

                email:
                  user.email,

                display_name:
                  trimmedName,

                avatar_url:
                  avatarUrl ||
                  null,

                updated_at:
                  new Date()
                    .toISOString(),
              },
              {
                onConflict:
                  "id",
              }
            );

        if (profileError) {
          throw profileError;
        }

        setUser(
          authData.user
        );

        Alert.alert(
          "บันทึกสำเร็จ",
          "อัปเดตข้อมูลโปรไฟล์เรียบร้อยแล้ว"
        );
      } catch (error: any) {
        console.log(
          "[profile] save error:",
          error
        );

        Alert.alert(
          "เกิดข้อผิดพลาด",
          error?.message ||
            "ไม่สามารถบันทึกข้อมูลได้"
        );
      } finally {
        setSaving(false);
      }
    };

  const handlePickAvatar =
    async () => {
      if (!user?.id) {
        Alert.alert(
          "ไม่พบผู้ใช้งาน",
          "กรุณาเข้าสู่ระบบใหม่อีกครั้ง"
        );

        return;
      }

      try {
        setUploading(true);

        const permission =
          await ImagePicker
            .requestMediaLibraryPermissionsAsync();

        if (
          !permission.granted
        ) {
          Alert.alert(
            "ต้องการสิทธิ์เข้าถึง",
            "กรุณาอนุญาตให้แอปเข้าถึงคลังรูปภาพของคุณ"
          );

          return;
        }

        const result =
          await ImagePicker
            .launchImageLibraryAsync({
              mediaTypes:
                ImagePicker
                  .MediaTypeOptions
                  .Images,

              allowsEditing:
                true,

              aspect:
                [1, 1],

              quality:
                0.8,
            });

        if (result.canceled) {
          return;
        }

        const asset =
          result.assets?.[0];

        if (!asset?.uri) {
          throw new Error(
            "ไม่พบไฟล์รูปภาพที่เลือก"
          );
        }

        const rawExtension =
          asset.uri
            .split(".")
            .pop()
            ?.toLowerCase()
            ?.split("?")[0];

        const fileExtension =
          rawExtension === "png"
            ? "png"
            : "jpg";

        const contentType =
          fileExtension === "png"
            ? "image/png"
            : "image/jpeg";

        const filePath =
          `${user.id}/` +
          `avatar-${Date.now()}.` +
          `${fileExtension}`;

        const response =
          await fetch(
            asset.uri
          );

        if (!response.ok) {
          throw new Error(
            "ไม่สามารถอ่านไฟล์รูปภาพที่เลือกได้"
          );
        }

        const arrayBuffer =
          await response
            .arrayBuffer();

        const {
          error: uploadError,
        } =
          await supabase
            .storage
            .from("avatars")
            .upload(
              filePath,
              arrayBuffer,
              {
                contentType,
                upsert: true,
              }
            );

        if (uploadError) {
          throw uploadError;
        }

        const {
          data: publicData,
        } =
          supabase
            .storage
            .from("avatars")
            .getPublicUrl(
              filePath
            );

        const publicUrl =
          publicData
            ?.publicUrl;

        if (!publicUrl) {
          throw new Error(
            "ไม่สามารถสร้าง URL ของรูปโปรไฟล์ได้"
          );
        }

        const previousAvatarUrl =
          avatarUrl;

        setAvatarUrl(
          publicUrl
        );

        try {
          const {
            error: authAvatarError,
          } =
            await supabase.auth
              .updateUser({
                data: {
                  avatar_url:
                    publicUrl,
                },
              });

          if (
            authAvatarError
          ) {
            throw authAvatarError;
          }

          const {
            error:
              profileAvatarError,
          } =
            await supabase
              .from("profiles")
              .upsert(
                {
                  id:
                    user.id,

                  email:
                    user.email,

                  display_name:
                    displayName
                      .trim() ||
                    user
                      .user_metadata
                      ?.display_name ||
                    user.email
                      ?.split("@")[0] ||
                    "User",

                  avatar_url:
                    publicUrl,

                  updated_at:
                    new Date()
                      .toISOString(),
                },
                {
                  onConflict:
                    "id",
                }
              );

          if (
            profileAvatarError
          ) {
            throw profileAvatarError;
          }
        } catch (saveError) {
          setAvatarUrl(
            previousAvatarUrl
          );

          throw saveError;
        }

        setUser(
          (previousUser: any) => {
            if (!previousUser) {
              return previousUser;
            }

            return {
              ...previousUser,

              user_metadata: {
                ...previousUser
                  .user_metadata,

                avatar_url:
                  publicUrl,
              },
            };
          }
        );

        Alert.alert(
          "เปลี่ยนรูปสำเร็จ",
          "อัปเดตรูปโปรไฟล์เรียบร้อยแล้ว"
        );
      } catch (error: any) {
        console.log(
          "[profile] avatar upload error:",
          error
        );

        Alert.alert(
          "อัปโหลดไม่สำเร็จ",
          error?.message ||
            "กรุณาลองใหม่อีกครั้ง"
        );
      } finally {
        setUploading(false);
      }
    };

  const handleOpenFeedback =
    () => {
      /*
       * เปิดหน้ารายการความคิดเห็นและรีวิวโดยตรง
       *
       * ไม่ส่ง scanId เพราะปุ่มนี้ใช้ดูรายการรีวิว
       * ไม่ได้ใช้สร้างรีวิวของผลสแกนเฉพาะภาพ
       */
      router.push(
        "/CommentScreen" as any
      );
    };

  const handleLogout =
    async () => {
      try {
        const {
          error,
        } =
          await supabase.auth
            .signOut();

        if (error) {
          throw error;
        }

        setUser(null);
        setDisplayName("");
        setAvatarUrl("");

        router.replace(
          "/login" as any
        );
      } catch (error: any) {
        console.log(
          "[profile] logout error:",
          error
        );

        Alert.alert(
          "ออกจากระบบไม่สำเร็จ",
          error?.message ||
            "กรุณาลองใหม่อีกครั้ง"
        );
      }
    };

  return (
    <SafeAreaView
      style={
        styles.safeArea
      }
    >
      <KeyboardAvoidingView
        style={
          styles.flexContainer
        }
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : "height"
        }
        keyboardVerticalOffset={
          Platform.OS === "ios"
            ? 20
            : 0
        }
      >
        <ScrollView
          style={
            styles.flexContainer
          }
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={
            styles.scrollContent
          }
        >
          {/* Header */}
          <View
            style={
              styles.headerCard
            }
          >
            <View
              style={
                styles.headerTitleRow
              }
            >
              <View
                style={
                  styles.headerIconContainer
                }
              >
                <Ionicons
                  name="person-circle-outline"
                  size={22}
                  color="#16A34A"
                />
              </View>

              <Text
                style={
                  styles.headerTitleText
                }
              >
                โปรไฟล์ผู้ใช้งาน
              </Text>
            </View>

            <Pressable
              onPress={
                loadProfile
              }
              disabled={
                loading
              }
              style={({
                pressed,
              }) => [
                styles.refreshButton,

                loading && {
                  opacity: 0.55,
                },

                pressed &&
                  !loading &&
                  styles.pressedEffect,
              ]}
            >
              {loading ? (
                <ActivityIndicator
                  size="small"
                  color="#16A34A"
                />
              ) : (
                <Ionicons
                  name="refresh-outline"
                  size={16}
                  color="#16A34A"
                />
              )}

              <Text
                style={
                  styles.refreshButtonText
                }
              >
                รีเฟรช
              </Text>
            </Pressable>
          </View>

          {loading && (
            <View
              style={[
                styles.card,
                styles.centerCard,
              ]}
            >
              <ActivityIndicator
                size="large"
                color="#16A34A"
              />

              <Text
                style={
                  styles.loadingText
                }
              >
                กำลังโหลดข้อมูลจริง...
              </Text>
            </View>
          )}

          {!!errorMsg &&
            !loading && (
              <View
                style={
                  styles.errorCard
                }
              >
                <View
                  style={
                    styles.errorTitleRow
                  }
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={20}
                    color="#DC2626"
                  />

                  <Text
                    style={
                      styles.errorTitle
                    }
                  >
                    เกิดข้อผิดพลาด
                  </Text>
                </View>

                <Text
                  style={
                    styles.errorText
                  }
                >
                  {errorMsg}
                </Text>

                <Pressable
                  onPress={
                    loadProfile
                  }
                  style={({
                    pressed,
                  }) => [
                    styles.retryButton,

                    pressed &&
                      styles.pressedEffect,
                  ]}
                >
                  <Text
                    style={
                      styles.retryButtonText
                    }
                  >
                    ลองใหม่
                  </Text>
                </Pressable>
              </View>
            )}

          {!loading &&
            !errorMsg &&
            !user && (
              <View
                style={[
                  styles.card,
                  styles.centerCard,
                  styles.loggedOutCard,
                ]}
              >
                <View
                  style={
                    styles.loggedOutIcon
                  }
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={32}
                    color="#16A34A"
                  />
                </View>

                <Text
                  style={
                    styles.headerTitleText
                  }
                >
                  ยังไม่ได้เข้าสู่ระบบ
                </Text>

                <Text
                  style={
                    styles.loggedOutText
                  }
                >
                  กรุณาเข้าสู่ระบบก่อนจัดการข้อมูลโปรไฟล์
                </Text>

                <Pressable
                  onPress={() =>
                    router.replace(
                      "/login" as any
                    )
                  }
                  style={({
                    pressed,
                  }) => [
                    styles.primaryButton,

                    pressed &&
                      styles.pressedEffect,
                  ]}
                >
                  <Ionicons
                    name="log-in-outline"
                    size={19}
                    color="#FFFFFF"
                  />

                  <Text
                    style={
                      styles.primaryButtonText
                    }
                  >
                    ไปหน้าเข้าสู่ระบบ
                  </Text>
                </Pressable>
              </View>
            )}

          {!loading &&
            !errorMsg &&
            user && (
              <>
                {/* Profile Management */}
                <View
                  style={[
                    styles.card,
                    styles.profileCardContainer,
                  ]}
                >
                  {avatarUrl ? (
                    <Image
                      source={{
                        uri:
                          avatarUrl,
                      }}
                      style={
                        styles.avatarImage
                      }
                    />
                  ) : (
                    <View
                      style={
                        styles.avatarFallback
                      }
                    >
                      <Text
                        style={
                          styles.avatarFallbackText
                        }
                      >
                        {getInitial(
                          displayName ||
                            user.email
                        )}
                      </Text>
                    </View>
                  )}

                  <Pressable
                    onPress={
                      handlePickAvatar
                    }
                    disabled={
                      uploading ||
                      saving
                    }
                    style={({
                      pressed,
                    }) => [
                      styles.secondaryButton,

                      uploading && {
                        backgroundColor:
                          "#DCFCE7",
                      },

                      pressed &&
                        !uploading &&
                        !saving &&
                        styles.pressedEffect,
                    ]}
                  >
                    {uploading ? (
                      <ActivityIndicator
                        size="small"
                        color="#16A34A"
                      />
                    ) : (
                      <Ionicons
                        name="camera-outline"
                        size={18}
                        color="#16A34A"
                      />
                    )}

                    <Text
                      style={
                        styles.secondaryButtonText
                      }
                    >
                      {uploading
                        ? "กำลังอัปโหลดรูป..."
                        : "เปลี่ยนรูปโปรไฟล์"}
                    </Text>
                  </Pressable>

                  <View
                    style={
                      styles.inputContainer
                    }
                  >
                    <Text
                      style={
                        styles.inputLabel
                      }
                    >
                      ชื่อผู้ใช้งาน / ชื่อเล่น
                    </Text>

                    <TextInput
                      value={
                        displayName
                      }
                      onChangeText={
                        setDisplayName
                      }
                      editable={
                        !saving &&
                        !uploading
                      }
                      placeholder="กรอกชื่อของคุณ"
                      placeholderTextColor="#9CA3AF"
                      autoCapitalize="words"
                      returnKeyType="done"
                      maxLength={80}
                      style={
                        styles.textInput
                      }
                    />

                    <Text
                      style={
                        styles.characterCount
                      }
                    >
                      {displayName.length}
                      /80
                    </Text>
                  </View>

                  <Pressable
                    onPress={
                      handleSaveProfile
                    }
                    disabled={
                      saving ||
                      uploading
                    }
                    style={({
                      pressed,
                    }) => [
                      styles.primaryButton,

                      saving && {
                        backgroundColor:
                          "#86EFAC",
                      },

                      pressed &&
                        !saving &&
                        !uploading &&
                        styles.pressedEffect,
                    ]}
                  >
                    {saving ? (
                      <ActivityIndicator
                        size="small"
                        color="#FFFFFF"
                      />
                    ) : (
                      <Ionicons
                        name="save-outline"
                        size={19}
                        color="#FFFFFF"
                      />
                    )}

                    <Text
                      style={
                        styles.primaryButtonText
                      }
                    >
                      {saving
                        ? "กำลังบันทึกข้อมูล..."
                        : "บันทึกการเปลี่ยนแปลง"}
                    </Text>
                  </Pressable>
                </View>

                {/* Account Details */}
                <View
                  style={
                    styles.card
                  }
                >
                  <View
                    style={
                      styles.sectionTitleRow
                    }
                  >
                    <Ionicons
                      name="shield-checkmark-outline"
                      size={20}
                      color="#16A34A"
                    />

                    <Text
                      style={
                        styles.sectionHeaderTitle
                      }
                    >
                      ข้อมูลบัญชีจริง
                    </Text>
                  </View>

                  <View
                    style={
                      styles.accountInfoContainer
                    }
                  >
                    <View
                      style={
                        styles.accountInfoRow
                      }
                    >
                      <View
                        style={
                          styles.accountInfoIcon
                        }
                      >
                        <Ionicons
                          name="mail-outline"
                          size={17}
                          color="#64748B"
                        />
                      </View>

                      <View
                        style={
                          styles.accountInfoTextArea
                        }
                      >
                        <Text
                          style={
                            styles.accountInfoLabel
                          }
                        >
                          อีเมล
                        </Text>

                        <Text
                          selectable
                          style={
                            styles.accountInfoValue
                          }
                        >
                          {user.email ||
                            "-"}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={
                        styles.accountDivider
                      }
                    />

                    <View
                      style={
                        styles.accountInfoRow
                      }
                    >
                      <View
                        style={
                          styles.accountInfoIcon
                        }
                      >
                        <Ionicons
                          name="calendar-outline"
                          size={17}
                          color="#64748B"
                        />
                      </View>

                      <View
                        style={
                          styles.accountInfoTextArea
                        }
                      >
                        <Text
                          style={
                            styles.accountInfoLabel
                          }
                        >
                          สร้างบัญชีเมื่อ
                        </Text>

                        <Text
                          style={
                            styles.accountInfoValue
                          }
                        >
                          {formatDate(
                            user.created_at
                          )}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={
                        styles.accountDivider
                      }
                    />

                    <View
                      style={
                        styles.accountInfoRow
                      }
                    >
                      <View
                        style={
                          styles.accountInfoIcon
                        }
                      >
                        <Ionicons
                          name="time-outline"
                          size={17}
                          color="#64748B"
                        />
                      </View>

                      <View
                        style={
                          styles.accountInfoTextArea
                        }
                      >
                        <Text
                          style={
                            styles.accountInfoLabel
                          }
                        >
                          เข้าสู่ระบบล่าสุด
                        </Text>

                        <Text
                          style={
                            styles.accountInfoValue
                          }
                        >
                          {formatDate(
                            user.last_sign_in_at
                          )}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* เปิดหน้ารายการความคิดเห็นโดยตรง */}
                  <Pressable
                    onPress={
                      handleOpenFeedback
                    }
                    style={({
                      pressed,
                    }) => [
                      styles.actionButton,

                      pressed &&
                        styles.pressedEffect,
                    ]}
                  >
                    <View
                      style={
                        styles.actionIconBox
                      }
                    >
                      <Ionicons
                        name="chatbubble-ellipses-outline"
                        size={20}
                        color="#FFFFFF"
                      />
                    </View>

                    <View
                      style={
                        styles.actionTextArea
                      }
                    >
                      <Text
                        style={
                          styles.actionButtonText
                        }
                      >
                        ความคิดเห็นและรีวิว
                      </Text>

                      <Text
                        style={
                          styles.actionButtonSubtext
                        }
                      >
                        ดูรายการความคิดเห็นและแก้ไขรีวิวที่เคยส่ง
                      </Text>
                    </View>

                    <Ionicons
                      name="chevron-forward"
                      size={21}
                      color="#FFFFFF"
                    />
                  </Pressable>
                </View>

                {/* Logout */}
                <Pressable
                  onPress={
                    handleLogout
                  }
                  style={({
                    pressed,
                  }) => [
                    styles.logoutButton,

                    pressed &&
                      styles.pressedEffect,
                  ]}
                >
                  <Ionicons
                    name="log-out-outline"
                    size={19}
                    color="#EF4444"
                  />

                  <Text
                    style={
                      styles.logoutButtonText
                    }
                  >
                    ออกจากระบบ (Logout)
                  </Text>
                </Pressable>
              </>
            )}
        </ScrollView>

        <HomeDock
          takePhoto={() =>
            router.replace(
              "/(tabs)" as any
            )
          }
          pickImage={() =>
            router.replace(
              "/(tabs)" as any
            )
          }
          scrollToTop={() =>
            router.replace(
              "/(tabs)" as any
            )
          }
          user={user}
          activeTab="profile"
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor:
        "#F9FAFB",
    },

    flexContainer: {
      flex: 1,
    },

    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 120,
      gap: 16,
    },

    headerCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      backgroundColor:
        "#FFFFFF",
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 20,
      borderWidth: 1,
      borderColor:
        "#E5E7EB",
      shadowColor: "#000000",
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.03,
      shadowRadius: 6,
      elevation: 2,
    },

    headerTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flex: 1,
    },

    headerIconContainer: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor:
        "#F0FDF4",
      alignItems: "center",
      justifyContent:
        "center",
    },

    headerTitleText: {
      fontSize: 18,
      fontWeight: "900",
      color: "#111827",
    },

    refreshButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor:
        "#F0FDF4",
      borderWidth: 1,
      borderColor:
        "#BBF7D0",
    },

    refreshButtonText: {
      fontWeight: "800",
      color: "#16A34A",
      fontSize: 12,
    },

    card: {
      backgroundColor:
        "#FFFFFF",
      borderRadius: 20,
      padding: 20,
      borderWidth: 1,
      borderColor:
        "#E5E7EB",
      shadowColor: "#000000",
      shadowOffset: {
        width: 0,
        height: 3,
      },
      shadowOpacity: 0.04,
      shadowRadius: 8,
      elevation: 2,
      gap: 14,
    },

    centerCard: {
      alignItems: "center",
      paddingVertical: 32,
    },

    loadingText: {
      marginTop: 12,
      fontWeight: "700",
      color: "#4B5563",
    },

    errorCard: {
      backgroundColor:
        "#FEF2F2",
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor:
        "#FECACA",
      gap: 8,
    },

    errorTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
    },

    errorTitle: {
      color: "#991B1B",
      fontWeight: "800",
      fontSize: 14,
    },

    errorText: {
      color: "#B91C1C",
      fontSize: 12,
      lineHeight: 18,
    },

    retryButton: {
      alignSelf: "flex-start",
      backgroundColor:
        "#FFFFFF",
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 13,
      borderWidth: 1,
      borderColor:
        "#FCA5A5",
      marginTop: 4,
    },

    retryButtonText: {
      color: "#DC2626",
      fontSize: 12,
      fontWeight: "800",
    },

    loggedOutCard: {
      gap: 12,
    },

    loggedOutIcon: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor:
        "#F0FDF4",
      alignItems: "center",
      justifyContent:
        "center",
    },

    loggedOutText: {
      color: "#64748B",
      fontSize: 12,
      textAlign: "center",
      lineHeight: 18,
    },

    profileCardContainer: {
      borderRadius: 24,
      alignItems: "center",
      gap: 14,
    },

    avatarImage: {
      width: 108,
      height: 108,
      borderRadius: 54,
      backgroundColor:
        "#DCFCE7",
      borderWidth: 4,
      borderColor:
        "#16A34A",
    },

    avatarFallback: {
      width: 108,
      height: 108,
      borderRadius: 54,
      backgroundColor:
        "#16A34A",
      alignItems: "center",
      justifyContent:
        "center",
      borderWidth: 4,
      borderColor:
        "#BBF7D0",
    },

    avatarFallbackText: {
      color: "#FFFFFF",
      fontWeight: "900",
      fontSize: 42,
    },

    secondaryButton: {
      backgroundColor:
        "#F0FDF4",
      borderRadius: 999,
      paddingVertical: 10,
      paddingHorizontal: 17,
      borderWidth: 1,
      borderColor:
        "#BBF7D0",
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "center",
      gap: 7,
    },

    secondaryButtonText: {
      color: "#16A34A",
      fontWeight: "800",
      fontSize: 13,
    },

    inputContainer: {
      width: "100%",
      gap: 6,
      marginTop: 4,
    },

    inputLabel: {
      color: "#374151",
      fontWeight: "800",
      fontSize: 13,
    },

    textInput: {
      backgroundColor:
        "#F9FAFB",
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 13,
      borderWidth: 1,
      borderColor:
        "#E5E7EB",
      color: "#111827",
      fontWeight: "700",
      fontSize: 14,
    },

    characterCount: {
      alignSelf: "flex-end",
      color: "#9CA3AF",
      fontSize: 10,
      fontWeight: "600",
    },

    primaryButton: {
      width: "100%",
      backgroundColor:
        "#16A34A",
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 16,
      alignItems: "center",
      justifyContent:
        "center",
      flexDirection: "row",
      gap: 8,
    },

    primaryButtonText: {
      color: "#FFFFFF",
      fontWeight: "900",
      fontSize: 15,
    },

    sectionTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },

    sectionHeaderTitle: {
      color: "#111827",
      fontWeight: "900",
      fontSize: 16,
    },

    accountInfoContainer: {
      borderRadius: 16,
      backgroundColor:
        "#F9FAFB",
      borderWidth: 1,
      borderColor:
        "#E5E7EB",
      paddingHorizontal: 14,
    },

    accountInfoRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
      paddingVertical: 13,
    },

    accountInfoIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#E5E7EB",
      alignItems: "center",
      justifyContent:
        "center",
    },

    accountInfoTextArea: {
      flex: 1,
      gap: 2,
    },

    accountInfoLabel: {
      color: "#6B7280",
      fontWeight: "700",
      fontSize: 10.5,
    },

    accountInfoValue: {
      color: "#374151",
      fontWeight: "700",
      fontSize: 13,
    },

    accountDivider: {
      height: 1,
      backgroundColor:
        "#E5E7EB",
    },

    actionButton: {
      marginTop: 2,
      backgroundColor:
        "#16A34A",
      borderRadius: 15,
      paddingVertical: 14,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
    },

    actionIconBox: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor:
        "rgba(255,255,255,0.18)",
      alignItems: "center",
      justifyContent:
        "center",
    },

    actionTextArea: {
      flex: 1,
    },

    actionButtonText: {
      color: "#FFFFFF",
      fontWeight: "900",
      fontSize: 14,
    },

    actionButtonSubtext: {
      marginTop: 2,
      color:
        "rgba(255,255,255,0.82)",
      fontWeight: "600",
      fontSize: 10.5,
      lineHeight: 15,
    },

    logoutButton: {
      backgroundColor:
        "#FEF2F2",
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent:
        "center",
      flexDirection: "row",
      gap: 7,
      borderWidth: 1,
      borderColor:
        "#FECACA",
    },

    logoutButtonText: {
      color: "#EF4444",
      fontSize: 15,
      fontWeight: "800",
    },

    pressedEffect: {
      opacity: 0.8,
      transform: [
        {
          scale: 0.98,
        },
      ],
    },
  });