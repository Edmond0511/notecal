import { Tokens } from "@/constants/theme";
import { useAppStore } from "@/store/app-store";
import {
  calculateBMI,
  cmToFeetInches,
  feetInchesToCm,
  kgToLbs,
  lbsToKg,
} from "@/utils/goalsCalculator";
import {
  isLiquidGlassSupported,
  LiquidGlassView,
} from "@callstack/liquid-glass";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { KeyboardAwareScrollView, KeyboardProvider } from "react-native-keyboard-controller";
import React, { useEffect, useState } from "react";
import {
  Dimensions,
  Keyboard,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BmiNumberLine } from "./BmiNumberLine";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const DISMISS_THRESHOLD = 150;

type EditingField = "age" | "sex" | "height" | "weight" | null;

interface PersonalInfoModalProps {
  visible: boolean;
  onClose: () => void;
}

export function PersonalInfoModal({
  visible,
  onClose,
}: PersonalInfoModalProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const isScrolledToTop = useSharedValue(true);
  const goals = useAppStore((s) => s.goals);
  const preferredUnits = useAppStore((s) => s.preferredUnits);
  const setGoals = useAppStore((s) => s.setGoals);

  // Editing state
  const [editingField, setEditingField] = useState<EditingField>(null);
  const [editAge, setEditAge] = useState("");
  const [editSex, setEditSex] = useState<"male" | "female">("male");
  const [editHeightCm, setEditHeightCm] = useState("");
  const [editHeightFeet, setEditHeightFeet] = useState("");
  const [editHeightInches, setEditHeightInches] = useState("");
  const [editWeightKg, setEditWeightKg] = useState("");
  const [editWeightLbs, setEditWeightLbs] = useState("");
  // Per-field unit toggles (independent of global preferredUnits)
  const [heightUnit, setHeightUnit] = useState<"metric" | "imperial">("metric");
  const [weightUnit, setWeightUnit] = useState<"metric" | "imperial">("metric");

  // Initialize edit values from goals on open
  useEffect(() => {
    if (visible && goals) {
      translateY.value = 0;
      isScrolledToTop.value = true;
      setEditingField(null);
      setEditAge(String(goals.age));
      setEditSex(goals.sex);
      setEditHeightCm(String(goals.heightCm));
      const { feet, inches } = cmToFeetInches(goals.heightCm);
      setEditHeightFeet(String(feet));
      setEditHeightInches(String(inches));
      setEditWeightKg(String(goals.weightKg));
      setEditWeightLbs(String(kgToLbs(goals.weightKg)));
      setHeightUnit(preferredUnits);
      setWeightUnit(preferredUnits);
    }
  }, [visible]);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    onClose();
  };

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (isScrolledToTop.value && event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_THRESHOLD) {
        translateY.value = withSpring(SCREEN_HEIGHT, {
          damping: 20,
          stiffness: 200,
        });
        runOnJS(handleClose)();
      } else {
        translateY.value = withSpring(0, {
          damping: 20,
          stiffness: 400,
        });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, SCREEN_HEIGHT * 0.5],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const handleScroll = (event: any) => {
    isScrolledToTop.value = event.nativeEvent.contentOffset.y <= 0;
  };

  if (!goals) return null;

  // Current edit values resolved to metric (using per-field unit choice)
  const currentWeightKg =
    weightUnit === "imperial"
      ? lbsToKg(parseFloat(editWeightLbs) || 0)
      : parseFloat(editWeightKg) || 0;
  const currentHeightCm =
    heightUnit === "imperial"
      ? feetInchesToCm(
          parseInt(editHeightFeet) || 0,
          parseInt(editHeightInches) || 0,
        )
      : parseFloat(editHeightCm) || 0;
  const currentAge = parseInt(editAge) || 0;

  // Live BMI
  const bmi =
    currentWeightKg > 0 && currentHeightCm > 0
      ? calculateBMI(currentWeightKg, currentHeightCm)
      : calculateBMI(goals.weightKg, goals.heightCm);

  // Check if values have changed
  const hasChanges =
    currentAge !== goals.age ||
    editSex !== goals.sex ||
    Math.abs(currentHeightCm - goals.heightCm) > 0.1 ||
    Math.abs(currentWeightKg - goals.weightKg) > 0.05;

  const handleTapField = (field: EditingField) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingField(editingField === field ? null : field);
  };

  const handleSave = () => {
    if (!goals || !hasChanges) return;

    // Validate
    if (currentAge < 18 || currentAge > 100) return;
    if (currentHeightCm < 100 || currentHeightCm > 275) return;
    if (currentWeightKg < 30 || currentWeightKg > 300) return;

    setGoals({
      ...goals,
      sex: editSex,
      age: currentAge,
      heightCm: Math.round(currentHeightCm * 10) / 10,
      weightKg: Math.round(currentWeightKg * 10) / 10,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditingField(null);
    Keyboard.dismiss();
    onClose();
  };

  const toggleHeightUnit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (heightUnit === "metric") {
      // Convert cm → ft/in
      const cm = parseFloat(editHeightCm) || 0;
      if (cm > 0) {
        const { feet, inches } = cmToFeetInches(cm);
        setEditHeightFeet(String(feet));
        setEditHeightInches(String(inches));
      }
      setHeightUnit("imperial");
    } else {
      // Convert ft/in → cm
      const cm = feetInchesToCm(
        parseInt(editHeightFeet) || 0,
        parseInt(editHeightInches) || 0,
      );
      if (cm > 0) setEditHeightCm(String(cm));
      setHeightUnit("metric");
    }
  };

  const toggleWeightUnit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (weightUnit === "metric") {
      // Convert kg → lbs
      const kg = parseFloat(editWeightKg) || 0;
      if (kg > 0) setEditWeightLbs(String(kgToLbs(kg)));
      setWeightUnit("imperial");
    } else {
      // Convert lbs → kg
      const lbs = parseFloat(editWeightLbs) || 0;
      if (lbs > 0) {
        const kg = lbsToKg(lbs);
        setEditWeightKg(String(Math.round(kg * 10) / 10));
      }
      setWeightUnit("metric");
    }
  };

  const renderUnitToggle = (
    current: "metric" | "imperial",
    onToggle: () => void,
    metricLabel: string,
    imperialLabel: string,
  ) => (
    <View style={styles.unitToggleRow}>
      <TouchableOpacity
        style={[styles.unitPill, current === "metric" && styles.unitPillActive]}
        onPress={current === "metric" ? undefined : onToggle}
        activeOpacity={current === "metric" ? 1 : 0.6}
      >
        <Text
          style={[
            styles.unitPillText,
            current === "metric" && styles.unitPillTextActive,
          ]}
        >
          {metricLabel}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[
          styles.unitPill,
          current === "imperial" && styles.unitPillActive,
        ]}
        onPress={current === "imperial" ? undefined : onToggle}
        activeOpacity={current === "imperial" ? 1 : 0.6}
      >
        <Text
          style={[
            styles.unitPillText,
            current === "imperial" && styles.unitPillTextActive,
          ]}
        >
          {imperialLabel}
        </Text>
      </TouchableOpacity>
    </View>
  );

  const renderMetricRow = (
    field: EditingField,
    label: string,
    isLast: boolean,
  ) => {
    const isEditing = editingField === field;
    const displayHeightUnit = isEditing ? heightUnit : preferredUnits;
    const displayWeightUnit = isEditing ? weightUnit : preferredUnits;

    return (
      <View key={field} style={[
        styles.metricRowWrapper,
        isLast && !isEditing && styles.metricRowWrapperLast,
      ]}>
        <TouchableOpacity
          style={styles.metricRow}
          onPress={() => handleTapField(field)}
          activeOpacity={0.6}
        >
          <Text style={styles.metricLabel}>{label}</Text>
          <View style={styles.metricValueContainer}>
            {field === "age" && (
              <Text
                style={[
                  styles.metricValue,
                  isEditing && styles.metricValueEditing,
                ]}
              >
                {editAge || goals.age}
              </Text>
            )}
            {field === "sex" && (
              <Text
                style={[
                  styles.metricValue,
                  isEditing && styles.metricValueEditing,
                ]}
              >
                {editSex === "male" ? "Male" : "Female"}
              </Text>
            )}
            {field === "height" && (
              <>
                <Text
                  style={[
                    styles.metricValue,
                    isEditing && styles.metricValueEditing,
                  ]}
                >
                  {displayHeightUnit === "imperial"
                    ? `${editHeightFeet || 0}'${editHeightInches || 0}"`
                    : editHeightCm || goals.heightCm}
                </Text>
                {displayHeightUnit !== "imperial" && (
                  <Text style={styles.metricUnit}>cm</Text>
                )}
              </>
            )}
            {field === "weight" && (
              <>
                <Text
                  style={[
                    styles.metricValue,
                    isEditing && styles.metricValueEditing,
                  ]}
                >
                  {displayWeightUnit === "imperial"
                    ? editWeightLbs || kgToLbs(goals.weightKg)
                    : editWeightKg || goals.weightKg}
                </Text>
                <Text style={styles.metricUnit}>
                  {displayWeightUnit === "imperial" ? "lbs" : "kg"}
                </Text>
              </>
            )}
            <Ionicons
              name="pencil"
              size={12}
              color={Tokens.textTertiary}
              style={styles.metricEditIcon}
            />
          </View>
        </TouchableOpacity>

        {/* Inline editor */}
        {isEditing && field === "age" && (
          <View style={styles.editRow}>
            <TextInput
              style={styles.editInput}
              value={editAge}
              onChangeText={setEditAge}
              keyboardType="number-pad"
              autoFocus
              selectTextOnFocus
              placeholder="18-100"
              placeholderTextColor={Tokens.textTertiary}
            />
            <Text style={styles.editUnit}>years</Text>
          </View>
        )}
        {isEditing && field === "sex" && (
          <View style={styles.sexToggleRow}>
            <TouchableOpacity
              style={[
                styles.sexPill,
                editSex === "male" && styles.sexPillActive,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setEditSex("male");
              }}
            >
              <Text
                style={[
                  styles.sexPillText,
                  editSex === "male" && styles.sexPillTextActive,
                ]}
              >
                Male
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.sexPill,
                editSex === "female" && styles.sexPillActive,
              ]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setEditSex("female");
              }}
            >
              <Text
                style={[
                  styles.sexPillText,
                  editSex === "female" && styles.sexPillTextActive,
                ]}
              >
                Female
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {isEditing && field === "height" && (
          <View style={styles.editSection}>
            {renderUnitToggle(heightUnit, toggleHeightUnit, "cm", "ft / in")}
            <View style={styles.editRow}>
              {heightUnit === "imperial" ? (
                <>
                  <TextInput
                    style={[styles.editInput, { flex: 1 }]}
                    value={editHeightFeet}
                    onChangeText={(v) => {
                      setEditHeightFeet(v);
                      const cm = feetInchesToCm(
                        parseInt(v) || 0,
                        parseInt(editHeightInches) || 0,
                      );
                      setEditHeightCm(String(cm));
                    }}
                    keyboardType="number-pad"
                    autoFocus
                    selectTextOnFocus
                    placeholder="5"
                    placeholderTextColor={Tokens.textTertiary}
                  />
                  <Text style={styles.editUnit}>ft</Text>
                  <TextInput
                    style={[styles.editInput, { flex: 1, marginLeft: 12 }]}
                    value={editHeightInches}
                    onChangeText={(v) => {
                      setEditHeightInches(v);
                      const cm = feetInchesToCm(
                        parseInt(editHeightFeet) || 0,
                        parseInt(v) || 0,
                      );
                      setEditHeightCm(String(cm));
                    }}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    placeholder="10"
                    placeholderTextColor={Tokens.textTertiary}
                  />
                  <Text style={styles.editUnit}>in</Text>
                </>
              ) : (
                <>
                  <TextInput
                    style={styles.editInput}
                    value={editHeightCm}
                    onChangeText={(v) => {
                      setEditHeightCm(v);
                      const cm = parseFloat(v) || 0;
                      if (cm > 0) {
                        const { feet, inches } = cmToFeetInches(cm);
                        setEditHeightFeet(String(feet));
                        setEditHeightInches(String(inches));
                      }
                    }}
                    keyboardType="decimal-pad"
                    autoFocus
                    selectTextOnFocus
                    placeholder="170"
                    placeholderTextColor={Tokens.textTertiary}
                  />
                  <Text style={styles.editUnit}>cm</Text>
                </>
              )}
            </View>
          </View>
        )}
        {isEditing && field === "weight" && (
          <View style={styles.editSection}>
            {renderUnitToggle(weightUnit, toggleWeightUnit, "kg", "lbs")}
            <View style={styles.editRow}>
              {weightUnit === "imperial" ? (
                <>
                  <TextInput
                    style={styles.editInput}
                    value={editWeightLbs}
                    onChangeText={(v) => {
                      setEditWeightLbs(v);
                      const kg = lbsToKg(parseFloat(v) || 0);
                      setEditWeightKg(String(Math.round(kg * 10) / 10));
                    }}
                    keyboardType="decimal-pad"
                    autoFocus
                    selectTextOnFocus
                    placeholder="150"
                    placeholderTextColor={Tokens.textTertiary}
                  />
                  <Text style={styles.editUnit}>lbs</Text>
                </>
              ) : (
                <>
                  <TextInput
                    style={styles.editInput}
                    value={editWeightKg}
                    onChangeText={(v) => {
                      setEditWeightKg(v);
                      const kg = parseFloat(v) || 0;
                      if (kg > 0) setEditWeightLbs(String(kgToLbs(kg)));
                    }}
                    keyboardType="decimal-pad"
                    autoFocus
                    selectTextOnFocus
                    placeholder="70"
                    placeholderTextColor={Tokens.textTertiary}
                  />
                  <Text style={styles.editUnit}>kg</Text>
                </>
              )}
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardProvider>
      <GestureHandlerRootView style={styles.gestureRoot}>
        <StatusBar barStyle="dark-content" />
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <TouchableOpacity
            style={styles.backdropPressable}
            onPress={handleClose}
            activeOpacity={1}
          />
        </Animated.View>

        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[styles.container, { marginTop: insets.top }, animatedStyle]}
          >
            <View style={styles.dragIndicatorContainer}>
              <View style={styles.dragIndicator} />
            </View>

            <View style={styles.header}>
              <TouchableOpacity
                onPress={handleClose}
                activeOpacity={0.7}
              >
                {isLiquidGlassSupported ? (
                  <LiquidGlassView
                    style={styles.backButton}
                    interactive
                    effect="regular"
                    tintColor="rgba(250, 250, 247, 0.3)"
                  >
                    <Ionicons name="chevron-back" size={20} color={Tokens.textPrimary} />
                  </LiquidGlassView>
                ) : (
                  <View style={[styles.backButton, styles.backButtonFallback]}>
                    <Ionicons name="chevron-back" size={20} color={Tokens.textSecondary} />
                  </View>
                )}
              </TouchableOpacity>
              <Text style={styles.title}>Personal Info</Text>
              <View style={styles.headerRightSpacer} />
            </View>

            <KeyboardAwareScrollView
              style={styles.content}
              contentContainerStyle={[
                styles.contentContainer,
                { paddingBottom: insets.bottom + 80 },
              ]}
              showsVerticalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              bounces={true}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            >
              {/* Metrics */}
              <Animated.View
                entering={FadeInDown.delay(100).duration(400)}
                style={styles.section}
              >
                <Text style={styles.sectionTitle}>Metrics</Text>
                <View style={styles.card}>
                  {renderMetricRow("age", "Age", false)}
                  {renderMetricRow("sex", "Sex", false)}
                  {renderMetricRow("height", "Height", false)}
                  {renderMetricRow("weight", "Weight", true)}
                </View>
              </Animated.View>

              {/* BMI */}
              <Animated.View
                entering={FadeInDown.delay(200).duration(400)}
                style={styles.section}
              >
                <Text style={styles.sectionTitle}>Body Mass Index</Text>
                <View style={styles.cardShadow}>
                  <View style={styles.bmiCard}>
                    <BmiNumberLine bmi={bmi} />
                  </View>
                </View>
              </Animated.View>
            </KeyboardAwareScrollView>

            {/* Save button */}
            {hasChanges && (
              <View
                style={[
                  styles.saveButtonContainer,
                  { paddingBottom: insets.bottom + 12 },
                ]}
              >
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSave}
                  activeOpacity={0.8}
                >
                  <Text style={styles.saveButtonText}>
                    Save
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
      </KeyboardProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  backdropPressable: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "#FCFCFB",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  dragIndicatorContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: "#FCFCFB",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Tokens.border,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FCFCFB",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonFallback: {
    backgroundColor: "#EBEBEB",
  },
  headerRightSpacer: {
    width: 36,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    color: Tokens.textPrimary,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#6B6B6B",
    textTransform: "capitalize",
    marginBottom: 6,
    marginLeft: 0,
  },
  cardShadow: {
    ...Tokens.shadowLight,
  },
  card: {
    backgroundColor: Tokens.surfaceRaised,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.07)",
    ...Tokens.shadowLight,
  },
  bmiCard: {
    backgroundColor: Tokens.surfaceRaised,
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.07)",
  },
  metricRowWrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Tokens.border,
  },
  metricRowWrapperLast: {
    borderBottomWidth: 0,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  metricLabel: {
    fontSize: 14,
    fontWeight: "400",
    color: Tokens.textPrimary,
    letterSpacing: -0.2,
  },
  metricValueContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "600",
    color: Tokens.textPrimary,
  },
  metricValueEditing: {
    color: Tokens.textPrimary,
  },
  metricUnit: {
    fontSize: 13,
    fontWeight: "400",
    color: Tokens.textTertiary,
  },
  metricEditIcon: {
    marginLeft: 4,
    opacity: 0.5,
  },
  // Inline editing styles
  editSection: {
    paddingVertical: 4,
  },
  editRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  editInput: {
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: "600",
    color: Tokens.textPrimary,
    minWidth: 80,
    borderColor: "#E8E7E3",
  },
  editUnit: {
    fontSize: 14,
    fontWeight: "500",
    color: Tokens.textTertiary,
  },
  sexToggleRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  sexPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
  },
  sexPillActive: {
    backgroundColor: "#1A6872",
  },
  sexPillText: {
    fontSize: 15,
    fontWeight: "600",
    color: Tokens.textSecondary,
  },
  sexPillTextActive: {
    color: "#fff",
  },
  unitToggleRow: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 2,
  },
  unitPill: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  unitPillActive: {
    backgroundColor: "#1A6872",
  },
  unitPillText: {
    fontSize: 13,
    fontWeight: "500",
    color: Tokens.textTertiary,
  },
  unitPillTextActive: {
    color: "#fff",
  },
  // Save button
  saveButtonContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "#FCFCFB",
  },
  saveButton: {
    backgroundColor: "#1A6872",
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: "600",
    color: "#fff",
  },
});
