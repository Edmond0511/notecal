# SavedEntriesPopup Liquid Glass Redesign

**Date**: 2026-03-06
**Component**: `components/SavedEntriesPopup.tsx`

## Goal

Redesign the SavedEntriesPopup to use iOS 26-style liquid glass aesthetics with a rounded pill search bar.

## Changes

### Search Bar
- Pill shape: `borderRadius: 22` (for 44px height)
- Wrap in `BlurView` from `expo-blur` with `intensity={40}` and `tint="light"`
- Background: `rgba(255, 255, 255, 0.6)` over the blur
- Border: `1px solid rgba(255, 255, 255, 0.8)` for the glass edge highlight
- Overflow hidden on the blur container to clip to pill shape

### Entry Cards
- Wrap card content in `BlurView` with `intensity={30}`, `tint="light"`
- Background overlay: `rgba(255, 255, 255, 0.55)`
- Border: `1px solid rgba(255, 255, 255, 0.7)`
- Remove existing box shadows (shadows conflict with glass aesthetic)
- Keep `borderRadius: 16`

### Unchanged
- Header structure (back button, title, count badge)
- Background color (`#f8f8f8`)
- Macro icons row layout and colors
- Swipe-to-delete behavior
- Pan gesture dismiss
- Empty states

## Technical
- `expo-blur` already installed (`~15.0.8`)
- `BlurView` uses native `UIVisualEffectView` on iOS — performant
- `overflow: 'hidden'` on BlurView containers to clip rounded corners
