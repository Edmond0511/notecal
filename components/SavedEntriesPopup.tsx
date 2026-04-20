import { useAppStore } from "@/store/app-store";
import { Tokens } from "@/constants/theme";
import { SavedEntry } from "@/types";
import {
  isLiquidGlassSupported,
  LiquidGlassView,
} from "@callstack/liquid-glass";
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
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  Keyboard,
  Modal,
  ScrollView,
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
  GestureHandlerRootView,
  Swipeable,
} from "react-native-gesture-handler";
import Animated, {
  Extrapolation,
  FadeIn,
  FadeInDown,
  FadeOutUp,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import {
  KeyboardAwareScrollView,
  KeyboardProvider,
} from "react-native-keyboard-controller";
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

const TEAL = "#1A6872";

interface SavedEntriesPopupProps {
  visible: boolean;
  onClose: () => void;
  onSelectEntry: (savedEntry: SavedEntry) => void;
  onSelectEntries?: (savedEntries: SavedEntry[]) => void;
}

export function SavedEntriesPopup({
  visible,
  onClose,
  onSelectEntry,
  onSelectEntries,
}: SavedEntriesPopupProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const scrollOffset = useSharedValue(0);
  const isScrolledToTop = useSharedValue(true);
  const savedEntries = useAppStore((state) => state.savedEntries);
  const deleteSavedEntry = useAppStore((state) => state.deleteSavedEntry);
  const showGlass = isLiquidGlassSupported;

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Reset state when popup opens
  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      isScrolledToTop.value = true;
      setSearchQuery("");
      setSelectedIds(new Set());
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

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Keyboard.dismiss();
    onClose();
  }, [onClose]);

  const handleToggleSelect = useCallback((entry: SavedEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(entry.id)) {
        next.delete(entry.id);
      } else {
        next.add(entry.id);
      }
      return next;
    });
  }, []);

  const handleSubmitSelection = useCallback(() => {
    if (selectedIds.size === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const selected = savedEntries.filter((e) => selectedIds.has(e.id));
    if (onSelectEntries) {
      onSelectEntries(selected);
    } else {
      selected.forEach((e) => onSelectEntry(e));
    }
  }, [selectedIds, savedEntries, onSelectEntry, onSelectEntries]);

  const handleRemoveSelected = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleDeleteEntry = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    deleteSavedEntry(id);
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [deleteSavedEntry]);

  const selectionTotalCal = useMemo(() => {
    return savedEntries
      .filter((e) => selectedIds.has(e.id))
      .reduce((sum, e) => sum + e.totalKcal, 0);
  }, [savedEntries, selectedIds]);

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
    Keyboard.dismiss();
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

    const selected = selectedIds.has(item.id);

    const cardContent = (
      <View style={styles.entryCardInner}>
        <View style={styles.entryContent}>
          <Text style={styles.entryLabel} numberOfLines={1}>
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
        <TouchableOpacity
          style={[
            styles.quickAddButton,
            selected && styles.quickAddButtonSelected,
          ]}
          onPress={() => handleToggleSelect(item)}
          activeOpacity={0.6}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons
            name={selected ? "checkmark" : "add"}
            size={22}
            color={selected ? TEAL : "#bbb"}
          />
        </TouchableOpacity>
      </View>
    );

    return (
      <Animated.View entering={FadeInDown.delay(index * 40).duration(300)}>
        <Swipeable
          renderRightActions={() => renderRightActions(item.id)}
          overshootRight={false}
        >
          <View style={styles.entryCard}>
            {cardContent}
          </View>
        </Swipeable>
      </Animated.View>
    );
  };

  const searchContent = (
    <View style={styles.searchInputWrapper}>
      <Ionicons
        name="search"
        size={18}
        color="#000"
        style={styles.searchIcon}
      />
      <TextInput
        style={styles.searchInput}
        placeholder="Search"
        placeholderTextColor="#636366"
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
          <Ionicons name="close-circle" size={18} color="#C7C7CC" />
        </TouchableOpacity>
      )}
    </View>
  );

  const renderSheetContent = () => (
    <>
      {/* Drag Indicator */}
      <View style={styles.dragIndicatorContainer}>
        <View style={styles.dragIndicator} />
      </View>

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleClose}
          activeOpacity={0.7}
        >
          {showGlass ? (
            <LiquidGlassView
              style={styles.backButton}
              interactive
              effect="regular"
              tintColor="rgba(250, 250, 247, 0.3)"
            >
              <Ionicons name="close" size={20} color={Tokens.textPrimary} />
            </LiquidGlassView>
          ) : (
            <View style={[styles.backButton, styles.backButtonFallback]}>
              <Ionicons name="close" size={20} color="#666" />
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Saved Foods</Text>
        </View>
        {selectedIds.size > 0 ? (
          <TouchableOpacity
            onPress={handleSubmitSelection}
            activeOpacity={0.8}
          >
            {showGlass ? (
              <LiquidGlassView
                style={[
                  styles.backButton,
                  { backgroundColor: Tokens.accent },
                ]}
                interactive
                effect="regular"
                tintColor={Tokens.tintColor}
              >
                <Ionicons
                  name="checkmark-sharp"
                  size={20}
                  color={Tokens.accent}
                />
              </LiquidGlassView>
            ) : (
              <View
                style={[
                  styles.backButton,
                  { backgroundColor: Tokens.accent },
                ]}
              >
                <Ionicons
                  name="checkmark-sharp"
                  size={20}
                  color={Tokens.accent}
                />
              </View>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.headerRightSpacer} />
        )}
      </View>

      {/* Search Bar — Liquid Glass Pill */}
      <View style={styles.searchContainer}>
        <View style={styles.searchShadowWrapper}>
          {showGlass ? (
            <LiquidGlassView
              style={styles.searchGlass}
              interactive
              effect="regular"
              tintColor="rgba(250, 250, 247, 0.3)"
            >
              {searchContent}
            </LiquidGlassView>
          ) : (
            <View style={[styles.searchGlass, styles.searchGlassFallback]}>
              {searchContent}
            </View>
          )}
        </View>
      </View>

      {/* Selection strip */}
      {selectedIds.size > 0 && (
        <Animated.View
          entering={FadeInDown.duration(200)}
          exiting={FadeOutUp.duration(150)}
          style={styles.selectionStrip}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selectionChipsContainer}
          >
            {savedEntries
              .filter((e) => selectedIds.has(e.id))
              .map((entry) => (
                <TouchableOpacity
                  key={entry.id}
                  style={styles.selectionChip}
                  activeOpacity={0.7}
                >
                  <Text style={styles.selectionChipName} numberOfLines={1}>
                    {getDisplayLabel(entry)}
                  </Text>
                  <TouchableOpacity
                    style={styles.selectionChipRemove}
                    onPress={() => handleRemoveSelected(entry.id)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name="close" size={14} color="#999" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
          </ScrollView>
          <Text style={styles.selectionStripSummary}>
            {selectedIds.size}{" "}
            {selectedIds.size === 1 ? "item" : "items"} ·{" "}
            {Math.round(selectionTotalCal)} cal
          </Text>
        </Animated.View>
      )}

      {/* Content */}
      {filteredEntries.length > 0 ? (
        <KeyboardAwareScrollView
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
          keyboardDismissMode="interactive"
        >
          {filteredEntries.map((item, index) => (
            <View key={item.id}>{renderItem({ item, index })}</View>
          ))}
        </KeyboardAwareScrollView>
      ) : searchQuery.length > 0 ? (
        <KeyboardAwareScrollView
          style={styles.content}
          contentContainerStyle={[
            styles.emptyContentScrollContainer,
            { paddingBottom: insets.bottom + 20 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          bounces={false}
        >
          <Animated.View
            entering={FadeIn.duration(300)}
            style={styles.emptyContent}
          >
            <Text style={styles.emptyTitle}>No results found</Text>
            <Text style={styles.emptyDescription}>
              Try a different search term
            </Text>
          </Animated.View>
        </KeyboardAwareScrollView>
      ) : (
        <KeyboardAwareScrollView
          style={styles.content}
          contentContainerStyle={[
            styles.emptyContentScrollContainer,
            { paddingBottom: insets.bottom + 20 },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          bounces={false}
        >
          <Animated.View
            entering={FadeInDown.delay(100).duration(300)}
            style={styles.emptyContent}
          >
            <Text style={styles.emptyTitle}>No saved foods yet</Text>
            <Text style={styles.emptyDescription}>
              Tap the Save button on any food entry to add it here for quick
              access
            </Text>
          </Animated.View>
        </KeyboardAwareScrollView>
      )}
    </>
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardProvider>
      <GestureHandlerRootView style={styles.gestureRoot}>
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
            {renderSheetContent()}
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
      </KeyboardProvider>
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
    backgroundColor: "#FCFCFB",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  dragIndicatorContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonFallback: {
    backgroundColor: "#EBEBEB",
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
    color: Tokens.textPrimary,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  countBadge: {
    marginLeft: 8,
    backgroundColor: Tokens.accentTint,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    fontSize: 13,
    fontFamily: "System",
    fontWeight: "700",
    color: Tokens.accent,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchShadowWrapper: {
    borderRadius: 22,
    ...Tokens.shadowLight,
  },
  searchGlass: {
    borderRadius: 22,
    overflow: "hidden",
  },
  searchGlassFallback: {
    backgroundColor: "#EBEBEB",
  },
  searchInputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: "System",
    fontWeight: "600",
    color: Tokens.textPrimary,
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
    borderRadius: 16,
    marginBottom: 6,
    backgroundColor: Tokens.surfaceRaised,
    borderWidth: 0.5,
    borderColor: '#E5E5E5',
  },
  entryCardInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 10,
  },
  quickAddButton: {
    padding: 2,
  },
  quickAddButtonSelected: {
    opacity: 0.7,
  },
  entryContent: {
    flex: 1,
  },
  entryLabel: {
    fontSize: 17,
    fontFamily: "System",
    fontWeight: "500",
    color: Tokens.textPrimary,
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
    color: Tokens.textSecondary,
  },
  selectionStrip: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  selectionStripSummary: {
    fontSize: 11,
    fontWeight: "500",
    color: "#999",
    marginTop: 4,
    marginLeft: 2,
  },
  selectionChipsContainer: {
    gap: 8,
    paddingRight: 4,
  },
  selectionChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: "#ddd",
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 4,
  },
  selectionChipName: {
    maxWidth: 140,
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
  },
  selectionChipRemove: {
    padding: 2,
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
  emptyContentScrollContainer: {
    flexGrow: 1,
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
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "System",
    fontWeight: "600",
    color: Tokens.textPrimary,
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  emptyDescription: {
    fontSize: 15,
    fontFamily: "System",
    fontWeight: "400",
    color: Tokens.textSecondary,
    textAlign: "center",
    lineHeight: 22,
  },
});
