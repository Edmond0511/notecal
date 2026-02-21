# Phase 1: Code Quality & Architecture Review

## Code Quality Findings

### Critical
1. **`requestAnimationFrame` is an unreliable guard release mechanism** (`DatePagerView.tsx:99-102`): The `isResettingRef` guard is set synchronously but released via RAF (~16ms). When a fast swipe fires `onPageSelected` before RAF fires, the event is silently dropped, leaving the pager stuck on page 0 or 2 with no recovery. This is the root cause of the lock-up bug.

### High
2. **No safety timeout on reset guard** (`DatePagerView.tsx:62,85,93`): If the native `onPageSelected` event is dropped, `isResettingRef` stays `true` forever, permanently blocking all swipes.
3. **`handleDateChange` stale closure** (`index.tsx:172-178`): Captures `currentDate` and `currentDocumentText` in closure. During rapid swipes, saves document to wrong date.
4. **`swipeTriggeredRef` boolean race** (`DatePagerView.tsx:64,94`): A single boolean for per-transition state. Two rapid swipes can cause the second `useEffect` to fire a redundant `setPageWithoutAnimation(1)`.

### Medium
5. **Duplicate date utilities** across `DatePagerView.tsx:11-33` and `index.tsx:87-137`
6. **`makeTextChangeHandler` creates new closures per render** (`DatePagerView.tsx:126-131`)
7. **Index-based keys** (`DatePagerView.tsx:143`) - relies on implicit recycling contract
8. **Dual navigation paths** (`index.tsx:118-137` vs `172-178`) - arrow buttons and swipe use separate code paths
9. **`allEntries` prop causes excessive re-renders** (`index.tsx:484`) - any entry change triggers DatePagerView re-render

### Low
10. Unstable `getDocument` prop reference (`index.tsx:163-169`)
11. Inline style objects recreated per render (`DatePagerView.tsx:134,143`)
12. Missing RAF cleanup on unmount (`DatePagerView.tsx:100-102`)

## Architecture Findings

### Critical
1. **Fundamental design flaw: Native/React state coordination** - The 3-page rolling window requires coordinating native PagerView state, React state, and guard refs. `requestAnimationFrame` cannot reliably know when the native pager has settled. Need scroll-state-gated transitions via `onPageScrollStateChanged`.

### High
2. **`dates` array stale during rapid swipes** (`DatePagerView.tsx:66-69,89`) - `handlePageSelected` reads from memoized `dates` which may lag behind the actual current date during rapid swipes.
3. **`handleDocumentTextChange` stale closure** (`index.tsx:152-160`) - closes over `currentDate`, can incorrectly update parent state.

### Medium
4. **`swipeTriggeredRef` fragility** - Boolean flag for per-transition state is not robust. Should use `lastSwipeDateRef` string comparison.

## Critical Issues for Phase 2 Context

- The RAF-based guard is the root cause of lock-up. Must replace with scroll-state-gated approach.
- Stale closures in `handleDateChange` and `handleDocumentTextChange` risk data integrity.
- The `dates` array staleness compounds the guard issue during rapid navigation.
