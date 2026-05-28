import { Tokens } from "@/constants/theme";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import {
  isLiquidGlassSupported,
  LiquidGlassView,
} from "@callstack/liquid-glass";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect } from "react";
import {
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
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const DISMISS_THRESHOLD = 150;

interface CalendarLegendModalProps {
  visible: boolean;
  onClose: () => void;
  nested?: boolean;
}

const LEGEND_ITEMS = [
  {
    color: "#4CAF50",
    type: "filled" as const,
    title: "On target",
    subtitle: "90% or more of daily calorie goal",
  },
  {
    color: "#FFC107",
    type: "filled" as const,
    title: "Partial",
    subtitle: "within 50–89% of daily calorie goal",
  },
  {
    color: "#EF5350",
    type: "filled" as const,
    title: "Under target",
    subtitle: "Less than 50% of daily calorie goal",
  },
  {
    color: "#ccc",
    type: "empty" as const,
    title: "No data",
    subtitle: "No food logged or no goal set",
  },
];

export function CalendarLegendModal({
  visible,
  onClose,
  nested,
}: CalendarLegendModalProps) {
  const { height: screenHeight, sheetMaxWidth, isRegular } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const isScrolledToTop = useSharedValue(true);

  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      isScrolledToTop.value = true;
    }
  }, [visible]);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
        translateY.value = withSpring(screenHeight, {
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
      [0, screenHeight * 0.5],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const handleScroll = (event: any) => {
    isScrolledToTop.value = event.nativeEvent.contentOffset.y <= 0;
  };

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
              isRegular && {
                width: sheetMaxWidth,
                maxWidth: sheetMaxWidth,
                alignSelf: "center",
              },
              animatedStyle,
            ]}
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
                    colorScheme="light"
                    tintColor="rgba(250, 250, 247, 0.3)"
                  >
                    <Ionicons name="chevron-back" size={20} color={Tokens.textPrimary} />
                  </LiquidGlassView>
                ) : (
                  <View style={[styles.backButton, styles.backButtonFallback]}>
                    <Ionicons name="chevron-back" size={20} color="#666" />
                  </View>
                )}
              </TouchableOpacity>
              <Text style={styles.title}>Calendar Legend</Text>
              <View style={styles.headerRightSpacer} />
            </View>

            <Animated.ScrollView
              style={styles.content}
              contentContainerStyle={[
                styles.contentContainer,
                { paddingBottom: insets.bottom + 20 },
              ]}
              showsVerticalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              bounces={true}
            >
              <Animated.View
                entering={FadeInDown.delay(100).duration(400)}
                style={styles.section}
              >
                <Text style={styles.sectionTitle}>Dot Indicators</Text>

                <View style={styles.card}>
                  {LEGEND_ITEMS.map((item, index) => (
                    <View
                      key={index}
                      style={[
                        styles.rowWrapper,
                        index === LEGEND_ITEMS.length - 1 && styles.rowWrapperLast,
                      ]}
                    >
                      <View style={styles.row}>
                        {item.type === "filled" ? (
                          <View
                            style={[
                              styles.dot,
                              { backgroundColor: item.color },
                            ]}
                          />
                        ) : (
                          <View
                            style={[
                              styles.dotEmpty,
                              { borderColor: item.color },
                            ]}
                          />
                        )}
                        <View style={styles.rowTextContainer}>
                          <Text style={styles.rowTitle}>{item.title}</Text>
                          <Text style={styles.rowSubtitle}>
                            {item.subtitle}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              </Animated.View>

              <Animated.View
                entering={FadeInDown.delay(200).duration(400)}
                style={styles.section}
              >
                <Text style={styles.hint}>
                  Colored dots appear below each date on the calendar to show
                  how your daily intake compares to your calorie goal.
                </Text>
              </Animated.View>
            </Animated.ScrollView>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
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
    fontSize: 17,
    fontWeight: "600",
    color: "#6B6B6B",
    textTransform: "capitalize",
    letterSpacing: -0.3,
    marginBottom: 6,
    marginLeft: 0,
  },
  card: {
    backgroundColor: Tokens.surfaceRaised,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 0, 0, 0.07)",
    ...Tokens.shadowLight,
  },
  rowWrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Tokens.border,
  },
  rowWrapperLast: {
    borderBottomWidth: 0,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 12,
  },
  dotEmpty: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderStyle: "dashed",
    marginRight: 12,
  },
  rowTextContainer: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 16,
    color: Tokens.textPrimary,
    fontWeight: "400",
    letterSpacing: -0.3,
  },
  rowSubtitle: {
    fontSize: 14,
    color: Tokens.textSecondary,
    fontWeight: "400",
    marginTop: 2,
  },
  hint: {
    fontSize: 15,
    color: Tokens.textSecondary,
    lineHeight: 22,
    marginLeft: 4,
  },
});
