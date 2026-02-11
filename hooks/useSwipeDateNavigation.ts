import { Keyboard } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  cancelAnimation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

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

  const triggerHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  const gesture = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onBegin(() => {
      // Cancel any running spring from a previous swipe so the view is
      // stationary when gesture recognition begins. Without this, the
      // animating translateX causes phantom horizontal displacement,
      // extending the failOffsetY dead zone and locking scrolling.
      cancelAnimation(translateX);
      translateX.value = 0;
    })
    .onStart(() => {
      runOnJS(dismissKeyboard)();
    })
    .onUpdate((event) => {
      // Limit the translation for visual feedback (max 30px)
      translateX.value = Math.max(-30, Math.min(30, event.translationX * 0.3));
    })
    .onEnd((event) => {
      const { translationX, velocityX } = event;

      // Check if swipe meets threshold (distance OR velocity)
      const swipedLeft = translationX < -threshold || velocityX < -velocityThreshold;
      const swipedRight = translationX > threshold || velocityX > velocityThreshold;

      if (swipedLeft) {
        runOnJS(triggerHaptic)();
        runOnJS(onSwipeLeft)();
      } else if (swipedRight) {
        runOnJS(triggerHaptic)();
        runOnJS(onSwipeRight)();
      }

      // Reset position
      translateX.value = withSpring(0, {
        damping: 20,
        stiffness: 300,
      });
    })
    .onFinalize(() => {
      // Ensure we reset even if gesture is cancelled
      translateX.value = withSpring(0, {
        damping: 20,
        stiffness: 300,
      });
    });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: translateX.value }],
    };
  });

  return {
    gesture,
    animatedStyle,
  };
}
