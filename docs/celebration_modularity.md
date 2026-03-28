# CelebrationModularity

Modular milestone celebration system for the Stellar Raise crowdfunding dApp.
Provides reusable, accessible, and testable components for surfacing campaign
funding milestones to contributors.

---

## Overview

This module ships three composable React components and a set of pure helper
functions. All pieces are independently importable and unit-testable.

```
MilestoneCelebration          ← main orchestrator
  ├── MilestoneProgressBar    ← reusable progress bar with tick marks
  └── MilestoneBadge          ← reusable per-milestone status badge
```

---

## Components

### MilestoneCelebration

The top-level component. Scans the `milestones` array for the first entry with
`status === "reached"` and renders a celebration panel. When no milestone is
reached it renders only the progress bar and badge list.

```tsx
import MilestoneCelebration from "../components/celebration_modularity";

<MilestoneCelebration
  milestones={milestones}
  currentPercent={fundingPercent}
  campaignName="Solar Farm Initiative"
  autoDismissMs={5000}
  onDismiss={() => markCelebrated(milestoneId)}
  onMilestoneReach={(m) => console.log("reached", m.label)}
/>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `milestones` | `Milestone[]` | — | Array of milestone definitions (required) |
| `currentPercent` | `number` | — | Current funding percentage 0–100 (required, clamped internally) |
| `campaignName` | `string` | `undefined` | Optional campaign name shown in the celebration header |
| `autoDismissMs` | `number` | `5000` | Auto-dismiss delay in ms. `0` disables auto-dismiss |
| `onDismiss` | `() => void` | `undefined` | Fired when the celebration is dismissed (user or auto) |
| `onMilestoneReach` | `(m: Milestone) => void` | `undefined` | Fired when a new `"reached"` milestone is detected |
| `showProgressBar` | `boolean` | `true` | Whether to render the progress bar |
| `className` | `string` | `undefined` | Additional CSS class on the root element |
| `id` | `string` | `undefined` | HTML `id` on the root element |

---

### MilestoneProgressBar

Standalone progress bar with milestone tick marks.

```tsx
import { MilestoneProgressBar } from "../components/celebration_modularity";

<MilestoneProgressBar
  currentPercent={fundingPercent}
  milestones={milestones}
  ariaLabel="Solar Farm funding progress"
/>
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `currentPercent` | `number` | — | Current funding percentage (required, clamped) |
| `milestones` | `Milestone[]` | — | Milestones to render as tick marks (required) |
| `ariaLabel` | `string` | `"Campaign funding progress"` | Accessible label for the progress bar |

---

### MilestoneBadge

Standalone badge for a single milestone.

```tsx
import { MilestoneBadge } from "../components/celebration_modularity";

<MilestoneBadge milestone={milestone} isActive={milestone.id === activeMilestoneId} />
```

#### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `milestone` | `Milestone` | — | The milestone to display (required) |
| `isActive` | `boolean` | `false` | Highlights the badge with a green ring |

---

## Types

### Milestone

```ts
interface Milestone {
  id: string;
  label: string;
  targetPercent: number;   // 0–100
  status: MilestoneStatus;
  reachedAt?: number;      // Unix timestamp (seconds)
}
```

### MilestoneStatus

```ts
type MilestoneStatus = "pending" | "reached" | "celebrated" | "failed";
```

| Status | Meaning |
|--------|---------|
| `pending` | Milestone not yet reached |
| `reached` | Just reached — triggers celebration panel |
| `celebrated` | Celebration acknowledged / dismissed |
| `failed` | Campaign ended without reaching this milestone |

---

## Exported helpers

All pure functions are exported for independent unit testing.

| Function | Purpose |
|----------|---------|
| `clampPercent(value)` | Clamps a number to `[0, 100]`; returns `0` for non-finite values |
| `normalizeCelebrationString(candidate, fallback, maxLength?)` | Strips control chars, normalizes whitespace, truncates to `maxLength` |
| `isValidMilestoneStatus(value)` | Type guard — returns `true` for valid `MilestoneStatus` values |
| `resolveMilestoneStatus(value)` | Returns a safe status, falling back to `"pending"` |
| `getActiveCelebration(milestones)` | Returns the first `"reached"` milestone or `null` |
| `getMilestonesForPercent(milestones, percent)` | Returns `"pending"` milestones whose `targetPercent` ≤ `percent` |
| `formatMilestonePercent(value)` | Formats a clamped percent as `"42%"` |
| `buildCelebrationAriaLabel(milestone, campaignName?)` | Builds the accessible label for the celebration container |

---

## Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `DEFAULT_AUTO_DISMISS_MS` | `5000` | Default auto-dismiss delay |
| `MAX_CAMPAIGN_NAME_LENGTH` | `60` | Max chars for campaign name display |
| `MAX_MILESTONE_LABEL_LENGTH` | `80` | Max chars for milestone label display |
| `MILESTONE_ICONS` | `Record<MilestoneStatus, string>` | Emoji per status |
| `MILESTONE_STATUS_LABELS` | `Record<MilestoneStatus, string>` | Accessible text per status |

---

## Usage examples

### Basic — no auto-dismiss

```tsx
<MilestoneCelebration
  milestones={[
    { id: "m1", label: "25% Funded", targetPercent: 25, status: "pending" },
    { id: "m2", label: "50% Funded", targetPercent: 50, status: "reached" },
    { id: "m3", label: "100% Funded", targetPercent: 100, status: "pending" },
  ]}
  currentPercent={52}
  autoDismissMs={0}
/>
```

### With campaign name and callbacks

```tsx
<MilestoneCelebration
  milestones={milestones}
  currentPercent={fundingPercent}
  campaignName="Solar Farm Initiative"
  autoDismissMs={6000}
  onDismiss={() => updateMilestoneStatus(reachedId, "celebrated")}
  onMilestoneReach={(m) => trackEvent("milestone_reached", { id: m.id })}
/>
```

### Progress bar only

```tsx
<MilestoneProgressBar
  currentPercent={fundingPercent}
  milestones={milestones}
/>
```

### Badge list only

```tsx
{milestones.map((m) => (
  <MilestoneBadge key={m.id} milestone={m} />
))}
```

---

## Security assumptions

| Concern | Mitigation |
|---------|-----------|
| XSS via user-supplied strings | All strings (labels, campaign name) are rendered as React text nodes — no `dangerouslySetInnerHTML` |
| Layout abuse via long strings | `normalizeCelebrationString` truncates to `maxLength` with ellipsis |
| Layout abuse via out-of-range percent | `clampPercent` enforces `[0, 100]` before any CSS width is computed |
| Dynamic CSS injection | All inline style values are compile-time constants; no user input reaches CSS properties |
| Memory leaks from timers | Auto-dismiss `setTimeout` ref is always cleared on unmount and on milestone change |
| State updates on unmounted components | Timer ref cleanup in `useEffect` return function prevents this |

---

## Accessibility

- `role="status"` + `aria-live="polite"` on the celebration panel — announces milestone updates without interrupting the user (WCAG 2.1 SC 4.1.3).
- `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax` on the progress bar (WCAG 2.1 SC 4.1.2).
- `aria-label` on the dismiss button (WCAG 2.1 SC 1.1.1).
- `aria-label` on each milestone tick mark describing its label and status.
- `aria-hidden="true"` on all decorative emoji icons.
- All interactive elements meet the 44 × 44 px minimum touch target (WCAG 2.5.5).

---

## Tests

```
frontend/components/celebration_modularity.test.tsx
```

16 describe blocks, 80+ tests covering:

- `clampPercent` — range, NaN, Infinity, decimals
- `normalizeCelebrationString` — non-strings, whitespace, control chars, truncation, XSS
- `isValidMilestoneStatus` / `resolveMilestoneStatus` — valid, invalid, fallback
- `getActiveCelebration` — found, not found, empty, non-array
- `getMilestonesForPercent` — filtering, clamping, non-pending exclusion
- `formatMilestonePercent` — rounding, clamping
- `buildCelebrationAriaLabel` — with/without campaign name, sanitization
- Constants — presence and type checks
- `MilestoneProgressBar` — rendering, aria attributes, ticks, labels
- `MilestoneBadge` — rendering, status variants, active state, sanitization
- `MilestoneCelebration` — panel visibility, dismiss, auto-dismiss, callbacks, edge cases, XSS

Target: ≥ 95% statement, branch, function, and line coverage.
