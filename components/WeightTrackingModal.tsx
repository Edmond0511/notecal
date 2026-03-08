import { Tokens } from "@/constants/theme";
import { photoSyncService } from "@/services/photoSyncService";
import { useAppStore } from "@/store/app-store";
import { WeightEntry } from "@/types";
import { kgToLbs, lbsToKg } from "@/utils/goalsCalculator";
import {
  isLiquidGlassSupported,
  LiquidGlassView,
} from "@callstack/liquid-glass";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Dimensions,
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
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Calendar } from "./Calendar";
import { SyncedImage } from "./SyncedImage";
import { WeightChart } from "./weight/WeightChart";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const DISMISS_THRESHOLD = 150;

// Helper to get all photos from a weight entry (handles legacy single photoUri)
function getEntryPhotos(entry: WeightEntry): string[] {
  if (entry.photoUris && entry.photoUris.length > 0) return entry.photoUris;
  if (entry.photoUri) return [entry.photoUri];
  return [];
}

type TimeRange = "30d" | "90d" | "all";

interface WeightTrackingModalProps {
  visible: boolean;
  onClose: () => void;
  openToLog?: boolean;
}

export function WeightTrackingModal({
  visible,
  onClose,
  openToLog,
}: WeightTrackingModalProps) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const isScrolledToTop = useSharedValue(true);
  const swipeableRefs = useRef<Map<string, Swipeable>>(new Map());

  const weightEntries = useAppStore((s) => s.weightEntries);
  const addWeightEntry = useAppStore((s) => s.addWeightEntry);
  const updateWeightEntry = useAppStore((s) => s.updateWeightEntry);
  const deleteWeightEntry = useAppStore((s) => s.deleteWeightEntry);
  const preferredUnits = useAppStore((s) => s.preferredUnits);
  const isImperial = preferredUnits === "imperial";
  const unitLabel = isImperial ? "lbs" : "kg";
  const showGlass = isLiquidGlassSupported;

  const [range, setRange] = useState<TimeRange>("30d");
  const [weightInput, setWeightInput] = useState("");
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [showLogPopup, setShowLogPopup] = useState(false);
  const [showLogCalendar, setShowLogCalendar] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WeightEntry | null>(null);
  const [editWeightInput, setEditWeightInput] = useState("");
  const [editPhotoUris, setEditPhotoUris] = useState<string[]>([]);
  const [editDateInput, setEditDateInput] = useState("");
  const [showEditCalendar, setShowEditCalendar] = useState(false);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);

  const toLocalYMD = (d: Date) =>
    d.getFullYear().toString() +
    (d.getMonth() + 1).toString().padStart(2, "0") +
    d.getDate().toString().padStart(2, "0");

  const todayStr = toLocalYMD(new Date());
  const [logDateInput, setLogDateInput] = useState(todayStr);
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = toLocalYMD(yesterdayDate);

  // Reset form state when modal opens
  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      isScrolledToTop.value = true;
      setWeightInput("");
      setPhotoUris([]);
      setLogDateInput(toLocalYMD(new Date()));
      if (openToLog) {
        setShowLogPopup(true);
      }
    }
  }, [visible]);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
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
        translateY.value = withSpring(0, { damping: 20, stiffness: 400 });
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
      Extrapolation.CLAMP,
    ),
  }));

  const handleScrollBeginDrag = (event: any) => {
    isScrolledToTop.value = event.nativeEvent.contentOffset.y <= 0;
  };

  const handleScroll = (event: any) => {
    isScrolledToTop.value = event.nativeEvent.contentOffset.y <= 0;
  };

  // Log popup gesture
  const logPopupTranslateY = useSharedValue(0);

  useEffect(() => {
    if (showLogPopup) logPopupTranslateY.value = 0;
  }, [showLogPopup]);

  const logPopupPanGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) {
        logPopupTranslateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_THRESHOLD) {
        logPopupTranslateY.value = withSpring(SCREEN_HEIGHT, {
          damping: 20,
          stiffness: 200,
        });
        runOnJS(setShowLogPopup)(false);
      } else {
        logPopupTranslateY.value = withSpring(0, {
          damping: 20,
          stiffness: 400,
        });
      }
    });

  const logPopupAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: logPopupTranslateY.value }],
  }));

  const logPopupBackdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      logPopupTranslateY.value,
      [0, SCREEN_HEIGHT * 0.5],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  // Edit popup gesture
  const editPopupTranslateY = useSharedValue(0);

  useEffect(() => {
    if (editingEntry) editPopupTranslateY.value = 0;
  }, [editingEntry]);

  const editPopupPanGesture = Gesture.Pan()
    .onUpdate((event) => {
      if (event.translationY > 0) {
        editPopupTranslateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_THRESHOLD) {
        editPopupTranslateY.value = withSpring(SCREEN_HEIGHT, {
          damping: 20,
          stiffness: 200,
        });
        runOnJS(setEditingEntry)(null);
      } else {
        editPopupTranslateY.value = withSpring(0, {
          damping: 20,
          stiffness: 400,
        });
      }
    });

  const editPopupAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: editPopupTranslateY.value }],
  }));

  const editPopupBackdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      editPopupTranslateY.value,
      [0, SCREEN_HEIGHT * 0.5],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  // Sort entries by date descending for history
  const sortedEntries = useMemo(
    () =>
      [...weightEntries].sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.createdAt.localeCompare(a.createdAt),
      ),
    [weightEntries],
  );

  const handleLogWeight = useCallback(() => {
    const parsed = parseFloat(weightInput);
    if (isNaN(parsed) || parsed <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const weightKg = isImperial ? lbsToKg(parsed) : parsed;

    addWeightEntry({
      date: logDateInput,
      weightKg,
      photoUris: photoUris.length > 0 ? photoUris : undefined,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setWeightInput("");
    setPhotoUris([]);
    setShowLogPopup(false);
  }, [weightInput, photoUris, isImperial, logDateInput, addWeightEntry]);

  const pickFromLibrary = useCallback(async (onPick: (uri: string) => void) => {
    const ImagePicker = await import("expo-image-picker");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const persisted = photoSyncService.persistLocalPhoto(
        result.assets[0].uri,
      );
      onPick(persisted);
    }
  }, []);

  const pickFromCamera = useCallback(async (onPick: (uri: string) => void) => {
    const ImagePicker = await import("expo-image-picker");
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Camera access is required to take a photo.",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      const persisted = photoSyncService.persistLocalPhoto(
        result.assets[0].uri,
      );
      onPick(persisted);
    }
  }, []);

  const showPhotoActionSheet = useCallback(
    (onPick: (uri: string) => void) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Alert.alert("Add Photo", undefined, [
        {
          text: "Take Photo",
          onPress: () =>
            pickFromCamera(onPick).catch(() =>
              Alert.alert(
                "Unavailable",
                "Camera requires a native build. Run `npx expo run:ios` to rebuild.",
              ),
            ),
        },
        {
          text: "Choose from Library",
          onPress: () =>
            pickFromLibrary(onPick).catch(() =>
              Alert.alert(
                "Unavailable",
                "Photo picker requires a native build. Run `npx expo run:ios` to rebuild.",
              ),
            ),
        },
        { text: "Cancel", style: "cancel" },
      ]);
    },
    [pickFromCamera, pickFromLibrary],
  );

  const handleAddPhoto = useCallback(() => {
    showPhotoActionSheet((uri) => setPhotoUris((prev) => [...prev, uri]));
  }, [showPhotoActionSheet]);

  const handleRemovePhoto = useCallback((index: number) => {
    setPhotoUris((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleAddEditPhoto = useCallback(() => {
    showPhotoActionSheet((uri) => setEditPhotoUris((prev) => [...prev, uri]));
  }, [showPhotoActionSheet]);

  const handleRemoveEditPhoto = useCallback((index: number) => {
    setEditPhotoUris((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDeleteEntry = useCallback(
    (id: string) => {
      Alert.alert("Delete Entry", "Remove this weight entry?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            deleteWeightEntry(id);
          },
        },
      ]);
    },
    [deleteWeightEntry],
  );

  const handleTapEntry = useCallback(
    (entry: WeightEntry) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setEditingEntry(entry);
      setEditWeightInput(displayWeight(entry.weightKg).toString());
      setEditPhotoUris(getEntryPhotos(entry));
      setEditDateInput(entry.date);
    },
    [isImperial],
  );

  const handleSaveEdit = useCallback(() => {
    if (!editingEntry) return;
    const parsed = parseFloat(editWeightInput);
    if (isNaN(parsed) || parsed <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const weightKg = isImperial ? lbsToKg(parsed) : parsed;
    updateWeightEntry(editingEntry.id, {
      weightKg,
      photoUri: undefined,
      photoUris: editPhotoUris.length > 0 ? editPhotoUris : undefined,
      date: editDateInput,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditingEntry(null);
  }, [
    editingEntry,
    editWeightInput,
    editPhotoUris,
    editDateInput,
    isImperial,
    updateWeightEntry,
  ]);

  const displayWeight = (kg: number) =>
    isImperial ? kgToLbs(kg) : Math.round(kg * 10) / 10;

  const formatDate = (dateStr: string) => {
    const y = parseInt(dateStr.substring(0, 4), 10);
    const m = parseInt(dateStr.substring(4, 6), 10) - 1;
    const d = parseInt(dateStr.substring(6, 8), 10);
    const date = new Date(y, m, d);
    const currentYear = new Date().getFullYear();
    if (dateStr === todayStr) return "Today";
    if (dateStr === yesterdayStr) return "Yesterday";
    if (y !== currentYear) {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const chartWidth = SCREEN_WIDTH - 64; // 16 padding on each side + 16 card padding on each side

  const renderDeleteAction = (id: string) => (
    <TouchableOpacity
      style={styles.deleteAction}
      onPress={() => handleDeleteEntry(id)}
    >
      <Ionicons name="trash-outline" size={20} color="#fff" />
    </TouchableOpacity>
  );

  // Shared popup content renderer for both Log and Edit popups
  const renderPopupContent = ({
    weightValue,
    onWeightChange,
    dateValue,
    showCalendar,
    onCloseCalendar,
    onSelectDate,
    photos,
    onAddPhoto,
    onRemovePhoto,
    saveEnabled,
    onSave,
    isEdit,
  }: {
    weightValue: string;
    onWeightChange: (text: string) => void;
    dateValue: string;
    showCalendar: boolean;
    onCloseCalendar: () => void;
    onSelectDate: (date: string) => void;
    photos: string[];
    onAddPhoto: () => void;
    onRemovePhoto: (index: number) => void;
    saveEnabled: boolean;
    onSave: () => void;
    isEdit: boolean;
  }) => {
    return (
      <>
        <ScrollView
          style={styles.popupScrollView}
          contentContainerStyle={styles.popupScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {/* Hero Weight Input */}
          <Animated.View
            entering={FadeInDown.delay(50).duration(350)}
            style={styles.heroWeightSection}
          >
            <TextInput
              style={styles.heroWeightInput}
              value={weightValue}
              onChangeText={(text) =>
                onWeightChange(
                  text.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"),
                )
              }
              keyboardType="decimal-pad"
              placeholder="0.0"
              placeholderTextColor="#ccc"
              textAlign="center"
            />
            <Text style={styles.heroUnitLabel}>{unitLabel}</Text>
            <View style={styles.heroAccentLine} />
            <TouchableOpacity
              style={styles.dateTapLabel}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (isEdit) setShowEditCalendar(true);
                else setShowLogCalendar(true);
              }}
              activeOpacity={0.6}
            >
              <Text style={styles.dateTapText}>{formatDate(dateValue)}</Text>
            </TouchableOpacity>
          </Animated.View>

          <Calendar
            visible={showCalendar}
            onClose={onCloseCalendar}
            selectedDate={dateValue}
            onSelectDate={onSelectDate}
          />

          {/* Photos Section */}
          <Animated.View
            entering={FadeInDown.delay(150).duration(350)}
            style={styles.photosSection}
          >
            <View style={styles.photosSectionHeader}>
              <Text style={styles.photosSectionLabel}>Progress Photos</Text>
            </View>
            <View style={styles.photoStrip}>
              {photos.map((uri, i) => (
                <View key={uri + i} style={styles.photoThumbWrap}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setPreviewImageUri(uri)}
                  >
                    <SyncedImage uri={uri} style={styles.photoThumb} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.photoThumbRemove}
                    onPress={() => onRemovePhoto(i)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={styles.photoAddButton}
                onPress={onAddPhoto}
                activeOpacity={0.7}
              >
                <Ionicons name="camera-outline" size={22} color="#999" />
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>

        {/* Save Button - pinned below scroll */}
        <Animated.View
          entering={FadeInDown.delay(200).duration(350)}
          style={[
            styles.saveButtonContainer,
            { paddingBottom: insets.bottom + 12 },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.saveButton,
              !saveEnabled && styles.saveButtonDisabled,
            ]}
            onPress={onSave}
            activeOpacity={0.8}
            disabled={!saveEnabled}
          >
            <Ionicons
              name="checkmark"
              size={18}
              color={saveEnabled ? "#fff" : "#aaa"}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.saveButtonText,
                !saveEnabled && styles.saveButtonTextDisabled,
              ]}
            >
              Save Entry
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <StatusBar barStyle="dark-content" />
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <TouchableOpacity
            style={styles.backdropPressable}
            onPress={handleClose}
            activeOpacity={1}
          />
        </Animated.View>

        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[styles.container, { marginTop: insets.top }, animatedStyle]}
          >
            <View style={styles.dragIndicatorContainer}>
              <View style={styles.dragIndicator} />
            </View>

            <View style={styles.header}>
              <TouchableOpacity
                onPress={handleClose}
                activeOpacity={0.7}
              >
                {showGlass ? (
                  <LiquidGlassView
                    style={styles.headerBackButton}
                    interactive
                    effect="regular"
                    tintColor="rgba(250, 250, 247, 0.3)"
                  >
                    <Ionicons name="chevron-back" size={20} color={Tokens.textPrimary} />
                  </LiquidGlassView>
                ) : (
                  <View style={[styles.headerBackButton, styles.headerBackButtonFallback]}>
                    <Ionicons name="chevron-back" size={20} color="#666" />
                  </View>
                )}
              </TouchableOpacity>
              <Text style={styles.title}>Weight</Text>
              <View style={styles.headerRightSpacer} />
            </View>

            <Animated.ScrollView
              style={styles.content}
              contentContainerStyle={[
                styles.contentContainer,
                { paddingBottom: 20 },
              ]}
              showsVerticalScrollIndicator={false}
              onScrollBeginDrag={handleScrollBeginDrag}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              bounces={true}
              keyboardShouldPersistTaps="handled"
            >
              {/* Chart Card */}
              <Animated.View
                entering={FadeInDown.delay(80).duration(400)}
                style={styles.section}
              >
                <Text style={styles.sectionTitle}>Weight Progress</Text>
                <View style={styles.card}>
                  <View style={styles.rangeToggle}>
                    {(["30d", "90d", "all"] as TimeRange[]).map((r) => (
                      <TouchableOpacity
                        key={r}
                        style={[
                          styles.rangeButton,
                          range === r && styles.rangeButtonActive,
                        ]}
                        onPress={() => {
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                          setRange(r);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.rangeButtonText,
                            range === r && styles.rangeButtonTextActive,
                          ]}
                        >
                          {r === "all" ? "All" : r}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <WeightChart
                    entries={weightEntries}
                    range={range}
                    width={chartWidth}
                  />
                </View>
              </Animated.View>

              {/* History */}
              {sortedEntries.length > 0 && (
                <Animated.View
                  entering={FadeInDown.delay(160).duration(400)}
                  style={styles.section}
                >
                  <Text style={styles.sectionTitle}>History</Text>

                  {sortedEntries.map((entry, index) => {
                    const prevEntry = sortedEntries[index + 1];
                    const delta = prevEntry
                      ? displayWeight(entry.weightKg) -
                        displayWeight(prevEntry.weightKg)
                      : null;
                    const deltaRounded =
                      delta !== null ? Math.round(delta * 10) / 10 : null;
                    const photos = getEntryPhotos(entry);
                    const photoCount = photos.length;

                    return (
                      <Animated.View
                        key={entry.id}
                        entering={FadeInDown.delay(index * 30).duration(250)}
                      >
                        <Swipeable
                          ref={(ref) => {
                            if (ref) swipeableRefs.current.set(entry.id, ref);
                            else swipeableRefs.current.delete(entry.id);
                          }}
                          renderRightActions={() =>
                            renderDeleteAction(entry.id)
                          }
                          overshootRight={false}
                        >
                          <TouchableOpacity
                            style={styles.entryCard}
                            onPress={() => handleTapEntry(entry)}
                            activeOpacity={0.6}
                          >
                            <View style={styles.entryContent}>
                              <Text style={styles.entryLabel}>
                                {displayWeight(entry.weightKg)} {unitLabel}
                                {deltaRounded !== null &&
                                  deltaRounded !== 0 && (
                                    <Text style={styles.entryDelta}>
                                      {"  "}
                                      {deltaRounded > 0 ? "+" : ""}
                                      {deltaRounded}
                                    </Text>
                                  )}
                              </Text>
                              <Text style={styles.entryDate} numberOfLines={1}>
                                {formatDate(entry.date)}
                              </Text>
                            </View>
                            {photoCount > 0 && (
                              <TouchableOpacity
                                style={styles.historyPhotoGroup}
                                activeOpacity={0.8}
                                onPress={(e) => {
                                  e.stopPropagation();
                                  setPreviewImageUri(photos[0]);
                                }}
                              >
                                <SyncedImage
                                  uri={photos[0]}
                                  style={styles.historyThumbnail}
                                />
                                {photoCount > 1 && (
                                  <View style={styles.historyPhotoBadge}>
                                    <Text style={styles.historyPhotoBadgeText}>
                                      +{photoCount - 1}
                                    </Text>
                                  </View>
                                )}
                              </TouchableOpacity>
                            )}
                            <View style={styles.chevronContainer}>
                              <Ionicons
                                name="chevron-forward"
                                size={18}
                                color="#ccc"
                              />
                            </View>
                          </TouchableOpacity>
                        </Swipeable>
                      </Animated.View>
                    );
                  })}
                </Animated.View>
              )}
            </Animated.ScrollView>

            {/* Footer */}
            <View
              style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}
            >
              <TouchableOpacity
                style={styles.logButton}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowLogPopup(true);
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.logButtonText}>Log Weight</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </GestureDetector>

        {/* Log Weight Popup */}
        {showLogPopup && (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={styles.popupOverlayRoot}
          >
            <Animated.View
              style={[styles.popupOverlayBackdrop, logPopupBackdropStyle]}
            >
              <TouchableOpacity
                style={styles.backdropPressable}
                activeOpacity={1}
                onPress={() => setShowLogPopup(false)}
              />
            </Animated.View>

            <GestureDetector gesture={logPopupPanGesture}>
              <Animated.View
                style={[
                  styles.popupOverlayContainer,
                  { marginTop: insets.top },
                  logPopupAnimatedStyle,
                ]}
              >
                <View style={styles.popupOverlayDragIndicator}>
                  <View style={styles.dragIndicator} />
                </View>

                <View style={styles.popupOverlayHeader}>
                  <TouchableOpacity
                    onPress={() => setShowLogPopup(false)}
                    activeOpacity={0.7}
                  >
                    {showGlass ? (
                      <LiquidGlassView
                        style={styles.backButton}
                        interactive
                        effect="regular"
                        tintColor="rgba(250, 250, 247, 0.3)"
                      >
                        <Ionicons name="chevron-back" size={20} color={Tokens.textPrimary} />
                      </LiquidGlassView>
                    ) : (
                      <View style={[styles.backButton, styles.backButtonFallback]}>
                        <Ionicons name="chevron-back" size={20} color="#666" />
                      </View>
                    )}
                  </TouchableOpacity>
                  <Text style={styles.popupOverlayTitle}>Log Weight</Text>
                  <View style={styles.popupOverlayHeaderSpacer} />
                </View>

                {renderPopupContent({
                  weightValue: weightInput,
                  onWeightChange: setWeightInput,
                  dateValue: logDateInput,
                  showCalendar: showLogCalendar,
                  onCloseCalendar: () => setShowLogCalendar(false),
                  onSelectDate: setLogDateInput,
                  photos: photoUris,
                  onAddPhoto: handleAddPhoto,
                  onRemovePhoto: handleRemovePhoto,
                  saveEnabled: !!weightInput,
                  onSave: handleLogWeight,
                  isEdit: false,
                })}
              </Animated.View>
            </GestureDetector>
          </Animated.View>
        )}

        {/* Edit Entry Popup */}
        {editingEntry !== null && (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={styles.popupOverlayRoot}
          >
            <Animated.View
              style={[styles.popupOverlayBackdrop, editPopupBackdropStyle]}
            >
              <TouchableOpacity
                style={styles.backdropPressable}
                activeOpacity={1}
                onPress={() => setEditingEntry(null)}
              />
            </Animated.View>

            <GestureDetector gesture={editPopupPanGesture}>
              <Animated.View
                style={[
                  styles.popupOverlayContainer,
                  { marginTop: insets.top },
                  editPopupAnimatedStyle,
                ]}
              >
                <View style={styles.popupOverlayDragIndicator}>
                  <View style={styles.dragIndicator} />
                </View>

                <View style={styles.popupOverlayHeader}>
                  <TouchableOpacity
                    onPress={() => setEditingEntry(null)}
                    activeOpacity={0.7}
                  >
                    {showGlass ? (
                      <LiquidGlassView
                        style={styles.backButton}
                        interactive
                        effect="regular"
                        tintColor="rgba(250, 250, 247, 0.3)"
                      >
                        <Ionicons name="chevron-back" size={20} color={Tokens.textPrimary} />
                      </LiquidGlassView>
                    ) : (
                      <View style={[styles.backButton, styles.backButtonFallback]}>
                        <Ionicons name="chevron-back" size={20} color="#666" />
                      </View>
                    )}
                  </TouchableOpacity>
                  <Text style={styles.popupOverlayTitle}>Edit Entry</Text>
                  <View style={styles.popupOverlayHeaderSpacer} />
                </View>

                {renderPopupContent({
                  weightValue: editWeightInput,
                  onWeightChange: setEditWeightInput,
                  dateValue: editDateInput,
                  showCalendar: showEditCalendar,
                  onCloseCalendar: () => setShowEditCalendar(false),
                  onSelectDate: setEditDateInput,
                  photos: editPhotoUris,
                  onAddPhoto: handleAddEditPhoto,
                  onRemovePhoto: handleRemoveEditPhoto,
                  saveEnabled: !!editWeightInput,
                  onSave: handleSaveEdit,
                  isEdit: true,
                })}
              </Animated.View>
            </GestureDetector>
          </Animated.View>
        )}
        {/* Full-screen image preview */}
        {previewImageUri && (
          <Modal
            visible
            transparent
            animationType="fade"
            onRequestClose={() => setPreviewImageUri(null)}
          >
            <TouchableOpacity
              style={styles.previewOverlay}
              activeOpacity={1}
              onPress={() => setPreviewImageUri(null)}
            >
              <View style={styles.previewCloseButton}>
                <Ionicons name="close" size={22} color="#fff" />
              </View>
              <SyncedImage
                uri={previewImageUri}
                style={styles.previewImage}
                resizeMode="contain"
              />
            </TouchableOpacity>
          </Modal>
        )}
      </GestureHandlerRootView>
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  dragIndicatorContainer: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: "#f8f8f8",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  dragIndicator: {
    width: 32,
    height: 3,
    borderRadius: 1.5,
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
  headerBackButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  headerBackButtonFallback: {
    backgroundColor: "#EBEBEB",
  },
  headerRightSpacer: {
    width: 36,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1a1a1a",
    letterSpacing: -0.3,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "500",
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  rangeToggle: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    borderRadius: 9,
    padding: 2,
    marginBottom: 12,
  },
  rangeButton: {
    flex: 1,
    paddingVertical: 6,
    alignItems: "center",
    borderRadius: 7,
  },
  rangeButtonActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  rangeButtonText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#999",
  },
  rangeButtonTextActive: {
    color: "#0a7ea4",
  },
  // History entries
  entryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 62,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  entryContent: {
    flex: 1,
  },
  entryLabel: {
    fontSize: 16,
    fontWeight: "500",
    color: "#1a1a1a",
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  entryDelta: {
    fontSize: 13,
    fontWeight: "400",
    color: "#999",
  },
  entryDate: {
    fontSize: 13,
    color: "#999",
  },
  historyPhotoGroup: {
    position: "relative",
    marginLeft: 12,
  },
  historyThumbnail: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  historyPhotoBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    backgroundColor: "#999",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  historyPhotoBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#fff",
  },
  chevronContainer: {
    marginLeft: 12,
  },
  deleteAction: {
    backgroundColor: "#F87171",
    justifyContent: "center",
    alignItems: "center",
    width: 72,
    height: 62,
    borderRadius: 14,
    marginLeft: 8,
  },
  // Footer
  footer: {
    backgroundColor: "#f8f8f8",
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  logButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 25,
    backgroundColor: "#0a7ea4",
  },
  logButtonText: {
    fontSize: 15,
    fontWeight: "400",
    color: "#fff",
  },
  // Popup overlay (full-height sheet)
  popupOverlayRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 9999,
    elevation: 20,
  },
  popupOverlayBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  popupOverlayContainer: {
    flex: 1,
    backgroundColor: "#f8f8f8",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  popupOverlayDragIndicator: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
  },
  popupOverlayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonFallback: {
    backgroundColor: "#EBEBEB",
  },
  popupOverlayTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1a1a1a",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  popupOverlayHeaderSpacer: {
    width: 36,
  },
  // Popup scroll layout
  popupScrollView: {
    flex: 1,
  },
  popupScrollContent: {
    paddingHorizontal: 16,
    gap: 20,
    paddingBottom: 8,
  },
  // Hero weight input
  heroWeightSection: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 4,
  },
  heroWeightInput: {
    fontSize: 56,
    fontWeight: "700",
    color: "#1a1a1a",
    padding: 0,
    minWidth: 120,
    letterSpacing: -1,
  },
  heroUnitLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginTop: 2,
  },
  heroAccentLine: {
    width: 48,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#ccc",
    marginTop: 10,
  },
  // Date tap label
  dateTapLabel: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 7,
    paddingHorizontal: 24,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E8E8E8",
  },
  dateTapText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#666",
  },
  // Photos section
  photosSection: {},
  photosSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    marginLeft: 4,
  },
  photosSectionLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  photoStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  photoThumbWrap: {
    position: "relative",
  },
  photoThumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: "#f0f0f0",
  },
  photoThumbRemove: {
    position: "absolute",
    top: -6,
    right: -6,
  },
  photoAddButton: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: "#f5f5f5",
    borderWidth: 1.5,
    borderColor: "#ddd",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  // Save button
  saveButtonContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: "#f8f8f8",
  },
  saveButton: {
    flexDirection: "row",
    backgroundColor: "#0a7ea4",
    paddingVertical: 15,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0a7ea4",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  saveButtonDisabled: {
    backgroundColor: "#E5E5E5",
    shadowOpacity: 0,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  saveButtonTextDisabled: {
    color: "#aaa",
  },
  // Full-screen image preview
  previewOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.95)",
    justifyContent: "center",
    alignItems: "center",
  },
  previewCloseButton: {
    position: "absolute",
    top: 60,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  previewImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
  },
});
