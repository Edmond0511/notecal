import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Keyboard, StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
  onLogWaterPress: () => void;
}

export function AddActionMenu({
  visible,
  onClose,
  onSavedEntriesPress,
  onScanBarcodePress,
  onLogWeightPress,
  onSnapFoodPress,
  onSearchDatabasePress,
  onLogWaterPress,
}: AddActionMenuProps) {
  const { contentMaxWidth, isRegular, actionGridColumns } = useResponsiveLayout();

  React.useEffect(() => {
    if (visible) Keyboard.dismiss();
  }, [visible]);

  if (!visible) return null;

  // Width % per tile so we hit `actionGridColumns` per row with the 12px gap.
  // 47% (2 cols on iPhone) / 31% (3 cols on iPad) — both leave room for gap.
  const tileWidthPercent =
    actionGridColumns === 3 ? "31%" : "47%";

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
        style={[
          styles.menuWrapper,
          isRegular && {
            maxWidth: contentMaxWidth,
            width: contentMaxWidth,
            alignSelf: "center",
            marginHorizontal: 0,
          },
        ]}
      >
        <View style={styles.menuGrid}>
          <TouchableOpacity
            style={[styles.menuItem, { width: tileWidthPercent }]}
            activeOpacity={0.7}
            onPress={onScanBarcodePress}
            accessibilityRole="button"
            accessibilityLabel="Scan barcode"
          >
            <Ionicons name="barcode-outline" size={28} color="#1a1a1a" />
            <Text style={styles.menuLabel}>Scan Barcode</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { width: tileWidthPercent }]}
            activeOpacity={0.7}
            onPress={onSnapFoodPress}
            accessibilityRole="button"
            accessibilityLabel="Snap a photo of food"
          >
            <Ionicons name="camera-outline" size={28} color="#1a1a1a" />
            <Text style={styles.menuLabel}>Snap Food</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { width: tileWidthPercent }]}
            activeOpacity={0.7}
            onPress={onSearchDatabasePress}
            accessibilityRole="button"
            accessibilityLabel="Search food database"
          >
            <Ionicons name="search-outline" size={28} color="#1a1a1a" />
            <Text style={styles.menuLabel}>Search Foods</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { width: tileWidthPercent }]}
            activeOpacity={0.7}
            onPress={onLogWaterPress}
            accessibilityRole="button"
            accessibilityLabel="Log water"
          >
            <Ionicons name="water-outline" size={28} color="#1a1a1a" />
            <Text style={styles.menuLabel}>Log Water</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { width: tileWidthPercent }]}
            activeOpacity={0.7}
            onPress={onLogWeightPress}
            accessibilityRole="button"
            accessibilityLabel="Log weight"
          >
            <Ionicons name="scale-outline" size={28} color="#1a1a1a" />
            <Text style={styles.menuLabel}>Log Weight</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, { width: tileWidthPercent }]}
            activeOpacity={0.7}
            onPress={onSavedEntriesPress}
            accessibilityRole="button"
            accessibilityLabel="Open saved entries"
          >
            <Ionicons name="bookmark-outline" size={28} color="#1a1a1a" />
            <Text style={styles.menuLabel}>Saved Entries</Text>
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
  menuGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  menuItem: {
    flexGrow: 1,
    minHeight: 88,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 20,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 12,
    elevation: 6,
  },
  menuLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    letterSpacing: -0.2,
  },
});
