# Keyboard Interactive Dismiss Freeze — Investigation Findings

## Problem

When the keyboard is visible and the user slowly swipes down to dismiss it (`keyboardDismissMode="interactive"`), the entire UI freezes. Nothing can be tapped — including elements outside the scroll view (header, settings gear, date navigation). The keyboard remains partially visible at the bottom.

## Root Cause

The freeze is caused by three interacting problems:

### 1. Touch Interceptor Design (NotesEditor.tsx)

A `View` with `StyleSheet.absoluteFill` + `onStartShouldSetResponder={() => true}` inside the `Animated.ScrollView`. When rendered, it unconditionally claims ALL touch events. Even with `isFocused` gating, `onBlur` can fire during the interactive dismiss gesture, causing this view to appear mid-drag and block all interaction.

### 2. Reanimated `Animated.ScrollView` + `keyboardDismissMode="interactive"` Conflict

Reanimated wraps the native UIScrollView and adds its own gesture handling layer. During interactive dismiss, the native gesture recognizer (tracking the keyboard) and Reanimated's scroll handler both compete for the gesture. This causes the gesture system to lock — explaining why EVERYTHING (including the header at zIndex:10 outside the ScrollView) becomes unresponsive.

### 3. `automaticallyAdjustKeyboardInsets` Layout Thrashing

This prop continuously adjusts the ScrollView's `contentInset` during keyboard animation. Combined with Reanimated's scroll handler, this creates conflicting layout updates during the dismiss gesture.

## What Was Tried

### Attempt 1: Switch touch interceptor from `isKeyboardUp` to `isFocused`

Switched the condition gating the touch interceptor from keyboard state to TextInput focus state. Did NOT resolve the bug — the problem is deeper than the touch interceptor's state condition. The Reanimated + interactive dismiss conflict causes a system-level gesture lockup.

## Solution Applied

1. **Removed the touch interceptor entirely** — replaced with a bottom spacer `Pressable` that handles tap-below-text by focusing at end-of-document. The native TextInput handles cursor placement on existing text.

2. **Switched to `keyboardDismissMode="on-drag"`** — dismisses keyboard immediately on scroll. No partial states, no gesture conflicts. This is what most production RN apps use.

3. **Replaced `Animated.ScrollView` with regular `ScrollView`** — removes Reanimated's gesture layer. `scrollOffset` was only read on the JS thread anyway, so no performance benefit was lost.

4. **Removed `automaticallyAdjustKeyboardInsets`** — increased `paddingBottom` to 400 instead. The existing `scrollToKeepCaretVisible` already handles keeping the cursor visible.

5. **Changed `keyboardDidHide` to `keyboardWillHide`** in index.tsx for smoother TotalsBar transition timing with `on-drag` dismiss.

## Community References

- `keyboardDismissMode="interactive"` is known to cause issues with Reanimated ScrollView
- Most production RN apps (Slack, Telegram) use `"on-drag"` for reliability
- React Native GitHub issues document gesture system lockups with interactive dismiss
