import { Tokens } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Props {
  selected: boolean;
  title: string;
  subtitle?: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}

export function OptionCard({ selected, title, subtitle, iconName, onPress }: Props) {
  const handle = () => {
    Haptics.selectionAsync();
    onPress();
  };

  return (
    <TouchableOpacity
      onPress={handle}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      style={[styles.card, selected && styles.cardSelected]}
    >
      {iconName && (
        <Ionicons
          name={iconName}
          size={24}
          color={selected ? Tokens.accent : Tokens.textPrimary}
          style={styles.icon}
        />
      )}
      <View style={styles.textCol}>
        <Text style={[styles.title, selected && styles.titleSelected]}>{title}</Text>
        {subtitle && (
          <Text style={[styles.subtitle, selected && styles.subtitleSelected]}>{subtitle}</Text>
        )}
      </View>
      {selected && (
        <View style={styles.checkCircle}>
          <Ionicons name="checkmark" size={14} color="#fff" />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Tokens.surfaceRaised,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Tokens.border,
    paddingVertical: 16,
    paddingHorizontal: 18,
    minHeight: 56,
    gap: 14,
  },
  cardSelected: {
    backgroundColor: Tokens.accentTint,
    borderColor: Tokens.accent,
    borderWidth: 1,
  },
  icon: { width: 24 },
  textCol: { flex: 1, gap: 2 },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: Tokens.textPrimary,
    letterSpacing: -0.2,
  },
  titleSelected: { color: Tokens.accent },
  subtitle: {
    fontSize: 13,
    color: Tokens.textSecondary,
  },
  subtitleSelected: { color: Tokens.accent, opacity: 0.85 },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Tokens.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
