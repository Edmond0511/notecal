import { Tokens } from '@/constants/theme';
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

const goalTypes: GoalType[] = ['lose', 'maintain', 'gain'];

const goalIcons: Record<GoalType, keyof typeof Ionicons.glyphMap> = {
  lose: 'trending-down',
  maintain: 'remove-outline',
  gain: 'trending-up',
};

const goalColors: Record<GoalType, string> = {
  lose: '#FB8C00',
  maintain: '#43A047',
  gain: '#1E88E5',
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
          const { title, description } = getGoalTypeDescription(goal);
          const isSelected = selectedGoal === goal;
          const color = goalColors[goal];

          return (
            <TouchableOpacity
              key={goal}
              style={[
                styles.optionCard,
                isSelected && styles.optionCardSelected,
              ]}
              onPress={() => handleSelect(goal)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={goalIcons[goal]}
                size={24}
                color={isSelected ? '#1A6872' : '#333'}
                style={styles.icon}
              />
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
    fontWeight: "600",
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
    borderRadius: 16,
  },
  optionCardSelected: {
    backgroundColor: '#E0F2F1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  icon: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: '#333',
    marginBottom: 2,
  },
  optionTitleSelected: {
    color: '#1A6872',
  },
  optionDescription: {
    fontSize: 13,
    color: '#666',
  },
  checkIcon: {
    marginLeft: 8,
  },
});
