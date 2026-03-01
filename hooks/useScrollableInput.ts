import { useEffect, useRef } from "react";
import { Keyboard } from "react-native";

/**
 * Tracks keyboard visibility using keyboardWillShow/keyboardWillHide.
 *
 * Returns a ref that is true when the keyboard is up, updated ~250ms
 * earlier than keyboardDidShow/keyboardDidHide.
 *
 * Optionally calls onKeyboardStateChange so the consumer can drive
 * render-dependent logic (e.g. showing/hiding a touch interceptor).
 */
export function useScrollableInput(
  onKeyboardStateChange?: (isUp: boolean) => void,
) {
  const isKeyboardUpRef = useRef(false);

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardWillShow", () => {
      isKeyboardUpRef.current = true;
      onKeyboardStateChange?.(true);
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      isKeyboardUpRef.current = false;
      onKeyboardStateChange?.(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [onKeyboardStateChange]);

  return { isKeyboardUpRef };
}
