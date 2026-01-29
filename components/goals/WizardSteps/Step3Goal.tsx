import { GoalType } from '@/types';
import { getGoalTypeDescription } from '@/utils/goalsCalculator';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Step3GoalProps {
  selectedGoal: GoalType | null;
  onSelect: (goal: GoalType) => void;
}

const goalTypes: GoalType[] = [
  'lose_fast',
  'lose',
  'maintain',
  'gain',
  'gain_fast',
];

const goalIcons: Record<GoalType, keyof typeof Ionicons.glyphMap> = {
  lose_fast: 'trending-down',
  lose: 'arrow-down-outline',
  maintain: 'remove-outline',
  gain: 'arrow-up-outline',
  gain_fast: 'trending-up',
};

const goalColors: Record<GoalType, string> = {
  lose_fast: '#E53935',
  lose: '#FB8C00',
  maintain: '#43A047',
  gain: '#1E88E5',
  gain_fast: '#7B1FA2',
};

export function Step3Goal({ selectedGoal, onSelect }: Step3GoalProps) {
  const handleSelect = (goal: GoalType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSelect(goal);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Your Goal</Text>
      <Text style={styles.subtitle}>
        What would you like to achieve?
      </Text>

      <View style={styles.optionsContainer}>
        {goalTypes.map((goal) => {
          const { title, description, weeklyChange } = getGoalTypeDescription(goal);
          const isSelected = selectedGoal === goal;
          const color = goalColors[goal];

          return (
            <TouchableOpacity
              key={goal}
              style={[
                styles.optionCard,
                isSelected && styles.optionCardSelected,
                isSelected && { borderColor: color },
              ]}
              onPress={() => handleSelect(goal)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.iconContainer,
                  { backgroundColor: `${color}20` },
                  isSelected && { backgroundColor: color },
                ]}
              >
                <Ionicons
                  name={goalIcons[goal]}
                  size={24}
                  color={isSelected ? '#fff' : color}
                />
              </View>
              <View style={styles.textContainer}>
                <Text
                  style={[
                    styles.optionTitle,
                    isSelected && { color },
                  ]}
                >
                  {title}
                </Text>
                <Text style={styles.optionDescription}>
                  {description}
                </Text>
                <View style={styles.weeklyBadge}>
                  <Ionicons
                    name="calendar-outline"
                    size={12}
                    color="#888"
                  />
                  <Text style={styles.weeklyText}>{weeklyChange}</Text>
                </View>
              </View>
              {isSelected && (
                <Ionicons
                  name="checkmark-circle"
                  size={24}
                  color={color}
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
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 24,
    lineHeight: 20,
  },
  optionsContainer: {
    gap: 12,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f8f8f8',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionCardSelected: {
    backgroundColor: '#fff',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  optionDescription: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
  },
  weeklyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  weeklyText: {
    fontSize: 11,
    color: '#888',
    fontStyle: 'italic',
  },
  checkIcon: {
    marginLeft: 8,
  },
});
