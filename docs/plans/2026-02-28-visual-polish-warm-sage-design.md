# NoteCal Visual Polish — Warm Sage Design

**Date**: 2026-02-28
**Scope**: Visual polish only (no keyboard/scroll refactor)
**Files**: 5 files changed, 0 new files

## Design Tokens (`constants/theme.ts`)

Replace current `Colors`/`Fonts` with a flat token object:

| Token | Value | Replaces |
|-------|-------|----------|
| `background` | `#FAFAF7` | `#fff` everywhere |
| `surface` | `#F4F3EF` | `#fafaf8`, card backgrounds |
| `textPrimary` | `#1C1C1E` | `#333`, `#222`, `#1a1a1a` |
| `textSecondary` | `#8E8E93` | `#666`, `#9E9E9E` |
| `textTertiary` | `#C7C7CC` | `#ccc` placeholders |
| `accent` | `#5F8B6A` | `#0a7ea4` |
| `accentTint` | `#EBF0EC` | `#E0F2F7` |
| `border` | `#E8E7E3` | `#e0e0e0`, `#ddd` |
| `error` | `#C62828` | keep |
| `errorTint` | `#FFEBEE` | keep |
| `macroKcal` | `#FF6B35` | keep |
| `macroProtein` | `#4A90D9` | keep |
| `macroFat` | `#F5A623` | keep |
| `macroCarbs` | `#9B6B9E` | keep |

Shadows:
- `shadowLight`: `{ color: #000, offset: {0,2}, opacity: 0.06, radius: 4 }`
- `shadowMedium`: `{ color: #000, offset: {0,4}, opacity: 0.10, radius: 12 }`

Typography:
- `fontSize.sm`: 12
- `fontSize.body`: 17
- `fontSize.title`: 20

## Changes by File

### `constants/theme.ts`
- Add `Tokens` export with all design tokens
- Keep existing `Colors`/`Fonts` for backward compatibility

### `components/NotesEditor.tsx`
- Import tokens, replace all hardcoded hex values
- Placeholder: dash mode = "Type — to start logging", freeform = "What did you eat today?"
- Badge colors: sage accent instead of teal
- Footer gradient: fade to `#FAFAF7`

### `components/TotalsBar.tsx`
- Import tokens, update bar background to `surface`
- Upgrade shadow to `shadowMedium`
- Add button: `accentTint` bg + `accent` icon color

### `components/ThinkingIndicator.tsx`
- Import tokens, update to sage accent colors

### `app/(tabs)/index.tsx`
- Import tokens, update header/container backgrounds
- Date nav pill: `surface` bg + `border` border
- Remove empty `headerPlaceholder`
- StatusBar background to `background` token

## Non-Goals
- No codebase-wide token migration (other components updated as touched)
- No keyboard/scroll refactor
- No behavior changes — pure visual
