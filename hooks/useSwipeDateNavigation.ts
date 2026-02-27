import { Dimensions, InteractionManager, Keyboard } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  cancelAnimation,
  withSpring,
  Easing,
} from 'react-native-reanimated';

const SCREEN_WIDTH = Dimensions.get('window').width;
const EXIT_DURATION = 120;
const ENTER_DURATION = 180;

interface UseSwipeDateNavigationOptions {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  threshold?: number;
  velocityThreshold?: number;
}

export function useSwipeDateNavigation({
  onSwipeLeft,
  onSwipeRight,
  threshold = 60,
  velocityThreshold = 500,
}: UseSwipeDateNavigationOptions) {
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);
  // Guard against concurrent swipe animations
  const isAnimating = useSharedValue(false);

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  /**
   * After the exit animation completes on the UI thread, we jump to JS
   * to fire the navigation callback, then animate the new content in
   * from the opposite edge.
   *
   * Key insight: Reanimated animations run on the native UI thread, so
   * they continue smoothly even while the JS thread is blocked by MMKV
   * serialization. We send animation commands first, then defer the
   * state update. The opacity fade from 0→1 over 200ms masks the
   * ~100ms React re-render.
   */
  const performNavigationAndEnter = (
    callback: () => void,
    enterFromX: number,
  ) => {
    // 1. Start enter animation immediately (runs on native UI thread)
    translateX.value = enterFromX;
    opacity.value = 0;
    translateX.value = withTiming(0, {
      duration: ENTER_DURATION,
      easing: Easing.out(Easing.cubic),
    });
    opacity.value = withTiming(1, { duration: ENTER_DURATION }, () => {
      isAnimating.value = false;
    });

    // 2. Defer state update: use rAF to ensure the animation values are
    //    committed to the native UI thread before the JS thread gets busy
    //    with React re-rendering from the state change.
    requestAnimationFrame(() => {
      InteractionManager.runAfterInteractions(callback);
    });
  };

  const gesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-10, 10])
    .onBegin(() => {
      if (isAnimating.value) return;
      cancelAnimation(translateX);
      translateX.value = 0;
      opacity.value = 1;
    })
    .onStart(() => {
      if (isAnimating.value) return;
      runOnJS(dismissKeyboard)();
    })
    .onUpdate((event) => {
      if (isAnimating.value) return;
      // Rubber-band drag: ~40% of finger movement, capped at 50px
      translateX.value = Math.max(-50, Math.min(50, event.translationX * 0.4));
    })
    .onEnd((event) => {
      if (isAnimating.value) return;

      const { translationX, velocityX } = event;

      const swipedLeft = translationX < -threshold || velocityX < -velocityThreshold;
      const swipedRight = translationX > threshold || velocityX > velocityThreshold;

      if (swipedLeft) {
        isAnimating.value = true;
        // Exit: slide current content to the left + fade out
        const exitTarget = -SCREEN_WIDTH * 0.15;
        translateX.value = withTiming(exitTarget, {
          duration: EXIT_DURATION,
          easing: Easing.in(Easing.cubic),
        });
        opacity.value = withTiming(0.3, { duration: EXIT_DURATION }, () => {
          // On completion, jump to JS for navigation + enter animation
          runOnJS(performNavigationAndEnter)(onSwipeLeft, SCREEN_WIDTH * 0.15);
        });
      } else if (swipedRight) {
        isAnimating.value = true;
        const exitTarget = SCREEN_WIDTH * 0.15;
        translateX.value = withTiming(exitTarget, {
          duration: EXIT_DURATION,
          easing: Easing.in(Easing.cubic),
        });
        opacity.value = withTiming(0.3, { duration: EXIT_DURATION }, () => {
          runOnJS(performNavigationAndEnter)(onSwipeRight, -SCREEN_WIDTH * 0.15);
        });
      } else {
        // No date change — bounce back visually
        translateX.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    })
    .onFinalize(() => {
      if (isAnimating.value) return;
      translateX.value = withTiming(0, { duration: 150 });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  return {
    gesture,
    animatedStyle,
  };
}
