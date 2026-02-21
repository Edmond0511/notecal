import { useAppStore } from "@/store/app-store";
import { SavedEntry } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import {
  faDroplet,
  faDrumstickBite,
  faFireFlameCurved,
  faWheatAwn,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-native-fontawesome";
import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  Swipeable,
} from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  FadeIn,
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const DISMISS_THRESHOLD = 150;

// Color palette matching NutritionReasoningPopup
const MACRO_COLORS = {
  calories: {
    primary: "#FF6B35",
    secondary: "#FFE5D9",
  },
  protein: {
    primary: "#4A90D9",
    secondary: "#E3F2FD",
  },
  fat: {
    primary: "#F5A623",
    secondary: "#FFF8E7",
  },
  carbs: {
    primary: "#9B6B9E",
    secondary: "#F3E5F5",
  },
};

const MACRO_ICONS = {
  calories: faFireFlameCurved as IconProp,
  protein: faDrumstickBite as IconProp,
  fat: faDroplet as IconProp,
  carbs: faWheatAwn as IconProp,
};

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
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const scrollOffset = useSharedValue(0);
  const isScrolledToTop = useSharedValue(true);
  const savedEntries = useAppStore((state) => state.savedEntries);
  const deleteSavedEntry = useAppStore((state) => state.deleteSavedEntry);

  const [searchQuery, setSearchQuery] = useState("");

  // Reset state when popup opens
  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      isScrolledToTop.value = true;
      setSearchQuery("");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [visible]);

  // Sort by lastUsedAt (most recent first) and filter by search
  const filteredEntries = useMemo(() => {
    const sorted = [...savedEntries].sort((a, b) => {
      const dateA = new Date(a.lastUsedAt).getTime();
      const dateB = new Date(b.lastUsedAt).getTime();
      return dateB - dateA;
    });

    if (!searchQuery.trim()) {
      return sorted;
    }

    const query = searchQuery.toLowerCase().trim();
    return sorted.filter((entry) =>
      entry.rawText.toLowerCase().includes(query)
    );
  }, [savedEntries, searchQuery]);

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

  const getDisplayLabel = (entry: SavedEntry) => {
    return entry.rawText.replace(/^[-—]\s*/, "");
  };

  const handleScrollBeginDrag = (event: any) => {
    scrollOffset.value = event.nativeEvent.contentOffset.y;
    isScrolledToTop.value = event.nativeEvent.contentOffset.y <= 0;
  };

  const handleScroll = (event: any) => {
    scrollOffset.value = event.nativeEvent.contentOffset.y;
    isScrolledToTop.value = event.nativeEvent.contentOffset.y <= 0;
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
    // Calculate totals from items array
    const totals = item.items.reduce(
      (acc, foodItem) => ({
        protein: acc.protein + (foodItem.macros.protein || 0),
        fat: acc.fat + (foodItem.macros.fat || 0),
        carbs: acc.carbs + (foodItem.macros.carbs || 0),
      }),
      { protein: 0, fat: 0, carbs: 0 }
    );

    return (
      <Animated.View entering={FadeInDown.delay(index * 40).duration(300)}>
        <Swipeable
          renderRightActions={() => renderRightActions(item.id)}
          overshootRight={false}
        >
          <TouchableOpacity
            style={styles.entryCard}
            onPress={() => handleSelectEntry(item)}
            activeOpacity={0.7}
          >
            <View style={styles.entryContent}>
              <Text style={styles.entryLabel} numberOfLines={2}>
                {getDisplayLabel(item)}
              </Text>
              <View style={styles.macrosRow}>
                <View style={styles.macroItem}>
                  <FontAwesomeIcon
                    icon={MACRO_ICONS.calories}
                    size={10}
                    color={MACRO_COLORS.calories.primary}
                  />
                  <Text style={styles.macroValue}>
                    {Math.round(item.totalKcal)}
                  </Text>
                </View>
                <View style={styles.macroItem}>
                  <FontAwesomeIcon
                    icon={MACRO_ICONS.protein}
                    size={10}
                    color={MACRO_COLORS.protein.primary}
                  />
                  <Text style={styles.macroValue}>
                    {Math.round(totals.protein)}g
                  </Text>
                </View>
                <View style={styles.macroItem}>
                  <FontAwesomeIcon
                    icon={MACRO_ICONS.fat}
                    size={10}
                    color={MACRO_COLORS.fat.primary}
                  />
                  <Text style={styles.macroValue}>
                    {Math.round(totals.fat)}g
                  </Text>
                </View>
                <View style={styles.macroItem}>
                  <FontAwesomeIcon
                    icon={MACRO_ICONS.carbs}
                    size={10}
                    color={MACRO_COLORS.carbs.primary}
                  />
                  <Text style={styles.macroValue}>
                    {Math.round(totals.carbs)}g
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.chevronContainer}>
              <Ionicons name="chevron-forward" size={18} color="#ccc" />
            </View>
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
    >
      <View style={styles.gestureRoot}>
        <StatusBar barStyle="dark-content" />
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
          <Animated.View
            style={[
              styles.container,
              { marginTop: insets.top },
              animatedStyle,
            ]}
          >
            {/* Drag Indicator */}
            <View style={styles.dragIndicatorContainer}>
              <View style={styles.dragIndicator} />
            </View>

            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={handleClose}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={20} color="#666" />
              </TouchableOpacity>
              <View style={styles.titleContainer}>
                <Text style={styles.title}>Saved Foods</Text>
                <View style={styles.countBadge}>
                  <Text style={styles.countText}>{savedEntries.length}</Text>
                </View>
              </View>
              <View style={styles.headerRightSpacer} />
            </View>

            {/* Search Bar */}
            <View style={styles.searchContainer}>
              <View style={styles.searchInputWrapper}>
                <Ionicons
                  name="search"
                  size={18}
                  color="#999"
                  style={styles.searchIcon}
                />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search saved foods..."
                  placeholderTextColor="#999"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearchQuery("")}
                    style={styles.clearButton}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close-circle" size={18} color="#ccc" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Content */}
            {filteredEntries.length > 0 ? (
              <Animated.ScrollView
                style={styles.content}
                contentContainerStyle={[
                  styles.contentContainer,
                  { paddingBottom: insets.bottom + 20 },
                ]}
                showsVerticalScrollIndicator={false}
                onScrollBeginDrag={handleScrollBeginDrag}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                bounces={true}
                keyboardShouldPersistTaps="handled"
              >
                {filteredEntries.map((item, index) => (
                  <View key={item.id}>{renderItem({ item, index })}</View>
                ))}
              </Animated.ScrollView>
            ) : searchQuery.length > 0 ? (
              <Animated.View
                entering={FadeIn.duration(300)}
                style={styles.emptyContent}
              >
                <View style={styles.emptyIconContainer}>
                  <Ionicons name="search-outline" size={32} color="#999" />
                </View>
                <Text style={styles.emptyTitle}>No results found</Text>
                <Text style={styles.emptyDescription}>
                  Try a different search term
                </Text>
              </Animated.View>
            ) : (
              <Animated.View
                entering={FadeInDown.delay(100).duration(300)}
                style={styles.emptyContent}
              >
                <View style={styles.emptyIconContainer}>
                  <Ionicons name="bookmark-outline" size={32} color="#0a7ea4" />
                </View>
                <Text style={styles.emptyTitle}>No saved foods yet</Text>
                <Text style={styles.emptyDescription}>
                  Tap the Save button on any food entry to add it here for quick
                  access
                </Text>
              </Animated.View>
            )}
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  backdropPressable: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "#f8f8f8",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  dragIndicatorContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: "#f8f8f8",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#ddd",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#f8f8f8",
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EBEBEB",
    alignItems: "center",
    justifyContent: "center",
  },
  headerRightSpacer: {
    width: 36,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    fontSize: 17,
    fontFamily: "System",
    fontWeight: "600",
    color: "#1a1a1a",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  countBadge: {
    marginLeft: 8,
    backgroundColor: "#E0F2F7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    fontSize: 13,
    fontFamily: "System",
    fontWeight: "700",
    color: "#0a7ea4",
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#f8f8f8",
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "400",
    color: "#1a1a1a",
    padding: 0,
  },
  clearButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  entryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  entryContent: {
    flex: 1,
  },
  entryLabel: {
    fontSize: 17,
    fontFamily: "System",
    fontWeight: "500",
    color: "#1a1a1a",
    marginBottom: 8,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  macrosRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  macroItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  macroValue: {
    fontSize: 13,
    fontFamily: "System",
    fontWeight: "500",
    color: "#666",
  },
  chevronContainer: {
    marginLeft: 12,
  },
  deleteAction: {
    backgroundColor: "#F87171",
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    borderRadius: 16,
    marginLeft: 8,
    marginBottom: 12,
  },
  emptyContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  emptyIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#E0F2F7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "System",
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  emptyDescription: {
    fontSize: 15,
    fontFamily: "System",
    fontWeight: "400",
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
  },
});
