import { AnimatedDigits } from "@/components/AnimatedDigits";
import { OfflinePill } from "@/components/OfflinePill";
import { SystemFont, Tokens } from "@/constants/theme";
import { useAppStore } from "@/store/app-store";
import { useEntriesForDate } from "@/store/selectors";
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
import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";

const icons = {
  fire: faFireFlameCurved as IconProp,
  protein: faDrumstickBite as IconProp,
  fat: faDroplet as IconProp,
  carbs: faWheatAwn as IconProp,
};

interface TotalsBarProps {
  isOnline: boolean;
  onAddSavedPress: () => void;
  onTotalsPress: () => void;
  useGlass?: boolean;
}

export const TotalsBar = React.memo(function TotalsBar({
  isOnline,
  onAddSavedPress,
  onTotalsPress,
  useGlass,
}: TotalsBarProps) {
  const currentDate = useAppStore((s) => s.currentDate);
  const entries = useEntriesForDate(currentDate);

  const dailyTotals = useMemo(() => {
    let kcal = 0,
      protein = 0,
      fat = 0,
      carbs = 0;
    for (const entry of entries) {
      if (entry.status !== "ok" || !entry.items) continue;
      kcal += entry.inlineKcal || 0;
      for (const item of entry.items) {
        const m = item.macros;
        if (!m) continue;
        protein += m.protein || 0;
        fat += m.fat || 0;
        carbs += m.carbs || 0;
      }
    }
    return { kcal, protein, fat, carbs };
  }, [entries]);

  // Detect date changes → skip animation
  const prevDateRef = useRef(currentDate);
  const [skipAnimation, setSkipAnimation] = useState(false);

  useEffect(() => {
    if (currentDate !== prevDateRef.current) {
      setSkipAnimation(true);
      prevDateRef.current = currentDate;
      requestAnimationFrame(() => setSkipAnimation(false));
    }
  }, [currentDate]);

  const showGlass = (useGlass ?? true) && isLiquidGlassSupported;

  const addButtonContent = (
    <Ionicons name="add" size={32} color={Tokens.accentBright} />
  );

  const totalsContent = (
    <>
      <View style={styles.totalItem}>
        <AnimatedDigits
          value={dailyTotals.kcal}
          maxDigits={5}
          maxWidth={56}
          style={styles.totalValue}
          skipAnimation={skipAnimation}
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
          skipAnimation={skipAnimation}
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
          skipAnimation={skipAnimation}
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
          skipAnimation={skipAnimation}
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
          activeOpacity={0.5}
        >
          {showGlass ? (
            <LiquidGlassView
              style={[styles.addSavedButton, { opacity: 0.9 }]}
              interactive
              effect="regular"
              tintColor={Tokens.accentTint}
              colorScheme="light"
            >
              {addButtonContent}
            </LiquidGlassView>
          ) : (
            <View
              style={[styles.addSavedButton, styles.addSavedButtonFallback, { opacity: 0.9 }]}
              
            >
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
              tintColor={Tokens.tintColor}
              colorScheme="light"
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
});

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
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
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
    fontFamily: SystemFont,
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
