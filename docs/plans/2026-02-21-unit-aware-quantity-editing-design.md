# Unit-Aware Quantity Editing

## Problem

The current "Edit Quantity" popup only exposes a servings multiplier (x1, x2, etc.). Users who want to adjust a food entry to a specific weight (e.g., change 150g chicken to 200g) must mentally calculate the multiplier. Adding unit-aware editing (g, oz, lbs) lets users type real-world quantities directly, and the app handles the math.

## Decisions

- **Client-side conversion only** — no AI re-query. Standard conversion factors (1 oz = 28.3495g, 1 lb = 453.592g).
- **Default to AI's original unit** — if the AI resolved "chicken breast, 150g" as qty=150 unit="g", open the popup with "g" selected and "150" in the input. Fall back to "servings" for non-weight units (piece, cup, etc.).
- **Always show all units** — servings, g, oz, lbs. No context-dependent filtering.
- **Auto-convert on unit switch** — switching from 150g to oz auto-fills ~5.3. User can then adjust.
- **Extend existing popup** — add unit pills to `EditQuantityPopup`, no new component.

## UI Changes

### EditQuantityPopup Layout

Current: header -> input -> hint -> save button.

New: header -> unit pills -> input -> hint -> save button.

### Unit Pills

Horizontal row of 4 tappable pills: `servings | g | oz | lbs`.

- Selected: filled background (#374151), white text
- Unselected: light background (#F3F4F6), gray text
- Pill row sits between the header and the input

### Input Behavior

- Opens with AI's original unit selected and its `qty` value
- If AI unit is not g/oz/lbs (e.g., "piece", "cup", "ml"), default to `servings` with value from `item.servings ?? 1`
- Switching units auto-converts the displayed value
- Decimal pad keyboard, select-on-focus

### Hint Text

- servings: "Nutrients will scale proportionally"
- g/oz/lbs: "Based on {originalQty}{originalUnit} = {originalKcal} kcal"

### Quantity Badge (in item header)

Current: `x1` with pencil icon.

New: show actual quantity + unit when available:
- `150g`, `5.3oz`, `0.33lbs` for weight units
- `x2` for servings mode or non-weight-convertible units

## Conversion Logic

All conversions route through grams as the canonical intermediate.

```
Conversion factors:
  g   -> g:   1
  oz  -> g:   28.3495
  lbs -> g:   453.592
```

### On open

1. Read `item.qty` and `item.unit` from the FoodItem
2. Determine if unit maps to a known weight unit (g, oz, lbs)
3. If yes: compute `originalGrams = qty * conversionFactor[unit]`, select that unit, show qty in input
4. If no: select "servings", show `item.servings ?? 1` in input, store originalGrams = null

### On unit switch

1. Convert current input value to grams: `currentGrams = inputValue * conversionFactor[currentUnit]`
2. Convert grams to new unit: `newValue = currentGrams / conversionFactor[newUnit]`
3. Special case for servings: `newValue = currentGrams / originalGrams`
4. Update input with formatted value

### On save

1. If unit is g/oz/lbs: convert input to grams, compute `scaleFactor = newGrams / originalGrams`
2. If unit is servings: `scaleFactor = inputValue` (direct multiplier, relative to original)
3. Pass to `updateEntryItemQuantity` which scales all macros by the ratio
4. Update `item.qty`, `item.unit`, and `item.servings` to reflect the new values

## Data Model

No schema changes. FoodItem already has `qty: number`, `unit: string`, `servings: number`.

The store's `updateEntryItemQuantity` action already scales macros proportionally. We update it to also accept an optional `newQty` and `newUnit` so the badge and future opens reflect the user's chosen unit.

## Scope

### In scope
- Unit pill selector in EditQuantityPopup
- Auto-conversion between servings/g/oz/lbs
- Updated quantity badge display
- Updated store action to persist qty/unit changes

### Out of scope
- Volume units (ml, cups, fl oz) — future enhancement
- Re-querying AI on unit change
- Context-aware unit filtering
