import { useAppStore } from '@/store/app-store';
import {
  ActivityLevel,
  CarbPreference,
  GoalType,
  ProteinPreference,
  Sex,
  UnitSystem,
  UserGoals,
  UserGoalsInput,
} from '@/types';
import { calculateGoals } from '@/utils/goalsCalculator';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StatusBar,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Step1Metrics } from './WizardSteps/Step1Metrics';
import { Step2Activity } from './WizardSteps/Step2Activity';
import { Step3Goal } from './WizardSteps/Step3Goal';
import { Step4Macros } from './WizardSteps/Step4Macros';
import { Step5Review } from './WizardSteps/Step5Review';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_THRESHOLD = 150;
const TOTAL_STEPS = 5;

interface GoalsWizardProps {
  visible: boolean;
  onClose: () => void;
  existingGoals?: UserGoals | null;
}

export interface WizardFormData {
  sex: Sex | null;
  age: string;
  heightCm: string;
  heightFeet: string;
  heightInches: string;
  weightKg: string;
  weightLbs: string;
  bodyFatPercentage: string;
  activityLevel: ActivityLevel | null;
  goalType: GoalType | null;
  proteinPreference: ProteinPreference;
  carbPreference: CarbPreference;
  useImperial: boolean;
}

const initialFormData: WizardFormData = {
  sex: null,
  age: '',
  heightCm: '',
  heightFeet: '',
  heightInches: '',
  weightKg: '',
  weightLbs: '',
  bodyFatPercentage: '',
  activityLevel: null,
  goalType: null,
  proteinPreference: 'standard',
  carbPreference: 'standard',
  useImperial: false,
};

export function GoalsWizard({ visible, onClose, existingGoals }: GoalsWizardProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const isScrolledToTop = useSharedValue(true);
  const setGoals = useAppStore((state) => state.setGoals);
  const preferredUnits = useAppStore((state) => state.preferredUnits);
  const setPreferredUnits = useAppStore((state) => state.setPreferredUnits);

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<WizardFormData>(initialFormData);

  // Initialize form with existing goals or defaults
  useEffect(() => {
    if (visible) {
      if (existingGoals) {
        const isImperial = preferredUnits === 'imperial';
        setFormData({
          sex: existingGoals.sex,
          age: existingGoals.age.toString(),
          heightCm: existingGoals.heightCm.toString(),
          heightFeet: Math.floor(existingGoals.heightCm / 30.48).toString(),
          heightInches: Math.round((existingGoals.heightCm % 30.48) / 2.54).toString(),
          weightKg: existingGoals.weightKg.toString(),
          weightLbs: Math.round(existingGoals.weightKg * 2.20462).toString(),
          bodyFatPercentage: existingGoals.bodyFatPercentage?.toString() || '',
          activityLevel: existingGoals.activityLevel,
          goalType: existingGoals.goalType,
          proteinPreference: existingGoals.proteinPreference || 'standard',
          carbPreference: existingGoals.carbPreference || 'standard',
          useImperial: isImperial,
        });
      } else {
        setFormData({
          ...initialFormData,
          useImperial: preferredUnits === 'imperial',
        });
      }
      setCurrentStep(1);
      translateY.value = 0;
    }
  }, [visible, existingGoals, preferredUnits]);

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
      Extrapolation.CLAMP
    ),
  }));

  const handleScrollBeginDrag = (event: any) => {
    isScrolledToTop.value = event.nativeEvent.contentOffset.y <= 0;
  };

  const handleScroll = (event: any) => {
    isScrolledToTop.value = event.nativeEvent.contentOffset.y <= 0;
  };

  const updateFormData = (updates: Partial<WizardFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 1:
        if (formData.useImperial) {
          return !!(
            formData.sex &&
            formData.age &&
            formData.heightFeet &&
            formData.weightLbs
          );
        }
        return !!(
          formData.sex &&
          formData.age &&
          formData.heightCm &&
          formData.weightKg
        );
      case 2:
        return !!formData.activityLevel;
      case 3:
        return !!formData.goalType;
      case 4:
        return true; // Optional step
      case 5:
        return true;
      default:
        return false;
    }
  };

  const goToNextStep = () => {
    if (currentStep < TOTAL_STEPS && canProceed()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentStep((prev) => prev + 1);
    }
  };

  const goToPreviousStep = () => {
    if (currentStep > 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Convert form data to UserGoalsInput
    let heightCm: number;
    let weightKg: number;

    if (formData.useImperial) {
      const feet = parseFloat(formData.heightFeet) || 0;
      const inches = parseFloat(formData.heightInches) || 0;
      heightCm = Math.round((feet * 12 + inches) * 2.54 * 10) / 10;
      weightKg = Math.round((parseFloat(formData.weightLbs) || 0) * 0.453592 * 10) / 10;
    } else {
      heightCm = parseFloat(formData.heightCm) || 0;
      weightKg = parseFloat(formData.weightKg) || 0;
    }

    const input: UserGoalsInput = {
      sex: formData.sex!,
      age: parseInt(formData.age, 10),
      heightCm,
      weightKg,
      bodyFatPercentage: formData.bodyFatPercentage
        ? parseFloat(formData.bodyFatPercentage)
        : null,
      activityLevel: formData.activityLevel!,
      goalType: formData.goalType!,
      proteinPreference: formData.proteinPreference,
      carbPreference: formData.carbPreference,
    };

    const calculatedGoals = calculateGoals(input);
    // Note: Manual targets are NOT preserved when recalculating via wizard.
    // The calculateGoals() function returns fresh goals without manual targets,
    // so the new calculated values always take precedence.

    setGoals(calculatedGoals);
    setPreferredUnits(formData.useImperial ? 'imperial' : 'metric');
    onClose();
  };

  const getCalculatedGoals = (): UserGoals | null => {
    if (!canProceed()) return null;

    let heightCm: number;
    let weightKg: number;

    if (formData.useImperial) {
      const feet = parseFloat(formData.heightFeet) || 0;
      const inches = parseFloat(formData.heightInches) || 0;
      heightCm = Math.round((feet * 12 + inches) * 2.54 * 10) / 10;
      weightKg = Math.round((parseFloat(formData.weightLbs) || 0) * 0.453592 * 10) / 10;
    } else {
      heightCm = parseFloat(formData.heightCm) || 0;
      weightKg = parseFloat(formData.weightKg) || 0;
    }

    if (!formData.sex || !formData.age || !heightCm || !weightKg ||
        !formData.activityLevel || !formData.goalType) {
      return null;
    }

    const input: UserGoalsInput = {
      sex: formData.sex,
      age: parseInt(formData.age, 10),
      heightCm,
      weightKg,
      bodyFatPercentage: formData.bodyFatPercentage
        ? parseFloat(formData.bodyFatPercentage)
        : null,
      activityLevel: formData.activityLevel,
      goalType: formData.goalType,
      proteinPreference: formData.proteinPreference,
      carbPreference: formData.carbPreference,
    };

    return calculateGoals(input);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <Step1Metrics
            formData={formData}
            updateFormData={updateFormData}
          />
        );
      case 2:
        return (
          <Step2Activity
            selectedActivity={formData.activityLevel}
            onSelect={(level) => updateFormData({ activityLevel: level })}
          />
        );
      case 3:
        return (
          <Step3Goal
            selectedGoal={formData.goalType}
            onSelect={(goal) => updateFormData({ goalType: goal })}
          />
        );
      case 4:
        return (
          <Step4Macros
            proteinPreference={formData.proteinPreference}
            carbPreference={formData.carbPreference}
            onProteinChange={(pref) => updateFormData({ proteinPreference: pref })}
            onCarbChange={(pref) => updateFormData({ carbPreference: pref })}
          />
        );
      case 5:
        return (
          <Step5Review
            goals={getCalculatedGoals()}
            formData={formData}
            existingGoals={existingGoals}
          />
        );
      default:
        return null;
    }
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
        {/* Backdrop */}
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <TouchableOpacity
            style={styles.backdropPressable}
            activeOpacity={1}
            onPress={handleClose}
          />
        </Animated.View>

        {/* Modal Content */}
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.modalContainer,
              { marginTop: insets.top, paddingBottom: insets.bottom + 16 },
              animatedStyle,
            ]}
          >
            {/* Handle */}
            <View style={styles.handleContainer}>
              <View style={styles.handle} />
            </View>

            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.headerBackButton}
                onPress={handleClose}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={20} color="#666" />
              </TouchableOpacity>
              <View style={styles.headerContent}>
                <Text style={styles.headerTitle}>
                  {existingGoals ? 'Edit Goals' : 'Set Up Goals'}
                </Text>
                <Text style={styles.headerSubtitle}>
                  Step {currentStep} of {TOTAL_STEPS}
                </Text>
              </View>
              <View style={styles.headerRightSpacer} />
            </View>

            {/* Progress indicator */}
            <View style={styles.progressContainer}>
              {Array.from({ length: TOTAL_STEPS }).map((_, index) => (
                <View
                  key={index}
                  style={[
                    styles.progressDot,
                    index < currentStep && styles.progressDotActive,
                    index === currentStep - 1 && styles.progressDotCurrent,
                  ]}
                />
              ))}
            </View>

            {/* Content */}
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.contentContainer}
            >
              <Animated.ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                onScrollBeginDrag={handleScrollBeginDrag}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                keyboardShouldPersistTaps="handled"
                bounces={true}
              >
                <Animated.View entering={FadeInDown.delay(100).duration(400)}>
                  {renderStep()}
                </Animated.View>
              </Animated.ScrollView>
            </KeyboardAvoidingView>

            {/* Navigation buttons */}
            <View style={styles.navigationContainer}>
              {currentStep > 1 ? (
                <TouchableOpacity
                  style={styles.backButton}
                  onPress={goToPreviousStep}
                >
                  <Ionicons name="arrow-back" size={20} color="#666" />
                  <Text style={styles.backButtonText}>Back</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.backButton} />
              )}

              {currentStep < TOTAL_STEPS ? (
                <TouchableOpacity
                  style={[
                    styles.nextButton,
                    !canProceed() && styles.nextButtonDisabled,
                  ]}
                  onPress={goToNextStep}
                  disabled={!canProceed()}
                >
                  <Text
                    style={[
                      styles.nextButtonText,
                      !canProceed() && styles.nextButtonTextDisabled,
                    ]}
                  >
                    Next
                  </Text>
                  <Ionicons
                    name="arrow-forward"
                    size={20}
                    color={canProceed() ? '#fff' : '#999'}
                  />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSave}
                >
                  <Text style={styles.saveButtonText}>Save Goals</Text>
                  <Ionicons name="checkmark" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
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
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8f8f8',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#f8f8f8',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#ddd',
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f8f8f8',
  },
  headerBackButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EBEBEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRightSpacer: {
    width: 36,
  },
  headerContent: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'System',
    fontWeight: '600',
    color: '#1a1a1a',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 20,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E0E0E0',
  },
  progressDotActive: {
    backgroundColor: '#1A6872',
  },
  progressDotCurrent: {
    width: 24,
    backgroundColor: '#1A6872',
  },
  contentContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  navigationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 100,
  },
  backButtonText: {
    fontSize: 16,
    color: '#666',
    marginLeft: 4,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A6872',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 25,
    gap: 8,
  },
  nextButtonDisabled: {
    backgroundColor: '#E0E0E0',
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  nextButtonTextDisabled: {
    color: '#999',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A6872',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 25,
    gap: 8,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
