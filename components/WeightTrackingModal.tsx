import { useAppStore } from "@/store/app-store";
import { WeightEntry } from "@/types";
import { kgToLbs, lbsToKg } from "@/utils/goalsCalculator";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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

  const weightEntries = useAppStore((s) => s.weightEntries);
  const addWeightEntry = useAppStore((s) => s.addWeightEntry);
  const deleteWeightEntry = useAppStore((s) => s.deleteWeightEntry);
  const preferredUnits = useAppStore((s) => s.preferredUnits);
  const isImperial = preferredUnits === "imperial";
  const unitLabel = isImperial ? "lbs" : "kg";

  const [range, setRange] = useState<TimeRange>("30d");
  const [weightInput, setWeightInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [photoUri, setPhotoUri] = useState<string | undefined>();

  const todayStr = new Date().toISOString().split("T")[0].replace(/-/g, "");

  // Reset form state when modal opens
  useEffect(() => {
    if (visible) {
      translateY.value = 0;
      isScrolledToTop.value = true;
      setWeightInput("");
      setNoteInput("");
      setPhotoUri(undefined);
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
      date: todayStr,
      weightKg,
      note: noteInput.trim() || undefined,
      photoUri,
    });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setWeightInput("");
    setNoteInput("");
    setPhotoUri(undefined);
  }, [weightInput, noteInput, photoUri, isImperial, todayStr, addWeightEntry]);

  const handlePickPhoto = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      const ImagePicker = await import("expo-image-picker");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert(
        "Unavailable",
        "Photo picker requires a new native build. Run `npx expo run:ios` to rebuild."
      );
    }
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

  const displayWeight = (kg: number) =>
    isImperial ? kgToLbs(kg) : Math.round(kg * 10) / 10;

  const formatDate = (dateStr: string) => {
    const y = parseInt(dateStr.substring(0, 4), 10);
    const m = parseInt(dateStr.substring(4, 6), 10) - 1;
    const d = parseInt(dateStr.substring(6, 8), 10);
    const date = new Date(y, m, d);
    if (dateStr === todayStr) return "Today";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const chartWidth = SCREEN_WIDTH - 64; // 16 padding on each side + 16 card padding on each side

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
              <Text style={styles.title}>Weight Tracking</Text>
            </View>

            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={styles.keyboardView}
            >
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
                {/* Weight Progress Section */}
                <Animated.View
                  entering={FadeInDown.delay(100).duration(400)}
                  style={styles.section}
                >
                  <Text style={styles.sectionTitle}>Weight Progress</Text>

                  <View style={styles.card}>
                    {/* Time range toggle */}
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

                {/* Log Weight Section */}
                <Animated.View
                  entering={FadeInDown.delay(200).duration(400)}
                  style={styles.section}
                >
                  <Text style={styles.sectionTitle}>Log Weight</Text>

                  <View style={styles.card}>
                    <View style={styles.inputRow}>
                      <View style={styles.weightInputContainer}>
                        <TextInput
                          style={styles.weightInput}
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
                        />
                        <Text style={styles.unitLabel}>{unitLabel}</Text>
                      </View>
                    </View>

                    <TextInput
                      style={styles.noteInput}
                      value={noteInput}
                      onChangeText={setNoteInput}
                      placeholder="Add a note (optional)"
                      placeholderTextColor="#bbb"
                      maxLength={100}
                    />

                    {/* Photo preview / picker */}
                    {photoUri ? (
                      <View style={styles.photoPreviewRow}>
                        <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                        <TouchableOpacity
                          style={styles.removePhotoButton}
                          onPress={() => setPhotoUri(undefined)}
                        >
                          <Ionicons name="close-circle" size={22} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.addPhotoButton}
                        onPress={handlePickPhoto}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="camera-outline" size={18} color="#1A6872" />
                        <Text style={styles.addPhotoText}>Add Photo</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[
                        styles.logButton,
                        !weightInput && styles.logButtonDisabled,
                      ]}
                      onPress={handleLogWeight}
                      activeOpacity={0.7}
                      disabled={!weightInput}
                    >
                      <Text style={styles.logButtonText}>Log Weight</Text>
                    </TouchableOpacity>
                  </View>
                </Animated.View>

                {/* Progress Photos Section */}
                {photoEntries.length > 0 && (
                  <Animated.View
                    entering={FadeInDown.delay(300).duration(400)}
                    style={styles.section}
                  >
                    <Text style={styles.sectionTitle}>Progress Photos</Text>

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

                {/* History Section */}
                {sortedEntries.length > 0 && (
                  <Animated.View
                    entering={FadeInDown.delay(400).duration(400)}
                    style={styles.section}
                  >
                    <Text style={styles.sectionTitle}>History</Text>

                    <View style={styles.card}>
                      {sortedEntries.map((entry, index) => {
                        // Find previous entry to calculate delta
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
                          <TouchableOpacity
                            key={entry.id}
                            style={[
                              styles.historyRow,
                              index === sortedEntries.length - 1 &&
                                styles.historyRowLast,
                            ]}
                            onLongPress={() => handleDeleteEntry(entry.id)}
                            activeOpacity={0.7}
                          >
                            <View style={styles.historyLeft}>
                              <Text style={styles.historyDate}>
                                {formatDate(entry.date)}
                              </Text>
                              {entry.note && (
                                <Text
                                  style={styles.historyNote}
                                  numberOfLines={1}
                                >
                                  {entry.note}
                                </Text>
                              )}
                            </View>
                            <View style={styles.historyRight}>
                              <Text style={styles.historyWeight}>
                                {displayWeight(entry.weightKg)} {unitLabel}
                              </Text>
                              {deltaRounded !== null && deltaRounded !== 0 && (
                                <Text
                                  style={[
                                    styles.historyDelta,
                                    {
                                      color:
                                        deltaRounded < 0
                                          ? "#22C55E"
                                          : "#EF4444",
                                    },
                                  ]}
                                >
                                  {deltaRounded > 0 ? "+" : ""}
                                  {deltaRounded}
                                </Text>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </Animated.View>
                )}
              </Animated.ScrollView>
            </KeyboardAvoidingView>
          </Animated.View>
        </GestureDetector>
      </GestureHandlerRootView>
    </Modal>
  );
}

const PHOTO_SIZE = (SCREEN_WIDTH - 64 - 16) / 3; // 3 columns with gaps

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
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#f8f8f8",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1a1a1a",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#999",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  // Range toggle
  rangeToggle: {
    flexDirection: "row",
    backgroundColor: "#f5f5f5",
    borderRadius: 10,
    padding: 3,
    marginBottom: 16,
  },
  rangeButton: {
    flex: 1,
    paddingVertical: 7,
    alignItems: "center",
    borderRadius: 8,
  },
  rangeButtonActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  rangeButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#999",
  },
  rangeButtonTextActive: {
    color: "#1A6872",
  },
  // Log Weight
  inputRow: {
    marginBottom: 12,
  },
  weightInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f8f8",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  weightInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: "700",
    color: "#1a1a1a",
    padding: 0,
    letterSpacing: -0.5,
  },
  unitLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#999",
    marginLeft: 8,
  },
  noteInput: {
    fontSize: 15,
    color: "#333",
    backgroundColor: "#f8f8f8",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
  },
  addPhotoButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    backgroundColor: "rgba(26, 104, 114, 0.06)",
    borderRadius: 10,
    marginBottom: 16,
  },
  addPhotoText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1A6872",
  },
  photoPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 8,
  },
  photoPreview: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: "#f0f0f0",
  },
  removePhotoButton: {
    padding: 4,
  },
  logButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 25,
    backgroundColor: "#1A6872",
  },
  logButtonDisabled: {
    backgroundColor: "#d0d0d0",
  },
  logButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  // Progress Photos
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoCard: {
    width: PHOTO_SIZE,
    marginBottom: 4,
  },
  gridPhoto: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: 12,
    backgroundColor: "#f0f0f0",
  },
  photoDate: {
    fontSize: 11,
    color: "#999",
    textAlign: "center",
    marginTop: 4,
  },
  // History
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#f0f0f0",
  },
  historyRowLast: {
    borderBottomWidth: 0,
  },
  historyLeft: {
    flex: 1,
  },
  historyDate: {
    fontSize: 15,
    fontWeight: "500",
    color: "#333",
  },
  historyNote: {
    fontSize: 13,
    color: "#999",
    marginTop: 2,
  },
  historyRight: {
    alignItems: "flex-end",
  },
  historyWeight: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1a1a1a",
  },
  historyDelta: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
});
