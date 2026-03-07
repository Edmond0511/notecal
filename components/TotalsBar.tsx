import { AnimatedDigits } from "@/components/AnimatedDigits";
import { OfflinePill } from "@/components/OfflinePill";
import { Tokens } from "@/constants/theme";
import {
  isLiquidGlassSupported,
  LiquidGlassView,
} from "@callstack/liquid-glass";
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
  useGlass?: boolean;
  isPagerSettledRef?: React.RefObject<boolean>;
}

function arePropsEqual(prev: TotalsBarProps, next: TotalsBarProps) {
  // Freeze during page transitions — prevent AnimatedDigits flash mid-swipe
  if (next.isPagerSettledRef && !next.isPagerSettledRef.current) {
    return true;
  }
  return (
    prev.dailyTotals.kcal === next.dailyTotals.kcal &&
    prev.dailyTotals.protein === next.dailyTotals.protein &&
    prev.dailyTotals.fat === next.dailyTotals.fat &&
    prev.dailyTotals.carbs === next.dailyTotals.carbs &&
    prev.isOnline === next.isOnline &&
    prev.onAddSavedPress === next.onAddSavedPress &&
    prev.onTotalsPress === next.onTotalsPress &&
    prev.useGlass === next.useGlass
  );
}

export const TotalsBar = React.memo(function TotalsBar({
  dailyTotals,
  isOnline,
  onAddSavedPress,
  onTotalsPress,
  useGlass,
  // isPagerSettledRef is only read inside arePropsEqual, not used in render
}: TotalsBarProps) {
  const showGlass = (useGlass ?? true) && isLiquidGlassSupported;

  const addButtonContent = (
    <Ionicons name="add" size={24} color={Tokens.accentBright} />
  );

  const totalsContent = (
    <>
      <View style={styles.totalItem}>
        <AnimatedDigits
          value={dailyTotals.kcal}
          maxDigits={5}
          maxWidth={56}
          style={styles.totalValue}
        />
        <FontAwesomeIcon
          icon={icons.fire}
          size={14}
          color="#FF6B35"
          style={styles.totalIcon}
        />
      </View>
      <View style={styles.totalDivider} />
      <View style={styles.totalItem}>
        <AnimatedDigits
          value={dailyTotals.protein}
          maxDigits={4}
          maxWidth={56}
          style={styles.totalValue}
        />
        <FontAwesomeIcon
          icon={icons.protein}
          size={14}
          color="#4A90D9"
          style={styles.totalIcon}
        />
      </View>
      <View style={styles.totalDivider} />
      <View style={styles.totalItem}>
        <AnimatedDigits
          value={dailyTotals.fat}
          maxDigits={4}
          maxWidth={56}
          style={styles.totalValue}
        />
        <FontAwesomeIcon
          icon={icons.fat}
          size={14}
          color="#F5A623"
          style={styles.totalIcon}
        />
      </View>
      <View style={styles.totalDivider} />
      <View style={styles.totalItem}>
        <AnimatedDigits
          value={dailyTotals.carbs}
          maxDigits={4}
          maxWidth={56}
          style={styles.totalValue}
        />
        <FontAwesomeIcon
          icon={icons.carbs}
          size={14}
          color="#9B6B9E"
          style={styles.totalIcon}
        />
      </View>
    </>
  );

  return (
    <View style={styles.container}>
      <OfflinePill visible={!isOnline} />

      <View style={styles.row}>
        {/* Add saved entry button */}
        <TouchableOpacity
          style={styles.addSavedButtonWrapper}
          onPress={onAddSavedPress}
          activeOpacity={0.8}
        >
          {showGlass ? (
            <LiquidGlassView
              style={[styles.addSavedButton]}
              interactive
              effect="regular"
              tintColor={Tokens.accentTint}
            >
              {addButtonContent}
            </LiquidGlassView>
          ) : (
            <View style={[styles.addSavedButton, styles.addSavedButtonFallback]}>
              {addButtonContent}
            </View>
          )}
        </TouchableOpacity>

        {/* Daily Totals Bar - Tap to open goals popup */}
        <TouchableOpacity
          style={styles.totalsBarWrapper}
          onPress={onTotalsPress}
          activeOpacity={0.8}
        >
          {showGlass ? (
            <LiquidGlassView
              style={[styles.totalsBar]}
              interactive
              effect="regular"
              tintColor="rgba(250, 250, 247, 0)"
            >
              {totalsContent}
            </LiquidGlassView>
          ) : (
            <View style={[styles.totalsBar, styles.totalsBarFallback]}>
              {totalsContent}
            </View>
          )}
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
  addSavedButtonWrapper: {
    marginRight: 12,
  },
  addSavedButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    ...Tokens.shadowLight,
  },
  addSavedButtonFallback: {
    backgroundColor: Tokens.accentTint,
    ...Tokens.shadowMedium,
  },
  totalsBarWrapper: {
    flex: 1,
  },
  totalsBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 26,
    ...Tokens.shadowLight,
  },
  totalsBarFallback: {
    backgroundColor: Tokens.surface,
    ...Tokens.shadowMedium,
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
    color: Tokens.textPrimary,
    letterSpacing: -0.3,
  },
  totalIcon: {
    marginTop: 3,
  },
  totalDivider: {
    width: 1,
    height: 24,
    backgroundColor: Tokens.border,
  },
});
