import { PaywallTrigger } from "@/components/PaywallTrigger";
import { Tokens } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useAppStore } from "@/store/app-store";
import { UserGoals } from "@/types";
import { calculateBMR, calculateTDEE } from "@/utils/goalsCalculator";
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
  useFonts,
} from "@expo-google-fonts/ibm-plex-sans";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  BackHandler,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, {
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
  useReducedMotion,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { canAdvance, OnboardingData } from "./canAdvance";
import { PrimaryButton } from "./PrimaryButton";
import { StepHeader } from "./StepHeader";
import { StepActivity } from "./steps/StepActivity";
import { StepAge } from "./steps/StepAge";
import { StepBody } from "./steps/StepBody";
import { StepGeneratingPlan } from "./steps/StepGeneratingPlan";
import { StepGoal } from "./steps/StepGoal";
import { StepHealthConnect } from "./steps/StepHealthConnect";
import { StepMacros } from "./steps/StepMacros";
import { StepReadyToGenerate } from "./steps/StepReadyToGenerate";
import { StepSex } from "./steps/StepSex";
import { StepTargets } from "./steps/StepTargets";
import { StepWeightTarget } from "./steps/StepWeightTarget";

const TOTAL_STEPS = 11;
const WEIGHT_TARGET_STEP = 5;
const MACROS_STEP = 6;
const HEALTH_STEP = 7;
const READY_STEP = 8;
const GENERATING_STEP = 9;
const TARGETS_STEP = 10;
const SLIDE_DURATION = 280;

interface StepCopy {
  title: string;
  subtitle: string;
  cta: string;
}

const COPY: StepCopy[] = [
  {
    title: "Choose your\ngender",
    subtitle: "Used to estimate calories",
    cta: "Continue",
  },
  {
    title: "Enter your age",
    subtitle: "Helps tune your daily target",
    cta: "Continue",
  },
  {
    title: "Enter your height\nand weight",
    subtitle: "Use the units you prefer",
    cta: "Continue",
  },
  {
    title: "How active are you?",
    subtitle: "Helps us estimate your daily calorie burn",
    cta: "Continue",
  },
  {
    title: "What's your goal?",
    subtitle: "We'll set a sustainable deficit/surplus",
    cta: "Continue",
  },
  {
    title: "Pick your target \nweight",
    subtitle: "And when you want to reach it",
    cta: "Continue",
  },
  {
    title: "Macro preferences",
    subtitle: "Tune your protein and carb split",
    cta: "See my targets",
  },
  {
    title: "Connect to Apple\nHealth",
    subtitle: "Sync meals and weight with the Health app",
    cta: "Continue",
  },
  {
    title: "",
    subtitle: "",
    cta: "Continue",
  },
  {
    title: "Generating your plan",
    subtitle: "Personalizing your nutrition targets",
    cta: "",
  },
  {
    title: "Your daily targets",
    subtitle: "Personalized to your body and goal",
    cta: "Start tracking",
  },
];

const initialData: OnboardingData = {
  sex: null,
  age: null,
  heightCm: null,
  weightKg: null,
  heightUnit: "metric",
  weightUnit: "metric",
  activity: null,
  goal: null,
  targetWeightKg: null,
  timelineWeeks: null,
  proteinPreference: "standard",
  carbPreference: "standard",
};

export function OnboardingWizard() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const { isPro } = useSubscription();
  const setGoals = useAppStore((s) => s.setGoals);
  const setPreferredUnits = useAppStore((s) => s.setPreferredUnits);
  const preferredUnits = useAppStore((s) => s.preferredUnits);
  const setPendingPaywallAfterAuth = useAppStore(
    (s) => s.setPendingPaywallAfterAuth,
  );
  const reducedMotion = useReducedMotion();
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [fontsLoaded] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
  });

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<"next" | "back">("next");
  const [data, setData] = useState<OnboardingData>(() => ({
    ...initialData,
    heightUnit: preferredUnits === "imperial" ? "imperial" : "metric",
    weightUnit: preferredUnits === "imperial" ? "imperial" : "metric",
  }));
  const computedGoalsRef = useRef<UserGoals | null>(null);
  // True after the generating screen has played once. Used to skip the
  // animation on subsequent forward navigations (e.g. user reaches review,
  // taps back, and continues again — they shouldn't sit through it twice).
  const hasGeneratedRef = useRef(false);

  const update = useCallback(
    <K extends keyof OnboardingData>(key: K, value: OnboardingData[K]) => {
      setData((d) => ({ ...d, [key]: value }));
    },
    [],
  );

  const skipsWeightTarget = data.goal === "maintain";
  const skipsHealth = Platform.OS !== "ios";

  const goNext = useCallback(() => {
    if (step >= TOTAL_STEPS - 1) return;
    setDirection("next");
    // If the generating animation has already played, jump straight to
    // review — no need to replay it when the user is just stepping back and
    // forth between the review page and prior steps.
    const skipGeneratingForward = hasGeneratedRef.current;
    if (step === WEIGHT_TARGET_STEP - 1 && skipsWeightTarget) {
      setStep(MACROS_STEP);
    } else if (step === MACROS_STEP && skipsHealth) {
      setStep(skipGeneratingForward ? TARGETS_STEP : READY_STEP);
    } else if (step === HEALTH_STEP && skipGeneratingForward) {
      setStep(TARGETS_STEP);
    } else {
      setStep((s) => s + 1);
    }
  }, [step, skipsWeightTarget, skipsHealth]);

  const goBack = useCallback(() => {
    if (step <= 0) {
      // At step 0: unauthed users can return to /get-started; authed users have no escape.
      if (!isAuthenticated && router.canGoBack()) {
        router.back();
      }
      return;
    }
    // Generating is auto-advancing — back is a no-op so the animation can complete.
    if (step === GENERATING_STEP) return;
    setDirection("back");
    if (step === MACROS_STEP && skipsWeightTarget) {
      setStep(WEIGHT_TARGET_STEP - 1);
    } else if (step === READY_STEP && skipsHealth) {
      setStep(MACROS_STEP);
    } else if (step === TARGETS_STEP) {
      // Skip the generating + ready bridges on the way back; on Android also skip Health.
      setStep(skipsHealth ? MACROS_STEP : HEALTH_STEP);
    } else {
      setStep((s) => s - 1);
    }
  }, [step, isAuthenticated, router, skipsWeightTarget, skipsHealth]);

  const finalizeAndNavigate = useCallback(() => {
    // User is guaranteed authenticated here — the onboarding screen is gated
    // behind /auth (see app/_layout.tsx isPreAuth + redirect logic).
    router.replace("/");
  }, [router]);

  const handleComplete = useCallback(() => {
    const goals = computedGoalsRef.current;
    if (!goals) return;
    const useImperial =
      data.heightUnit === "imperial" || data.weightUnit === "imperial";
    setPreferredUnits(useImperial ? "imperial" : "metric");
    setGoals(goals);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Hard paywall at the peak investment moment — user has just seen their
    // personalized plan. Existing Pro users skip straight to the home tab.
    if (!isPro) {
      // Auth must happen before the paywall so the RC purchase is bound to a
      // real userId (no anonymous → identified alias chain). After /auth the
      // user lands on home, which reads pendingPaywallAfterAuth and fires the
      // paywall there.
      if (!isAuthenticated) {
        setPendingPaywallAfterAuth(true);
        router.push("/auth");
        return;
      }
      setPaywallVisible(true);
      return;
    }
    finalizeAndNavigate();
  }, [
    data.heightUnit,
    data.weightUnit,
    setGoals,
    setPreferredUnits,
    isPro,
    isAuthenticated,
    router,
    setPendingPaywallAfterAuth,
    finalizeAndNavigate,
  ]);

  const onPrimary = useCallback(() => {
    if (step === TARGETS_STEP) {
      handleComplete();
    } else {
      goNext();
    }
  }, [step, goNext, handleComplete]);

  const visibleTotal =
    TOTAL_STEPS - (skipsWeightTarget ? 1 : 0) - (skipsHealth ? 1 : 0);

  const visibleStep = (() => {
    let s = step;
    if (skipsWeightTarget && step > WEIGHT_TARGET_STEP) s -= 1;
    if (skipsHealth && step > HEALTH_STEP) s -= 1;
    return s;
  })();

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        goBack();
        return true;
      });
      return () => sub.remove();
    }, [goBack]),
  );

  const enteringAnim = reducedMotion
    ? undefined
    : (direction === "next" ? SlideInRight : SlideInLeft).duration(
        SLIDE_DURATION,
      );
  const exitingAnim = reducedMotion
    ? undefined
    : (direction === "next" ? SlideOutLeft : SlideOutRight).duration(
        SLIDE_DURATION,
      );

  const renderStep = () => {
    switch (step) {
      case 0:
        return <StepSex value={data.sex} onChange={(v) => update("sex", v)} />;
      case 1:
        return <StepAge value={data.age} onChange={(v) => update("age", v)} />;
      case 2:
        return (
          <StepBody
            heightCm={data.heightCm}
            weightKg={data.weightKg}
            heightUnit={data.heightUnit}
            weightUnit={data.weightUnit}
            onChangeHeightCm={(v) => update("heightCm", v)}
            onChangeWeightKg={(v) => update("weightKg", v)}
            onChangeHeightUnit={(u) => update("heightUnit", u)}
            onChangeWeightUnit={(u) => update("weightUnit", u)}
          />
        );
      case 3:
        return (
          <StepActivity
            value={data.activity}
            onChange={(v) => update("activity", v)}
          />
        );
      case 4:
        return (
          <StepGoal value={data.goal} onChange={(v) => update("goal", v)} />
        );
      case 5: {
        if (
          data.weightKg == null ||
          data.goal == null ||
          data.goal === "maintain"
        ) {
          return null;
        }
        const tdee =
          data.sex != null &&
          data.age != null &&
          data.heightCm != null &&
          data.activity != null
            ? calculateTDEE(
                calculateBMR(data.sex, data.weightKg, data.heightCm, data.age),
                data.activity,
              )
            : undefined;
        return (
          <StepWeightTarget
            goal={data.goal}
            currentWeightKg={data.weightKg}
            weightUnit={data.weightUnit}
            targetWeightKg={data.targetWeightKg}
            timelineWeeks={data.timelineWeeks}
            onChangeTargetWeightKg={(v) => update("targetWeightKg", v)}
            onChangeTimelineWeeks={(v) => update("timelineWeeks", v)}
            sex={data.sex ?? undefined}
            tdee={tdee}
          />
        );
      }
      case 6:
        return (
          <StepMacros
            proteinPreference={data.proteinPreference}
            carbPreference={data.carbPreference}
            onProteinChange={(v) => update("proteinPreference", v)}
            onCarbChange={(v) => update("carbPreference", v)}
          />
        );
      case 7:
        return <StepHealthConnect />;
      case 8:
        return (
          <StepReadyToGenerate
            headlineFontFamily={
              fontsLoaded ? "IBMPlexSans_700Bold" : undefined
            }
            subtitleFontFamily={
              fontsLoaded ? "IBMPlexSans_400Regular" : undefined
            }
          />
        );
      case 9: {
        if (
          data.sex == null ||
          data.age == null ||
          data.heightCm == null ||
          data.weightKg == null ||
          data.activity == null ||
          data.goal == null
        ) {
          return null;
        }
        return (
          <StepGeneratingPlan
            onComplete={() => {
              hasGeneratedRef.current = true;
              goNext();
            }}
            sex={data.sex}
            age={data.age}
            heightCm={data.heightCm}
            weightKg={data.weightKg}
            activity={data.activity}
            goal={data.goal}
            targetWeightKg={data.targetWeightKg}
            timelineWeeks={data.timelineWeeks}
            proteinPreference={data.proteinPreference}
            carbPreference={data.carbPreference}
            headlineFontFamily={
              fontsLoaded ? "IBMPlexSans_600SemiBold" : undefined
            }
            boldNumericFontFamily={
              fontsLoaded ? "IBMPlexSans_700Bold" : undefined
            }
            semiBoldFontFamily={
              fontsLoaded ? "IBMPlexSans_600SemiBold" : undefined
            }
          />
        );
      }
      case 10:
        if (
          data.sex == null ||
          data.age == null ||
          data.heightCm == null ||
          data.weightKg == null ||
          data.activity == null ||
          data.goal == null
        ) {
          return null;
        }
        return (
          <StepTargets
            sex={data.sex}
            age={data.age}
            heightCm={data.heightCm}
            weightKg={data.weightKg}
            activity={data.activity}
            goal={data.goal}
            heightUnit={data.heightUnit}
            weightUnit={data.weightUnit}
            targetWeightKg={data.targetWeightKg}
            timelineWeeks={data.timelineWeeks}
            proteinPreference={data.proteinPreference}
            carbPreference={data.carbPreference}
            onComputed={(g) => {
              computedGoalsRef.current = g;
            }}
          />
        );
      default:
        return null;
    }
  };

  const heroFont = fontsLoaded
    ? { fontFamily: "IBMPlexSans_700Bold" as const }
    : null;
  const subtitleFont = fontsLoaded
    ? { fontFamily: "IBMPlexSans_400Regular" as const }
    : null;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar barStyle="dark-content" backgroundColor={Tokens.background} />
      <View style={styles.headerWrap}>
        <StepHeader
          step={visibleStep}
          total={visibleTotal}
          onBack={goBack}
          showBack={step !== GENERATING_STEP && (step > 0 || !isAuthenticated)}
        />
      </View>
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <Animated.View
          key={step}
          entering={enteringAnim}
          exiting={exitingAnim}
          style={styles.slideTrack}
        >
          {step !== GENERATING_STEP && step !== READY_STEP && (
            <View style={styles.heroBlock}>
              <Text style={[styles.heroTitle, heroFont]}>
                {COPY[step].title}
              </Text>
              <Text style={[styles.heroSubtitle, subtitleFont]}>
                {COPY[step].subtitle}
              </Text>
            </View>
          )}
          <View style={styles.body}>{renderStep()}</View>
        </Animated.View>
      </KeyboardAwareScrollView>
      <View
        style={[styles.footer, step === GENERATING_STEP && styles.footerHidden]}
        pointerEvents={step === GENERATING_STEP ? "none" : "auto"}
      >
        <PrimaryButton
          label={COPY[step].cta}
          onPress={onPrimary}
          disabled={!canAdvance(step, data)}
        />
      </View>
      <PaywallTrigger
        visible={paywallVisible}
        onClose={() => {
          // Dismissing without purchasing still completes the flow — the
          // user keeps the goals they just configured. They'll hit the inline
          // paywall once they exhaust their free AI taste in NotesEditor.
          setPaywallVisible(false);
          finalizeAndNavigate();
        }}
        onSuccess={() => {
          setPaywallVisible(false);
          finalizeAndNavigate();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Tokens.background,
  },
  headerWrap: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  slideTrack: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
  },
  heroBlock: {
    marginBottom: 24,
    gap: 8,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.8,
    lineHeight: 32,
    color: Tokens.textPrimary,
  },
  heroSubtitle: {
    fontSize: 15,
    color: Tokens.textSecondary,
    lineHeight: 20,
  },
  body: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },
  footerHidden: {
    opacity: 0,
  },
});
