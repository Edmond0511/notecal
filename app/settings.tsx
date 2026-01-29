import { AuthModal } from "@/components/AuthModal";
import { supabase } from "@/lib/supabase";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { User } from "@supabase/supabase-js";

export default function SettingsScreen() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    // Get initial session
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    Alert.alert(
      "Sign Out",
      "Are you sure you want to sign out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await supabase.auth.signOut();
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Account Section */}
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.section}>
          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#666" />
            </View>
          ) : user ? (
            <>
              {/* User Info */}
              <View style={styles.userRow}>
                <View style={styles.avatarContainer}>
                  <Text style={styles.avatarText}>
                    {user.email?.charAt(0).toUpperCase() || "U"}
                  </Text>
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.userEmail} numberOfLines={1}>
                    {user.email}
                  </Text>
                  <Text style={styles.userStatus}>Signed in</Text>
                </View>
                <View style={styles.checkmark}>
                  <Ionicons name="checkmark-circle" size={24} color="#22C55E" />
                </View>
              </View>

              {/* Sign Out Button */}
              <TouchableOpacity
                style={styles.settingsRow}
                onPress={handleSignOut}
                activeOpacity={0.7}
              >
                <View style={styles.settingsRowLeft}>
                  <View style={[styles.iconContainer, { backgroundColor: "#FEE2E2" }]}>
                    <Ionicons name="log-out-outline" size={20} color="#DC2626" />
                  </View>
                  <Text style={[styles.settingsRowText, { color: "#DC2626" }]}>
                    Sign Out
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
              </TouchableOpacity>
            </>
          ) : (
            /* Sign In Button */
            <TouchableOpacity
              style={styles.settingsRow}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowAuthModal(true);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.settingsRowLeft}>
                <View style={[styles.iconContainer, { backgroundColor: "#E0F2FE" }]}>
                  <Ionicons name="person-outline" size={20} color="#0284C7" />
                </View>
                <View>
                  <Text style={styles.settingsRowText}>Sign In</Text>
                  <Text style={styles.settingsRowSubtext}>
                    Sync across devices
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>
          )}
        </View>

        {/* About Section */}
        <Text style={styles.sectionLabel}>About</Text>
        <View style={styles.section}>
          <View style={styles.settingsRow}>
            <View style={styles.settingsRowLeft}>
              <View style={[styles.iconContainer, { backgroundColor: "#F0FDF4" }]}>
                <Text style={{ fontSize: 18 }}>🥗</Text>
              </View>
              <View>
                <Text style={styles.settingsRowText}>NoteCal</Text>
                <Text style={styles.settingsRowSubtext}>Version 1.0.0</Text>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* Auth Modal */}
      <AuthModal
        visible={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onAuthSuccess={() => {
          setShowAuthModal(false);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#333",
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingTop: 24,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginLeft: 16,
    marginBottom: 8,
  },
  section: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#eee",
    marginBottom: 32,
  },
  loadingRow: {
    paddingVertical: 20,
    alignItems: "center",
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#E0F2FE",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0284C7",
  },
  userInfo: {
    flex: 1,
  },
  userEmail: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 2,
  },
  userStatus: {
    fontSize: 13,
    color: "#22C55E",
    fontWeight: "500",
  },
  checkmark: {
    marginLeft: 8,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  settingsRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  settingsRowText: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1a1a1a",
  },
  settingsRowSubtext: {
    fontSize: 13,
    color: "#666",
    marginTop: 2,
  },
});
