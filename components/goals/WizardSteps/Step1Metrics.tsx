import { Sex } from "@/types";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { faMars, faVenus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-native-fontawesome";
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
    updateFormData({ heightUseImperial: useImperial });
  };

  const toggleWeightUnits = (useImperial: boolean) => {
    Keyboard.dismiss();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateFormData({ weightUseImperial: useImperial });
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
          <Text style={styles.fieldLabel}>Age</Text>
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
            <View style={styles.segmentedControl}>
              <TouchableOpacity
                style={[
                  styles.segmentOption,
                  styles.segmentOptionLeft,
                  !formData.heightUseImperial && styles.segmentOptionActive,
                ]}
                onPress={() => toggleHeightUnits(false)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.segmentText,
                    !formData.heightUseImperial && styles.segmentTextActive,
                  ]}
                >
                  cm
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.segmentOption,
                  styles.segmentOptionRight,
                  formData.heightUseImperial && styles.segmentOptionActive,
                ]}
                onPress={() => toggleHeightUnits(true)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.segmentText,
                    formData.heightUseImperial && styles.segmentTextActive,
                  ]}
                >
                  ft/in
                </Text>
              </TouchableOpacity>
            </View>
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
            <View style={styles.segmentedControl}>
              <TouchableOpacity
                style={[
                  styles.segmentOption,
                  styles.segmentOptionLeft,
                  !formData.weightUseImperial && styles.segmentOptionActive,
                ]}
                onPress={() => toggleWeightUnits(false)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.segmentText,
                    !formData.weightUseImperial && styles.segmentTextActive,
                  ]}
                >
                  kg
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.segmentOption,
                  styles.segmentOptionRight,
                  formData.weightUseImperial && styles.segmentOptionActive,
                ]}
                onPress={() => toggleWeightUnits(true)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.segmentText,
                    formData.weightUseImperial && styles.segmentTextActive,
                  ]}
                >
                  lbs
                </Text>
              </TouchableOpacity>
            </View>
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
  card: {
    backgroundColor: "#f8f8f8",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: "600",
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
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: "#e8e8e8",
    borderRadius: 16,
    padding: 2,
  },
  segmentOption: {
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  segmentOptionLeft: {
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  segmentOptionRight: {
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  segmentOptionActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#999",
  },
  segmentTextActive: {
    color: "#333",
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
    borderWidth: 2,
    borderColor: "transparent",
  },
  sexOptionActive: {
    backgroundColor: "#E0F2F1",
    borderColor: "#1A6872",
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
    fontWeight: "600",
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
    backgroundColor: "#fff",
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
