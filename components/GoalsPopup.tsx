import { UserGoals } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect } from 'react';
import {
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { ProgressRings } from './goals/ProgressRings';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_THRESHOLD = 100;

interface GoalsPopupProps {
  visible: boolean;
  onClose: () => void;
  onSetupPress: () => void;
  onEditPress: () => void;
  goals: UserGoals | null;
  consumed: {
    kcal: number;
    protein: number;
    fat: number;
    carbs: number;
    fiber?: number;
    sugar?: number;
    sodium?: number;
    potassium?: number;
    water?: number;
  };
}

export function GoalsPopup({
  visible,
  onClose,
  onSetupPress,
  onEditPress,
  goals,
  consumed,
}: GoalsPopupProps) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [visible]);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const handleSetup = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
    onSetupPress();
  };

  const handleEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    onEditPress();
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
      [0, SCREEN_HEIGHT * 0.3],
      [1, 0],
      Extrapolation.CLAMP
    ),
  }));

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        {/* Backdrop */}
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <TouchableOpacity
            style={styles.backdropPressable}
            onPress={handleClose}
            activeOpacity={1}
          />
        </Animated.View>

        {/* Popup Content */}
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[styles.popupContainer, animatedStyle]}
          >
            {/* Drag Indicator */}
            <View style={styles.dragIndicatorContainer}>
              <View style={styles.dragIndicator} />
            </View>

            {goals ? (
              // Progress View - Goals are configured
              <Animated.View
                entering={FadeInDown.delay(100).duration(300)}
                style={styles.progressContent}
              >
                <View style={styles.progressHeader}>
                  <Text style={styles.progressTitle}>Daily Progress</Text>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={handleEdit}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="pencil" size={16} color="#666" />
                  </TouchableOpacity>
                </View>

                <ProgressRings
                  consumed={consumed}
                  targets={{
                    kcal: goals.manualTargets?.kcal ?? goals.targetKcal,
                    protein: goals.manualTargets?.protein ?? goals.targetProtein,
                    fat: goals.manualTargets?.fat ?? goals.targetFat,
                    carbs: goals.manualTargets?.carbs ?? goals.targetCarbs,
                    fiber: goals.manualTargets?.fiber,
                    sugar: goals.manualTargets?.sugar,
                    sodium: goals.manualTargets?.sodium,
                    potassium: goals.manualTargets?.potassium,
                    water: goals.manualTargets?.water,
                  }}
                />
              </Animated.View>
            ) : (
              // Setup Prompt - No goals configured
              <Animated.View
                entering={FadeInDown.delay(100).duration(300)}
                style={styles.setupContent}
              >
                <View style={styles.setupIconContainer}>
                  <Ionicons name="nutrition-outline" size={32} color="#1A6872" />
                </View>
                <Text style={styles.setupTitle}>Set your nutrition goals</Text>
                <Text style={styles.setupDescription}>
                  Track your progress with personalized daily targets based on your body and goals
                </Text>
                <TouchableOpacity
                  style={styles.setupButton}
                  onPress={handleSetup}
                  activeOpacity={0.8}
                >
                  <Text style={styles.setupButtonText}>Get Started</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  backdropPressable: {
    flex: 1,
  },
  popupContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  dragIndicatorContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 16,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
  },
  // Setup prompt styles
  setupContent: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  setupIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E0F2F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  setupTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  setupDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  setupButton: {
    backgroundColor: '#1A6872',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
    minWidth: 160,
    alignItems: 'center',
  },
  setupButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  // Progress view styles
  progressContent: {
    paddingBottom: 8,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  editButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
  },
});
