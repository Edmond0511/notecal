import { Tokens } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

interface Props {
  headlineFontFamily?: string;
  subtitleFontFamily?: string;
}

const ACCENT_SOFT = '#F1F7F7';

const ENTRANCE_DURATION = 520;
const OVERSHOOT = Easing.bezier(0.34, 1.56, 0.64, 1);

export function StepReadyToGenerate({
  headlineFontFamily,
  subtitleFontFamily,
}: Props) {
  const reducedMotion = useReducedMotion();

  const haloProgress = useSharedValue(reducedMotion ? 1 : 0);
  const textProgress = useSharedValue(reducedMotion ? 1 : 0);

  React.useEffect(() => {
    if (reducedMotion) {
      haloProgress.value = 1;
      textProgress.value = 1;
      return;
    }
    haloProgress.value = withDelay(
      40,
      withTiming(1, { duration: ENTRANCE_DURATION, easing: OVERSHOOT }),
    );
    textProgress.value = withDelay(
      220,
      withTiming(1, { duration: ENTRANCE_DURATION, easing: OVERSHOOT }),
    );
  }, [reducedMotion, haloProgress, textProgress]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: haloProgress.value,
    transform: [
      { translateY: (1 - haloProgress.value) * 8 },
      { scale: 0.96 + haloProgress.value * 0.04 },
    ],
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: textProgress.value,
    transform: [
      { translateY: (1 - textProgress.value) * 8 },
      { scale: 0.96 + textProgress.value * 0.04 },
    ],
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.emblemWrap, haloStyle]}>
        <HaloEmblem />
      </Animated.View>

      <Animated.View style={[styles.textBlock, textStyle]}>
        <Text
          style={[
            styles.headline,
            headlineFontFamily ? { fontFamily: headlineFontFamily } : null,
          ]}
        >
          That&apos;s Everything.
        </Text>
        <Text
          style={[
            styles.subtitle,
            subtitleFontFamily ? { fontFamily: subtitleFontFamily } : null,
          ]}
        >
          We have everything we need. Tap continue and we&apos;ll calculate your personalized goals.
        </Text>
      </Animated.View>
    </View>
  );
}

function HaloEmblem() {
  return (
    <View style={styles.haloOuter}>
      <View style={styles.haloMiddle} />
      <View style={styles.haloCore}>
        <Ionicons name="checkmark" size={40} color="#fff" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  emblemWrap: {
    marginBottom: 36,
  },
  haloOuter: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: ACCENT_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  haloMiddle: {
    position: 'absolute',
    width: 144,
    height: 144,
    borderRadius: 72,
    backgroundColor: Tokens.accentTint,
  },
  haloCore: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Tokens.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Tokens.accent,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.24,
    shadowRadius: 24,
    elevation: 10,
  },
  textBlock: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  headline: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1.3,
    lineHeight: 37,
    color: Tokens.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 14,
    fontSize: 15,
    fontWeight: '400',
    letterSpacing: -0.1,
    lineHeight: 22,
    color: Tokens.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },
});
