import { useAppStore } from '@/store/app-store';
import { SavedEntry } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect } from 'react';
import {
  Dimensions,
  FlatList,
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
  Swipeable,
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

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_THRESHOLD = 100;

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
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [visible]);

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
    if (entry.items.length > 0) {
      return entry.items.map((item) => item.label).join(', ');
    }
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
    minHeight: 250,
    maxHeight: SCREEN_HEIGHT * 0.6,
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
