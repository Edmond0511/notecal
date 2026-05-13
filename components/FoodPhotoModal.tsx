import { SystemFont } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dimensions,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
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
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Lazy-load expo-camera to avoid crashing before native rebuild
let CameraView: any = null;
let useCameraPermissions: any = null;
let cameraAvailable = false;

try {
  const mod = require("expo-camera");
  CameraView = mod.CameraView;
  useCameraPermissions = mod.useCameraPermissions;
  cameraAvailable = true;
} catch {
  cameraAvailable = false;
}

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const DISMISS_THRESHOLD = 150;
const TEAL = "#1A6872";

interface FoodPhotoModalProps {
  visible: boolean;
  onClose: () => void;
  onPhotoCaptured: (base64: string, mimeType: string) => void;
}

// Stub hook when expo-camera is not available
function useStubPermissions(): [{ granted: false } | null, () => void] {
  return [null, () => {}];
}

export function FoodPhotoModal({
  visible,
  onClose,
  onPhotoCaptured,
}: FoodPhotoModalProps) {
  const insets = useSafeAreaInsets();
  const usePerms = cameraAvailable ? useCameraPermissions : useStubPermissions;
  const [permission, requestPermission] = usePerms();
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [zoom, setZoom] = useState(0);
  const cameraRef = useRef<any>(null);
  const captureLockRef = useRef(false);
  const translateY = useSharedValue(0);
  const hintOpacity = useSharedValue(0);

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setTorchEnabled(false);
      setZoom(0);
      translateY.value = 0;
      captureLockRef.current = false;
      // Fade in hint, then auto-fade out after 2s
      hintOpacity.value = withSequence(
        withTiming(1, { duration: 400 }),
        withDelay(2000, withTiming(0, { duration: 600 })),
      );
    }
  }, [visible]);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || captureLockRef.current) return;
    captureLockRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.5,
        base64: true,
      });
      if (photo?.base64) {
        onPhotoCaptured(photo.base64, "image/jpeg");
      }
    } catch (e) {
      console.error("[FoodPhotoModal] Capture error:", e);
    }
    onClose();
  }, [onPhotoCaptured, onClose]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  const toggleFlash = useCallback(() => {
    setTorchEnabled((prev) => !prev);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleZoomToggle = useCallback((level: number) => {
    setZoom(level);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const flashIconName = torchEnabled ? "flash" : "flash-off";

  const panGesture = Gesture.Pan()
    .activeOffsetY(10)
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

  const hintStyle = useAnimatedStyle(() => ({
    opacity: hintOpacity.value,
  }));

  if (!permission) return null;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <StatusBar barStyle="light-content" />
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          <TouchableOpacity
            style={styles.backdropPressable}
            onPress={handleClose}
            activeOpacity={1}
          />
        </Animated.View>
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.container,
              { marginTop: insets.top },
              animatedStyle,
            ]}
          >
            {!cameraAvailable ? (
              <View style={styles.permissionContainer}>
                <View style={styles.permissionContent}>
                  <View style={styles.permissionIconCircle}>
                    <Ionicons name="build-outline" size={48} color={TEAL} />
                  </View>
                  <Text style={styles.permissionTitle}>Rebuild Required</Text>
                  <Text style={styles.permissionDescription}>
                    The camera module requires a native rebuild. Run{"\n"}
                    <Text style={{ fontWeight: "600" }}>
                      npx expo run:ios
                    </Text>
                    {"\n"}then reopen the app.
                  </Text>
                  <TouchableOpacity
                    style={styles.permissionCancelButton}
                    onPress={handleClose}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.permissionCancelText}>Close</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : !permission.granted ? (
              <View style={styles.permissionContainer}>
                <View style={styles.permissionContent}>
                  <View style={styles.permissionIconCircle}>
                    <Ionicons name="camera-outline" size={48} color="#000" />
                  </View>
                  <Text style={styles.permissionTitle}>Camera Access</Text>
                  <Text style={styles.permissionDescription}>
                    NoteCal needs camera access to photograph food and calculate
                    nutrition
                  </Text>
                  <TouchableOpacity
                    style={styles.permissionButton}
                    onPress={requestPermission}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.permissionButtonText}>
                      Allow Camera
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.permissionCancelButton}
                    onPress={handleClose}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.permissionCancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <CameraView
                  ref={cameraRef}
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  enableTorch={torchEnabled}
                  zoom={zoom}
                />

                {/* Drag indicator */}
                <View
                  style={styles.dragIndicatorContainer}
                  pointerEvents="none"
                >
                  <View style={styles.dragIndicator} />
                </View>

                {/* Close button */}
                <TouchableOpacity
                  style={[styles.closeButton, { top: 12 }]}
                  onPress={handleClose}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={26} color="#fff" />
                </TouchableOpacity>

                {/* Flash toggle */}
                <TouchableOpacity
                  style={[styles.flashButton, { top: 12 }]}
                  onPress={toggleFlash}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={flashIconName as any}
                    size={22}
                    color="#fff"
                  />
                </TouchableOpacity>

                {/* Hint pill */}
                <Animated.View
                  style={[styles.hintContainer, hintStyle]}
                  pointerEvents="none"
                >
                  <View style={styles.hintPill}>
                    <Ionicons
                      name="camera-outline"
                      size={18}
                      color="rgba(255,255,255,0.8)"
                    />
                    <Text style={styles.hintText}>
                      Take a photo of your food
                    </Text>
                  </View>
                </Animated.View>

                {/* Zoom + capture button */}
                <View
                  style={[
                    styles.captureContainer,
                    { paddingBottom: insets.bottom + 20 },
                  ]}
                >
                  <View style={styles.zoomContainer}>
                    <TouchableOpacity
                      style={[
                        styles.zoomButton,
                        zoom === 0 && styles.zoomButtonActive,
                      ]}
                      onPress={() => handleZoomToggle(0)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.zoomLabel,
                          zoom === 0 && styles.zoomLabelActive,
                        ]}
                      >
                        0.5x
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.zoomButton,
                        zoom !== 0 && styles.zoomButtonActive,
                      ]}
                      onPress={() => handleZoomToggle(0.1)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.zoomLabel,
                          zoom !== 0 && styles.zoomLabelActive,
                        ]}
                      >
                        1x
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.captureButtonOuter}
                    onPress={handleCapture}
                    activeOpacity={0.8}
                  >
                    <View style={styles.captureButtonInner} />
                  </TouchableOpacity>
                </View>
              </>
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
    backgroundColor: "#000",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  dragIndicatorContainer: {
    position: "absolute",
    top: 8,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
  },
  dragIndicator: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.4)",
  },
  // Permission screens
  permissionContainer: {
    flex: 1,
    backgroundColor: "#f8f8f8",
    justifyContent: "center",
    alignItems: "center",
  },
  permissionContent: {
    alignItems: "center",
    paddingHorizontal: 40,
  },
  permissionIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
  },
  permissionTitle: {
    fontSize: 22,
    fontFamily: SystemFont,
    fontWeight: "600",
    color: "#1a1a1a",
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  permissionDescription: {
    fontSize: 16,
    fontFamily: SystemFont,
    fontWeight: "400",
    color: "#666",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
  },
  permissionButton: {
    backgroundColor: TEAL,
    paddingVertical: 14,
    paddingHorizontal: 36,
    borderRadius: 999,
    marginBottom: 12,
  },
  permissionButtonText: {
    fontSize: 17,
    fontFamily: SystemFont,
    fontWeight: "400",
    color: "#fff",
  },
  permissionCancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  permissionCancelText: {
    fontSize: 16,
    fontFamily: SystemFont,
    fontWeight: "400",
    color: "#666",
  },
  // Close button
  closeButton: {
    position: "absolute",
    left: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  // Flash button
  flashButton: {
    position: "absolute",
    right: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  // Zoom controls
  zoomContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 18,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 20,
    padding: 3,
  },
  zoomButton: {
    width: 40,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  zoomButtonActive: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  zoomLabel: {
    fontSize: 13,
    fontFamily: SystemFont,
    fontWeight: "500",
    color: "rgba(255,255,255,0.5)",
  },
  zoomLabelActive: {
    color: "#fff",
    fontWeight: "600",
  },
  // Hint pill
  hintContainer: {
    position: "absolute",
    bottom: 200,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  hintPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 24,
  },
  hintText: {
    fontSize: 15,
    fontFamily: SystemFont,
    fontWeight: "500",
    color: "#fff",
  },
  // Capture button
  captureContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingTop: 16,
  },
  captureButtonOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.3)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  captureButtonInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: "#fff",
  },
});
