import { Tokens } from "@/constants/theme";
import { useAppStore } from "@/store/app-store";
import { formatWater } from "@/utils/formatNumber";
import {
  WATER_PRESETS,
  formatInUnit,
  toMl,
  type WaterPreset,
  type WaterUnit,
} from "@/utils/waterUnits";
import {
  isLiquidGlassSupported,
  LiquidGlassView,
} from "@callstack/liquid-glass";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect } from "react";
import {
  ActionSheetIOS,
  Dimensions,
  Modal,
  Platform,
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
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, {
  Easing,
  Extrapolation,
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Circle, Defs, LinearGradient, Stop, Svg } from "react-native-svg";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const DISMISS_THRESHOLD = 150;

const RING_SIZE = 200;
const RING_STROKE = 14;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const UNIT_OPTIONS: WaterUnit[] = ["ml", "L", "oz"];

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface WaterTrackingModalProps {
  visible: boolean;
  onClose: () => void;
  nested?: boolean;
}

function WaterRing({ waterMl, targetMl }: { waterMl: number; targetMl: number }) {
  const progress = useSharedValue(0);
  const pct = Math.min(1, targetMl > 0 ? waterMl / targetMl : 0);

  useEffect(() => {
    progress.value = withTiming(pct, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    });
  }, [pct, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUMFERENCE * (1 - progress.value),
  }));

  const formattedCurrent = formatWater(waterMl);
  const formattedTarget = formatWater(targetMl);
  const sameUnit = formattedCurrent.unit === formattedTarget.unit;
  const displayValue = sameUnit
    ? `${formattedCurrent.value} / ${formattedTarget.value}`
    : `${formattedCurrent.value}${formattedCurrent.unit} / ${formattedTarget.value}${formattedTarget.unit}`;
  const unitLabel = sameUnit ? formattedCurrent.unit : "";

  return (
    <View style={ringStyles.container}>
      <Svg width={RING_SIZE} height={RING_SIZE}>
        <Defs>
          <LinearGradient id="waterRingGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#7DC4E8" />
            <Stop offset="1" stopColor="#5AADE0" />
          </LinearGradient>
        </Defs>
        <Circle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke="#E8F2F9"
          strokeWidth={RING_STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={RING_SIZE / 2}
          cy={RING_SIZE / 2}
          r={RING_RADIUS}
          stroke="url(#waterRingGrad)"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
        />
      </Svg>
      <View style={ringStyles.centerOverlay} pointerEvents="none">
        <Text style={ringStyles.centerValue}>{displayValue}</Text>
        {unitLabel ? <Text style={ringStyles.centerUnit}>{unitLabel}</Text> : null}
      </View>
    </View>
  );
}

function PresetChip({
  preset,
  unit,
  onPress,
}: {
  preset: WaterPreset;
  unit: WaterUnit;
  onPress: () => void;
}) {
  const amountText = `${formatInUnit(preset.amountMl, unit)}${unit}`;
  return (
    <TouchableOpacity
      style={presetStyles.chip}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <Text style={presetStyles.label}>{preset.label}</Text>
      <Text style={presetStyles.amount}>{amountText}</Text>
    </TouchableOpacity>
  );
}

export function WaterTrackingModal({
  visible,
  onClose,
  nested,
}: WaterTrackingModalProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);

  const sex = useAppStore((s) => s.goals?.sex);
  const manualWaterTarget = useAppStore((s) => s.goals?.manualTargets?.water);
  const currentDate = useAppStore((s) => s.currentDate);
  // Select a primitive (not the whole DailyTotals object) to keep the snapshot
  // stable for useSyncExternalStore. getDailyTotals returns a fresh object each
  // call, which loops if subscribed to directly.
  const waterMl = useAppStore(
    (s) => s.getDailyTotals(currentDate).water ?? 0,
  );
  const logWater = useAppStore((s) => s.logWater);

  const sexDefault = sex === "female" ? 2700 : 3700;
  const targetMl = manualWaterTarget ?? sexDefault;

  const [amount, setAmount] = React.useState("");
  const [unit, setUnit] = React.useState<WaterUnit>("ml");
  const [showAndroidPicker, setShowAndroidPicker] = React.useState(false);

  const numericAmount = parseFloat(amount);
  const canSave = Number.isFinite(numericAmount) && numericAmount > 0;

  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      setAmount("");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [visible, translateY]);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const handlePresetPress = (preset: WaterPreset) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAmount(formatInUnit(preset.amountMl, unit));
  };

  const openUnitPicker = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...UNIT_OPTIONS, "Cancel"],
          cancelButtonIndex: UNIT_OPTIONS.length,
          title: "Select unit",
        },
        (idx) => {
          if (idx < UNIT_OPTIONS.length) setUnit(UNIT_OPTIONS[idx]);
        },
      );
    } else {
      setShowAndroidPicker(true);
    }
  };

  const handleLogCustom = () => {
    if (!canSave) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    logWater(toMl(numericAmount, unit));
    setAmount("");
  };

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) translateY.value = event.translationY;
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_THRESHOLD) {
        translateY.value = withSpring(SCREEN_HEIGHT, {
          damping: 20,
          stiffness: 200,
        });
        runOnJS(handleClose)();
      } else {
        translateY.value = withSpring(0, { damping: 20, stiffness: 400 });
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

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
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
            style={[
              styles.container,
              { marginTop: insets.top + (nested ? 16 : 0) },
              animatedStyle,
            ]}
          >
            <View style={styles.dragIndicatorContainer}>
              <View style={styles.dragIndicator} />
            </View>

            <View style={styles.header}>
              <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
                {isLiquidGlassSupported ? (
                  <LiquidGlassView
                    style={styles.backButton}
                    interactive
                    effect="regular"
                    colorScheme="light"
                    tintColor="rgba(250, 250, 247, 0.3)"
                  >
                    <Ionicons
                      name="chevron-back"
                      size={20}
                      color={Tokens.textPrimary}
                    />
                  </LiquidGlassView>
                ) : (
                  <View style={[styles.backButton, styles.backButtonFallback]}>
                    <Ionicons name="chevron-back" size={20} color="#666" />
                  </View>
                )}
              </TouchableOpacity>
              <Text style={styles.title}>Log Water</Text>
              <View style={styles.headerRightSpacer} />
            </View>

            <KeyboardAwareScrollView
              style={styles.body}
              contentContainerStyle={{ paddingBottom: 24 }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
            >
              <Animated.View entering={FadeInDown.delay(50).duration(350)}>
                <WaterRing waterMl={waterMl} targetMl={targetMl} />
              </Animated.View>

              <Animated.View
                entering={FadeInDown.delay(150).duration(350)}
                style={styles.customSection}
              >
                <TextInput
                  style={styles.customInput}
                  placeholder="0"
                  placeholderTextColor={Tokens.textTertiary}
                  keyboardType="decimal-pad"
                  keyboardAppearance="light"
                  textAlign="center"
                  value={amount}
                  onChangeText={(t) =>
                    setAmount(
                      t
                        .replace(/[^0-9.]/g, "")
                        .replace(/(\..*)\./g, "$1"),
                    )
                  }
                />
                <TouchableOpacity
                  style={styles.unitDropdown}
                  onPress={openUnitPicker}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                >
                  <Text style={styles.unitDropdownText}>{unit}</Text>
                  <Ionicons
                    name="chevron-down"
                    size={12}
                    color={Tokens.textTertiary}
                  />
                </TouchableOpacity>
              </Animated.View>

              <Animated.View entering={FadeInDown.delay(200).duration(350)} style={styles.section}>
                <Text style={styles.sectionTitle}>Quick Add</Text>
                <View style={styles.presetGrid}>
                  {WATER_PRESETS.map((preset) => (
                    <PresetChip
                      key={preset.id}
                      preset={preset}
                      unit={unit}
                      onPress={() => handlePresetPress(preset)}
                    />
                  ))}
                </View>
              </Animated.View>
            </KeyboardAwareScrollView>

            <View
              style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}
            >
              <TouchableOpacity
                style={[
                  styles.logButton,
                  !canSave && styles.logButtonDisabled,
                ]}
                onPress={handleLogCustom}
                disabled={!canSave}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.logButtonText,
                    !canSave && styles.logButtonTextDisabled,
                  ]}
                >
                  Log Water
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </GestureDetector>

        {Platform.OS !== "ios" && showAndroidPicker && (
          <Modal
            transparent
            animationType="fade"
            visible
            onRequestClose={() => setShowAndroidPicker(false)}
          >
            <TouchableOpacity
              style={styles.androidPickerBackdrop}
              activeOpacity={1}
              onPress={() => setShowAndroidPicker(false)}
            >
              <View style={styles.androidPickerCard}>
                {UNIT_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={styles.androidPickerRow}
                    onPress={() => {
                      setUnit(opt);
                      setShowAndroidPicker(false);
                    }}
                  >
                    <Text style={styles.androidPickerText}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </TouchableOpacity>
          </Modal>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  backdropPressable: { flex: 1 },
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
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonFallback: { backgroundColor: "#EBEBEB" },
  headerRightSpacer: { width: 36 },
  title: {
    fontSize: 17,
    fontWeight: "600",
    color: Tokens.textPrimary,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  body: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#6B6B6B",
    textTransform: "capitalize",
    letterSpacing: -0.3,
    marginBottom: 6,
    marginLeft: 0,
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  customSection: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
    marginBottom: 16,
  },
  customInput: {
    fontSize: 44,
    fontWeight: "700",
    color: Tokens.textPrimary,
    letterSpacing: -1,
    minWidth: 100,
    padding: 0,
  },
  unitDropdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  unitDropdownText: {
    fontSize: 12,
    fontWeight: "500",
    color: Tokens.textTertiary,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: "#FCFCFB",
  },
  logButton: {
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    borderRadius: 9999,
    backgroundColor: "#000000",
  },
  logButtonDisabled: {
    backgroundColor: Tokens.border,
  },
  logButtonText: {
    fontSize: 16,
    fontWeight: "500",
    letterSpacing: -0.2,
    color: "#fff",
  },
  logButtonTextDisabled: {
    color: Tokens.textTertiary,
  },
  androidPickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  androidPickerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 8,
    minWidth: 200,
    ...Tokens.shadowMedium,
  },
  androidPickerRow: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  androidPickerText: {
    fontSize: 16,
    fontWeight: "600",
    color: Tokens.textPrimary,
  },
});

const ringStyles = StyleSheet.create({
  container: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: 8,
  },
  centerOverlay: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  centerValue: {
    fontSize: 30,
    fontWeight: "700",
    color: "#1A6A8C",
    letterSpacing: -1,
  },
  centerUnit: {
    fontSize: 13,
    fontWeight: "500",
    color: "#5AADE0",
    marginTop: 2,
    letterSpacing: 0.5,
  },
});

const presetStyles = StyleSheet.create({
  chip: {
    flexBasis: "31%",
    flexGrow: 1,
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#EAF3FB",
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  amount: {
    fontSize: 12,
    fontWeight: "500",
    color: "#5A9AC7",
  },
});
