import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Entry } from "@/types";

interface NutritionReasoningPopupProps {
  visible: boolean;
  onClose: () => void;
  entry: Entry | null;
}

export function NutritionReasoningPopup({
  visible,
  onClose,
  entry,
}: NutritionReasoningPopupProps) {
  if (!entry) return null;

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={handleClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Nutrition Details</Text>
              <TouchableOpacity
                onPress={handleClose}
                style={styles.closeButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color="#007AFF" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.content}>
              {/* Original Input */}
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Input</Text>
                <Text style={styles.inputText}>{entry.rawText}</Text>
              </View>

              {/* Items */}
              {entry.items.map((item, index) => (
                <View key={item.id || index} style={styles.itemCard}>
                  {/* Item Header */}
                  <View style={styles.itemHeader}>
                    <Text style={styles.itemLabel}>{item.label}</Text>
                    <View style={styles.confidenceBadge}>
                      <Text style={styles.confidenceText}>
                        {Math.round(item.confidence * 100)}%
                      </Text>
                    </View>
                  </View>

                  {/* Macros */}
                  <View style={styles.macrosRow}>
                    <MacroItem label="Cal" value={item.macros.kcal} unit="" />
                    <MacroItem
                      label="P"
                      value={item.macros.protein}
                      unit="g"
                    />
                    <MacroItem label="F" value={item.macros.fat} unit="g" />
                    <MacroItem label="C" value={item.macros.carbs} unit="g" />
                  </View>

                  {/* Portion */}
                  <Text style={styles.portionText}>
                    {item.qty} {item.unit}
                  </Text>

                  {/* Reasoning Section */}
                  {item.reasoning && (
                    <View style={styles.reasoningSection}>
                      {/* Interpretation */}
                      {item.reasoning.interpretation && (
                        <View style={styles.reasoningRow}>
                          <Ionicons
                            name="bulb-outline"
                            size={16}
                            color="#666"
                          />
                          <Text style={styles.reasoningText}>
                            {item.reasoning.interpretation}
                          </Text>
                        </View>
                      )}

                      {/* Assumptions */}
                      {item.reasoning.assumptions?.length > 0 && (
                        <View style={styles.reasoningRow}>
                          <Ionicons
                            name="information-circle-outline"
                            size={16}
                            color="#666"
                          />
                          <View style={styles.assumptionsList}>
                            {item.reasoning.assumptions.map((assumption, i) => (
                              <Text key={i} style={styles.assumptionText}>
                                {"\u2022"} {assumption}
                              </Text>
                            ))}
                          </View>
                        </View>
                      )}

                      {/* Portion Notes */}
                      {item.reasoning.portionNotes && (
                        <View style={styles.reasoningRow}>
                          <Ionicons
                            name="scale-outline"
                            size={16}
                            color="#666"
                          />
                          <Text style={styles.reasoningText}>
                            {item.reasoning.portionNotes}
                          </Text>
                        </View>
                      )}

                      {/* Data Source */}
                      {item.reasoning.dataSource && (
                        <View style={styles.reasoningRow}>
                          <Ionicons
                            name="library-outline"
                            size={16}
                            color="#666"
                          />
                          <Text style={styles.sourceText}>
                            {item.reasoning.dataSource}
                          </Text>
                        </View>
                      )}

                      {/* Confidence Explanation */}
                      {item.reasoning.confidenceExplanation && (
                        <View style={styles.reasoningRow}>
                          <Ionicons
                            name="checkmark-circle-outline"
                            size={16}
                            color="#666"
                          />
                          <Text style={styles.reasoningText}>
                            {item.reasoning.confidenceExplanation}
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  {/* Source Badge */}
                  <View style={styles.sourceBadge}>
                    <Text style={styles.sourceBadgeText}>{item.source}</Text>
                  </View>
                </View>
              ))}

              {/* Totals */}
              <View style={styles.totalsSection}>
                <Text style={styles.totalsLabel}>Total</Text>
                <Text style={styles.totalsValue}>{entry.inlineKcal} cal</Text>
              </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function MacroItem({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <View style={styles.macroItem}>
      <Text style={styles.macroValue}>
        {Math.round(value)}
        {unit}
      </Text>
      <Text style={styles.macroLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    backgroundColor: "#ffffff",
    borderRadius: 16,
    width: "90%",
    maxWidth: 400,
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E9ECEF",
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000000",
  },
  closeButton: {
    padding: 4,
    borderRadius: 16,
    backgroundColor: "#F0F8FF",
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    color: "#888",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  inputText: {
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
  },
  itemCard: {
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  itemLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    flex: 1,
  },
  confidenceBadge: {
    backgroundColor: "#E3F2FD",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  confidenceText: {
    fontSize: 12,
    color: "#1976D2",
    fontWeight: "600",
  },
  macrosRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
    borderRadius: 8,
  },
  macroItem: {
    alignItems: "center",
  },
  macroValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  macroLabel: {
    fontSize: 11,
    color: "#888",
    marginTop: 2,
  },
  portionText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 12,
  },
  reasoningSection: {
    borderTopWidth: 1,
    borderTopColor: "#E9ECEF",
    paddingTop: 12,
    marginTop: 4,
  },
  reasoningRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
    gap: 8,
  },
  reasoningText: {
    fontSize: 13,
    color: "#555",
    flex: 1,
    lineHeight: 18,
  },
  assumptionsList: {
    flex: 1,
  },
  assumptionText: {
    fontSize: 13,
    color: "#555",
    marginBottom: 2,
  },
  sourceText: {
    fontSize: 13,
    color: "#1976D2",
    flex: 1,
  },
  sourceBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#E8E8E8",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 8,
  },
  sourceBadgeText: {
    fontSize: 10,
    color: "#666",
    fontWeight: "500",
  },
  totalsSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E9ECEF",
    marginTop: 8,
  },
  totalsLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  totalsValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1976D2",
  },
});
