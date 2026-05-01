import { Tokens } from "@/constants/theme";
import { GoalsWizard } from "@/components/goals/GoalsWizard";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, View } from "react-native";

export default function OnboardingScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <GoalsWizard
        visible={true}
        existingGoals={null}
        onClose={() => router.replace("/auth")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Tokens.background,
  },
});
