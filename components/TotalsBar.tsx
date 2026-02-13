import { AnimatedDigits, AnimationMode } from "@/components/AnimatedDigits";
import { OfflinePill } from "@/components/OfflinePill";
import { Ionicons } from "@expo/vector-icons";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import {
  faDroplet,
  faDrumstickBite,
  faFireFlameCurved,
  faWheatAwn,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-native-fontawesome";
import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

// ─── Change this to try different animation styles ───
const ANIMATION_MODE: AnimationMode = "rolling";

const icons = {
  fire: faFireFlameCurved as IconProp,
  protein: faDrumstickBite as IconProp,
  fat: faDroplet as IconProp,
  carbs: faWheatAwn as IconProp,
};

interface TotalsBarProps {
  dailyTotals: {
    kcal: number;
    protein: number;
    fat: number;
    carbs: number;
  };
  isOnline: boolean;
  onAddSavedPress: () => void;
  onTotalsPress: () => void;
}

function arePropsEqual(prev: TotalsBarProps, next: TotalsBarProps) {
  return (
    prev.dailyTotals.kcal === next.dailyTotals.kcal &&
    prev.dailyTotals.protein === next.dailyTotals.protein &&
    prev.dailyTotals.fat === next.dailyTotals.fat &&
    prev.dailyTotals.carbs === next.dailyTotals.carbs &&
    prev.isOnline === next.isOnline &&
    prev.onAddSavedPress === next.onAddSavedPress &&
    prev.onTotalsPress === next.onTotalsPress
  );
}

export const TotalsBar = React.memo(function TotalsBar({
  dailyTotals,
  isOnline,
  onAddSavedPress,
  onTotalsPress,
}: TotalsBarProps) {
  return (
    <View style={styles.container}>
      <OfflinePill visible={!isOnline} />

      <View style={styles.row}>
        {/* Add saved entry button */}
        <TouchableOpacity
          style={styles.addSavedButton}
          onPress={onAddSavedPress}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={24} color="#1A6872" />
        </TouchableOpacity>

        {/* Daily Totals Bar - Tap to open goals popup */}
        <TouchableOpacity
          style={styles.totalsBar}
          onPress={onTotalsPress}
          activeOpacity={0.8}
        >
          <View style={styles.totalItem}>
            <AnimatedDigits value={dailyTotals.kcal} maxDigits={5} style={styles.totalValue} mode={ANIMATION_MODE} />
            <FontAwesomeIcon
              icon={icons.fire}
              size={14}
              color="#FF6B35"
              style={styles.totalIcon}
            />
          </View>
          <View style={styles.totalDivider} />
          <View style={styles.totalItem}>
            <AnimatedDigits value={dailyTotals.protein} maxDigits={4} style={styles.totalValue} mode={ANIMATION_MODE} />
            <FontAwesomeIcon
              icon={icons.protein}
              size={14}
              color="#4A90D9"
              style={styles.totalIcon}
            />
          </View>
          <View style={styles.totalDivider} />
          <View style={styles.totalItem}>
            <AnimatedDigits value={dailyTotals.fat} maxDigits={4} style={styles.totalValue} mode={ANIMATION_MODE} />
            <FontAwesomeIcon
              icon={icons.fat}
              size={14}
              color="#F5A623"
              style={styles.totalIcon}
            />
          </View>
          <View style={styles.totalDivider} />
          <View style={styles.totalItem}>
            <AnimatedDigits value={dailyTotals.carbs} maxDigits={4} style={styles.totalValue} mode={ANIMATION_MODE} />
            <FontAwesomeIcon
              icon={icons.carbs}
              size={14}
              color="#9B6B9E"
              style={styles.totalIcon}
            />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}, arePropsEqual);

const styles = StyleSheet.create({
  container: {
    flexDirection: "column",
    alignItems: "center",
    paddingHorizontal: 16,
    backgroundColor: "transparent",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  addSavedButton: {
    marginRight: 12,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E0F2F1",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  totalsBar: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    backgroundColor: "#ffffffee",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 26,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  totalItem: {
    flex: 1,
    maxWidth: 64,
    alignItems: "center",
    paddingHorizontal: 4,
  },
  totalValue: {
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "600",
    color: "#222",
    letterSpacing: -0.3,
  },
  totalIcon: {
    marginTop: 3,
  },
  totalDivider: {
    width: 1,
    height: 24,
    backgroundColor: "#e0e0e0",
  },
});
