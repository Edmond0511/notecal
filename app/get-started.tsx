import { SignInModal } from "@/components/SignInModal";
import { Tokens } from "@/constants/theme";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { IBMPlexSans_700Bold, useFonts } from "@expo-google-fonts/ibm-plex-sans";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  ImageSourcePropType,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

type Slide = { src: ImageSourcePropType; headline: string };

const SLIDES: Slide[] = [
  {
    src: require("@/assets/onboarding/screen-1-notes.png"),
    headline: "Just write what you ate.\nWe'll do the **math**.",
  },
  {
    src: require("@/assets/onboarding/screen-2-nutrition.png"),
    headline: "Every meal,\n**broken down**.",
  },
  {
    src: require("@/assets/onboarding/screen-3-search.png"),
    headline: "Search any\n**branded** meal.",
  },
  {
    src: require("@/assets/onboarding/screen-4-meal.png"),
    headline: "Save your meals.\nLog it in **seconds**.",
  },
  {
    src: require("@/assets/onboarding/screen-5-progress.png"),
    headline: "See your day\nin **one glance**.",
  },
];

const SWIPE_THRESHOLD = 40;
const SWIPE_VELOCITY_THRESHOLD = 400;

const INTERVAL_MS = 3500;
const CROSSFADE_DURATION = 600;
const CROSSFADE_EASING = Easing.bezier(0.2, 0.7, 0.2, 1);
const DOT_DURATION = 300;

function renderHeadline(text: string, fontFamily: string | null) {
  const fontStyle = fontFamily ? { fontFamily } : null;
  return text.split("\n").map((line, lineIdx) => {
    const segments = line.split("**");
    return (
      <Text key={lineIdx} style={[styles.headlineLine, fontStyle]}>
        {segments.map((seg, segIdx) =>
          segIdx % 2 === 1 ? (
            <Text key={segIdx} style={[styles.headlineAccent, fontStyle]}>
              {seg}
            </Text>
          ) : (
            <Text key={segIdx}>{seg}</Text>
          ),
        )}
      </Text>
    );
  });
}

function CarouselImage({ source, isActive }: { source: ImageSourcePropType; isActive: boolean }) {
  const opacity = useSharedValue(isActive ? 1 : 0);
  const translateY = useSharedValue(isActive ? 0 : 8);
  const scale = useSharedValue(isActive ? 1 : 0.985);

  useEffect(() => {
    const config = { duration: CROSSFADE_DURATION, easing: CROSSFADE_EASING };
    opacity.value = withTiming(isActive ? 1 : 0, config);
    translateY.value = withTiming(isActive ? 0 : 8, config);
    scale.value = withTiming(isActive ? 1 : 0.985, config);
  }, [isActive, opacity, translateY, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.imageWrapper, animatedStyle]} pointerEvents="none">
      <Image source={source} style={styles.image} resizeMode="contain" />
    </Animated.View>
  );
}

function Dot({ isActive, onPress }: { isActive: boolean; onPress: () => void }) {
  const width = useSharedValue(isActive ? 22 : 6);

  useEffect(() => {
    width.value = withTiming(isActive ? 22 : 6, { duration: DOT_DURATION });
  }, [isActive, width]);

  const animatedStyle = useAnimatedStyle(() => ({ width: width.value }));

  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button">
      <Animated.View
        style={[
          styles.dot,
          { backgroundColor: isActive ? Tokens.textPrimary : Tokens.textTertiary },
          animatedStyle,
        ]}
      />
    </Pressable>
  );
}

export default function GetStartedScreen() {
  const router = useRouter();
  const { contentMaxWidth, isRegular } = useResponsiveLayout();
  const [fontsLoaded] = useFonts({ IBMPlexSans_700Bold });
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [signInVisible, setSignInVisible] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startInterval = useMemo(
    () => () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        setIdx((i) => (i + 1) % SLIDES.length);
      }, INTERVAL_MS);
    },
    [],
  );

  useEffect(() => {
    if (paused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    startInterval();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [paused, startInterval]);

  const handleDotPress = (i: number) => {
    setIdx(i);
    if (!paused) startInterval();
  };

  const goNext = () => setIdx((i) => (i + 1) % SLIDES.length);
  const goPrev = () => setIdx((i) => (i - 1 + SLIDES.length) % SLIDES.length);

  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-20, 20])
    .onBegin(() => {
      runOnJS(setPaused)(true);
    })
    .onEnd((e) => {
      const passedDistance = Math.abs(e.translationX) > SWIPE_THRESHOLD;
      const passedVelocity = Math.abs(e.velocityX) > SWIPE_VELOCITY_THRESHOLD;
      if (passedDistance || passedVelocity) {
        if (e.translationX < 0) {
          runOnJS(goNext)();
        } else {
          runOnJS(goPrev)();
        }
      }
    })
    .onFinalize(() => {
      runOnJS(setPaused)(false);
    });

  const fontFamily = fontsLoaded ? "IBMPlexSans_700Bold" : null;

  const innerStyle = isRegular
    ? { width: contentMaxWidth, maxWidth: contentMaxWidth, alignSelf: "center" as const }
    : undefined;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar barStyle="dark-content" backgroundColor={Tokens.background} />

      <View style={[styles.inner, innerStyle]}>
      {/* Headline */}
      <View style={styles.headlineContainer}>
        <Animated.View key={idx} entering={FadeInDown.duration(480)}>
          {renderHeadline(SLIDES[idx].headline, fontFamily)}
        </Animated.View>
      </View>

      {/* Screenshot stack — swipe to navigate; pause autoplay while touched */}
      <GestureDetector gesture={swipeGesture}>
        <Animated.View style={styles.imageStack}>
          {SLIDES.map((s, i) => (
            <CarouselImage key={i} source={s.src} isActive={i === idx} />
          ))}
        </Animated.View>
      </GestureDetector>

      {/* Dots */}
      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <Dot key={i} isActive={i === idx} onPress={() => handleDotPress(i)} />
        ))}
      </View>

      {/* CTA + sign-in link */}
      <View style={styles.bottomBlock}>
        <TouchableOpacity
          style={styles.ctaButton}
          onPress={() => router.push("/onboarding")}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Get started"
        >
          <Text style={styles.ctaText}>Get started</Text>
          <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.signInCaption}>
          Already have an account?{" "}
          <Text
            style={styles.signInLink}
            onPress={() => setSignInVisible(true)}
            accessibilityRole="link"
          >
            Sign in
          </Text>
        </Text>
      </View>

      </View>

      <SignInModal visible={signInVisible} onClose={() => setSignInVisible(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Tokens.background,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 28,
    width: "100%",
  },
  headlineContainer: {
    paddingTop: 76,
    paddingBottom: 12,
    minHeight: 130,
  },
  headlineLine: {
    fontSize: 28,
    lineHeight: 33,
    letterSpacing: -1,
    fontWeight: "700",
    color: Tokens.textPrimary,
    textAlign: "center",
  },
  headlineAccent: {
    color: Tokens.accent,
  },
  imageStack: {
    flex: 1,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 0,
    paddingBottom: 8,
  },
  imageWrapper: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 24 },
        shadowOpacity: 0.1,
        shadowRadius: 40,
      },
      android: {
        elevation: 16,
      },
    }),
  },
  image: {
    width: "100%",
    height: "100%",
  },
  dotsRow: {
    flexDirection: "row",
    gap: 6,
    justifyContent: "center",
    marginTop: 16,
    marginBottom: 28,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  bottomBlock: {
    paddingBottom: 44,
  },
  ctaButton: {
    width: "100%",
    height: 56,
    borderRadius: 999,
    backgroundColor: Tokens.textPrimary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
    letterSpacing: -0.2,
  },
  signInCaption: {
    marginTop: 20,
    textAlign: "center",
    fontSize: 13,
    color: Tokens.textSecondary,
  },
  signInLink: {
    color: Tokens.textPrimary,
    fontWeight: "500",
    textDecorationLine: "underline",
  },
});
