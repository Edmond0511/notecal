import { ActivityLevel } from "@/types";
import { getActivityLevelDescription } from "@/utils/goalsCalculator";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface Step2ActivityProps {
  selectedActivity: ActivityLevel | null;
  onSelect: (level: ActivityLevel) => void;
}

const activityLevels: ActivityLevel[] = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "extra_active",
];

const activityIcons: Record<ActivityLevel, keyof typeof Ionicons.glyphMap> = {
  sedentary: "body-outline",
  light: "walk-outline",
  moderate: "bicycle-outline",
  active: "fitness-outline",
  extra_active: "barbell-outline",
};

export function Step2Activity({
  selectedActivity,
  onSelect,
}: Step2ActivityProps) {
  const handleSelect = (level: ActivityLevel) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(level);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Activity Level</Text>
      <Text style={styles.subtitle}>How active are you on a typical week?</Text>

      <View style={styles.optionsContainer}>
        {activityLevels.map((level) => {
          const { title, description } = getActivityLevelDescription(level);
          const isSelected = selectedActivity === level;

          return (
            <TouchableOpacity
              key={level}
              style={[
                styles.optionCard,
                isSelected && styles.optionCardSelected,
              ]}
              onPress={() => handleSelect(level)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.iconContainer,
                  isSelected && styles.iconContainerSelected,
                ]}
              >
                <Ionicons
                  name={activityIcons[level]}
                  size={24}
                  color={isSelected ? "#fff" : "#1A6872"}
                />
              </View>
              <View style={styles.textContainer}>
                <Text
                  style={[
                    styles.optionTitle,
                    isSelected && styles.optionTitleSelected,
                  ]}
                >
                  {title}
                </Text>
                <Text style={styles.optionDescription}>
                  {description}
                </Text>
              </View>
              {isSelected && (
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color="#1A6872"
                  style={styles.checkIcon}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#333",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 24,
    lineHeight: 20,
  },
  optionsContainer: {
    gap: 12,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#f8f8f8",
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
  },
  optionCardSelected: {
    backgroundColor: "#E0F2F1",
    borderColor: "#1A6872",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E0F2F1",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  iconContainerSelected: {
    backgroundColor: "#1A6872",
  },
  textContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  optionTitleSelected: {
    color: "#1A6872",
  },
  optionDescription: {
    fontSize: 13,
    color: "#666",
  },
  checkIcon: {
    marginLeft: 8,
  },
});
