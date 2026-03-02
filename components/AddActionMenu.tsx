import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutDown,
} from "react-native-reanimated";

interface AddActionMenuProps {
  visible: boolean;
  onClose: () => void;
  onSavedEntriesPress: () => void;
  onScanBarcodePress: () => void;
  onLogWeightPress: () => void;
  onSnapFoodPress: () => void;
  onSearchDatabasePress: () => void;
}

export function AddActionMenu({
  visible,
  onClose,
  onSavedEntriesPress,
  onScanBarcodePress,
  onLogWeightPress,
  onSnapFoodPress,
  onSearchDatabasePress,
}: AddActionMenuProps) {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <Animated.View
        entering={FadeIn.duration(200)}
        exiting={FadeOut.duration(200)}
        style={styles.backdrop}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
      </Animated.View>

      <Animated.View
        entering={FadeInDown.duration(200)}
        exiting={FadeOutDown.duration(150)}
        style={styles.menuWrapper}
      >
          <View style={styles.menuRow}>
            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onScanBarcodePress();
              }}
            >
              <Ionicons name="barcode-outline" size={28} color="#1a1a1a" />
              <Text style={styles.menuLabel}>Scan Barcode</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSavedEntriesPress();
              }}
            >
              <Ionicons name="bookmark-outline" size={28} color="#1a1a1a" />
              <Text style={styles.menuLabel}>Saved Entries</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onLogWeightPress();
              }}
            >
              <Ionicons name="scale-outline" size={28} color="#1a1a1a" />
              <Text style={styles.menuLabel}>Log Weight</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSnapFoodPress();
              }}
            >
              <Ionicons name="camera-outline" size={28} color="#1a1a1a" />
              <Text style={styles.menuLabel}>Snap Food</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSearchDatabasePress();
              }}
            >
              <Ionicons name="search-outline" size={28} color="#1a1a1a" />
              <Text style={styles.menuLabel}>Search Foods</Text>
            </TouchableOpacity>
          </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    bottom: 0,
    zIndex: 9999,
    justifyContent: "flex-end",
    alignItems: "center",
    elevation: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  menuWrapper: {
    marginBottom: 140,
    marginHorizontal: 20,
    alignSelf: "stretch",
  },
  menuRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  menuItem: {
    width: "47%",
    flexGrow: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 20,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  menuLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    letterSpacing: -0.2,
  },
});
