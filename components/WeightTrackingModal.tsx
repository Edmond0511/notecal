import { useAppStore } from "@/store/app-store";
import { WeightEntry } from "@/types";
import { kgToLbs, lbsToKg } from "@/utils/goalsCalculator";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Calendar } from "./Calendar";
import { WeightChart } from "./weight/WeightChart";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const DISMISS_THRESHOLD = 150;

type TimeRange = "30d" | "90d" | "all";

interface WeightTrackingModalProps {
  visible: boolean;
  onClose: () => void;
}

export function WeightTrackingModal({ visible, onClose }: WeightTrackingModalProps) {
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

  const [range, setRange] = useState<TimeRange>("30d");
  const [weightInput, setWeightInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [photoUri, setPhotoUri] = useState<string | undefined>();
  const [showLogPopup, setShowLogPopup] = useState(false);
  const [showLogCalendar, setShowLogCalendar] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WeightEntry | null>(null);
  const [editWeightInput, setEditWeightInput] = useState("");
  const [editNoteInput, setEditNoteInput] = useState("");
  const [editPhotoUri, setEditPhotoUri] = useState<string | undefined>();
  const [editDateInput, setEditDateInput] = useState("");
  const [showEditCalendar, setShowEditCalendar] = useState(false);

  const todayStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const [logDateInput, setLogDateInput] = useState(todayStr);
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().split("T")[0].replace(/-/g, "");

  // Reset form state when modal opens
  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      isScrolledToTop.value = true;
      setWeightInput("");
      setNoteInput("");
      setPhotoUri(undefined);
      setLogDateInput(new Date().toISOString().split("T")[0].replace(/-/g, ""));
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
        translateY.value = withSpring(SCREEN_HEIGHT, { damping: 20, stiffness: 200 });
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
      Extrapolation.CLAMP
    ),
  }));

  const handleScrollBeginDrag = (event: any) => {
    isScrolledToTop.value = event.nativeEvent.contentOffset.y <= 0;
  };

  const handleScroll = (event: any) => {
    isScrolledToTop.value = event.nativeEvent.contentOffset.y <= 0;
  };

  // Sort entries by date descending for history
  const sortedEntries = useMemo(
    () => [...weightEntries].sort((a, b) => b.date.localeCompare(a.date)),
    [weightEntries]
  );

  // Entries with photos
  const photoEntries = useMemo(
    () => sortedEntries.filter((e) => e.photoUri),
    [sortedEntries]
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
      note: noteInput.trim() || undefined,
      photoUri,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setWeightInput("");
    setNoteInput("");
    setPhotoUri(undefined);
    setShowLogPopup(false);
  }, [weightInput, noteInput, photoUri, isImperial, logDateInput, addWeightEntry]);


  const pickFromLibrary = useCallback(async (setUri: (uri: string) => void) => {
    const ImagePicker = await import("expo-image-picker");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setUri(result.assets[0].uri);
    }
  }, []);

  const pickFromCamera = useCallback(async (setUri: (uri: string) => void) => {
    const ImagePicker = await import("expo-image-picker");
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera access is required to take a photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]) {
      setUri(result.assets[0].uri);
    }
  }, []);

  const showPhotoActionSheet = useCallback((setUri: (uri: string) => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert("Add Photo", undefined, [
      {
        text: "Take Photo",
        onPress: () => pickFromCamera(setUri).catch(() =>
          Alert.alert("Unavailable", "Camera requires a native build. Run `npx expo run:ios` to rebuild.")
        ),
      },
      {
        text: "Choose from Library",
        onPress: () => pickFromLibrary(setUri).catch(() =>
          Alert.alert("Unavailable", "Photo picker requires a native build. Run `npx expo run:ios` to rebuild.")
        ),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [pickFromCamera, pickFromLibrary]);

  const handlePickPhoto = useCallback(() => {
    showPhotoActionSheet(setPhotoUri);
  }, [showPhotoActionSheet]);

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
    [deleteWeightEntry]
  );

  const handleDeletePhoto = useCallback(
    (entry: WeightEntry) => {
      Alert.alert("Delete Photo", "Remove this progress photo?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            // Remove the photo URI from the entry
            const store = useAppStore.getState();
            store.updateWeightEntry(entry.id, { photoUri: undefined });
          },
        },
      ]);
    },
    []
  );

  const handleTapEntry = useCallback((entry: WeightEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingEntry(entry);
    setEditWeightInput(displayWeight(entry.weightKg).toString());
    setEditNoteInput(entry.note || "");
    setEditPhotoUri(entry.photoUri);
    setEditDateInput(entry.date);
  }, [isImperial]);

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
      note: editNoteInput.trim() || undefined,
      photoUri: editPhotoUri,
      date: editDateInput,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setEditingEntry(null);
  }, [editingEntry, editWeightInput, editNoteInput, editPhotoUri, editDateInput, isImperial, updateWeightEntry]);


  const handleEditPickPhoto = useCallback(() => {
    showPhotoActionSheet(setEditPhotoUri);
  }, [showPhotoActionSheet]);

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
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleClose}>
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
              <Text style={styles.title}>Weight</Text>
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
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
                      delta !== null
                        ? Math.round(delta * 10) / 10
                        : null;

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
                          renderRightActions={() => renderDeleteAction(entry.id)}
                          overshootRight={false}
                        >
                          <TouchableOpacity
                            style={styles.entryCard}
                            onPress={() => handleTapEntry(entry)}
                            activeOpacity={0.6}
                          >
                            {entry.photoUri && (
                              <Image
                                source={{ uri: entry.photoUri }}
                                style={styles.historyThumbnail}
                              />
                            )}
                            <View style={styles.entryContent}>
                              <Text style={styles.entryLabel}>
                                {displayWeight(entry.weightKg)} {unitLabel}
                                {deltaRounded !== null && deltaRounded !== 0 && (
                                  <Text style={styles.entryDelta}>
                                    {"  "}{deltaRounded > 0 ? "+" : ""}{deltaRounded}
                                  </Text>
                                )}
                              </Text>
                              <Text style={styles.entryDate}>
                                {formatDate(entry.date)}
                                {entry.note ? `  ·  ${entry.note}` : ""}
                              </Text>
                            </View>
                            <View style={styles.chevronContainer}>
                              <Ionicons name="chevron-forward" size={18} color="#ccc" />
                            </View>
                          </TouchableOpacity>
                        </Swipeable>
                      </Animated.View>
                    );
                  })}
                </Animated.View>
              )}

              {/* Progress Photos */}
              {photoEntries.length > 0 && (
                <Animated.View
                  entering={FadeInDown.delay(240).duration(400)}
                  style={styles.section}
                >
                  <Text style={styles.sectionTitle}>Photos</Text>

                  <View style={styles.photoGrid}>
                    {photoEntries.map((entry) => (
                      <TouchableOpacity
                        key={entry.id}
                        style={styles.photoCard}
                        onLongPress={() => handleDeletePhoto(entry)}
                        activeOpacity={0.8}
                      >
                        <Image
                          source={{ uri: entry.photoUri }}
                          style={styles.gridPhoto}
                        />
                        <Text style={styles.photoDate}>
                          {formatDate(entry.date)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </Animated.View>
              )}
            </Animated.ScrollView>

            {/* Footer */}
            <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
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
      </GestureHandlerRootView>

      {/* Log Weight Popup */}
      <Modal
        visible={showLogPopup}
        animationType="fade"
        transparent
        onRequestClose={() => setShowLogPopup(false)}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.popupGestureRoot}
        >
          <TouchableOpacity
            style={styles.popupBackdrop}
            onPress={() => setShowLogPopup(false)}
            activeOpacity={1}
          />

          <View style={[styles.popupContainer, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.popupDragIndicatorContainer}>
              <View style={styles.dragIndicator} />
            </View>

            <Text style={styles.popupTitle}>Log Weight</Text>

            <View style={styles.scaleReadout}>
              <View style={styles.scaleCenter}>
                <TextInput
                  style={styles.scaleInput}
                  value={weightInput}
                  onChangeText={(text) =>
                    setWeightInput(
                      text
                        .replace(/[^0-9.]/g, "")
                        .replace(/(\..*)\./g, "$1")
                    )
                  }
                  keyboardType="decimal-pad"
                  placeholder="0.0"
                  placeholderTextColor="#ccc"
                  autoFocus
                />
                <Text style={styles.scaleUnitLabel}>{unitLabel}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.dateLabelContainer}
              onPress={() => setShowLogCalendar(true)}
              activeOpacity={0.6}
            >
              <Text style={styles.dateSelectorText}>{formatDate(logDateInput)}</Text>
            </TouchableOpacity>

            <Calendar
              visible={showLogCalendar}
              onClose={() => setShowLogCalendar(false)}
              selectedDate={logDateInput}
              onSelectDate={setLogDateInput}
            />

            <View style={styles.notePhotoRow}>
              <TextInput
                style={styles.compactNoteInput}
                value={noteInput}
                onChangeText={setNoteInput}
                placeholder="Note (optional)"
                placeholderTextColor="#bbb"
                maxLength={100}
              />
              {photoUri ? (
                <View style={styles.photoButtonContainer}>
                  <Image source={{ uri: photoUri }} style={styles.compactPhotoPreview} />
                  <TouchableOpacity
                    style={styles.compactPhotoRemove}
                    onPress={() => setPhotoUri(undefined)}
                  >
                    <Ionicons name="close-circle" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.compactPhotoButton}
                  onPress={handlePickPhoto}
                  activeOpacity={0.7}
                >
                  <Ionicons name="camera-outline" size={20} color="#1A6872" />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.popupSubmitButton,
                !weightInput && styles.popupSubmitButtonDisabled,
              ]}
              onPress={handleLogWeight}
              activeOpacity={0.8}
              disabled={!weightInput}
            >
              <Text
                style={[
                  styles.popupSubmitText,
                  !weightInput && styles.popupSubmitTextDisabled,
                ]}
              >
                Save
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Entry Popup */}
      <Modal
        visible={editingEntry !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setEditingEntry(null)}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.popupGestureRoot}
        >
          <TouchableOpacity
            style={styles.popupBackdrop}
            onPress={() => setEditingEntry(null)}
            activeOpacity={1}
          />

          <View style={[styles.popupContainer, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.popupDragIndicatorContainer}>
              <View style={styles.dragIndicator} />
            </View>

            <Text style={styles.popupTitle}>Edit Entry</Text>

            <View style={styles.scaleReadout}>
              <View style={styles.scaleCenter}>
                <TextInput
                  style={styles.scaleInput}
                  value={editWeightInput}
                  onChangeText={(text) =>
                    setEditWeightInput(
                      text
                        .replace(/[^0-9.]/g, "")
                        .replace(/(\..*)\./g, "$1")
                    )
                  }
                  keyboardType="decimal-pad"
                  placeholder="0.0"
                  placeholderTextColor="#ccc"
                />
                <Text style={styles.scaleUnitLabel}>{unitLabel}</Text>
              </View>
            </View>

            {/* Date selector */}
            <TouchableOpacity
              style={styles.dateLabelContainer}
              onPress={() => setShowEditCalendar(true)}
              activeOpacity={0.6}
            >
              <Text style={styles.dateSelectorText}>{formatDate(editDateInput)}</Text>
            </TouchableOpacity>

            <Calendar
              visible={showEditCalendar}
              onClose={() => setShowEditCalendar(false)}
              selectedDate={editDateInput}
              onSelectDate={setEditDateInput}
            />

            <View style={styles.notePhotoRow}>
              <TextInput
                style={styles.compactNoteInput}
                value={editNoteInput}
                onChangeText={setEditNoteInput}
                placeholder="Note (optional)"
                placeholderTextColor="#bbb"
                maxLength={100}
              />
              {editPhotoUri ? (
                <View style={styles.photoButtonContainer}>
                  <Image source={{ uri: editPhotoUri }} style={styles.compactPhotoPreview} />
                  <TouchableOpacity
                    style={styles.compactPhotoRemove}
                    onPress={() => setEditPhotoUri(undefined)}
                  >
                    <Ionicons name="close-circle" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.compactPhotoButton}
                  onPress={handleEditPickPhoto}
                  activeOpacity={0.7}
                >
                  <Ionicons name="camera-outline" size={20} color="#1A6872" />
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.popupSubmitButton,
                !editWeightInput && styles.popupSubmitButtonDisabled,
              ]}
              onPress={handleSaveEdit}
              activeOpacity={0.8}
              disabled={!editWeightInput}
            >
              <Text
                style={[
                  styles.popupSubmitText,
                  !editWeightInput && styles.popupSubmitTextDisabled,
                ]}
              >
                Save
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Modal>
  );
}

const PHOTO_SIZE = (SCREEN_WIDTH - 64 - 16) / 3;

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
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: "#f8f8f8",
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
    fontWeight: "600",
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
    fontWeight: "600",
    color: "#999",
  },
  rangeButtonTextActive: {
    color: "#1A6872",
  },
  // History entries
  entryCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 15,
    marginBottom: 15,
  },
  entryContent: {
    flex: 1,
  },
  entryLabel: {
    fontSize: 16,
    fontWeight: "600",
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
  historyThumbnail: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
    marginRight: 12,
  },
  chevronContainer: {
    marginLeft: 12,
  },
  deleteAction: {
    backgroundColor: "#F87171",
    justifyContent: "center",
    alignItems: "center",
    width: 72,
    borderRadius: 14,
    marginLeft: 8,
    marginBottom: 8,
  },
  // Photos
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoCard: {
    width: PHOTO_SIZE,
  },
  gridPhoto: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: 10,
    backgroundColor: "#f0f0f0",
  },
  photoDate: {
    fontSize: 11,
    color: "#999",
    textAlign: "center",
    marginTop: 4,
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
    backgroundColor: "#1A6872",
  },
  logButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  // Popup shared
  popupGestureRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  popupBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  popupContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
  },
  popupDragIndicatorContainer: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 12,
  },
  popupTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#1a1a1a",
    textAlign: "center",
    marginBottom: 16,
  },
  scaleReadout: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  scaleCenter: {
    alignItems: "center",
  },
  scaleInput: {
    fontSize: 40,
    fontWeight: "700",
    color: "#1a1a1a",
    textAlign: "center",
    padding: 0,
    letterSpacing: -1,
    minWidth: 120,
  },
  scaleUnitLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#999",
    textTransform: "uppercase",
    marginTop: 2,
  },
  notePhotoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  compactNoteInput: {
    flex: 1,
    fontSize: 15,
    color: "#333",
    backgroundColor: "#f8f8f8",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  photoButtonContainer: {
    position: "relative",
  },
  compactPhotoPreview: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: "#f0f0f0",
  },
  compactPhotoRemove: {
    position: "absolute",
    top: -6,
    right: -6,
  },
  compactPhotoButton: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: "rgba(26, 104, 114, 0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  dateLabelContainer: {
    alignSelf: "center",
    backgroundColor: "#f5f5f5",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 9,
    marginBottom: 12,
  },
  dateSelectorText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  popupSubmitButton: {
    backgroundColor: "#1A6872",
    paddingVertical: 14,
    borderRadius: 25,
    alignItems: "center",
  },
  popupSubmitButtonDisabled: {
    backgroundColor: "#E0E0E0",
    opacity: 0.6,
  },
  popupSubmitText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  popupSubmitTextDisabled: {
    color: "#aaa",
  },
});
