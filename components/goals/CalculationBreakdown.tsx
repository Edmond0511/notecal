import { Tokens } from "@/constants/theme";
import { UserGoals } from "@/types";
import {
  getActivityLevelDescription,
  getGoalTypeDescription,
  kgToLbs,
} from "@/utils/goalsCalculator";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeInUp, FadeOutUp } from "react-native-reanimated";

type ExplanationKey = "bmr" | "tdee" | "target";

const EXPLANATIONS: Record<
  ExplanationKey,
  { title: string; description: string; formula: string }
> = {
  bmr: {
    title: "BMR (Basal Metabolic Rate)",
    description:
      "The calories your body burns at complete rest — just to keep vital organs like your heart, lungs, and brain functioning.",
    formula:
      "Calculated using the Mifflin-St Jeor equation based on your sex, age, height, and weight.",
  },
  tdee: {
    title: "TDEE (Total Daily Energy Expenditure)",
    description:
      "Your BMR plus calories burned through daily activity and exercise. This is your estimated total daily calorie burn.",
    formula: "TDEE = BMR × Activity Multiplier",
  },
  target: {
    title: "Daily Calorie Target",
    description:
      "The number of calories you should eat each day to reach your goal. Adjusted from your TDEE to create a deficit, surplus, or maintenance balance.",
    formula: "Target = TDEE + Goal Adjustment",
  },
};

function ExplanationPopup({
  type,
  visible,
  onClose,
}: {
  type: ExplanationKey;
  visible: boolean;
  onClose: () => void;
}) {
  const explanation = EXPLANATIONS[type];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.popupOverlay}>
        <TouchableOpacity
          style={styles.popupBackdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <Animated.View entering={FadeIn.duration(200)} style={styles.popup}>
          <Text style={styles.popupTitle}>{explanation.title}</Text>
          <Text style={styles.popupDescription}>{explanation.description}</Text>
          <Text style={styles.popupFormula}>{explanation.formula}</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

interface CalculationBreakdownProps {
  goals: UserGoals;
  useImperial?: boolean;
}

export function CalculationBreakdown({ goals, useImperial }: CalculationBreakdownProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeExplanation, setActiveExplanation] = useState<ExplanationKey | null>(null);
  const activityInfo = getActivityLevelDescription(goals.activityLevel);
  const goalInfo = getGoalTypeDescription(goals.goalType);
  const goalAdjustment = goals.targetKcal - goals.tdee;

  const toggleExpanded = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpanded((prev) => !prev);
  };

  const handlePress = (type: ExplanationKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveExplanation(type);
  };

  const hasWeightTarget =
    goals.targetWeightKg != null &&
    goals.timelineWeeks != null &&
    goals.timelineWeeks > 0 &&
    goals.targetWeightKg !== goals.weightKg;

  let targetCaption: string;
  if (hasWeightTarget) {
    const weeklyKg = Math.abs(
      (goals.targetWeightKg! - goals.weightKg) / goals.timelineWeeks!,
    );
    const weeklyDisplay = useImperial
      ? `${kgToLbs(weeklyKg).toFixed(1)} lb/wk`
      : `${weeklyKg.toFixed(1)} kg/wk`;
    const adjSign = goalAdjustment > 0 ? "+" : "−";
    targetCaption = `${weeklyDisplay} → ${adjSign}${Math.abs(goalAdjustment)} cal`;
  } else if (goalAdjustment === 0) {
    targetCaption = `${goalInfo.title} · no adjustment`;
  } else {
    targetCaption = `${goalInfo.title} · ${goalAdjustment > 0 ? "surplus" : "deficit"}`;
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.headerRow}
        onPress={toggleExpanded}
        activeOpacity={0.6}
      >
        <Text style={styles.headerText}>How is this calculated?</Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={14}
          color={Tokens.textSecondary}
        />
      </TouchableOpacity>

      {expanded && (
        <Animated.View
          entering={FadeInUp.duration(220)}
          exiting={FadeOutUp.duration(150)}
          style={styles.body}
        >
          <Step
            label="BMR"
            value={goals.bmr}
            caption="Mifflin-St Jeor · resting metabolic rate"
            onInfoPress={() => handlePress("bmr")}
          />

          <View style={styles.divider} />

          <Step
            label="TDEE"
            value={goals.tdee}
            caption={`${activityInfo.title} · daily energy burned`}
            onInfoPress={() => handlePress("tdee")}
          />

          <View style={styles.divider} />

          <Step
            label="Target"
            value={goals.targetKcal}
            caption={targetCaption}
            accent
            onInfoPress={() => handlePress("target")}
          />
        </Animated.View>
      )}

      <ExplanationPopup
        type={activeExplanation ?? "bmr"}
        visible={activeExplanation !== null}
        onClose={() => setActiveExplanation(null)}
      />
    </View>
  );
}

interface StepProps {
  label: string;
  value: number;
  caption: string;
  accent?: boolean;
  onInfoPress: () => void;
}

function Step({ label, value, caption, accent, onInfoPress }: StepProps) {
  return (
    <View style={styles.step}>
      <View style={styles.stepRow}>
        <TouchableOpacity
          style={styles.stepLabelRow}
          onPress={onInfoPress}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.6}
        >
          <Text style={styles.stepLabel}>{label}</Text>
          <Ionicons
            name="information-circle-outline"
            size={14}
            color={Tokens.textTertiary}
            style={styles.infoIcon}
          />
        </TouchableOpacity>
        <Text style={[styles.stepValue, accent && styles.targetValue]}>
          {value}
          <Text style={[styles.unit, accent && styles.targetUnit]}> cal</Text>
        </Text>
      </View>
      <Text style={styles.caption}>{caption}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    marginTop: 4,
    marginBottom: 24,
    alignItems: "center",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: Tokens.surface,
  },
  headerText: {
    fontSize: 13,
    fontWeight: "500",
    color: Tokens.textSecondary,
    letterSpacing: -0.1,
  },
  body: {
    alignSelf: "stretch",
    marginTop: 12,
  },
  step: {
    paddingVertical: 14,
  },
  stepRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  stepLabelRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Tokens.textPrimary,
    letterSpacing: -0.2,
  },
  infoIcon: {
    marginLeft: 4,
  },
  stepValue: {
    fontSize: 20,
    fontWeight: "700",
    color: Tokens.textPrimary,
    letterSpacing: -0.3,
    fontVariant: ["tabular-nums"],
  },
  targetValue: {
    color: Tokens.macroKcal,
  },
  unit: {
    fontSize: 13,
    fontWeight: "500",
    color: Tokens.textSecondary,
  },
  targetUnit: {
    color: "#FF8A65",
  },
  caption: {
    fontSize: 12,
    color: Tokens.textTertiary,
    letterSpacing: -0.1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Tokens.border,
  },
  popupOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  popupBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  popup: {
    backgroundColor: Tokens.surfaceRaised,
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    maxWidth: 320,
    ...Tokens.shadowMedium,
  },
  popupTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: Tokens.textPrimary,
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  popupDescription: {
    fontSize: 14,
    color: Tokens.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  popupFormula: {
    fontSize: 13,
    color: Tokens.textTertiary,
    fontStyle: "italic",
  },
});
