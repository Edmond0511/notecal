import { Tokens } from "@/constants/theme";
import React, { forwardRef } from "react";
import {
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
  autoFocus?: boolean;
  editable?: boolean;
  /** When true, the field is rendered with a red ring and the message below. */
  error?: string | null;
  /** Override the default "Email" placeholder. */
  placeholder?: string;
  returnKeyType?: TextInputProps["returnKeyType"];
}

export const EmailField = forwardRef<RNTextInput, Props>(function EmailField(
  {
    value,
    onChangeText,
    onSubmitEditing,
    autoFocus = false,
    editable = true,
    error = null,
    placeholder = "Email",
    returnKeyType = "next",
  },
  ref,
) {
  return (
    <View>
      <View style={[styles.container, error ? styles.containerError : null]}>
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          onSubmitEditing={onSubmitEditing}
          autoFocus={autoFocus}
          editable={editable}
          placeholder={placeholder}
          placeholderTextColor={Tokens.textTertiary}
          textContentType="emailAddress"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          keyboardAppearance="light"
          returnKeyType={returnKeyType}
          style={styles.input}
          accessibilityLabel="Email"
        />
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
    paddingHorizontal: 16,
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
  errorText: {
    marginTop: 6,
    marginLeft: 4,
    fontSize: 12,
    color: Tokens.error,
    fontWeight: "500",
  },
});
