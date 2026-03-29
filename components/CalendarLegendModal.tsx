import { Tokens } from "@/constants/theme";
import {
  isLiquidGlassSupported,
  LiquidGlassView,
} from "@callstack/liquid-glass";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect } from "react";
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
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const DISMISS_THRESHOLD = 150;

interface CalendarLegendModalProps {
  visible: boolean;
  onClose: () => void;
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
}: CalendarLegendModalProps) {
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
                    <React.Fragment key={index}>
                      {index > 0 && <View style={styles.divider} />}
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
                    </React.Fragment>
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
    fontSize: 18,
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#999",
    textTransform: "capitalize",
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  divider: {
    height: 1,
    backgroundColor: "#f0f0f0",
    marginLeft: 38,
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
    color: "#1a1a1a",
    fontWeight: "500",
  },
  rowSubtitle: {
    fontSize: 13,
    color: "#aaa",
    fontWeight: "400",
    marginTop: 2,
  },
  hint: {
    fontSize: 14,
    color: "#999",
    lineHeight: 20,
    marginLeft: 4,
  },
});
