import { Sex } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { WizardFormData } from '../GoalsWizard';

interface Step1MetricsProps {
  formData: WizardFormData;
  updateFormData: (updates: Partial<WizardFormData>) => void;
}

export function Step1Metrics({ formData, updateFormData }: Step1MetricsProps) {
  const toggleUnits = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateFormData({ useImperial: !formData.useImperial });
  };

  const selectSex = (sex: Sex) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateFormData({ sex });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Basic Information</Text>
      <Text style={styles.subtitle}>
        We'll use this to calculate your daily calorie needs
      </Text>

      {/* Unit toggle */}
      <View style={styles.unitToggleContainer}>
        <TouchableOpacity
          style={[
            styles.unitOption,
            !formData.useImperial && styles.unitOptionActive,
          ]}
          onPress={() => updateFormData({ useImperial: false })}
        >
          <Text
            style={[
              styles.unitOptionText,
              !formData.useImperial && styles.unitOptionTextActive,
            ]}
          >
            Metric
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.unitOption,
            formData.useImperial && styles.unitOptionActive,
          ]}
          onPress={() => updateFormData({ useImperial: true })}
        >
          <Text
            style={[
              styles.unitOptionText,
              formData.useImperial && styles.unitOptionTextActive,
            ]}
          >
            Imperial
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sex selection */}
      <View style={styles.fieldContainer}>
        <Text style={styles.fieldLabel}>Sex</Text>
        <View style={styles.sexContainer}>
          <TouchableOpacity
            style={[
              styles.sexOption,
              formData.sex === 'male' && styles.sexOptionActive,
            ]}
            onPress={() => selectSex('male')}
          >
            <Ionicons
              name="male"
              size={24}
              color={formData.sex === 'male' ? '#fff' : '#666'}
            />
            <Text
              style={[
                styles.sexOptionText,
                formData.sex === 'male' && styles.sexOptionTextActive,
              ]}
            >
              Male
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sexOption,
              formData.sex === 'female' && styles.sexOptionActive,
            ]}
            onPress={() => selectSex('female')}
          >
            <Ionicons
              name="female"
              size={24}
              color={formData.sex === 'female' ? '#fff' : '#666'}
            />
            <Text
              style={[
                styles.sexOptionText,
                formData.sex === 'female' && styles.sexOptionTextActive,
              ]}
            >
              Female
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Age */}
      <View style={styles.fieldContainer}>
        <Text style={styles.fieldLabel}>Age</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={formData.age}
            onChangeText={(text) => updateFormData({ age: text.replace(/[^0-9]/g, '') })}
            keyboardType="number-pad"
            placeholder="25"
            placeholderTextColor="#aaa"
            maxLength={3}
          />
          <Text style={styles.inputUnit}>years</Text>
        </View>
      </View>

      {/* Height */}
      <View style={styles.fieldContainer}>
        <Text style={styles.fieldLabel}>Height</Text>
        {formData.useImperial ? (
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.inputSmall]}
              value={formData.heightFeet}
              onChangeText={(text) =>
                updateFormData({ heightFeet: text.replace(/[^0-9]/g, '') })
              }
              keyboardType="number-pad"
              placeholder="5"
              placeholderTextColor="#aaa"
              maxLength={1}
            />
            <Text style={styles.inputUnit}>ft</Text>
            <TextInput
              style={[styles.input, styles.inputSmall]}
              value={formData.heightInches}
              onChangeText={(text) =>
                updateFormData({ heightInches: text.replace(/[^0-9]/g, '') })
              }
              keyboardType="number-pad"
              placeholder="10"
              placeholderTextColor="#aaa"
              maxLength={2}
            />
            <Text style={styles.inputUnit}>in</Text>
          </View>
        ) : (
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={formData.heightCm}
              onChangeText={(text) =>
                updateFormData({ heightCm: text.replace(/[^0-9.]/g, '') })
              }
              keyboardType="decimal-pad"
              placeholder="175"
              placeholderTextColor="#aaa"
              maxLength={5}
            />
            <Text style={styles.inputUnit}>cm</Text>
          </View>
        )}
      </View>

      {/* Weight */}
      <View style={styles.fieldContainer}>
        <Text style={styles.fieldLabel}>Weight</Text>
        {formData.useImperial ? (
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={formData.weightLbs}
              onChangeText={(text) =>
                updateFormData({ weightLbs: text.replace(/[^0-9.]/g, '') })
              }
              keyboardType="decimal-pad"
              placeholder="160"
              placeholderTextColor="#aaa"
              maxLength={5}
            />
            <Text style={styles.inputUnit}>lbs</Text>
          </View>
        ) : (
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={formData.weightKg}
              onChangeText={(text) =>
                updateFormData({ weightKg: text.replace(/[^0-9.]/g, '') })
              }
              keyboardType="decimal-pad"
              placeholder="70"
              placeholderTextColor="#aaa"
              maxLength={5}
            />
            <Text style={styles.inputUnit}>kg</Text>
          </View>
        )}
      </View>

      {/* Body Fat (Optional) */}
      <View style={styles.fieldContainer}>
        <View style={styles.labelRow}>
          <Text style={styles.fieldLabel}>Body Fat %</Text>
          <Text style={styles.optionalLabel}>Optional</Text>
        </View>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={formData.bodyFatPercentage}
            onChangeText={(text) =>
              updateFormData({ bodyFatPercentage: text.replace(/[^0-9.]/g, '') })
            }
            keyboardType="decimal-pad"
            placeholder="20"
            placeholderTextColor="#aaa"
            maxLength={4}
          />
          <Text style={styles.inputUnit}>%</Text>
        </View>
        <Text style={styles.fieldHint}>
          Adding body fat % enables more accurate calculations
        </Text>
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
  unitToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  unitOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  unitOptionActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  unitOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#888',
  },
  unitOptionTextActive: {
    color: '#333',
  },
  fieldContainer: {
    marginBottom: 20,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  optionalLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  sexContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  sexOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    gap: 8,
  },
  sexOptionActive: {
    backgroundColor: '#4CAF50',
  },
  sexOptionText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#666',
  },
  sexOptionTextActive: {
    color: '#fff',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    maxWidth: 120,
    height: 48,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: '500',
    color: '#333',
  },
  inputSmall: {
    maxWidth: 80,
  },
  inputUnit: {
    fontSize: 14,
    color: '#666',
    minWidth: 30,
  },
  fieldHint: {
    fontSize: 12,
    color: '#888',
    marginTop: 6,
    fontStyle: 'italic',
  },
});
