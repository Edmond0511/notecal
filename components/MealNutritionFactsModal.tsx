import { Tokens } from "@/constants/theme";
import { CustomMealItem } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo } from "react";
import {
  Dimensions,
  Modal,
  ScrollView,
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

interface Totals {
  kcal: number;
  fat: number;
  saturatedFat: number;
  transFat: number;
  cholesterol: number;
  sodium: number;
  carbs: number;
  fiber: number;
  sugar: number;
  protein: number;
  vitaminA: number;
  vitaminC: number;
  calcium: number;
  iron: number;
  potassium: number;
}

function computeTotals(items: CustomMealItem[]): Totals {
  const acc: Totals = {
    kcal: 0,
    fat: 0,
    saturatedFat: 0,
    transFat: 0,
    cholesterol: 0,
    sodium: 0,
    carbs: 0,
    fiber: 0,
    sugar: 0,
    protein: 0,
    vitaminA: 0,
    vitaminC: 0,
    calcium: 0,
    iron: 0,
    potassium: 0,
  };
  for (const item of items) {
    const m = item.macros;
    const ext = item.extendedNutrients;
    acc.kcal += m.kcal ?? 0;
    acc.fat += m.fat ?? 0;
    acc.carbs += m.carbs ?? 0;
    acc.protein += m.protein ?? 0;
    acc.fiber += m.fiber ?? 0;
    acc.sugar += m.sugar ?? 0;
    acc.sodium += m.sodium ?? 0;
    acc.potassium += m.potassium ?? 0;
    acc.saturatedFat += ext?.saturatedFat ?? 0;
    acc.transFat += ext?.transFat ?? 0;
    acc.cholesterol += ext?.cholesterol ?? 0;
    acc.vitaminA += ext?.vitaminA ?? 0;
    acc.vitaminC += ext?.vitaminC ?? 0;
    acc.calcium += ext?.calcium ?? 0;
    acc.iron += ext?.iron ?? 0;
  }
  return acc;
}

function formatGrams(value: number): string {
  return `${Math.round(value * 10) / 10}g`;
}

function formatMg(value: number): string {
  return `${Math.round(value)}mg`;
}

function formatMcg(value: number): string {
  return `${Math.round(value)}mcg`;
}

interface Props {
  visible: boolean;
  items: CustomMealItem[];
  onClose: () => void;
}

export function MealNutritionFactsModal({ visible, items, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);

  const totals = useMemo(() => computeTotals(items), [items]);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const panGesture = Gesture.Pan()
    .activeOffsetY(10)
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

  // Reset translation when reopened
  React.useEffect(() => {
    if (visible) translateY.value = 0;
  }, [visible, translateY]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <StatusBar barStyle="dark-content" />
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={handleClose}
          />
        </Animated.View>
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.container,
              { paddingBottom: insets.bottom + 16 },
              animatedStyle,
            ]}
          >
            <View style={styles.dragIndicatorContainer}>
              <View style={styles.dragIndicator} />
            </View>

            <View style={styles.header}>
              <View style={styles.headerSpacer} />
              <Text style={styles.headerTitle}>Nutrition Facts</Text>
              <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
                <View style={styles.closeButton}>
                  <Ionicons name="close" size={20} color="#666" />
                </View>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Row label="Calories" value={`${Math.round(totals.kcal)}`} bold first />
              <Row label="Total Fat" value={formatGrams(totals.fat)} bold />
              <Row label="Saturated Fat" value={formatGrams(totals.saturatedFat)} indent />
              <Row label="Trans Fat" value={formatGrams(totals.transFat)} indent />
              <Row label="Cholesterol" value={formatMg(totals.cholesterol)} bold />
              <Row label="Sodium" value={formatMg(totals.sodium)} bold />
              <Row label="Total Carbohydrate" value={formatGrams(totals.carbs)} bold />
              <Row label="Dietary Fiber" value={formatGrams(totals.fiber)} indent />
              <Row label="Total Sugars" value={formatGrams(totals.sugar)} indent />
              <Row label="Protein" value={formatGrams(totals.protein)} bold />
              <View style={styles.divider} />
              <Row label="Vitamin A" value={formatMcg(totals.vitaminA)} />
              <Row label="Vitamin C" value={formatMg(totals.vitaminC)} />
              <Row label="Calcium" value={formatMg(totals.calcium)} />
              <Row label="Iron" value={formatMg(totals.iron)} />
              <Row label="Potassium" value={formatMg(totals.potassium)} />
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

interface RowProps {
  label: string;
  value: string;
  bold?: boolean;
  indent?: boolean;
  first?: boolean;
}

function Row({ label, value, bold, indent, first }: RowProps) {
  return (
    <View style={[styles.row, first && styles.rowFirst, indent && styles.rowIndent]}>
      <Text style={[styles.label, bold && styles.labelBold]}>{label}</Text>
      <Text style={[styles.value, bold && styles.valueBold]}>{value}</Text>
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
  container: {
    backgroundColor: "#FCFCFB",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    maxHeight: SCREEN_HEIGHT * 0.75,
  },
  dragIndicatorContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
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
    paddingVertical: 8,
    paddingBottom: 12,
  },
  headerSpacer: {
    width: 36,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: "System",
    fontWeight: "600",
    color: Tokens.textPrimary,
    letterSpacing: -0.3,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EBEBEB",
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    minHeight: 40,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E8E7E3",
  },
  rowFirst: {
    borderTopWidth: 0,
  },
  rowIndent: {
    paddingLeft: 16,
  },
  label: {
    fontSize: 14,
    fontFamily: "System",
    fontWeight: "500",
    color: "#333",
  },
  labelBold: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  value: {
    fontSize: 14,
    fontFamily: "System",
    fontWeight: "500",
    color: "#333",
  },
  valueBold: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  divider: {
    height: 6,
    backgroundColor: "transparent",
    borderTopWidth: 2,
    borderTopColor: "#1a1a1a",
    marginTop: 4,
  },
});
