import { useAppStore } from "@/store/app-store";
import { Entry } from "@/types";
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
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Dimensions,
  Linking,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
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
    primary: "#8B6914",
    secondary: "#FDF6E3",
  },
  sugar: {
    primary: "#C45BAA",
    secondary: "#FCE4F6",
  },
  sodium: {
    primary: "#5B8CC4",
    secondary: "#E8F1FA",
  },
  potassium: {
    primary: "#6B8E5B",
    secondary: "#EDF5EB",
  },
  water: {
    primary: "#4DB6AC",
    secondary: "#E0F2F1",
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
    <View style={styles.confidencePopupOverlay}>
      <TouchableOpacity
        style={styles.confidencePopupBackdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <Animated.View
        entering={FadeInDown.duration(200)}
        style={styles.confidencePopup}
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
            <Text style={[styles.popupConfidenceValue, { color: colors.text }]}>
              {confidencePercent}%
            </Text>
          </View>
          <Text style={styles.popupTitle} numberOfLines={1}>
            {getConfidenceLevel()} Confidence
          </Text>
        </View>

        {/* AI Explanation Label */}
        <Text style={styles.popupSectionLabel}>AI Explanation</Text>

        {/* Explanation Paragraph */}
        <ParsedText text={displayText} style={styles.popupExplanation} />
      </Animated.View>
    </View>
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

  // Get goals to check which micronutrients are enabled
  const goals = useAppStore((state) => state.goals);

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
  }, [visible]);

  if (!entry) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.gestureRoot}>
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
              <Text style={styles.title}>Nutrition Details</Text>
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
                  {entry.rawText.replace(/^-\s*/, "")}
                </Text>
              </Animated.View>

              {/* Items */}
              {entry.items.map((item, index) => (
                <Animated.View
                  key={item.id || index}
                  entering={FadeInDown.delay(150 + index * 100).duration(400)}
                  style={styles.itemCard}
                >
                  {/* Item Header */}
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemLabel}>{item.label}</Text>
                    <View>
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
                          <Ionicons
                            name="information-circle-outline"
                            size={14}
                            color={getConfidenceColors(item.confidence).text}
                            style={{ opacity: 0.6 }}
                          />
                        </View>
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Macros */}
                  <View style={styles.macrosRow}>
                    <MacroItem
                      label="cal"
                      value={item.macros.kcal}
                      unit=""
                      type="calories"
                    />
                    <MacroItem
                      label="protein"
                      value={item.macros.protein}
                      unit="g"
                      type="protein"
                    />
                    <MacroItem
                      label="fat"
                      value={item.macros.fat}
                      unit="g"
                      type="fat"
                    />
                    <MacroItem
                      label="carbs"
                      value={item.macros.carbs}
                      unit="g"
                      type="carbs"
                    />
                  </View>

                  {/* Micronutrients - only show if enabled in goals */}
                  {((enabledMicros.fiber && item.macros.fiber !== undefined) ||
                    (enabledMicros.sugar && item.macros.sugar !== undefined) ||
                    (enabledMicros.sodium && item.macros.sodium !== undefined) ||
                    (enabledMicros.potassium && item.macros.potassium !== undefined) ||
                    (enabledMicros.water && item.macros.water !== undefined)) && (
                    <View style={styles.microsRow}>
                      {enabledMicros.fiber && item.macros.fiber !== undefined && (
                        <MicroItem
                          label="fiber"
                          value={item.macros.fiber}
                          unit="g"
                          type="fiber"
                        />
                      )}
                      {enabledMicros.sugar && item.macros.sugar !== undefined && (
                        <MicroItem
                          label="sugar"
                          value={item.macros.sugar}
                          unit="g"
                          type="sugar"
                        />
                      )}
                      {enabledMicros.sodium && item.macros.sodium !== undefined && (
                        <MicroItem
                          label="sodium"
                          value={item.macros.sodium}
                          unit="mg"
                          type="sodium"
                        />
                      )}
                      {enabledMicros.potassium && item.macros.potassium !== undefined && (
                        <MicroItem
                          label="potassium"
                          value={item.macros.potassium}
                          unit="mg"
                          type="potassium"
                        />
                      )}
                      {enabledMicros.water && item.macros.water !== undefined && (
                        <MicroItem
                          label="water"
                          value={item.macros.water}
                          unit="L"
                          type="water"
                        />
                      )}
                    </View>
                  )}

                  {/* Reasoning Section */}
                  {item.reasoning && (
                    <View style={styles.reasoningSection}>
                      {/* Interpretation */}
                      {item.reasoning.interpretation && (
                        <View style={styles.reasoningRow}>
                          <Ionicons
                            name="bulb-outline"
                            size={16}
                            color="#666"
                          />
                          <Text style={styles.reasoningText}>
                            {item.reasoning.interpretation}
                          </Text>
                        </View>
                      )}

                      {/* Assumptions */}
                      {item.reasoning.assumptions?.length > 0 && (
                        <View style={styles.reasoningRow}>
                          <Ionicons
                            name="information-circle-outline"
                            size={16}
                            color="#666"
                          />
                          <View style={styles.assumptionsList}>
                            {item.reasoning.assumptions.map((assumption, i) => (
                              <Text key={i} style={styles.assumptionText}>
                                {"\u2022"} {assumption}
                              </Text>
                            ))}
                          </View>
                        </View>
                      )}

                      {/* Portion Notes */}
                      {item.reasoning.portionNotes && (
                        <View style={styles.reasoningRow}>
                          <Ionicons
                            name="scale-outline"
                            size={16}
                            color="#666"
                          />
                          <Text style={styles.reasoningText}>
                            {item.reasoning.portionNotes}
                          </Text>
                        </View>
                      )}

                      {/* Data Source */}
                      {item.reasoning.dataSource && (
                        <View style={styles.reasoningRow}>
                          <Ionicons
                            name="library-outline"
                            size={16}
                            color="#666"
                          />
                          <ParsedText
                            text={item.reasoning.dataSource}
                            style={styles.sourceText}
                          />
                        </View>
                      )}

                      {/* Confidence Explanation */}
                      {item.reasoning.confidenceExplanation && (
                        <View style={styles.reasoningRow}>
                          <Ionicons
                            name="checkmark-circle-outline"
                            size={16}
                            color="#666"
                          />
                          <Text style={styles.reasoningText}>
                            {item.reasoning.confidenceExplanation}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </Animated.View>
              ))}

              {/* Totals */}
              <Animated.View
                entering={FadeInDown.delay(150 + entry.items.length * 100).duration(400)}
                style={styles.totalsSection}
              >
                <View style={styles.totalsLeft}>
                  <FontAwesomeIcon
                    icon={MACRO_ICONS.calories}
                    size={18}
                    color={MACRO_COLORS.calories.primary}
                  />
                  <Text style={styles.totalsLabel}>Total</Text>
                </View>
                <Text style={styles.totalsValue}>{entry.inlineKcal} cal</Text>
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
      </View>
    </Modal>
  );
}

function MacroItem({
  label,
  value,
  unit,
  type,
}: {
  label: string;
  value: number;
  unit: string;
  type: "calories" | "protein" | "fat" | "carbs";
}) {
  const colors = MACRO_COLORS[type];
  const icon = MACRO_ICONS[type];

  return (
    <View style={styles.macroItem}>
      <View style={styles.macroIconContainer}>
        <FontAwesomeIcon icon={icon} size={12} color={colors.primary} />
      </View>
      <Text style={styles.macroValue}>
        {Math.round(value)}
        {unit}
      </Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

function MicroItem({
  label,
  value,
  unit,
  type,
}: {
  label: string;
  value: number;
  unit: string;
  type: "fiber" | "sugar" | "sodium" | "potassium" | "water";
}) {
  const colors = MICRO_COLORS[type];
  const icon = MICRO_ICONS[type];

  // Format value based on type
  const displayValue = type === "water"
    ? value.toFixed(1)
    : Math.round(value).toString();

  return (
    <View style={styles.macroItem}>
      <View style={styles.macroIconContainer}>
        <FontAwesomeIcon icon={icon} size={12} color={colors.primary} />
      </View>
      <Text style={styles.macroValue}>
        {displayValue}
        {unit}
      </Text>
      <Text style={styles.macroLabel}>{label}</Text>
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
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#f8f8f8",
  },
  title: {
    fontSize: 18,
    fontFamily: "System",
    fontWeight: "600",
    color: "#1a1a1a",
    textAlign: "center",
    letterSpacing: -0.3,
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
    fontWeight: "700",
    lineHeight: 32,
    marginBottom: 24,
    letterSpacing: -0.5,
  },
  itemCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  itemLabel: {
    fontSize: 19,
    fontFamily: "System",
    fontWeight: "700",
    color: "#1a1a1a",
    flex: 1,
    marginRight: 12,
    lineHeight: 26,
  },
  confidenceBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  confidenceBadgeContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  confidenceText: {
    fontSize: 13,
    fontFamily: "System",
    fontWeight: "700",
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
  macroIconContainer: {
    marginBottom: 6,
  },
  macroValue: {
    fontSize: 18,
    fontFamily: "System",
    fontWeight: "700",
    color: "#333",
    marginBottom: 2,
  },
  macroLabel: {
    fontSize: 10,
    fontFamily: "System",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    color: "#888",
  },
  microsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    gap: 8,
  },
  reasoningSection: {
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingTop: 16,
    marginTop: 8,
  },
  reasoningRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
    gap: 12,
  },
  reasoningText: {
    fontSize: 14,
    color: "#4a4a4a",
    flex: 1,
    lineHeight: 22,
    fontFamily: "System",
    fontWeight: "400",
  },
  assumptionsList: {
    flex: 1,
  },
  assumptionText: {
    fontSize: 14,
    color: "#4a4a4a",
    marginBottom: 6,
    lineHeight: 22,
    fontFamily: "System",
    fontWeight: "400",
  },
  sourceText: {
    fontSize: 14,
    color: "#4A90D9",
    flex: 1,
    fontFamily: "System",
    fontWeight: "600",
    lineHeight: 22,
  },
  totalsSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 20,
    marginTop: 12,
    backgroundColor: MACRO_COLORS.calories.secondary,
    borderRadius: 16,
  },
  totalsLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  totalsLabel: {
    fontSize: 18,
    fontFamily: "System",
    fontWeight: "700",
    color: "#1a1a1a",
    letterSpacing: -0.3,
  },
  totalsValue: {
    fontSize: 24,
    fontFamily: "System",
    fontWeight: "700",
    color: MACRO_COLORS.calories.primary,
    letterSpacing: -0.5,
  },
  // Confidence popup styles
  confidencePopupOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    left: 0,
    bottom: 0,
    zIndex: 9999,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    elevation: 20,
  },
  confidencePopupBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  confidencePopup: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    minWidth: 320,
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
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
    textTransform: "uppercase",
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
    fontWeight: "600",
  },
  popupHint: {
    fontSize: 12,
    fontFamily: "System",
    fontWeight: "500",
    color: "#999",
    textAlign: "center",
    marginTop: 4,
  },
});
