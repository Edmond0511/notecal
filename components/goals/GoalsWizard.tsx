import { Tokens } from '@/constants/theme';
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
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-sans';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  StatusBar,
  StyleSheet,
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
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/onboarding/PrimaryButton';
import { ProgressDots } from '@/components/onboarding/ProgressDots';
import { StepGeneratingPlan } from '@/components/onboarding/steps/StepGeneratingPlan';
import { Step1Sex } from './WizardSteps/Step1Sex';
import { Step2Age } from './WizardSteps/Step2Age';
import { Step3Body } from './WizardSteps/Step3Body';
import { Step2Activity } from './WizardSteps/Step2Activity';
import { Step3Goal } from './WizardSteps/Step3Goal';
import { Step4Macros } from './WizardSteps/Step4Macros';
import { StepWeightTarget } from './WizardSteps/StepWeightTarget';
import { Step5Review } from './WizardSteps/Step5Review';
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";

const DISMISS_THRESHOLD = 150;

interface GoalsWizardProps {
  visible: boolean;
  onClose: () => void;
  existingGoals?: UserGoals | null;
  nested?: boolean;
}

export interface WizardFormData {
  sex: Sex | null;
  age: string;
  heightCm: string;
  heightFeet: string;
  heightInches: string;
  weightKg: string;
  weightLbs: string;
  activityLevel: ActivityLevel | null;
  goalType: GoalType | null;
  proteinPreference: ProteinPreference;
  carbPreference: CarbPreference;
  useImperial: boolean; // Legacy - kept for compatibility
  heightUseImperial: boolean;
  weightUseImperial: boolean;
  targetWeightKg: string;
  targetWeightLbs: string;
  timelineMonths: string;
}

const initialFormData: WizardFormData = {
  sex: null,
  age: '',
  heightCm: '',
  heightFeet: '',
  heightInches: '',
  weightKg: '',
  weightLbs: '',
  activityLevel: null,
  goalType: null,
  proteinPreference: 'standard',
  carbPreference: 'standard',
  useImperial: false,
  heightUseImperial: false,
  weightUseImperial: false,
  targetWeightKg: '',
  targetWeightLbs: '',
  timelineMonths: '',
};

export function GoalsWizard({ visible, onClose, existingGoals, nested }: GoalsWizardProps) {
  const { height: screenHeight, sheetMaxWidth, isRegular } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const isScrolledToTop = useSharedValue(true);
  const setGoals = useAppStore((state) => state.setGoals);
  const preferredUnits = useAppStore((state) => state.preferredUnits);
  const setPreferredUnits = useAppStore((state) => state.setPreferredUnits);

  useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
  });

  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<WizardFormData>(initialFormData);
  // Tracks whether the generating animation has already played in this modal
  // session, so going back from Review and continuing again skips the replay.
  const hasGeneratedRef = useRef(false);

  // Initialize form with existing goals or defaults
  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      isScrolledToTop.value = true;
      hasGeneratedRef.current = false;
      if (existingGoals) {
        const isImperial = preferredUnits === 'imperial';
        // Backward compatibility: map removed goal types
        let goalType = existingGoals.goalType;
        if ((goalType as string) === 'lose_fast') goalType = 'lose';
        if ((goalType as string) === 'gain_fast') goalType = 'gain';

        setFormData({
          sex: existingGoals.sex,
          age: existingGoals.age.toString(),
          heightCm: existingGoals.heightCm.toString(),
          heightFeet: Math.floor(existingGoals.heightCm / 30.48).toString(),
          heightInches: Math.round((existingGoals.heightCm % 30.48) / 2.54).toString(),
          weightKg: existingGoals.weightKg.toString(),
          weightLbs: Math.round(existingGoals.weightKg * 2.20462).toString(),
          activityLevel: existingGoals.activityLevel,
          goalType,
          proteinPreference: existingGoals.proteinPreference || 'standard',
          carbPreference: existingGoals.carbPreference || 'standard',
          useImperial: isImperial,
          heightUseImperial: isImperial,
          weightUseImperial: isImperial,
          targetWeightKg: existingGoals.targetWeightKg?.toString() ?? '',
          targetWeightLbs: existingGoals.targetWeightKg
            ? Math.round(existingGoals.targetWeightKg * 2.20462).toString()
            : '',
          timelineMonths: existingGoals.timelineWeeks
            ? Math.round(existingGoals.timelineWeeks / (52 / 12)).toString()
            : '',
        });
      } else {
        const isImperial = preferredUnits === 'imperial';
        setFormData({
          ...initialFormData,
          useImperial: isImperial,
          heightUseImperial: isImperial,
          weightUseImperial: isImperial,
        });
      }
      setCurrentStep(1);
    }
  }, [visible, existingGoals, preferredUnits]);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const updateFormData = (updates: Partial<WizardFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  // Whether the weight target step should be shown
  const hasWeightTargetStep = formData.goalType === 'lose' || formData.goalType === 'gain';
  const totalSteps = hasWeightTargetStep ? 9 : 8;

  // Map logical step to content:
  // With weight target: 1-Sex, 2-Age, 3-Body, 4-Activity, 5-Goal, 6-WeightTarget, 7-Macros, 8-Generating, 9-Review
  // Without:            1-Sex, 2-Age, 3-Body, 4-Activity, 5-Goal, 6-Macros, 7-Generating, 8-Review
  const getStepContent = (step: number): string => {
    if (step <= 5) return ['sex', 'age', 'body', 'activity', 'goal'][step - 1];
    if (hasWeightTargetStep) {
      return ['weight_target', 'macros', 'generating', 'review'][step - 6];
    }
    return ['macros', 'generating', 'review'][step - 6];
  };

  const canProceed = (): boolean => {
    const content = getStepContent(currentStep);
    switch (content) {
      case 'sex':
        return !!formData.sex;
      case 'age': {
        const ageNum = parseInt(formData.age, 10);
        return !!formData.age && ageNum >= 13 && ageNum <= 100;
      }
      case 'body': {
        const hasHeight = formData.heightUseImperial
          ? !!formData.heightFeet
          : !!formData.heightCm;
        const hasWeight = formData.weightUseImperial
          ? !!formData.weightLbs
          : !!formData.weightKg;
        return hasHeight && hasWeight;
      }
      case 'activity':
        return !!formData.activityLevel;
      case 'goal':
        return !!formData.goalType;
      case 'weight_target': {
        const hasTarget = formData.weightUseImperial
          ? !!formData.targetWeightLbs
          : !!formData.targetWeightKg;
        if (!hasTarget || !formData.timelineMonths) return false;

        // Compute weights in kg
        const currentKg = formData.weightUseImperial
          ? (parseFloat(formData.weightLbs) || 0) * 0.453592
          : parseFloat(formData.weightKg) || 0;
        const targetKg = formData.weightUseImperial
          ? (parseFloat(formData.targetWeightLbs) || 0) * 0.453592
          : parseFloat(formData.targetWeightKg) || 0;
        const weeks = (parseInt(formData.timelineMonths, 10) || 0) * (52 / 12);

        if (!currentKg || !targetKg || weeks <= 0) return false;

        // Wrong direction — block proceeding
        const isLosing = formData.goalType === 'lose';
        const isGaining = formData.goalType === 'gain';
        if ((isLosing && targetKg >= currentKg) || (isGaining && targetKg <= currentKg)) return false;

        return true;
      }
      case 'macros':
        return true; // Optional step
      case 'generating':
        return false; // Auto-advances via the animation's onComplete
      case 'review':
        return true;
      default:
        return false;
    }
  };

  const goToNextStep = () => {
    if (currentStep < totalSteps && canProceed()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // If the generating animation has already played, jump straight from
      // Macros to Review on subsequent forward passes — no replay.
      if (getStepContent(currentStep) === 'macros' && hasGeneratedRef.current) {
        setCurrentStep((prev) => prev + 2);
        return;
      }
      setCurrentStep((prev) => prev + 1);
    }
  };

  const goToPreviousStep = () => {
    if (currentStep > 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // Skip the generating bridge on the way back so the user lands on the
      // last editable step (Macros) instead of replaying the animation.
      if (getStepContent(currentStep) === 'review') {
        setCurrentStep((prev) => prev - 2);
        return;
      }
      setCurrentStep((prev) => prev - 1);
    }
  };

  const buildInput = (): { heightCm: number; weightKg: number; targetWeightKg?: number; timelineWeeks?: number } => {
    let heightCm: number;
    let weightKg: number;

    if (formData.heightUseImperial) {
      const feet = parseFloat(formData.heightFeet) || 0;
      const inches = parseFloat(formData.heightInches) || 0;
      heightCm = Math.round((feet * 12 + inches) * 2.54 * 10) / 10;
    } else {
      heightCm = parseFloat(formData.heightCm) || 0;
    }

    if (formData.weightUseImperial) {
      weightKg = (parseFloat(formData.weightLbs) || 0) * 0.453592;
    } else {
      weightKg = parseFloat(formData.weightKg) || 0;
    }

    // Weight target (only for lose/gain with values)
    let targetWeightKg: number | undefined;
    let timelineWeeks: number | undefined;

    if (hasWeightTargetStep) {
      if (formData.weightUseImperial) {
        const tw = parseFloat(formData.targetWeightLbs);
        if (tw) targetWeightKg = tw * 0.453592;
      } else {
        const tw = parseFloat(formData.targetWeightKg);
        if (tw) targetWeightKg = tw;
      }
      const months = parseInt(formData.timelineMonths, 10);
      if (months > 0) timelineWeeks = months * (52 / 12);
    }

    return { heightCm, weightKg, targetWeightKg, timelineWeeks };
  };

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const { heightCm, weightKg, targetWeightKg, timelineWeeks } = buildInput();

    const input: UserGoalsInput = {
      sex: formData.sex!,
      age: parseInt(formData.age, 10),
      heightCm,
      weightKg,
      activityLevel: formData.activityLevel!,
      goalType: formData.goalType!,
      proteinPreference: formData.proteinPreference,
      carbPreference: formData.carbPreference,
      targetWeightKg,
      timelineWeeks,
    };

    const calculatedGoals = calculateGoals(input);

    setGoals(calculatedGoals);
    setPreferredUnits(formData.weightUseImperial ? 'imperial' : 'metric');
    onClose();
  };

  const getCalculatedGoals = (): UserGoals | null => {
    const { heightCm, weightKg, targetWeightKg, timelineWeeks } = buildInput();

    if (!formData.sex || !formData.age || !heightCm || !weightKg ||
        !formData.activityLevel || !formData.goalType) {
      return null;
    }

    const input: UserGoalsInput = {
      sex: formData.sex,
      age: parseInt(formData.age, 10),
      heightCm,
      weightKg,
      activityLevel: formData.activityLevel,
      goalType: formData.goalType,
      proteinPreference: formData.proteinPreference,
      carbPreference: formData.carbPreference,
      targetWeightKg,
      timelineWeeks,
    };

    return calculateGoals(input);
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

  const handleScrollBeginDrag = (event: any) => {
    isScrolledToTop.value = event.nativeEvent.contentOffset.y <= 0;
  };

  const handleScroll = (event: any) => {
    isScrolledToTop.value = event.nativeEvent.contentOffset.y <= 0;
  };

  const renderStep = () => {
    const content = getStepContent(currentStep);
    switch (content) {
      case 'sex':
        return (
          <Step1Sex
            value={formData.sex}
            onSelect={(sex) => updateFormData({ sex })}
          />
        );
      case 'age':
        return (
          <Step2Age
            age={formData.age}
            onChangeAge={(age) => updateFormData({ age })}
          />
        );
      case 'body':
        return (
          <Step3Body
            formData={formData}
            updateFormData={updateFormData}
          />
        );
      case 'activity':
        return (
          <Step2Activity
            selectedActivity={formData.activityLevel}
            onSelect={(level) => updateFormData({ activityLevel: level })}
          />
        );
      case 'goal':
        return (
          <Step3Goal
            selectedGoal={formData.goalType}
            onSelect={(goal) => updateFormData({ goalType: goal })}
          />
        );
      case 'weight_target':
        return (
          <StepWeightTarget
            formData={formData}
            updateFormData={updateFormData}
          />
        );
      case 'macros':
        return (
          <Step4Macros
            proteinPreference={formData.proteinPreference}
            carbPreference={formData.carbPreference}
            onProteinChange={(pref) => updateFormData({ proteinPreference: pref })}
            onCarbChange={(pref) => updateFormData({ carbPreference: pref })}
          />
        );
      case 'generating': {
        const { heightCm, weightKg, targetWeightKg, timelineWeeks } = buildInput();
        if (
          !formData.sex ||
          !formData.age ||
          !heightCm ||
          !weightKg ||
          !formData.activityLevel ||
          !formData.goalType
        ) {
          return null;
        }
        return (
          <StepGeneratingPlan
            onComplete={() => {
              hasGeneratedRef.current = true;
              setCurrentStep((prev) => prev + 1);
            }}
            sex={formData.sex}
            age={parseInt(formData.age, 10)}
            heightCm={heightCm}
            weightKg={weightKg}
            activity={formData.activityLevel}
            goal={formData.goalType}
            targetWeightKg={targetWeightKg ?? null}
            timelineWeeks={timelineWeeks ?? null}
            proteinPreference={formData.proteinPreference}
            carbPreference={formData.carbPreference}
            headlineFontFamily="IBMPlexSans_600SemiBold"
            boldNumericFontFamily="IBMPlexSans_700Bold"
            semiBoldFontFamily="IBMPlexSans_600SemiBold"
          />
        );
      }
      case 'review':
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
              styles.modalContainer,
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

            {/* Header — onboarding-style: back chevron + progress dots */}
            <View style={styles.header}>
              <View style={styles.headerSide}>
                {getStepContent(currentStep) !== 'generating' && (
                  <TouchableOpacity
                    onPress={currentStep > 1 ? goToPreviousStep : handleClose}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={currentStep > 1 ? 'Back' : 'Close'}
                    style={styles.chevronBtn}
                  >
                    <Ionicons
                      name={currentStep > 1 ? 'chevron-back' : 'close'}
                      size={24}
                      color={Tokens.textPrimary}
                    />
                  </TouchableOpacity>
                )}
              </View>
              <ProgressDots total={totalSteps} current={currentStep - 1} />
              <View style={styles.headerSide} />
            </View>

            {/* Content */}
            <KeyboardAwareScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              bounces={true}
              onScrollBeginDrag={handleScrollBeginDrag}
              onScroll={handleScroll}
              scrollEventThrottle={16}
            >
              <Animated.View entering={FadeInDown.delay(100).duration(400)}>
                {renderStep()}
              </Animated.View>
            </KeyboardAwareScrollView>

            {/* Navigation button — onboarding-style PrimaryButton */}
            {getStepContent(currentStep) !== 'generating' && (
              <View
                style={[
                  styles.navigationContainer,
                  { paddingBottom: insets.bottom + 16 },
                ]}
              >
                <PrimaryButton
                  label={
                    currentStep < totalSteps
                      ? getStepContent(currentStep) === 'macros'
                        ? 'See my targets'
                        : 'Continue'
                      : 'Save Goals'
                  }
                  onPress={currentStep < totalSteps ? goToNextStep : handleSave}
                  disabled={currentStep < totalSteps && !canProceed()}
                />
              </View>
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
    alignItems: 'center',
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
    backgroundColor: Tokens.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  dragIndicatorContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: Tokens.background,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 12,
    height: 56,
    backgroundColor: Tokens.background,
  },
  headerSide: {
    width: 44,
    alignItems: 'flex-start',
  },
  chevronBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -10,
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
    paddingHorizontal: 24,
    paddingTop: 16,
    backgroundColor: 'transparent',
  },
});
