import { Entry } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Dimensions,
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
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const DISMISS_THRESHOLD = 150;

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

  // Reset translation when modal opens
  React.useEffect(() => {
    if (visible) {
      translateY.value = 0;
      isScrolledToTop.value = true;
    }
  }, [visible]);

  if (!entry) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      transparent={false}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <StatusBar barStyle="dark-content" />
        <Animated.View style={[styles.backdrop, backdropStyle]} />
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.container,
              { paddingTop: insets.top },
              animatedStyle,
            ]}
          >
            {/* Drag Indicator */}
            <View style={styles.dragIndicatorContainer}>
              <View style={styles.dragIndicator} />
            </View>

            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity
                onPress={handleClose}
                style={styles.closeButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="chevron-down" size={28} color="#1976D2" />
              </TouchableOpacity>
              <Text style={styles.title}>Nutrition Details</Text>
              <View style={styles.headerSpacer} />
            </View>

            <Animated.ScrollView
              style={styles.content}
              contentContainerStyle={[
                styles.contentContainer,
                { paddingBottom: insets.bottom + 24 },
              ]}
              showsVerticalScrollIndicator={false}
              onScrollBeginDrag={handleScrollBeginDrag}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              bounces={true}
            >
              {/* Original Input */}
              <Text style={styles.inputText}>
                {entry.rawText.replace(/^-\s*/, "")}
              </Text>

              {/* Items */}
              {entry.items.map((item, index) => (
                <View key={item.id || index} style={styles.itemCard}>
                  {/* Item Header */}
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemLabel}>{item.label}</Text>
                    <View style={styles.confidenceBadge}>
                      <Text style={styles.confidenceText}>
                        {Math.round(item.confidence * 100)}%
                      </Text>
                    </View>
                  </View>

                  {/* Macros */}
                  <View style={styles.macrosRow}>
                    <MacroItem
                      label="calories"
                      value={item.macros.kcal}
                      unit=""
                    />
                    <MacroItem
                      label="protein"
                      value={item.macros.protein}
                      unit="g"
                    />
                    <MacroItem label="fat" value={item.macros.fat} unit="g" />
                    <MacroItem
                      label="carbs"
                      value={item.macros.carbs}
                      unit="g"
                    />
                  </View>

                  {/* Portion */}
                  <Text style={styles.portionText}>
                    {item.qty} {item.unit}
                  </Text>

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
                          <Text style={styles.sourceText}>
                            {item.reasoning.dataSource}
                          </Text>
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
                </View>
              ))}

              {/* Totals */}
              <View style={styles.totalsSection}>
                <Text style={styles.totalsLabel}>Total</Text>
                <Text style={styles.totalsValue}>{entry.inlineKcal} cal</Text>
              </View>
            </Animated.ScrollView>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

function MacroItem({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <View style={styles.macroItem}>
      <Text style={styles.macroValue}>
        {Math.round(value)}
        {unit}
      </Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#FAFCFF",
  },
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  dragIndicatorContainer: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  dragIndicator: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: "#D1D5DB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#ffffff",
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Poppins_600SemiBold",
    color: "#1a1a1a",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EDF4FC",
    alignItems: "center",
    justifyContent: "center",
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  inputText: {
    fontSize: 24,
    color: "#1a1a1a",
    fontFamily: "Poppins_700Bold",
    lineHeight: 32,
    marginBottom: 24,
    letterSpacing: -0.5,
  },
  itemCard: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E3F2FD",
    shadowColor: "#1976D2",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  itemLabel: {
    fontSize: 19,
    fontFamily: "Poppins_700Bold",
    color: "#1a1a1a",
    flex: 1,
    marginRight: 12,
    lineHeight: 26,
  },
  confidenceBadge: {
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BBDEFB",
  },
  confidenceText: {
    fontSize: 13,
    color: "#1976D2",
    fontFamily: "Poppins_700Bold",
    letterSpacing: 0.5,
  },
  macrosRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
    paddingVertical: 12,
  },
  macroItem: {
    alignItems: "center",
    flex: 1,
  },
  macroValue: {
    fontSize: 20,
    fontFamily: "Poppins_700Bold",
    color: "#1976D2",
    marginBottom: 4,
  },
  macroLabel: {
    fontSize: 11,
    color: "#64B5F6",
    fontFamily: "Poppins_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  portionText: {
    fontSize: 15,
    color: "#666",
    marginBottom: 16,
    fontFamily: "Poppins_500Medium",
  },
  reasoningSection: {
    borderTopWidth: 2,
    borderTopColor: "#E3F2FD",
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
    fontFamily: "Poppins_400Regular",
  },
  assumptionsList: {
    flex: 1,
  },
  assumptionText: {
    fontSize: 14,
    color: "#4a4a4a",
    marginBottom: 6,
    lineHeight: 22,
    fontFamily: "Poppins_400Regular",
  },
  sourceText: {
    fontSize: 14,
    color: "#1976D2",
    flex: 1,
    fontFamily: "Poppins_600SemiBold",
    lineHeight: 22,
  },
  totalsSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 20,
    marginTop: 12,
    backgroundColor: "#ffffff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E3F2FD",
    shadowColor: "#1976D2",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  totalsLabel: {
    fontSize: 18,
    fontFamily: "Poppins_700Bold",
    color: "#1a1a1a",
    letterSpacing: -0.3,
  },
  totalsValue: {
    fontSize: 24,
    fontFamily: "Poppins_700Bold",
    color: "#1976D2",
    letterSpacing: -0.5,
  },
});
