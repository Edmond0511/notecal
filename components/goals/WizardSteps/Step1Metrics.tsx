import { Tokens } from "@/constants/theme";
import { Sex } from "@/types";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faMars, faVenus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-native-fontawesome";
import SegmentedControl from "@react-native-segmented-control/segmented-control";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { WizardFormData } from "../GoalsWizard";

// Cast icons to IconProp to fix type mismatch between FA packages
const icons = {
  mars: faMars as IconProp,
  venus: faVenus as IconProp,
};

interface Step1MetricsProps {
  formData: WizardFormData;
  updateFormData: (updates: Partial<WizardFormData>) => void;
}

export function Step1Metrics({ formData, updateFormData }: Step1MetricsProps) {
  const toggleHeightUnits = (useImperial: boolean) => {
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (useImperial) {
      const cm = parseFloat(formData.heightCm) || 0;
      if (cm > 0) {
        const totalInches = cm / 2.54;
        const feet = Math.floor(totalInches / 12);
        const inches = Math.round(totalInches % 12);
        updateFormData({
          heightUseImperial: true,
          heightFeet: feet.toString(),
          heightInches: (inches === 12 ? 0 : inches).toString(),
        });
      } else {
        updateFormData({ heightUseImperial: true });
      }
    } else {
      const feet = parseFloat(formData.heightFeet) || 0;
      const inches = parseFloat(formData.heightInches) || 0;
      if (feet > 0 || inches > 0) {
        const cm = Math.round((feet * 30.48 + inches * 2.54) * 10) / 10;
        updateFormData({ heightUseImperial: false, heightCm: cm.toString() });
      } else {
        updateFormData({ heightUseImperial: false });
      }
    }
  };

  const toggleWeightUnits = (useImperial: boolean) => {
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (useImperial) {
      const kg = parseFloat(formData.weightKg) || 0;
      if (kg > 0) {
        const lbs = Math.round(kg * 2.20462 * 10) / 10;
        updateFormData({ weightUseImperial: true, weightLbs: lbs.toString() });
      } else {
        updateFormData({ weightUseImperial: true });
      }
    } else {
      const lbs = parseFloat(formData.weightLbs) || 0;
      if (lbs > 0) {
        const kg = Math.round(lbs * 0.453592 * 10) / 10;
        updateFormData({ weightUseImperial: false, weightKg: kg.toString() });
      } else {
        updateFormData({ weightUseImperial: false });
      }
    }
  };

  const selectSex = (sex: Sex) => {
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateFormData({ sex });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Basic Information</Text>
      <Text style={styles.subtitle}>
        We'll use this to calculate your daily calorie needs
      </Text>

      {/* Sex selection card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Sex</Text>
        <View style={styles.sexContainer}>
          <TouchableOpacity
            style={[
              styles.sexOption,
              formData.sex === "male" && styles.sexOptionActive,
            ]}
            onPress={() => selectSex("male")}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.sexIconContainer,
                formData.sex === "male" && styles.sexIconContainerActive,
              ]}
            >
              <FontAwesomeIcon
                icon={icons.mars}
                size={20}
                color={formData.sex === "male" ? "#fff" : "#1A6872"}
              />
            </View>
            <Text
              style={[
                styles.sexOptionText,
                formData.sex === "male" && styles.sexOptionTextActive,
              ]}
            >
              Male
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sexOption,
              formData.sex === "female" && styles.sexOptionActive,
            ]}
            onPress={() => selectSex("female")}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.sexIconContainer,
                formData.sex === "female" && styles.sexIconContainerActive,
              ]}
            >
              <FontAwesomeIcon
                icon={icons.venus}
                size={20}
                color={formData.sex === "female" ? "#fff" : "#1A6872"}
              />
            </View>
            <Text
              style={[
                styles.sexOptionText,
                formData.sex === "female" && styles.sexOptionTextActive,
              ]}
            >
              Female
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Measurements card */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Measurements</Text>

        {/* Age */}
        <View style={styles.fieldContainer}>
          <Text style={[styles.fieldLabel, styles.fieldLabelStandalone]}>Age</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={formData.age}
              onChangeText={(text) =>
                updateFormData({ age: text.replace(/[^0-9]/g, "") })
              }
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
          <View style={styles.fieldHeaderRow}>
            <Text style={styles.fieldLabel}>Height</Text>
            <SegmentedControl
              values={["cm", "ft/in"]}
              selectedIndex={formData.heightUseImperial ? 1 : 0}
              onChange={(event) => {
                toggleHeightUnits(event.nativeEvent.selectedSegmentIndex === 1);
              }}
              style={styles.segmentedControl}
              appearance="light"
            />
          </View>
          {formData.heightUseImperial ? (
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, styles.inputSmall]}
                value={formData.heightFeet}
                onChangeText={(text) =>
                  updateFormData({ heightFeet: text.replace(/[^0-9]/g, "") })
                }
                keyboardType="number-pad"
                placeholder="5"
                placeholderTextColor="#bbb"
                maxLength={1}
              />
              <Text style={styles.inputUnit}>ft</Text>
              <TextInput
                style={[styles.input, styles.inputSmall]}
                value={formData.heightInches}
                onChangeText={(text) =>
                  updateFormData({ heightInches: text.replace(/[^0-9]/g, "") })
                }
                keyboardType="number-pad"
                placeholder="10"
                placeholderTextColor="#bbb"
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
                  updateFormData({ heightCm: text.replace(/[^0-9.]/g, "") })
                }
                keyboardType="decimal-pad"
                placeholder="175"
                placeholderTextColor="#bbb"
                maxLength={5}
              />
              <Text style={styles.inputUnit}>cm</Text>
            </View>
          )}
        </View>

        {/* Weight */}
        <View style={[styles.fieldContainer, { marginBottom: 0 }]}>
          <View style={styles.fieldHeaderRow}>
            <Text style={styles.fieldLabel}>Weight</Text>
            <SegmentedControl
              values={["kg", "lbs"]}
              selectedIndex={formData.weightUseImperial ? 1 : 0}
              onChange={(event) => {
                toggleWeightUnits(event.nativeEvent.selectedSegmentIndex === 1);
              }}
              style={styles.segmentedControl}
              appearance="light"
            />
          </View>
          {formData.weightUseImperial ? (
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={formData.weightLbs}
                onChangeText={(text) =>
                  updateFormData({ weightLbs: text.replace(/[^0-9.]/g, "") })
                }
                keyboardType="decimal-pad"
                placeholder="160"
                placeholderTextColor="#bbb"
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
                  updateFormData({ weightKg: text.replace(/[^0-9.]/g, "") })
                }
                keyboardType="decimal-pad"
                placeholder="70"
                placeholderTextColor="#bbb"
                maxLength={5}
              />
              <Text style={styles.inputUnit}>kg</Text>
            </View>
          )}
        </View>
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
    color: "#333",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 24,
    lineHeight: 20,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#333",
    marginBottom: 12,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  fieldHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#666",
  },
  fieldLabelStandalone: {
    marginBottom: 18,
  },
  segmentedControl: {
    width: 120,
  },
  sexContainer: {
    flexDirection: "row",
    gap: 12,
  },
  sexOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#fff",
  },
  sexOptionActive: {
    backgroundColor: "#E0F2F1",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sexIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E0F2F1",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  sexIconContainerActive: {
    backgroundColor: "#1A6872",
  },
  sexOptionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
  sexOptionTextActive: {
    color: "#1A6872",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  input: {
    flex: 1,
    maxWidth: 120,
    height: 48,
    backgroundColor: "#F3F4F6",
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: "500",
    color: "#333",
  },
  inputSmall: {
    maxWidth: 80,
  },
  inputUnit: {
    fontSize: 14,
    color: "#666",
    minWidth: 30,
  },
});
