import { Tokens } from "@/constants/theme";
import { Ionicons } from "@expo/vector-icons";
import React, { forwardRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInput as RNTextInput,
  type TextInputProps,
  View,
} from "react-native";

interface Props {
  value: string;
  onChangeText: (v: string) => void;
  onSubmitEditing?: TextInputProps["onSubmitEditing"];
  /**
   * "signup" → `textContentType="newPassword"` triggers iOS's strong-password
   *            generator and Keychain offer-to-save on submit.
   * "signin" → `textContentType="password"` enables Keychain AutoFill.
   */
  mode: "signin" | "signup";
  editable?: boolean;
  error?: string | null;
  placeholder?: string;
  returnKeyType?: TextInputProps["returnKeyType"];
}

export const PasswordField = forwardRef<RNTextInput, Props>(function PasswordField(
  {
    value,
    onChangeText,
    onSubmitEditing,
    mode,
    editable = true,
    error = null,
    placeholder = "Password",
    returnKeyType = "done",
  },
  ref,
) {
  const [show, setShow] = useState(false);

  return (
    <View>
      <View style={[styles.container, error ? styles.containerError : null]}>
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmitEditing}
          editable={editable}
          placeholder={placeholder}
          placeholderTextColor={Tokens.textTertiary}
          secureTextEntry={!show}
          textContentType={mode === "signup" ? "newPassword" : "password"}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          keyboardAppearance="light"
          returnKeyType={returnKeyType}
          style={styles.input}
          accessibilityLabel="Password"
        />
        <Pressable
          onPress={() => setShow((s) => !s)}
          hitSlop={12}
          style={styles.eyeButton}
          accessibilityRole="button"
          accessibilityLabel={show ? "Hide password" : "Show password"}
        >
          <Ionicons
            name={show ? "eye-off-outline" : "eye-outline"}
            size={20}
            color={Tokens.textSecondary}
          />
        </Pressable>
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    height: 56,
    borderRadius: 14,
    backgroundColor: Tokens.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Tokens.border,
    paddingLeft: 16,
    paddingRight: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  containerError: {
    borderColor: Tokens.error,
    borderWidth: 1,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: Tokens.textPrimary,
    letterSpacing: -0.1,
    padding: 0,
    includeFontPadding: false,
  },
  eyeButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    marginTop: 6,
    marginLeft: 4,
    fontSize: 12,
    color: Tokens.error,
    fontWeight: "500",
  },
});
