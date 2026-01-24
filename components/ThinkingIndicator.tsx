import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
  Easing,
} from 'react-native';

export const ThinkingIndicator: React.FC = () => {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const dot1Opacity = useRef(new Animated.Value(0.3)).current;
  const dot2Opacity = useRef(new Animated.Value(0.3)).current;
  const dot3Opacity = useRef(new Animated.Value(0.3)).current;
  const shimmerPosition = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    // Breathing pulse animation
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1200,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
      ])
    );

    // Sequential dot animation (wave effect)
    const createDotAnimation = (dotOpacity: Animated.Value) =>
      Animated.sequence([
        Animated.timing(dotOpacity, {
          toValue: 1,
          duration: 400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(dotOpacity, {
          toValue: 0.3,
          duration: 400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]);

    const dotAnimation = Animated.loop(
      Animated.stagger(200, [
        createDotAnimation(dot1Opacity),
        createDotAnimation(dot2Opacity),
        createDotAnimation(dot3Opacity),
      ])
    );

    // Shimmer sweep animation
    const shimmerAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerPosition, {
          toValue: 2,
          duration: 2000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(1000),
        Animated.timing(shimmerPosition, {
          toValue: -1,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );

    pulseAnimation.start();
    dotAnimation.start();
    shimmerAnimation.start();

    return () => {
      pulseAnimation.stop();
      dotAnimation.stop();
      shimmerAnimation.stop();
    };
  }, [pulseAnim, dot1Opacity, dot2Opacity, dot3Opacity, shimmerPosition]);

  // Interpolated values
  const backgroundColor = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#E3F2FD', '#BBDEFB'],
  });

  const shadowOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.1, 0.25],
  });

  const scale = pulseAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.02, 1],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor,
          transform: [{ scale }],
          shadowOpacity,
        },
      ]}
    >
      {/* Shimmer overlay */}
      <Animated.View
        style={[
          styles.shimmer,
          {
            transform: [
              {
                translateX: shimmerPosition.interpolate({
                  inputRange: [-1, 2],
                  outputRange: [-50, 100],
                }),
              },
            ],
          },
        ]}
      />

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.text}>thinking</Text>

        {/* Animated dots */}
        <View style={styles.dotsContainer}>
          <Animated.View style={[styles.dot, { opacity: dot1Opacity }]} />
          <Animated.View style={[styles.dot, { opacity: dot2Opacity }]} />
          <Animated.View style={[styles.dot, { opacity: dot3Opacity }]} />
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    marginLeft: 12,
    alignSelf: 'center',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 3,
    // Soft shadow for depth
    shadowColor: '#1976D2',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 3,
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    transform: [{ skewX: '-20deg' }],
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  text: {
    fontSize: 12,
    color: '#1565C0',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  dotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 2,
    gap: 2,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#1976D2',
  },
});

export default ThinkingIndicator;
