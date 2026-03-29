import React, { useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getBMICategory } from "@/utils/goalsCalculator";
import { AnimatedDigits } from "./AnimatedDigits";

const BAR_HEIGHT = 8;

const ZONES = [
  { min: 10, max: 18.5, color: "#3B82F6", label: "<18.5" },
  { min: 18.5, max: 25, color: "#22C55E", label: "18.5\u201325" },
  { min: 25, max: 30, color: "#F97316", label: "25\u201330" },
  { min: 30, max: 45, color: "#EF4444", label: "30+" },
];

const BMI_INFO_RANGES = [
  { label: "Underweight", range: "Below 18.5", color: "#3B82F6" },
  { label: "Normal", range: "18.5 \u2013 24.9", color: "#22C55E" },
  { label: "Overweight", range: "25 \u2013 29.9", color: "#F97316" },
  { label: "Obese", range: "30 and above", color: "#EF4444" },
];

function getMarkerPercent(bmi: number): number {
  const segmentWidth = 100 / ZONES.length;
  for (let i = 0; i < ZONES.length; i++) {
    const zone = ZONES[i];
    if (bmi <= zone.max || i === ZONES.length - 1) {
      const fraction = Math.max(
        0,
        Math.min(1, (bmi - zone.min) / (zone.max - zone.min))
      );
      return (i + fraction) * segmentWidth;
    }
  }
  return 100;
}

interface BmiNumberLineProps {
  bmi: number;
}

export function BmiNumberLine({ bmi }: BmiNumberLineProps) {
  const category = getBMICategory(bmi);
  const markerPct = getMarkerPercent(bmi);
  const [showInfo, setShowInfo] = useState(false);

  return (
    <View style={styles.container}>
      {/* Header: value + category + info */}
      <View style={styles.header}>
        <View style={styles.valueRow}>
          <View style={styles.bmiValueRow}>
            <AnimatedDigits
              value={Math.floor(bmi)}
              style={styles.bmiValue}
            />
            <Text style={styles.bmiValue}>.</Text>
            <AnimatedDigits
              value={Math.round((bmi % 1) * 10)}
              maxDigits={1}
              style={styles.bmiValue}
            />
          </View>
          <View style={[styles.categoryPill, { backgroundColor: category.color + "14" }]}>
            <Text style={[styles.categoryLabel, { color: category.color }]}>
              {category.label}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => setShowInfo(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.6}
        >
          <Ionicons name="information-circle-outline" size={20} color="#c0c0c0" />
        </TouchableOpacity>
      </View>

      {/* Marker */}
      <View style={styles.markerRow}>
        <View style={[styles.markerGroup, { left: `${markerPct}%` }]}>
          <Text style={[styles.markerValue, { color: category.color }]}>
            {bmi}
          </Text>
          <View
            style={[styles.triangle, { borderTopColor: category.color }]}
          />
        </View>
      </View>

      {/* Color bar */}
      <View style={styles.bar}>
        {ZONES.map((zone) => (
          <View
            key={zone.label}
            style={[styles.segment, { backgroundColor: zone.color }]}
          />
        ))}
      </View>

      {/* Zone labels */}
      <View style={styles.labels}>
        {ZONES.map((zone) => (
          <Text key={zone.label} style={styles.label}>
            {zone.label}
          </Text>
        ))}
      </View>

      {/* BMI Info Popup */}
      <Modal
        visible={showInfo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInfo(false)}
      >
        <TouchableOpacity
          style={styles.infoBackdrop}
          activeOpacity={1}
          onPress={() => setShowInfo(false)}
        >
          <View style={styles.infoCard} onStartShouldSetResponder={() => true}>
            <View style={styles.infoHeader}>
              <Text style={styles.infoTitle}>About BMI</Text>
              <TouchableOpacity
                onPress={() => setShowInfo(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={22} color="#999" />
              </TouchableOpacity>
            </View>

            <Text style={styles.infoDescription}>
              Body Mass Index (BMI) is a measure of body composition calculated
              from your height and weight. It provides a general indication of
              whether your weight falls within a healthy range.
            </Text>

            <View style={styles.infoRanges}>
              {BMI_INFO_RANGES.map((item) => (
                <View key={item.label} style={styles.infoRangeRow}>
                  <View style={[styles.infoRangeDot, { backgroundColor: item.color }]} />
                  <Text style={styles.infoRangeLabel}>{item.label}</Text>
                  <Text style={styles.infoRangeValue}>{item.range}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.infoDisclaimer}>
              BMI does not distinguish between muscle and fat mass and may not be
              accurate for athletes, elderly individuals, or during pregnancy.
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bmiValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  bmiValue: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1a1a1a",
  },
  categoryPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  categoryLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  // Marker
  markerRow: {
    height: 22,
    position: "relative",
  },
  markerGroup: {
    position: "absolute",
    alignItems: "center",
    transform: [{ translateX: "-50%" }],
  },
  markerValue: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 1,
  },
  triangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 5,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  // Bar
  bar: {
    flexDirection: "row",
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    overflow: "hidden",
  },
  segment: {
    flex: 1,
  },
  // Labels
  labels: {
    flexDirection: "row",
    marginTop: 5,
  },
  label: {
    flex: 1,
    fontSize: 10,
    fontWeight: "500",
    textAlign: "center",
    color: "#aaa",
  },
  // Info popup
  infoBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 340,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  infoHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a1a1a",
    letterSpacing: -0.3,
  },
  infoDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: "#666",
    marginBottom: 18,
  },
  infoRanges: {
    gap: 10,
    marginBottom: 18,
  },
  infoRangeRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  infoRangeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  infoRangeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    flex: 1,
  },
  infoRangeValue: {
    fontSize: 13,
    fontWeight: "500",
    color: "#999",
  },
  infoDisclaimer: {
    fontSize: 12,
    lineHeight: 17,
    color: "#aaa",
    fontStyle: "italic",
  },
});
