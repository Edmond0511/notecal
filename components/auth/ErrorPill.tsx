import { Tokens } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

interface Props {
  message: string;
}

export function ErrorPill({ message }: Props) {
  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.pill}>
      <Ionicons name="alert-circle" size={16} color={Tokens.error} />
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: Tokens.errorTint,
    borderRadius: 12,
  },
  text: {
    fontSize: 14,
    fontWeight: "500",
    color: Tokens.error,
    flex: 1,
  },
});
