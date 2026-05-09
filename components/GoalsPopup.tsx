import { Tokens } from '@/constants/theme';
import { UserGoals } from '@/types';
import {
  isLiquidGlassSupported,
  LiquidGlassView,
} from '@callstack/liquid-glass';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect } from 'react';
import {
  Dimensions,
  Image,
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
const DISMISS_THRESHOLD = 150;

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
  const showGlass = isLiquidGlassSupported;
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
              <>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressTitle}>Daily Progress</Text>
                  <TouchableOpacity
                    onPress={handleEdit}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    activeOpacity={0.7}
                  >
                    {showGlass ? (
                      <LiquidGlassView
                        style={styles.editButton}
                        interactive
                        effect="regular"
                        colorScheme="light"
                        tintColor="rgba(250, 250, 247, 0.3)"
                      >
                        <Ionicons name="pencil" size={16} color={Tokens.textPrimary} />
                      </LiquidGlassView>
                    ) : (
                      <View style={[styles.editButton, styles.editButtonFallback]}>
                        <Ionicons name="pencil" size={16} color={Tokens.textSecondary} />
                      </View>
                    )}
                  </TouchableOpacity>
                </View>

                <Animated.View
                  entering={FadeInDown.delay(100).duration(400)}
                  style={styles.progressContent}
                >
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
              </>
            ) : (
              // Setup Prompt - No goals configured
              <Animated.View
                entering={FadeInDown.delay(100).duration(400)}
                style={styles.setupContent}
              >
                <View style={styles.previewImageWrapper}>
                  <View style={styles.previewImageContainer}>
                    <View style={styles.previewImageAspect}>
                      <Image
                        source={require('../assets/images/goals-preview.png')}
                        style={styles.previewImage}
                        resizeMode="cover"
                      />
                    </View>
                  </View>
                </View>
                <Text style={styles.setupTitle}>Set your nutrition goals</Text>
                <Text style={styles.setupDescription}>
                  Track your progress with personalized daily targets
                </Text>
                <TouchableOpacity
                  style={styles.setupButton}
                  onPress={handleSetup}
                  activeOpacity={0.7}
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
    backgroundColor: Tokens.surfaceRaised,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
    paddingHorizontal: 20,
    ...Tokens.shadowMedium,
  },
  dragIndicatorContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Tokens.border,
  },
  // Setup prompt styles
  setupContent: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 8,
  },
  setupTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: Tokens.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  setupDescription: {
    fontSize: 14,
    color: Tokens.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  previewImageWrapper: {
    width: '100%',
    marginTop: 30,
    marginBottom: 40,
  },
  previewImageContainer: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  previewImageAspect: {
    width: '100%',
    aspectRatio: 1805 / 552,
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  setupButton: {
    backgroundColor: Tokens.accent,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 999,
    minWidth: 160,
    alignItems: 'center',
  },
  setupButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: "600",
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
    fontSize: 17,
    fontWeight: "600",
    color: Tokens.textPrimary,
    letterSpacing: -0.3,
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  editButtonFallback: {
    backgroundColor: '#EBEBEB',
  },
});
