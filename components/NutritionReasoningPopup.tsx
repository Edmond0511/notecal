import { Tokens } from "@/constants/theme";
import { useAppStore } from "@/store/app-store";
import { CommonPortion, Entry, Macros } from "@/types";
import {
  isLiquidGlassSupported,
  LiquidGlassView,
} from "@callstack/liquid-glass";
import { Ionicons } from "@expo/vector-icons";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import {
  faBolt,
  faCube,
  faCubesStacked,
  faDroplet,
  faDrumstickBite,
  faFireFlameCurved,
  faGlassWater,
  faSeedling,
  faWheatAwn,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-native-fontawesome";
import * as Haptics from "expo-haptics";
import React, { useCallback, useRef, useState } from "react";
import {
  Dimensions,
  Keyboard,
  LayoutAnimation,
  Linking,
  Modal,
  ScrollView,
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
  TouchableOpacity as GHTouchableOpacity,
} from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  FadeIn,
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Color palette matching ProgressRings
const MACRO_COLORS = {
  calories: {
    primary: "#FF6B35",
    secondary: "#FFE5D9",
  },
  protein: {
    primary: "#4A90D9",
    secondary: "#E3F2FD",
  },
  fat: {
    primary: "#F5A623",
    secondary: "#FFF8E7",
  },
  carbs: {
    primary: "#9B6B9E",
    secondary: "#F3E5F5",
  },
};

const MICRO_COLORS = {
  fiber: {
    primary: "#B08C5A",
    secondary: "#F8F4EF",
  },
  sugar: {
    primary: "#D4687E",
    secondary: "#FDF0F4",
  },
  sodium: {
    primary: "#6898BE",
    secondary: "#F0F5FA",
  },
  potassium: {
    primary: "#72A868",
    secondary: "#F2F7F0",
  },
  water: {
    primary: "#7BA3A8",
    secondary: "#F0F4F3",
  },
};

const MACRO_ICONS = {
  calories: faFireFlameCurved as IconProp,
  protein: faDrumstickBite as IconProp,
  fat: faDroplet as IconProp,
  carbs: faWheatAwn as IconProp,
};

const MICRO_ICONS = {
  fiber: faSeedling as IconProp,
  sugar: faCube as IconProp,
  sodium: faCubesStacked as IconProp,
  potassium: faBolt as IconProp,
  water: faGlassWater as IconProp,
};

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const DISMISS_THRESHOLD = 150;

// Confidence color helper
function getConfidenceColors(confidence: number): {
  background: string;
  border: string;
  text: string;
} {
  if (confidence >= 0.8) {
    // High confidence - green
    return {
      background: "#E8F5E9",
      border: "#A5D6A7",
      text: "#2E7D32",
    };
  } else if (confidence >= 0.5) {
    // Medium confidence - amber
    return {
      background: "#FFF8E1",
      border: "#FFD54F",
      text: "#F57F17",
    };
  } else {
    // Low confidence - red
    return {
      background: "#FFEBEE",
      border: "#EF9A9A",
      text: "#C62828",
    };
  }
}

function getTimeBadgeStyle(date: Date): { background: string; text: string; icon: "sunny" | "moon" } {
  const hour = date.getHours();
  if (hour >= 6 && hour < 18) {
    // Day — warm golden
    return { background: "#FFF3E0", text: "#BF6C00", icon: "sunny" };
  } else {
    // Night — soft blue-gray
    return { background: "#ECEEF8", text: "#5C6BC0", icon: "moon" };
  }
}

// Parse both markdown [text](url) and HTML <a href="url">text</a> links
function ParsedText({ text, style }: { text: string; style: any }) {
  if (!text) return <Text style={style}></Text>;

  // Support both markdown and HTML style links
  const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const htmlLinkRegex = /<a\s+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;

  const parts: Array<{ type: "text" | "link"; content: string; url?: string }> =
    [];
  let processedText = text;
  let lastIndex = 0;

  // First, find all links (both markdown and HTML)
  const allMatches: Array<{
    index: number;
    length: number;
    text: string;
    url: string;
  }> = [];

  // Find markdown links
  let match;
  while ((match = markdownLinkRegex.exec(text)) !== null) {
    allMatches.push({
      index: match.index,
      length: match[0].length,
      text: match[1],
      url: match[2],
    });
  }

  // Find HTML links
  markdownLinkRegex.lastIndex = 0; // Reset
  while ((match = htmlLinkRegex.exec(text)) !== null) {
    allMatches.push({
      index: match.index,
      length: match[0].length,
      text: match[2],
      url: match[1],
    });
  }

  // Sort matches by position
  allMatches.sort((a, b) => a.index - b.index);

  // Build parts array
  lastIndex = 0;
  for (const linkMatch of allMatches) {
    // Add text before the link
    if (linkMatch.index > lastIndex) {
      parts.push({
        type: "text",
        content: text.substring(lastIndex, linkMatch.index),
      });
    }

    // Add the link
    parts.push({
      type: "link",
      content: linkMatch.text,
      url: linkMatch.url,
    });

    lastIndex = linkMatch.index + linkMatch.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      type: "text",
      content: text.substring(lastIndex),
    });
  }

  // If no links found, just return the text
  if (parts.length === 0) {
    return <Text style={style}>{text}</Text>;
  }

  return (
    <Text style={style}>
      {parts.map((part, index) => {
        if (part.type === "link") {
          return (
            <Text
              key={index}
              style={styles.linkText}
              onPress={() => {
                if (part.url) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  Linking.openURL(part.url);
                }
              }}
            >
              {part.content}
            </Text>
          );
        }
        return <Text key={index}>{part.content}</Text>;
      })}
    </Text>
  );
}

// Confidence explanation popup component
function ConfidencePopup({
  confidence,
  reasoning,
  onClose,
}: {
  confidence: number;
  reasoning?: {
    confidenceExplanation?: string;
    confidenceAnalysis?: string;
  };
  onClose: () => void;
}) {
  const colors = getConfidenceColors(confidence);
  const confidencePercent = Math.round(confidence * 100);

  const getConfidenceLevel = () => {
    if (confidence >= 0.8) return "High";
    if (confidence >= 0.5) return "Medium";
    return "Low";
  };

  const getDefaultExplanation = () => {
    if (confidence >= 0.8) {
      return "This food item was matched with high certainty using reliable nutrition databases (USDA FDC, CNF, or Open Food Facts).";
    } else if (confidence >= 0.5) {
      return "This estimate is based on similar foods or general nutritional data. The portion size or specific variety may affect accuracy.";
    } else {
      return "Limited data available for this item. The nutrition values are rough estimates based on similar foods.";
    }
  };

  // Use detailed analysis if available, otherwise fall back to simple explanation or default
  const displayText =
    reasoning?.confidenceAnalysis ||
    reasoning?.confidenceExplanation ||
    getDefaultExplanation();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.confidencePopupBackdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <View
          style={styles.confidencePopup}
          onStartShouldSetResponder={() => true}
        >
          {/* Header */}
          <View style={styles.popupHeader}>
            <View
              style={[
                styles.popupConfidenceIndicator,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text
                style={[styles.popupConfidenceValue, { color: colors.text }]}
              >
                {confidencePercent}%
              </Text>
            </View>
            <Text style={styles.popupTitle}>
              {getConfidenceLevel()} Confidence
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color="#999" />
            </TouchableOpacity>
          </View>


          {/* Explanation Paragraph */}
          <ParsedText text={displayText} style={styles.popupExplanation} />
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// Edit Nutrient Popup component
type MacroKey = "kcal" | "protein" | "fat" | "carbs";
type MicroKey = "fiber" | "sugar" | "sodium" | "potassium" | "water";
type NutrientKey = MacroKey | MicroKey;

const NUTRIENT_LABELS: Record<NutrientKey, string> = {
  kcal: "Calories",
  protein: "Protein",
  fat: "Fat",
  carbs: "Carbs",
  fiber: "Fiber",
  sugar: "Sugar",
  sodium: "Sodium",
  potassium: "Potassium",
  water: "Water",
};

const NUTRIENT_UNITS: Record<NutrientKey, string> = {
  kcal: "cal",
  protein: "g",
  fat: "g",
  carbs: "g",
  fiber: "g",
  sugar: "g",
  sodium: "mg",
  potassium: "mg",
  water: "L",
};

// Map display type to macro key
const MACRO_TYPE_TO_KEY: Record<
  "calories" | "protein" | "fat" | "carbs",
  MacroKey
> = {
  calories: "kcal",
  protein: "protein",
  fat: "fat",
  carbs: "carbs",
};

// Something Off Popup component - bottom sheet style like NutritionReasoningPopup
function SomethingOffPopup({
  item,
  onSubmit,
  onClose,
  isLoading,
}: {
  item: { id: string; label: string; macros: Macros };
  onSubmit: (feedback: string) => void;
  onClose: () => void;
  isLoading: boolean;
}) {
  const [feedback, setFeedback] = useState("");
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);

  const handleSubmit = () => {
    if (!feedback.trim() || isLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSubmit(feedback.trim());
  };

  const handleClose = () => {
    if (isLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    onClose();
  };

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) {
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

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  const backdropStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [0, SCREEN_HEIGHT * 0.5],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return {
      opacity,
    };
  });

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={styles.somethingOffRoot}
    >
      {/* Backdrop */}
      <Animated.View style={[styles.somethingOffBackdrop, backdropStyle]}>
        <TouchableOpacity
          style={styles.backdropPressable}
          activeOpacity={1}
          onPress={handleClose}
        />
      </Animated.View>

      {/* Sheet Container */}
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.somethingOffContainer,
            { marginTop: insets.top },
            animatedStyle,
          ]}
        >
          {/* Drag Indicator */}
          <View style={styles.somethingOffDragIndicatorContainer}>
            <View style={styles.dragIndicator} />
          </View>

          {/* Header */}
          <View style={styles.somethingOffHeader}>
            <TouchableOpacity
              onPress={handleClose}
              activeOpacity={0.7}
              disabled={isLoading}
            >
              {isLiquidGlassSupported ? (
                <LiquidGlassView
                  style={styles.backButton}
                  interactive
                  effect="regular"
                  tintColor="rgba(250, 250, 247, 0.3)"
                >
                  <Ionicons
                    name="chevron-back"
                    size={20}
                    color={isLoading ? "#bbb" : Tokens.textPrimary}
                  />
                </LiquidGlassView>
              ) : (
                <View style={[styles.backButton, styles.backButtonFallback]}>
                  <Ionicons
                    name="chevron-back"
                    size={20}
                    color={isLoading ? "#bbb" : "#666"}
                  />
                </View>
              )}
            </TouchableOpacity>
            <Text style={styles.somethingOffTitle}>Fix Issue</Text>
            <View style={styles.headerRightSpacer} />
          </View>

          {/* Content */}
          <View style={styles.somethingOffContent}>
            {/* Item Label */}
            <View style={styles.somethingOffItemRow}>
              <Text style={styles.somethingOffItemLabel} numberOfLines={3}>
                {item.label}
              </Text>
            </View>

            {/* Input */}
            <TextInput
              ref={inputRef}
              style={styles.somethingOffInput}
              value={feedback}
              onChangeText={setFeedback}
              placeholder="Describe what's wrong..."
              placeholderTextColor="#999"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              autoFocus
              editable={!isLoading}
            />

            {/* Hint */}
            <Text style={styles.somethingOffHint}>
              E.g., "Calories seem too high", "This is grilled, not fried"
            </Text>

            {/* Action buttons */}
            <View style={styles.somethingOffActions}>
              <TouchableOpacity
                style={styles.somethingOffCancelButton}
                onPress={handleClose}
                activeOpacity={0.7}
                disabled={isLoading}
              >
                <Text
                  style={[
                    styles.somethingOffCancelText,
                    isLoading && { color: "#bbb" },
                  ]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.somethingOffSubmitButton,
                  (!feedback.trim() || isLoading) &&
                    styles.somethingOffSubmitButtonDisabled,
                ]}
                onPress={handleSubmit}
                activeOpacity={0.7}
                disabled={!feedback.trim() || isLoading}
              >
                {isLoading ? (
                  <Text style={styles.somethingOffSubmitText}>Updating...</Text>
                ) : (
                  <Text style={styles.somethingOffSubmitText}>Submit</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

export function EditNutrientPopup({
  nutrientKey,
  currentValue,
  originalValue,
  onSave,
  onRevert,
  onClose,
}: {
  nutrientKey: NutrientKey;
  currentValue: number;
  originalValue?: number;
  onSave: (value: number) => void;
  onRevert: () => void;
  onClose: () => void;
}) {
  // Get colors based on whether it's a macro or micro
  const isMacro = ["kcal", "protein", "fat", "carbs"].includes(nutrientKey);
  const colorKey = nutrientKey === "kcal" ? "calories" : nutrientKey;
  const colors = isMacro
    ? MACRO_COLORS[colorKey as keyof typeof MACRO_COLORS]
    : MICRO_COLORS[nutrientKey as MicroKey];
  const icon = isMacro
    ? MACRO_ICONS[colorKey as keyof typeof MACRO_ICONS]
    : MICRO_ICONS[nutrientKey as MicroKey];
  const label = NUTRIENT_LABELS[nutrientKey];
  const unit = NUTRIENT_UNITS[nutrientKey];
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);

  // Format initial value - water to 1 decimal, others as integers
  const formatValue = (val: number) =>
    nutrientKey === "water" ? val.toFixed(1) : Math.round(val).toString();

  const [inputValue, setInputValue] = useState(formatValue(currentValue));

  const handleSave = () => {
    const numValue = parseFloat(inputValue);
    if (!isNaN(numValue) && numValue >= 0) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onSave(numValue);
      onClose();
    }
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    onClose();
  };

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) {
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

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  const backdropStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [0, SCREEN_HEIGHT * 0.5],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return {
      opacity,
    };
  });

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={styles.editNutrientRoot}
    >
      {/* Backdrop */}
      <Animated.View style={[styles.editNutrientBackdrop, backdropStyle]}>
        <TouchableOpacity
          style={styles.backdropPressable}
          activeOpacity={1}
          onPress={handleClose}
        />
      </Animated.View>

      {/* Sheet Container */}
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.editNutrientContainer,
            { marginTop: insets.top },
            animatedStyle,
          ]}
        >
          {/* Drag Indicator */}
          <View style={styles.editNutrientDragIndicatorContainer}>
            <View style={styles.dragIndicator} />
          </View>

          {/* Header */}
          <View style={styles.editNutrientHeader}>
            <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
              {isLiquidGlassSupported ? (
                <LiquidGlassView
                  style={styles.backButton}
                  interactive
                  effect="regular"
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
            <Text style={styles.editNutrientTitle}>Edit {label}</Text>
            <View style={styles.headerRightSpacer} />
          </View>

          {/* Content */}
          <View style={styles.editNutrientContent}>
            {/* Input field */}
            <View style={styles.editNutrientInputContainer}>
              <TextInput
                ref={inputRef}
                style={[
                  styles.editNutrientInput,
                  { borderColor: colors.primary },
                ]}
                value={inputValue}
                onChangeText={setInputValue}
                keyboardType="decimal-pad"
                selectTextOnFocus
                autoFocus
              />
              <View
                style={[
                  styles.editNutrientUnitBadge,
                  { backgroundColor: colors.secondary },
                ]}
              >
                <Text
                  style={[
                    styles.editNutrientUnitText,
                    { color: colors.primary },
                  ]}
                >
                  {unit}
                </Text>
              </View>
            </View>

            {/* Action buttons */}
            <View style={styles.editNutrientActions}>
              <TouchableOpacity
                style={[
                  styles.editNutrientRevertButton,
                  !originalValue && styles.editNutrientRevertButtonDisabled,
                ]}
                onPress={() => {
                  if (!originalValue) return;
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  Keyboard.dismiss();
                  onRevert();
                  onClose();
                }}
                activeOpacity={originalValue ? 0.7 : 1}
                disabled={!originalValue}
              >
                <Ionicons
                  name="refresh-outline"
                  size={16}
                  color={originalValue ? "#666" : "#bbb"}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[
                    styles.editNutrientRevertText,
                    !originalValue && styles.editNutrientRevertTextDisabled,
                  ]}
                >
                  Revert
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.editNutrientSaveButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleSave}
                activeOpacity={0.7}
              >
                <Text style={styles.editNutrientSaveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

// Unit conversion constants
type QuantityUnit = "servings" | "g" | "oz" | "lbs" | "portion";

const WEIGHT_UNITS: QuantityUnit[] = ["servings", "g", "oz", "lbs"];

const GRAMS_PER: Record<string, number> = {
  g: 1,
  oz: 28.3495,
  lbs: 453.592,
};

function normalizeUnit(unit: string): QuantityUnit | null {
  const lower = unit.toLowerCase().trim();
  if (lower === "g" || lower === "gram" || lower === "grams") return "g";
  if (lower === "oz" || lower === "ounce" || lower === "ounces") return "oz";
  if (
    lower === "lb" ||
    lower === "lbs" ||
    lower === "pound" ||
    lower === "pounds"
  )
    return "lbs";
  return null;
}

function toGrams(value: number, unit: QuantityUnit): number | null {
  if (unit === "servings") return null;
  return value * (GRAMS_PER[unit] ?? 1);
}

function fromGrams(grams: number, unit: QuantityUnit): number | null {
  if (unit === "servings") return null;
  return grams / (GRAMS_PER[unit] ?? 1);
}

function formatQtyValue(val: number): string {
  if (Number.isInteger(val)) return val.toString();
  if (val >= 100) return val.toFixed(0);
  if (val >= 10) return val.toFixed(1);
  return val.toFixed(2);
}

// Edit Quantity Popup component
function EditQuantityPopup({
  currentServings,
  itemQty,
  itemUnit,
  commonPortions,
  onSave,
  onClose,
}: {
  currentServings: number;
  itemQty: number;
  itemUnit: string;
  commonPortions?: CommonPortion[];
  onSave: (servings: number, qty?: number, unit?: string) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);

  const normalizedUnit = normalizeUnit(itemUnit);
  const initialUnit: QuantityUnit = normalizedUnit ?? "servings";
  const originalGrams = normalizedUnit
    ? toGrams(itemQty, normalizedUnit)
    : null;

  const [selectedUnit, setSelectedUnit] = useState<QuantityUnit>(initialUnit);
  const [selectedPortion, setSelectedPortion] = useState<CommonPortion | null>(
    null,
  );
  const [inputValue, setInputValue] = useState(
    initialUnit === "servings"
      ? formatQtyValue(currentServings)
      : initialUnit === "g"
      ? "100"
      : formatQtyValue(itemQty * currentServings),
  );

  // Convert current value to grams based on selected unit
  const getCurrentGrams = (num: number): number | null => {
    if (selectedUnit === "portion" && selectedPortion) {
      return num * selectedPortion.grams;
    }
    if (selectedUnit === "servings") {
      return originalGrams != null ? num * originalGrams : null;
    }
    return toGrams(num, selectedUnit);
  };

  const handleSave = () => {
    const numValue = parseFloat(inputValue);
    if (isNaN(numValue) || numValue <= 0) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (selectedUnit === "servings") {
      onSave(numValue);
    } else if (selectedUnit === "portion" && selectedPortion) {
      const newGrams = numValue * selectedPortion.grams;
      if (originalGrams != null && originalGrams > 0) {
        onSave(newGrams / originalGrams);
      } else {
        onSave(numValue);
      }
    } else {
      const newGrams = toGrams(numValue, selectedUnit);
      if (newGrams == null || originalGrams == null || originalGrams <= 0) {
        onSave(numValue);
      } else {
        onSave(newGrams / originalGrams);
      }
    }
    onClose();
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    onClose();
  };

  const handlePortionSelect = (portion: CommonPortion) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const currentNum = parseFloat(inputValue);
    // Convert current value to grams, then to this portion's units
    const curGrams =
      !isNaN(currentNum) && currentNum > 0 ? getCurrentGrams(currentNum) : null;

    setSelectedUnit("portion");
    setSelectedPortion(portion);
    setInputValue("1");
  };

  const UNIT_DEFAULTS: Partial<Record<QuantityUnit, number>> = {
    servings: 1,
    g: 100,
    oz: 1,
    lbs: 1,
  };

  const handleUnitSwitch = (newUnit: QuantityUnit) => {
    if (newUnit === selectedUnit && newUnit !== "portion") return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (newUnit === "portion") {
      // Handled by handlePortionSelect
      return;
    }

    setSelectedUnit(newUnit);
    setSelectedPortion(null);
    setInputValue(formatQtyValue(newUnit === "servings" ? currentServings : (UNIT_DEFAULTS[newUnit] ?? 1)));
  };

  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) {
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

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={styles.editQuantityRoot}
    >
      <Animated.View style={[styles.editQuantityBackdrop, backdropStyle]}>
        <TouchableOpacity
          style={styles.backdropPressable}
          activeOpacity={1}
          onPress={handleClose}
        />
      </Animated.View>

      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.editQuantityContainer,
            { marginTop: insets.top },
            animatedStyle,
          ]}
        >
          <View style={styles.editQuantityDragIndicatorContainer}>
            <View style={styles.dragIndicator} />
          </View>

          <View style={styles.editQuantityHeader}>
            <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
              {isLiquidGlassSupported ? (
                <LiquidGlassView
                  style={styles.backButton}
                  interactive
                  effect="regular"
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
            <Text style={styles.editQuantityTitle}>Edit Quantity</Text>
            <View style={styles.headerRightSpacer} />
          </View>

          <View style={styles.editQuantityContent}>
            {/* Quantity Input */}
            <View style={styles.editQuantityInputContainer}>
              <TextInput
                ref={inputRef}
                style={styles.editQuantityInput}
                value={inputValue}
                onChangeText={setInputValue}
                keyboardType="decimal-pad"
                selectTextOnFocus
                autoFocus
              />
            </View>

            {/* Food-specific portion pills (Row 1) */}
            {commonPortions && commonPortions.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.portionPillScrollRow}
                contentContainerStyle={styles.portionPillScrollContent}
              >
                {commonPortions.map((portion, i) => {
                  const isActive =
                    selectedUnit === "portion" &&
                    selectedPortion?.label === portion.label;
                  return (
                    <TouchableOpacity
                      key={`${portion.label}-${i}`}
                      style={[
                        styles.portionPillItem,
                        isActive && styles.portionPillItemSelected,
                      ]}
                      onPress={() => handlePortionSelect(portion)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.portionPillItemLabel,
                          isActive && styles.portionPillItemLabelSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {portion.label}
                      </Text>
                      <Text
                        style={[
                          styles.portionPillItemGrams,
                          isActive && styles.portionPillItemGramsSelected,
                        ]}
                      >
                        {portion.grams}g
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Universal Unit Pill Selector (Row 2) */}
            <View style={styles.unitPillRow}>
              {WEIGHT_UNITS.map((unit) => (
                <TouchableOpacity
                  key={unit}
                  style={[
                    styles.unitPill,
                    selectedUnit === unit && styles.unitPillSelected,
                  ]}
                  onPress={() => handleUnitSwitch(unit)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.unitPillText,
                      selectedUnit === unit && styles.unitPillTextSelected,
                    ]}
                  >
                    {unit}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={styles.editQuantitySaveButton}
              onPress={handleSave}
              activeOpacity={0.7}
            >
              <Text style={styles.editQuantitySaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

interface NutritionReasoningPopupProps {
  visible: boolean;
  onClose: () => void;
  entry: Entry | null;
}

export function NutritionReasoningPopup({
  visible,
  onClose,
  entry,
}: NutritionReasoningPopupProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const scrollOffset = useSharedValue(0);
  const isScrolledToTop = useSharedValue(true);
  const [activeConfidencePopup, setActiveConfidencePopup] = useState<
    string | null
  >(null);
  const [activePopupData, setActivePopupData] = useState<{
    confidence: number;
    reasoning?: any;
  } | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [editNutrientPopup, setEditNutrientPopup] = useState<{
    itemId: string;
    nutrientKey: NutrientKey;
    currentValue: number;
    originalValue?: number;
  } | null>(null);
  const [somethingOffItem, setSomethingOffItem] = useState<{
    id: string;
    label: string;
    macros: Macros;
  } | null>(null);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [totalsExpanded, setTotalsExpanded] = useState(false);
  const [editQuantityPopup, setEditQuantityPopup] = useState<{
    itemId: string;
    currentServings: number;
    itemQty: number;
    itemUnit: string;
    commonPortions?: CommonPortion[];
  } | null>(null);

  // Get goals to check which micronutrients are enabled
  const goals = useAppStore((state) => state.goals);
  const saveEntry = useAppStore((state) => state.saveEntry);
  const deleteSavedEntry = useAppStore((state) => state.deleteSavedEntry);
  const savedEntries = useAppStore((state) => state.savedEntries);
  const updateEntryItemMacro = useAppStore(
    (state) => state.updateEntryItemMacro,
  );
  const revertEntryItemSingleMacro = useAppStore(
    (state) => state.revertEntryItemSingleMacro,
  );
  const revertEntryItemMacros = useAppStore(
    (state) => state.revertEntryItemMacros,
  );
  const correctEntryItem = useAppStore((state) => state.correctEntryItem);
  const updateEntryItemQuantity = useAppStore(
    (state) => state.updateEntryItemQuantity,
  );

  // Subscribe directly to the store entry to get live updates after edits
  const storeEntry = useAppStore((state) =>
    entry ? state.entries.find((e) => e.id === entry.id) : null,
  );
  // Use store entry if available (for live updates), otherwise fall back to prop
  const displayEntry = storeEntry || entry;

  // Check if entry is already saved and get its ID
  const savedEntryMatch = React.useMemo(() => {
    if (!displayEntry) return null;
    const normalizedText = displayEntry.rawText.toLowerCase().trim();
    return (
      savedEntries.find(
        (se) => se.rawText.toLowerCase().trim() === normalizedText,
      ) || null
    );
  }, [displayEntry, savedEntries]);

  const isEntrySaved = savedEntryMatch !== null;

  const handleSaveEntry = useCallback(() => {
    console.log("🔘 Save button pressed, entry:", {
      status: displayEntry?.status,
      itemsCount: displayEntry?.items?.length,
      rawText: displayEntry?.rawText,
      isEntrySaved,
    });
    if (
      !displayEntry ||
      displayEntry.status !== "ok" ||
      !displayEntry.items.length
    ) {
      console.log("🔘 Save aborted - entry not valid");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    if (isEntrySaved && savedEntryMatch) {
      // Unsave - delete the saved entry
      deleteSavedEntry(savedEntryMatch.id);
    } else {
      // Save the entry
      saveEntry(displayEntry);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 1500);
    }
  }, [
    displayEntry,
    saveEntry,
    deleteSavedEntry,
    isEntrySaved,
    savedEntryMatch,
  ]);

  // Check which micronutrients are enabled in goals
  const enabledMicros = {
    fiber: goals?.manualTargets?.fiber !== undefined,
    sugar: goals?.manualTargets?.sugar !== undefined,
    sodium: goals?.manualTargets?.sodium !== undefined,
    potassium: goals?.manualTargets?.potassium !== undefined,
    water: goals?.manualTargets?.water !== undefined,
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const panGesture = Gesture.Pan()
    .onStart(() => {
      // Only allow drag when scrolled to top
    })
    .onUpdate((event) => {
      // Only drag down when at top of scroll, or always allow if pulling down
      if (isScrolledToTop.value && event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_THRESHOLD) {
        // Dismiss the modal
        translateY.value = withSpring(SCREEN_HEIGHT, {
          damping: 20,
          stiffness: 200,
        });
        runOnJS(handleClose)();
      } else {
        // Snap back
        translateY.value = withSpring(0, {
          damping: 20,
          stiffness: 400,
        });
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  const backdropStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateY.value,
      [0, SCREEN_HEIGHT * 0.5],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return {
      opacity,
    };
  });

  const handleScrollBeginDrag = (event: any) => {
    scrollOffset.value = event.nativeEvent.contentOffset.y;
    isScrolledToTop.value = event.nativeEvent.contentOffset.y <= 0;
  };

  const handleScroll = (event: any) => {
    scrollOffset.value = event.nativeEvent.contentOffset.y;
    isScrolledToTop.value = event.nativeEvent.contentOffset.y <= 0;
  };

  // Reset translation and popup state when modal opens/closes
  React.useEffect(() => {
    if (visible) {
      translateY.value = 0;
      isScrolledToTop.value = true;
    }
    setActiveConfidencePopup(null);
    setActivePopupData(null);
    setIsSaved(false);
    setEditNutrientPopup(null);
    setSomethingOffItem(null);
    setIsCorrecting(false);
    setTotalsExpanded(false);
    setEditQuantityPopup(null);
  }, [visible]);

  // Handler for when a nutrient is clicked
  const handleNutrientPress = useCallback(
    (
      itemId: string,
      nutrientKey: NutrientKey,
      currentValue: number,
      originalValue?: number,
    ) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setEditNutrientPopup({
        itemId,
        nutrientKey,
        currentValue,
        originalValue,
      });
    },
    [],
  );

  // Handler for saving edited nutrient value
  const handleSaveNutrient = useCallback(
    (value: number) => {
      if (!displayEntry || !editNutrientPopup) return;
      updateEntryItemMacro(
        displayEntry.id,
        editNutrientPopup.itemId,
        editNutrientPopup.nutrientKey,
        value,
      );
    },
    [displayEntry, editNutrientPopup, updateEntryItemMacro],
  );

  // Handler for reverting single nutrient to calculated value
  const handleRevertNutrient = useCallback(() => {
    if (!displayEntry || !editNutrientPopup) return;
    revertEntryItemSingleMacro(
      displayEntry.id,
      editNutrientPopup.itemId,
      editNutrientPopup.nutrientKey,
    );
  }, [displayEntry, editNutrientPopup, revertEntryItemSingleMacro]);

  // Handler for reverting ALL macros for an item
  const handleRevertAllMacros = useCallback(
    (itemId: string) => {
      if (!displayEntry) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      revertEntryItemMacros(displayEntry.id, itemId);
    },
    [displayEntry, revertEntryItemMacros],
  );

  // Handler for submitting "Something Off" correction feedback
  const handleSomethingOffSubmit = useCallback(
    async (feedback: string) => {
      if (!displayEntry || !somethingOffItem) return;

      setIsCorrecting(true);
      try {
        await correctEntryItem(displayEntry.id, somethingOffItem.id, feedback);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSomethingOffItem(null);
      } catch (error) {
        console.error("Error correcting entry:", error);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setIsCorrecting(false);
      }
    },
    [displayEntry, somethingOffItem, correctEntryItem],
  );

  // Handler for when quantity badge is pressed
  const handleQuantityPress = useCallback(
    (
      itemId: string,
      currentServings: number,
      qty: number,
      unit: string,
      kcal: number,
      itemCommonPortions?: CommonPortion[],
    ) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setEditQuantityPopup({
        itemId,
        currentServings,
        itemQty: qty,
        itemUnit: unit,
        commonPortions: itemCommonPortions,
      });
    },
    [],
  );

  // Handler for saving edited quantity value
  const handleSaveQuantity = useCallback(
    (newServings: number, newQty?: number, newUnit?: string) => {
      if (!displayEntry || !editQuantityPopup) return;
      updateEntryItemQuantity(
        displayEntry.id,
        editQuantityPopup.itemId,
        newServings,
        newQty,
        newUnit,
      );
    },
    [displayEntry, editQuantityPopup, updateEntryItemQuantity],
  );

  if (!displayEntry) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <StatusBar barStyle="dark-content" />
        {/* Backdrop */}
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
            {/* Drag Indicator */}
            <View style={styles.dragIndicatorContainer}>
              <View style={styles.dragIndicator} />
            </View>

            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
                {isLiquidGlassSupported ? (
                  <LiquidGlassView
                    style={styles.backButton}
                    interactive
                    effect="regular"
                    tintColor="rgba(250, 250, 247, 0.3)"
                  >
                    <Ionicons
                      name="close"
                      size={20}
                      color={Tokens.textPrimary}
                    />
                  </LiquidGlassView>
                ) : (
                  <View style={[styles.backButton, styles.backButtonFallback]}>
                    <Ionicons name="close" size={20} color="#666" />
                  </View>
                )}
              </TouchableOpacity>
              <Text style={styles.title}>Nutrition Details</Text>
              <View style={styles.headerRightSpacer} />
            </View>

            <Animated.ScrollView
              style={styles.content}
              contentContainerStyle={[
                styles.contentContainer,
                { paddingBottom: insets.bottom + 20 },
              ]}
              showsVerticalScrollIndicator={false}
              onScrollBeginDrag={handleScrollBeginDrag}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              bounces={true}
            >
              {/* Original Input */}
              <Animated.View entering={FadeInDown.delay(100).duration(400)}>
                <Text style={styles.inputText}>
                  {displayEntry.rawText.replace(/^[-—]\s*/, "")}
                </Text>
                {/* Metadata Row - Time & Save */}
                <View style={styles.metadataRow}>
                  {displayEntry.createdAt && (() => {
                    const timeBadge = getTimeBadgeStyle(new Date(displayEntry.createdAt));
                    return (
                      <View style={[styles.entryTimeBadge, { backgroundColor: timeBadge.background }]}>
                        <Ionicons name={timeBadge.icon} size={13} color={timeBadge.text} />
                        <Text style={[styles.entryTimeText, { color: timeBadge.text }]}>
                          {new Date(displayEntry.createdAt).toLocaleTimeString(
                            "en-US",
                            {
                              hour: "numeric",
                              minute: "2-digit",
                              hour12: true,
                            },
                          )}
                        </Text>
                      </View>
                    );
                  })()}
                  {displayEntry.status === "ok" &&
                    displayEntry.items.length > 0 && (
                      <TouchableOpacity
                        style={[
                          styles.saveButton,
                          (isSaved || isEntrySaved) && styles.saveButtonSaved,
                        ]}
                        onPress={handleSaveEntry}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={
                            isSaved || isEntrySaved
                              ? "bookmark"
                              : "bookmark-outline"
                          }
                          size={14}
                          color={isSaved || isEntrySaved ? "#fff" : "#1A6872"}
                        />
                        <Text
                          style={[
                            styles.saveButtonText,
                            (isSaved || isEntrySaved) &&
                              styles.saveButtonTextSaved,
                          ]}
                        >
                          {isSaved || isEntrySaved ? "Saved" : "Save"}
                        </Text>
                      </TouchableOpacity>
                    )}
                </View>
              </Animated.View>

              {/* Items */}
              {displayEntry.items.map((item, index) => (
                <Animated.View
                  key={item.id || index}
                  entering={FadeInDown.delay(150 + index * 100).duration(400)}
                  style={styles.itemCard}
                >
                  {/* Item Header */}
                  <View style={styles.itemHeader}>
                    <View style={styles.itemLabelRow}>
                      <Text style={styles.itemLabel} numberOfLines={3}>
                        {item.label}
                      </Text>
                      <View style={styles.headerBadges}>
                        {/* Quantity Badge */}
                        <TouchableOpacity
                          style={styles.quantityBadge}
                          onPress={() =>
                            handleQuantityPress(
                              item.id,
                              item.servings ?? 1,
                              item.qty,
                              item.unit,
                              item.macros.kcal,
                              item.commonPortions,
                            )
                          }
                          activeOpacity={0.6}
                        >
                          <Text style={styles.quantityText}>
                            {normalizeUnit(item.unit)
                              ? `${formatQtyValue(item.qty * (item.servings ?? 1))}${item.unit}`
                              : `×${
                                  Number.isInteger(item.servings ?? 1)
                                    ? (item.servings ?? 1)
                                    : (item.servings ?? 1).toFixed(1)
                                }`}
                          </Text>
                          <Ionicons
                            name="pencil"
                            size={12}
                            color="#999"
                            style={{ marginLeft: 3 }}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            Haptics.impactAsync(
                              Haptics.ImpactFeedbackStyle.Light,
                            );
                            const itemKey = item.id || String(index);
                            if (activeConfidencePopup === itemKey) {
                              setActiveConfidencePopup(null);
                              setActivePopupData(null);
                            } else {
                              setActiveConfidencePopup(itemKey);
                              setActivePopupData({
                                confidence: item.confidence,
                                reasoning: item.reasoning,
                              });
                            }
                          }}
                          style={[
                            styles.confidenceBadge,
                            {
                              backgroundColor: getConfidenceColors(
                                item.confidence,
                              ).background,
                              borderColor: getConfidenceColors(item.confidence)
                                .border,
                            },
                          ]}
                          activeOpacity={0.7}
                        >
                          <View style={styles.confidenceBadgeContent}>
                            <Text
                              style={[
                                styles.confidenceText,
                                {
                                  color: getConfidenceColors(item.confidence)
                                    .text,
                                },
                              ]}
                            >
                              {Math.round(item.confidence * 100)}%
                            </Text>
                           
                          </View>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* Macros */}
                  <View style={styles.macrosRow}>
                    <MacroItem
                      label="cal"
                      value={item.macros.kcal}
                      unit=""
                      type="calories"
                      onPress={() =>
                        handleNutrientPress(
                          item.id,
                          "kcal",
                          item.macros.kcal,
                          item.originalMacros?.kcal,
                        )
                      }
                    />
                    <MacroItem
                      label="protein"
                      value={item.macros.protein}
                      unit="g"
                      type="protein"
                      onPress={() =>
                        handleNutrientPress(
                          item.id,
                          "protein",
                          item.macros.protein,
                          item.originalMacros?.protein,
                        )
                      }
                    />
                    <MacroItem
                      label="fat"
                      value={item.macros.fat}
                      unit="g"
                      type="fat"
                      onPress={() =>
                        handleNutrientPress(
                          item.id,
                          "fat",
                          item.macros.fat,
                          item.originalMacros?.fat,
                        )
                      }
                    />
                    <MacroItem
                      label="carbs"
                      value={item.macros.carbs}
                      unit="g"
                      type="carbs"
                      onPress={() =>
                        handleNutrientPress(
                          item.id,
                          "carbs",
                          item.macros.carbs,
                          item.originalMacros?.carbs,
                        )
                      }
                    />
                  </View>

                  {/* Micronutrients - only show if enabled in goals */}
                  {((enabledMicros.fiber && item.macros.fiber !== undefined) ||
                    (enabledMicros.sugar && item.macros.sugar !== undefined) ||
                    (enabledMicros.sodium &&
                      item.macros.sodium !== undefined) ||
                    (enabledMicros.potassium &&
                      item.macros.potassium !== undefined) ||
                    (enabledMicros.water &&
                      item.sourceId === 'water' &&
                      item.macros.water !== undefined)) && (
                    <View style={styles.microsRow}>
                      {enabledMicros.fiber &&
                        item.macros.fiber !== undefined && (
                          <MicroItem
                            label="fiber"
                            value={item.macros.fiber}
                            unit="g"
                            type="fiber"
                            onPress={() =>
                              handleNutrientPress(
                                item.id,
                                "fiber",
                                item.macros.fiber!,
                                item.originalMacros?.fiber,
                              )
                            }
                          />
                        )}
                      {enabledMicros.sugar &&
                        item.macros.sugar !== undefined && (
                          <MicroItem
                            label="sugar"
                            value={item.macros.sugar}
                            unit="g"
                            type="sugar"
                            onPress={() =>
                              handleNutrientPress(
                                item.id,
                                "sugar",
                                item.macros.sugar!,
                                item.originalMacros?.sugar,
                              )
                            }
                          />
                        )}
                      {enabledMicros.sodium &&
                        item.macros.sodium !== undefined && (
                          <MicroItem
                            label="sodium"
                            value={item.macros.sodium}
                            unit="mg"
                            type="sodium"
                            onPress={() =>
                              handleNutrientPress(
                                item.id,
                                "sodium",
                                item.macros.sodium!,
                                item.originalMacros?.sodium,
                              )
                            }
                          />
                        )}
                      {enabledMicros.potassium &&
                        item.macros.potassium !== undefined && (
                          <MicroItem
                            label="potassium"
                            value={item.macros.potassium}
                            unit="mg"
                            type="potassium"
                            onPress={() =>
                              handleNutrientPress(
                                item.id,
                                "potassium",
                                item.macros.potassium!,
                                item.originalMacros?.potassium,
                              )
                            }
                          />
                        )}
                      {enabledMicros.water &&
                        item.sourceId === 'water' &&
                        item.macros.water !== undefined && (
                          <MicroItem
                            label="water"
                            value={item.macros.water}
                            unit="L"
                            type="water"
                            onPress={() =>
                              handleNutrientPress(
                                item.id,
                                "water",
                                item.macros.water!,
                                item.originalMacros?.water,
                              )
                            }
                          />
                        )}
                    </View>
                  )}

                  {/* Revert All - shows when any macro has been edited */}
                  {item.originalMacros && (
                    <TouchableOpacity
                      style={styles.revertAllRow}
                      onPress={() => handleRevertAllMacros(item.id)}
                      activeOpacity={0.6}
                    >
                      <Ionicons
                        name="refresh-outline"
                        size={14}
                        color="#8B5CF6"
                      />
                      <Text style={styles.revertAllText}>
                        Revert to calculated
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Reasoning Section */}
                  {item.reasoning && (
                    <View style={styles.reasoningSection}>

                      {/* Summary */}
                      {item.reasoning.interpretation && (
                        <View style={styles.sectionBlock}>
                          <Text style={styles.sectionLabel}>Summary</Text>
                          <Text style={styles.reasoningText}>
                            {item.reasoning.interpretation}
                            {item.reasoning.portionNotes && item.reasoning.portionNotes !== 'N/A'
                              ? ` \u2014 ${item.reasoning.portionNotes}`
                              : ''}
                          </Text>
                        </View>
                      )}

                      {/* Assumptions */}
                      {item.reasoning.assumptions?.length > 0 && (
                        <View style={styles.sectionBlock}>
                          <Text style={styles.sectionLabel}>Assumptions</Text>
                          {item.reasoning.assumptions.map((assumption, i) => (
                            <Text key={i} style={styles.assumptionText}>
                              {item.reasoning!.assumptions!.length > 1 ? `\u2022 ${assumption}` : assumption}
                            </Text>
                          ))}
                        </View>
                      )}

                      {/* Confidence */}
                      {item.reasoning.confidenceExplanation && (
                        <View style={styles.sectionBlock}>
                          <Text style={styles.sectionLabel}>Confidence</Text>
                          <Text style={styles.reasoningText}>
                            {item.reasoning.confidenceExplanation}
                          </Text>
                        </View>
                      )}

                      {/* Source */}
                      {item.reasoning.dataSource && item.reasoning.dataSource !== 'No source available' && (
                        <View style={styles.sectionBlock}>
                          <Text style={styles.sectionLabel}>Source</Text>
                          <ParsedText
                            text={item.reasoning.dataSource}
                            style={styles.sourceText}
                          />
                        </View>
                      )}

                    </View>
                  )}

                  {/* Something Off Button - at the bottom of card */}
                  <TouchableOpacity
                    style={styles.somethingOffButton}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSomethingOffItem({
                        id: item.id,
                        label: item.label,
                        macros: item.macros,
                      });
                    }}
                    activeOpacity={0.6}
                  >
                    <Ionicons
                      name="alert-circle-outline"
                      size={14}
                      color="#888"
                    />
                    <Text style={styles.somethingOffButtonText}>
                      Something Off?
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              ))}

              {/* Totals */}
              <Animated.View
                entering={FadeInDown.delay(
                  150 + displayEntry.items.length * 100,
                ).duration(400)}
                style={styles.totalsSection}
              >
                {/* Calorie header — always visible */}
                <TouchableOpacity
                  style={styles.totalsHeaderRow}
                  activeOpacity={0.7}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    LayoutAnimation.configureNext(
                      LayoutAnimation.Presets.easeInEaseOut,
                    );
                    setTotalsExpanded(!totalsExpanded);
                  }}
                >
                  <View style={styles.totalsLeft}>
                    <FontAwesomeIcon
                      icon={MACRO_ICONS.calories}
                      size={18}
                      color={MACRO_COLORS.calories.primary}
                    />
                    <Text style={styles.totalsLabel}>Total Calories</Text>
                  </View>
                  <View style={styles.totalsRight}>
                    <Text style={styles.totalsValue}>
                      {displayEntry.inlineKcal} cal
                    </Text>
                    <Ionicons
                      name={totalsExpanded ? "chevron-up" : "chevron-down"}
                      size={16}
                      color={Tokens.textTertiary}
                    />
                  </View>
                </TouchableOpacity>

                {/* Expanded nutrient rows */}
                {totalsExpanded && (
                  <View style={styles.totalsDropdown}>
                    {/* Protein */}
                    <View style={styles.totalsNutrientRow}>
                      <View style={styles.totalsNutrientLeft}>
                        <FontAwesomeIcon
                          icon={MACRO_ICONS.protein}
                          size={13}
                          color={MACRO_COLORS.protein.primary}
                        />
                        <Text style={styles.totalsNutrientLabel}>Protein</Text>
                      </View>
                      <Text style={styles.totalsNutrientValue}>
                        {Math.round(
                          displayEntry.items.reduce(
                            (sum, it) =>
                              sum + it.macros.protein * (it.servings ?? 1),
                            0,
                          ),
                        )}
                        g
                      </Text>
                    </View>
                    {/* Fat */}
                    <View style={styles.totalsNutrientRow}>
                      <View style={styles.totalsNutrientLeft}>
                        <FontAwesomeIcon
                          icon={MACRO_ICONS.fat}
                          size={13}
                          color={MACRO_COLORS.fat.primary}
                        />
                        <Text style={styles.totalsNutrientLabel}>Fat</Text>
                      </View>
                      <Text style={styles.totalsNutrientValue}>
                        {Math.round(
                          displayEntry.items.reduce(
                            (sum, it) =>
                              sum + it.macros.fat * (it.servings ?? 1),
                            0,
                          ),
                        )}
                        g
                      </Text>
                    </View>
                    {/* Carbs */}
                    <View style={styles.totalsNutrientRow}>
                      <View style={styles.totalsNutrientLeft}>
                        <FontAwesomeIcon
                          icon={MACRO_ICONS.carbs}
                          size={13}
                          color={MACRO_COLORS.carbs.primary}
                        />
                        <Text style={styles.totalsNutrientLabel}>Carbs</Text>
                      </View>
                      <Text style={styles.totalsNutrientValue}>
                        {Math.round(
                          displayEntry.items.reduce(
                            (sum, it) =>
                              sum + it.macros.carbs * (it.servings ?? 1),
                            0,
                          ),
                        )}
                        g
                      </Text>
                    </View>
                    {/* Micronutrients — only if enabled in goals */}
                    {enabledMicros.fiber && (
                      <View style={styles.totalsNutrientRow}>
                        <View style={styles.totalsNutrientLeft}>
                          <FontAwesomeIcon
                            icon={MICRO_ICONS.fiber}
                            size={13}
                            color={MICRO_COLORS.fiber.primary}
                          />
                          <Text style={styles.totalsNutrientLabel}>Fiber</Text>
                        </View>
                        <Text style={styles.totalsNutrientValue}>
                          {Math.round(
                            displayEntry.items.reduce(
                              (sum, it) =>
                                sum +
                                (it.macros.fiber ?? 0) * (it.servings ?? 1),
                              0,
                            ),
                          )}
                          g
                        </Text>
                      </View>
                    )}
                    {enabledMicros.sugar && (
                      <View style={styles.totalsNutrientRow}>
                        <View style={styles.totalsNutrientLeft}>
                          <FontAwesomeIcon
                            icon={MICRO_ICONS.sugar}
                            size={13}
                            color={MICRO_COLORS.sugar.primary}
                          />
                          <Text style={styles.totalsNutrientLabel}>Sugar</Text>
                        </View>
                        <Text style={styles.totalsNutrientValue}>
                          {Math.round(
                            displayEntry.items.reduce(
                              (sum, it) =>
                                sum +
                                (it.macros.sugar ?? 0) * (it.servings ?? 1),
                              0,
                            ),
                          )}
                          g
                        </Text>
                      </View>
                    )}
                    {enabledMicros.sodium && (
                      <View style={styles.totalsNutrientRow}>
                        <View style={styles.totalsNutrientLeft}>
                          <FontAwesomeIcon
                            icon={MICRO_ICONS.sodium}
                            size={13}
                            color={MICRO_COLORS.sodium.primary}
                          />
                          <Text style={styles.totalsNutrientLabel}>Sodium</Text>
                        </View>
                        <Text style={styles.totalsNutrientValue}>
                          {Math.round(
                            displayEntry.items.reduce(
                              (sum, it) =>
                                sum +
                                (it.macros.sodium ?? 0) * (it.servings ?? 1),
                              0,
                            ),
                          )}
                          mg
                        </Text>
                      </View>
                    )}
                    {enabledMicros.potassium && (
                      <View style={styles.totalsNutrientRow}>
                        <View style={styles.totalsNutrientLeft}>
                          <FontAwesomeIcon
                            icon={MICRO_ICONS.potassium}
                            size={13}
                            color={MICRO_COLORS.potassium.primary}
                          />
                          <Text style={styles.totalsNutrientLabel}>
                            Potassium
                          </Text>
                        </View>
                        <Text style={styles.totalsNutrientValue}>
                          {Math.round(
                            displayEntry.items.reduce(
                              (sum, it) =>
                                sum +
                                (it.macros.potassium ?? 0) *
                                  (it.servings ?? 1),
                              0,
                            ),
                          )}
                          mg
                        </Text>
                      </View>
                    )}
                  </View>
                )}
              </Animated.View>
            </Animated.ScrollView>

            {/* Render popup outside ScrollView for proper z-index layering */}
            {activeConfidencePopup && activePopupData && (
              <ConfidencePopup
                confidence={activePopupData.confidence}
                reasoning={activePopupData.reasoning}
                onClose={() => {
                  setActiveConfidencePopup(null);
                  setActivePopupData(null);
                }}
              />
            )}
          </Animated.View>
        </GestureDetector>

        {/* Edit Nutrient Popup - rendered outside GestureDetector to cover entire modal */}
        {editNutrientPopup && (
          <EditNutrientPopup
            nutrientKey={editNutrientPopup.nutrientKey}
            currentValue={editNutrientPopup.currentValue}
            originalValue={editNutrientPopup.originalValue}
            onSave={handleSaveNutrient}
            onRevert={handleRevertNutrient}
            onClose={() => setEditNutrientPopup(null)}
          />
        )}

        {/* Something Off Popup - rendered outside GestureDetector to cover entire modal */}
        {somethingOffItem && (
          <SomethingOffPopup
            item={somethingOffItem}
            onSubmit={handleSomethingOffSubmit}
            onClose={() => setSomethingOffItem(null)}
            isLoading={isCorrecting}
          />
        )}

        {/* Edit Quantity Popup */}
        {editQuantityPopup && (
          <EditQuantityPopup
            currentServings={editQuantityPopup.currentServings}
            itemQty={editQuantityPopup.itemQty}
            itemUnit={editQuantityPopup.itemUnit}
            commonPortions={editQuantityPopup.commonPortions}
            onSave={handleSaveQuantity}
            onClose={() => setEditQuantityPopup(null)}
          />
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

function MacroItem({
  label,
  value,
  unit,
  type,
  onPress,
}: {
  label: string;
  value: number;
  unit: string;
  type: "calories" | "protein" | "fat" | "carbs";
  onPress?: () => void;
}) {
  const colors = MACRO_COLORS[type];
  const icon = MACRO_ICONS[type];

  return (
    <View style={styles.macroItem}>
      <GHTouchableOpacity
        style={styles.macroItemTouchable}
        onPress={onPress}
        activeOpacity={0.6}
      >
        <View style={styles.macroIconContainer}>
          <FontAwesomeIcon icon={icon} size={12} color={colors.primary} />
        </View>
        <View style={styles.macroValueEditable}>
          <Text style={styles.macroValue}>
            {Math.round(value)}
            {unit}
          </Text>
        </View>
        <Text style={styles.macroLabel}>{label}</Text>
      </GHTouchableOpacity>
    </View>
  );
}

function MicroItem({
  label,
  value,
  unit,
  type,
  onPress,
}: {
  label: string;
  value: number;
  unit: string;
  type: "fiber" | "sugar" | "sodium" | "potassium" | "water";
  onPress?: () => void;
}) {
  const colors = MICRO_COLORS[type];
  const icon = MICRO_ICONS[type];

  // Format value based on type
  const displayValue =
    type === "water" ? value.toFixed(1) : Math.round(value).toString();

  return (
    <View style={styles.microItem}>
      <GHTouchableOpacity
        style={styles.microItemTouchable}
        onPress={onPress}
        activeOpacity={0.6}
      >
        <View style={styles.macroIconContainer}>
          <FontAwesomeIcon icon={icon} size={12} color={colors.primary} />
        </View>
        <View style={styles.macroValueEditable}>
          <Text style={styles.macroValue}>
            {displayValue}
            {unit}
          </Text>
        </View>
        <Text style={styles.macroLabel}>{label}</Text>
      </GHTouchableOpacity>
    </View>
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
    backgroundColor: "#f8f8f8",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  dragIndicatorContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: "#f8f8f8",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ddd",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#f8f8f8",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontFamily: "System",
    fontWeight: "600",
    color: "#1a1a1a",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  metadataRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 20,
  },
  entryTimeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  entryTimeText: {
    fontSize: 12,
    fontFamily: "System",
    fontWeight: "500",
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E0F2F1",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
  },
  saveButtonSaved: {
    backgroundColor: "#1A6872",
  },
  saveButtonText: {
    fontSize: 12,
    fontFamily: "System",
    fontWeight: "500",
    color: "#1A6872",
  },
  saveButtonTextSaved: {
    color: "#fff",
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  inputText: {
    fontSize: 24,
    color: "#1a1a1a",
    fontFamily: "System",
    fontWeight: "600",
    lineHeight: 32,
    marginBottom: 12,
    letterSpacing: -0.5,
  },
  itemCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  itemHeader: {
    marginBottom: 16,
  },
  itemLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  itemLabel: {
    fontSize: 20,
    fontFamily: "System",
    fontWeight: "600",
    color: "#1a1a1a",
    lineHeight: 26,
    flex: 1,
  },
  headerBadges: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 8,
    marginTop: 2,
  },
  quantityBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  quantityText: {
    fontSize: 13,
    fontFamily: "System",
    fontWeight: "500",
    color: "#6B7280",
  },
  confidenceBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  confidenceBadgeContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  confidenceText: {
    fontSize: 13,
    fontFamily: "System",
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  macrosRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 8,
  },
  macroItem: {
    alignItems: "center",
    flex: 1,
  },
  macroItemTouchable: {
    alignItems: "center",
  },
  microItem: {
    alignItems: "center",
    flexBasis: "22%",
    flexGrow: 0,
    flexShrink: 0,
  },
  microItemTouchable: {
    alignItems: "center",
  },
  macroIconContainer: {
    marginBottom: 6,
  },
  macroValue: {
    fontSize: 18,
    fontFamily: "System",
    fontWeight: "700",
    color: "#333",
  },
  macroValueEditable: {
    marginBottom: 2,
  },
  macroLabel: {
    fontSize: 11,
    fontFamily: "System",
    fontWeight: "500",
    textTransform: "capitalize",
    letterSpacing: 0.3,
    color: "#888",
  },
  microsRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 16,
    gap: 8,
  },
  reasoningSection: {
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingTop: 16,
    marginTop: 8,
  },
  sectionBlock: {
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontFamily: 'System',
    fontWeight: '600',
    color: '#aaa',
    marginBottom: 2,
  },
  reasoningText: {
    fontSize: 13,
    color: '#4a4a4a',
    lineHeight: 22,
    fontFamily: 'System',
    fontWeight: '400',
  },
  assumptionText: {
    fontSize: 13,
    color: '#4a4a4a',
    marginBottom: 6,
    lineHeight: 22,
    fontFamily: 'System',
    fontWeight: '400',
  },
  sourceText: {
    fontSize: 13,
    color: '#4a4a4a',
    flex: 1,
    fontFamily: 'System',
    fontWeight: '400',
    lineHeight: 22,
  },
  totalsSection: {
    marginTop: 4,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 0,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  totalsHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  totalsLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  totalsRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  totalsLabel: {
    fontSize: 15,
    fontFamily: "System",
    fontWeight: "600",
    color: "#1a1a1a",
  },
  totalsValue: {
    fontSize: 15,
    fontFamily: "System",
    fontWeight: "700",
    color: "#1a1a1a",
  },
  totalsDropdown: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#f0f0f0",
    paddingBottom: 8,
    paddingHorizontal: 20,
  },
  totalsNutrientRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    minHeight: 36,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f0f0f0",
  },
  totalsNutrientRowLast: {
    borderBottomWidth: 0,
  },
  totalsNutrientLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  totalsNutrientLabel: {
    fontSize: 13,
    fontFamily: "System",
    fontWeight: "500",
    color: "#333",
  },
  totalsNutrientValue: {
    fontSize: 13,
    fontFamily: "System",
    fontWeight: "600",
    color: "#333",
  },
  // Confidence popup styles
  confidencePopupBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  confidencePopup: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 340,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  popupHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 12,
  },
  popupConfidenceIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  popupConfidenceValue: {
    fontSize: 15,
    fontFamily: "System",
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  popupTitle: {
    fontSize: 17,
    fontFamily: "System",
    fontWeight: "600",
    color: "#1a1a1a",
    letterSpacing: -0.2,
    flex: 1,
  },
  popupSectionLabel: {
    fontSize: 12,
    fontFamily: "System",
    fontWeight: "600",
    color: "#000000",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginTop: 4,
  },
  popupExplanation: {
    fontSize: 15,
    fontFamily: "System",
    fontWeight: "400",
    color: "#333",
    lineHeight: 24,
    marginBottom: 4,
  },
  linkText: {
    color: "#4A90D9",
    fontWeight: "500",
  },
  popupHint: {
    fontSize: 12,
    fontFamily: "System",
    fontWeight: "500",
    color: "#999",
    textAlign: "center",
    marginTop: 4,
  },
  // Edit Nutrient Popup styles - bottom sheet like SomethingOffPopup
  editNutrientRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 9999,
    elevation: 20,
  },
  editNutrientBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  editNutrientContainer: {
    flex: 1,
    backgroundColor: "#f8f8f8",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  editNutrientDragIndicatorContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
  },
  editNutrientHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  editNutrientIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  editNutrientTitle: {
    fontSize: 18,
    fontFamily: "System",
    fontWeight: "600",
    color: "#1a1a1a",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  editNutrientContent: {
    paddingHorizontal: 20,
  },
  editNutrientInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    gap: 12,
  },
  editNutrientInput: {
    flex: 1,
    height: 56,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 18,
    fontSize: 24,
    fontFamily: "System",
    fontWeight: "600",
    color: "#1a1a1a",
    backgroundColor: "#ffffff",
    letterSpacing: -0.5,
  },
  editNutrientUnitBadge: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  editNutrientUnitText: {
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  editNutrientActions: {
    flexDirection: "row",
    gap: 12,
  },
  editNutrientRevertButton: {
    flex: 1,
    height: 52,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EBEBEB",
  },
  editNutrientRevertButtonDisabled: {
    backgroundColor: "#f5f5f5",
  },
  editNutrientRevertText: {
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "400",
    color: "#666",
  },
  editNutrientRevertTextDisabled: {
    color: "#bbb",
  },
  editNutrientSaveButton: {
    flex: 1,
    height: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  editNutrientSaveText: {
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "600",
    color: "#ffffff",
  },
  // Revert All styles
  revertAllRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    marginTop: -4,
    backgroundColor: "#FAF5FF",
    borderRadius: 10,
  },
  revertAllText: {
    fontSize: 13,
    fontFamily: "System",
    fontWeight: "500",
    color: "#8B5CF6",
  },
  // Something Off Button styles
  somethingOffButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
  },
  somethingOffButtonText: {
    fontSize: 13,
    fontFamily: "System",
    fontWeight: "500",
    color: "#888",
  },
  // Something Off Popup styles - bottom sheet like NutritionReasoningPopup
  somethingOffRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 9999,
    elevation: 20,
  },
  somethingOffBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  somethingOffContainer: {
    flex: 1,
    backgroundColor: "#f8f8f8",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  somethingOffDragIndicatorContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
  },
  somethingOffHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  somethingOffTitle: {
    fontSize: 18,
    fontFamily: "System",
    fontWeight: "600",
    color: "#1a1a1a",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  somethingOffContent: {
    paddingHorizontal: 20,
  },
  somethingOffItemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  somethingOffIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
  },
  somethingOffItemLabel: {
    flex: 1,
    fontSize: 17,
    fontFamily: "System",
    fontWeight: "500",
    color: "#1a1a1a",
    lineHeight: 22,
  },
  somethingOffInput: {
    height: 120,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "400",
    color: "#1a1a1a",
    backgroundColor: "#ffffff",
    marginBottom: 8,
  },
  somethingOffHint: {
    fontSize: 13,
    fontFamily: "System",
    fontWeight: "400",
    color: "#888",
    marginBottom: 24,
    lineHeight: 18,
    paddingHorizontal: 4,
  },
  somethingOffActions: {
    flexDirection: "row",
    gap: 12,
  },
  somethingOffCancelButton: {
    flex: 1,
    height: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EBEBEB",
  },
  somethingOffCancelText: {
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "400",
    color: "#666",
  },
  somethingOffSubmitButton: {
    flex: 1,
    height: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1A6872",
  },
  somethingOffSubmitButtonDisabled: {
    backgroundColor: "#A8D5DA",
  },
  somethingOffSubmitText: {
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "600",
    color: "#ffffff",
  },
  // Edit Quantity Popup styles
  editQuantityRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 9999,
    elevation: 20,
  },
  editQuantityBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  editQuantityContainer: {
    flex: 1,
    backgroundColor: "#f8f8f8",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  editQuantityDragIndicatorContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
  },
  editQuantityHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  editQuantityTitle: {
    fontSize: 17,
    fontFamily: "System",
    fontWeight: "600",
    color: "#1a1a1a",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  editQuantityContent: {
    paddingHorizontal: 20,
  },
  portionPillScrollRow: {
    marginBottom: 10,
    maxHeight: 52,
  },
  portionPillScrollContent: {
    gap: 8,
    paddingHorizontal: 2,
  },
  portionPillItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#EBEBEB",
    alignItems: "center",
    minWidth: 64,
  },
  portionPillItemSelected: {
    backgroundColor: "#D6F0F2",
  },
  portionPillItemLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#444",
  },
  portionPillItemLabelSelected: {
    color: "#1A6872",
  },
  portionPillItemGrams: {
    fontSize: 11,
    fontWeight: "400",
    color: "#999",
    marginTop: 1,
  },
  portionPillItemGramsSelected: {
    color: "#1A6872",
  },
  unitPillRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  unitPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#EBEBEB",
    alignItems: "center",
    justifyContent: "center",
  },
  unitPillSelected: {
    backgroundColor: "#D6F0F2",
  },
  unitPillText: {
    fontSize: 13,
    fontFamily: "System",
    fontWeight: "600",
    color: "#666",
  },
  unitPillTextSelected: {
    color: "#1A6872",
  },
  editQuantityInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  editQuantityInput: {
    flex: 1,
    height: 56,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 24,
    fontFamily: "System",
    fontWeight: "600",
    color: "#1a1a1a",
    backgroundColor: "#fff",
    letterSpacing: -0.5,
  },
  editQuantitySaveButton: {
    height: 52,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#1A6872",
  },
  editQuantitySaveText: {
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "600",
    color: "#ffffff",
  },
});
