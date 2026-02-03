import { useAppStore } from '@/store/app-store';
import { SavedEntry } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Keyboard,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  Swipeable,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_THRESHOLD = 100;

// Shimmer dimensions for thinking indicator
const SHIMMER_WIDTH = 60;
const TEXT_WIDTH = 140; // Width of "Calculating nutrition" text

// Animated thinking indicator with shimmer effect
function ThinkingIndicator() {
  const shimmerTranslate = useSharedValue(-SHIMMER_WIDTH);
  const shimmerOpacity = useSharedValue(0);

  React.useEffect(() => {
    // Animate shimmer sweep with fade in/out
    shimmerTranslate.value = withRepeat(
      withSequence(
        withTiming(TEXT_WIDTH + SHIMMER_WIDTH, {
          duration: 1800,
          easing: Easing.inOut(Easing.ease),
        }),
        withTiming(-SHIMMER_WIDTH, { duration: 0 })
      ),
      -1,
      false
    );

    shimmerOpacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 400, easing: Easing.ease }),
        withTiming(0.7, { duration: 1000 }), // Hold
        withTiming(0, { duration: 400, easing: Easing.ease }),
        withTiming(0, { duration: 0 }) // Reset
      ),
      -1,
      false
    );
  }, []);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerTranslate.value }],
    opacity: shimmerOpacity.value,
  }));

  return (
    <View style={styles.thinkingContainer}>
      <View style={styles.shimmerTextContainer}>
        {/* Base text layer */}
        <Text style={styles.thinkingText}>Calculating nutrition</Text>

        {/* Shimmer overlay */}
        <Animated.View style={[styles.shimmerOverlay, shimmerStyle]}>
          <LinearGradient
            colors={[
              'rgba(255, 255, 255, 0)',
              'rgba(255, 255, 255, 0.9)',
              'rgba(255, 255, 255, 0)',
            ]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.shimmerGradient}
          />
        </Animated.View>
      </View>
    </View>
  );
}

interface SavedEntriesPopupProps {
  visible: boolean;
  onClose: () => void;
  onSelectEntry: (savedEntry: SavedEntry) => void;
}

export function SavedEntriesPopup({
  visible,
  onClose,
  onSelectEntry,
}: SavedEntriesPopupProps) {
  const translateY = useSharedValue(0);
  const savedEntries = useAppStore((state) => state.savedEntries);
  const deleteSavedEntry = useAppStore((state) => state.deleteSavedEntry);
  const createSavedEntry = useAppStore((state) => state.createSavedEntry);

  // State for direct entry input
  const [inputText, setInputText] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debug log when visible
  useEffect(() => {
    if (visible) {
      console.log('📋 SavedEntriesPopup opened, savedEntries:', savedEntries.length);
      console.log('📋 savedEntries data:', JSON.stringify(savedEntries, null, 2));
    }
  }, [visible, savedEntries]);

  // Sort by lastUsedAt (most recent first)
  const sortedEntries = React.useMemo(() => {
    return [...savedEntries].sort((a, b) => {
      const dateA = new Date(a.lastUsedAt).getTime();
      const dateB = new Date(b.lastUsedAt).getTime();
      return dateB - dateA;
    });
  }, [savedEntries]);

  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      // Reset input state when popup opens
      setInputText('');
      setError(null);
      setIsResolving(false);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [visible]);

  const handleAddEntry = async () => {
    const trimmedText = inputText.trim();
    if (!trimmedText || isResolving) return;

    Keyboard.dismiss();
    setIsResolving(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await createSavedEntry(trimmedText);

    setIsResolving(false);
    if (result.success) {
      setInputText('');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      setError(result.error || 'Failed to save');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  const handleSelectEntry = (entry: SavedEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSelectEntry(entry);
  };

  const handleDeleteEntry = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    deleteSavedEntry(id);
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

  const getDisplayLabel = (entry: SavedEntry) => {
    return entry.rawText.replace(/^-\s*/, '');
  };

  const renderRightActions = (id: string) => {
    return (
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={() => handleDeleteEntry(id)}
      >
        <Ionicons name="trash-outline" size={20} color="#fff" />
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item, index }: { item: SavedEntry; index: number }) => {
    return (
      <Animated.View entering={FadeInDown.delay(index * 50).duration(200)}>
        <Swipeable
          renderRightActions={() => renderRightActions(item.id)}
          overshootRight={false}
        >
          <TouchableOpacity
            style={styles.entryItem}
            onPress={() => handleSelectEntry(item)}
            activeOpacity={0.7}
          >
            <View style={styles.entryContent}>
              <Text style={styles.entryLabel} numberOfLines={1}>
                {getDisplayLabel(item)}
              </Text>
              <View style={styles.entryMeta}>
                <View style={styles.caloriesBadge}>
                  <Text style={styles.caloriesText}>{Math.round(item.totalKcal)} cal</Text>
                </View>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#ccc" />
          </TouchableOpacity>
        </Swipeable>
      </Animated.View>
    );
  };

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
          <Animated.View style={[styles.popupContainer, animatedStyle]}>
            {/* Drag Indicator */}
            <View style={styles.dragIndicatorContainer}>
              <View style={styles.dragIndicator} />
            </View>

            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Saved Foods ({savedEntries.length})</Text>
            </View>

            {sortedEntries.length > 0 ? (
              <FlatList
                data={sortedEntries}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                style={styles.list}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
              />
            ) : (
              <Animated.View
                entering={FadeInDown.delay(100).duration(300)}
                style={styles.emptyContent}
              >
                <View style={styles.emptyIconContainer}>
                  <Ionicons name="bookmark-outline" size={32} color="#1A6872" />
                </View>
                <Text style={styles.emptyTitle}>No saved foods yet</Text>
                <Text style={styles.emptyDescription}>
                  Save your frequently eaten foods for quick access without re-calculating nutrition
                </Text>
              </Animated.View>
            )}

            {/* Add Entry Input */}
            <View style={styles.inputContainer}>
              {isResolving ? (
                <View style={styles.loadingWrapper}>
                  <ThinkingIndicator />
                </View>
              ) : (
                <TextInput
                  style={styles.input}
                  placeholder="Type food to save..."
                  placeholderTextColor="#999"
                  value={inputText}
                  onChangeText={(text) => {
                    setInputText(text);
                    if (error) setError(null);
                  }}
                  onSubmitEditing={handleAddEntry}
                  returnKeyType="done"
                  editable={!isResolving}
                />
              )}
              {error && (
                <Text style={styles.errorText}>{error}</Text>
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
  popupContainer: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
    minHeight: 450,
    maxHeight: SCREEN_HEIGHT * 0.9,
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
    backgroundColor: '#ddd',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  input: {
    height: 44,
    backgroundColor: '#f5f5f5',
    borderRadius: 25,
    paddingHorizontal: 18,
    fontSize: 15,
    color: '#333',
  },
  loadingWrapper: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 25,
  },
  thinkingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shimmerTextContainer: {
    position: 'relative',
    overflow: 'hidden',
    height: 20,
  },
  thinkingText: {
    fontSize: 14,
    color: '#1A6872',
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  shimmerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SHIMMER_WIDTH,
    height: 20,
  },
  shimmerGradient: {
    flex: 1,
    width: SHIMMER_WIDTH,
    height: 20,
  },
  errorText: {
    fontSize: 13,
    color: '#e74c3c',
    marginTop: 6,
    marginLeft: 2,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 8,
  },
  entryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  entryContent: {
    flex: 1,
    marginRight: 8,
  },
  entryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  entryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  caloriesBadge: {
    backgroundColor: '#E0F2F1',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  caloriesText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1A6872',
  },
  deleteAction: {
    backgroundColor: '#FF4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    height: '100%',
  },
  // Empty state
  emptyContent: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
  },
  emptyIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E0F2F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 16,
  },
});
