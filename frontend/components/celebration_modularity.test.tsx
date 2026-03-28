/**
 * @file celebration_modularity.test.tsx
 * @title Test Suite – MilestoneCelebration
 *
 * @notice Comprehensive unit tests for the milestone celebration modularity module.
 *
 * @dev Coverage targets (≥ 95%):
 *   - Pure helpers: clampPercent, normalizeCelebrationString, isValidMilestoneStatus,
 *     resolveMilestoneStatus, getActiveCelebration, getMilestonesForPercent,
 *     formatMilestonePercent, buildCelebrationAriaLabel
 *   - MilestoneProgressBar: rendering, aria attributes, tick marks, fill width
 *   - MilestoneBadge: rendering, status variants, active state, sanitization
 *   - MilestoneCelebration: celebration panel, dismiss, auto-dismiss, callbacks,
 *     progress bar toggle, milestone list, edge cases
 *
 * @custom:security-notes
 *   - XSS tests confirm user-supplied strings are rendered as text nodes only.
 *   - Clamping tests confirm out-of-range values cannot produce invalid CSS widths.
 *   - Control-character stripping tests confirm label sanitization is effective.
 *
 * @custom:test-output
 *   Run: `npm test -- --testPathPattern=celebration_modularity --coverage`
 *   Expected: all tests pass, ≥ 95% statement/branch/function/line coverage.
 */

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import MilestoneCelebration, {
  MilestoneProgressBar,
  MilestoneBadge,
  clampPercent,
  normalizeCelebrationString,
  isValidMilestoneStatus,
  resolveMilestoneStatus,
  getActiveCelebration,
  getMilestonesForPercent,
  formatMilestonePercent,
  buildCelebrationAriaLabel,
  DEFAULT_AUTO_DISMISS_MS,
  MAX_CAMPAIGN_NAME_LENGTH,
  MAX_MILESTONE_LABEL_LENGTH,
  MILESTONE_ICONS,
  MILESTONE_STATUS_LABELS,
  type Milestone,
  type MilestoneCelebrationProps,
} from "./celebration_modularity";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeMilestone = (overrides: Partial<Milestone> = {}): Milestone => ({
  id: "m1",
  label: "25% Funded",
  targetPercent: 25,
  status: "pending",
  ...overrides,
});

const MILESTONES: Milestone[] = [
  makeMilestone({ id: "m1", label: "25% Funded", targetPercent: 25, status: "pending" }),
  makeMilestone({ id: "m2", label: "50% Funded", targetPercent: 50, status: "pending" }),
  makeMilestone({ id: "m3", label: "75% Funded", targetPercent: 75, status: "pending" }),
  makeMilestone({ id: "m4", label: "100% Funded", targetPercent: 100, status: "pending" }),
];

function renderCelebration(props: Partial<MilestoneCelebrationProps> = {}) {
  return render(
    <MilestoneCelebration
      milestones={MILESTONES}
      currentPercent={0}
      autoDismissMs={0}
      {...props}
    />,
  );
}

// ── 1. clampPercent ───────────────────────────────────────────────────────────

describe("1. clampPercent", () => {
  it("1.1 returns 0 for negative values", () => {
    expect(clampPercent(-1)).toBe(0);
    expect(clampPercent(-999)).toBe(0);
  });

  it("1.2 returns 100 for values above 100", () => {
    expect(clampPercent(101)).toBe(100);
    expect(clampPercent(9999)).toBe(100);
  });

  it("1.3 returns the value unchanged when in range", () => {
    expect(clampPercent(0)).toBe(0);
    expect(clampPercent(50)).toBe(50);
    expect(clampPercent(100)).toBe(100);
  });

  it("1.4 returns 0 for NaN", () => {
    expect(clampPercent(NaN)).toBe(0);
  });

  it("1.5 returns 0 for Infinity", () => {
    expect(clampPercent(Infinity)).toBe(0);
    expect(clampPercent(-Infinity)).toBe(0);
  });

  it("1.6 handles decimal values correctly", () => {
    expect(clampPercent(33.5)).toBeCloseTo(33.5);
    expect(clampPercent(99.9)).toBeCloseTo(99.9);
  });
});

// ── 2. normalizeCelebrationString ─────────────────────────────────────────────

describe("2. normalizeCelebrationString", () => {
  it("2.1 returns fallback for non-string values", () => {
    expect(normalizeCelebrationString(undefined, "Fallback")).toBe("Fallback");
    expect(normalizeCelebrationString(null, "Fallback")).toBe("Fallback");
    expect(normalizeCelebrationString(42, "Fallback")).toBe("Fallback");
    expect(normalizeCelebrationString({}, "Fallback")).toBe("Fallback");
    expect(normalizeCelebrationString(true, "Fallback")).toBe("Fallback");
  });

  it("2.2 returns fallback for empty or whitespace-only strings", () => {
    expect(normalizeCelebrationString("", "Fallback")).toBe("Fallback");
    expect(normalizeCelebrationString("   ", "Fallback")).toBe("Fallback");
    expect(normalizeCelebrationString("\n\t", "Fallback")).toBe("Fallback");
  });

  it("2.3 strips control characters", () => {
    expect(normalizeCelebrationString("Hello\u0000World", "F")).toBe("Hello World");
    expect(normalizeCelebrationString("A\u001FB", "F")).toBe("A B");
    expect(normalizeCelebrationString("A\u007FB", "F")).toBe("A B");
  });

  it("2.4 normalizes multiple whitespace to single space", () => {
    expect(normalizeCelebrationString("Hello   World", "F")).toBe("Hello World");
    expect(normalizeCelebrationString("A\n\nB", "F")).toBe("A B");
  });

  it("2.5 returns string unchanged when within maxLength", () => {
    const s = "A".repeat(80);
    expect(normalizeCelebrationString(s, "F")).toBe(s);
  });

  it("2.6 truncates strings exceeding maxLength with ellipsis", () => {
    const long = "A".repeat(200);
    const result = normalizeCelebrationString(long, "F");
    expect(result).toHaveLength(80);
    expect(result.endsWith("...")).toBe(true);
  });

  it("2.7 respects custom maxLength parameter", () => {
    const result = normalizeCelebrationString("Hello World", "F", 5);
    expect(result).toHaveLength(5);
    expect(result.endsWith("...")).toBe(true);
  });

  it("2.8 XSS: renders markup-like text as plain string (not HTML)", () => {
    const xss = "<script>alert(1)</script>";
    expect(normalizeCelebrationString(xss, "F")).toBe(xss);
  });
});

// ── 3. isValidMilestoneStatus ─────────────────────────────────────────────────

describe("3. isValidMilestoneStatus", () => {
  it("3.1 returns true for all valid statuses", () => {
    expect(isValidMilestoneStatus("pending")).toBe(true);
    expect(isValidMilestoneStatus("reached")).toBe(true);
    expect(isValidMilestoneStatus("celebrated")).toBe(true);
    expect(isValidMilestoneStatus("failed")).toBe(true);
  });

  it("3.2 returns false for invalid values", () => {
    expect(isValidMilestoneStatus("unknown")).toBe(false);
    expect(isValidMilestoneStatus("")).toBe(false);
    expect(isValidMilestoneStatus(null)).toBe(false);
    expect(isValidMilestoneStatus(undefined)).toBe(false);
    expect(isValidMilestoneStatus(42)).toBe(false);
    expect(isValidMilestoneStatus({})).toBe(false);
  });
});

// ── 4. resolveMilestoneStatus ─────────────────────────────────────────────────

describe("4. resolveMilestoneStatus", () => {
  it("4.1 returns the value for valid statuses", () => {
    expect(resolveMilestoneStatus("pending")).toBe("pending");
    expect(resolveMilestoneStatus("reached")).toBe("reached");
    expect(resolveMilestoneStatus("celebrated")).toBe("celebrated");
    expect(resolveMilestoneStatus("failed")).toBe("failed");
  });

  it("4.2 falls back to 'pending' for invalid inputs", () => {
    expect(resolveMilestoneStatus("bogus")).toBe("pending");
    expect(resolveMilestoneStatus(null)).toBe("pending");
    expect(resolveMilestoneStatus(undefined)).toBe("pending");
    expect(resolveMilestoneStatus(0)).toBe("pending");
  });
});

// ── 5. getActiveCelebration ───────────────────────────────────────────────────

describe("5. getActiveCelebration", () => {
  it("5.1 returns null when no milestone has status 'reached'", () => {
    expect(getActiveCelebration(MILESTONES)).toBeNull();
  });

  it("5.2 returns the first 'reached' milestone", () => {
    const ms: Milestone[] = [
      makeMilestone({ id: "a", status: "celebrated" }),
      makeMilestone({ id: "b", status: "reached" }),
      makeMilestone({ id: "c", status: "reached" }),
    ];
    expect(getActiveCelebration(ms)?.id).toBe("b");
  });

  it("5.3 returns null for an empty array", () => {
    expect(getActiveCelebration([])).toBeNull();
  });

  it("5.4 returns null for non-array input", () => {
    expect(getActiveCelebration(null as any)).toBeNull();
    expect(getActiveCelebration(undefined as any)).toBeNull();
  });

  it("5.5 returns null when all milestones are 'pending'", () => {
    const ms = MILESTONES.map((m) => ({ ...m, status: "pending" as const }));
    expect(getActiveCelebration(ms)).toBeNull();
  });
});

// ── 6. getMilestonesForPercent ────────────────────────────────────────────────

describe("6. getMilestonesForPercent", () => {
  it("6.1 returns milestones whose targetPercent ≤ currentPercent and status is pending", () => {
    const result = getMilestonesForPercent(MILESTONES, 50);
    expect(result.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("6.2 returns empty array when currentPercent is 0", () => {
    expect(getMilestonesForPercent(MILESTONES, 0)).toHaveLength(0);
  });

  it("6.3 returns all pending milestones when currentPercent is 100", () => {
    expect(getMilestonesForPercent(MILESTONES, 100)).toHaveLength(4);
  });

  it("6.4 excludes non-pending milestones even if targetPercent is met", () => {
    const ms: Milestone[] = [
      makeMilestone({ id: "a", targetPercent: 25, status: "celebrated" }),
      makeMilestone({ id: "b", targetPercent: 25, status: "pending" }),
    ];
    const result = getMilestonesForPercent(ms, 50);
    expect(result.map((m) => m.id)).toEqual(["b"]);
  });

  it("6.5 clamps currentPercent before comparison", () => {
    expect(getMilestonesForPercent(MILESTONES, -10)).toHaveLength(0);
    expect(getMilestonesForPercent(MILESTONES, 200)).toHaveLength(4);
  });

  it("6.6 returns empty array for non-array input", () => {
    expect(getMilestonesForPercent(null as any, 50)).toEqual([]);
  });
});

// ── 7. formatMilestonePercent ─────────────────────────────────────────────────

describe("7. formatMilestonePercent", () => {
  it("7.1 formats whole numbers correctly", () => {
    expect(formatMilestonePercent(0)).toBe("0%");
    expect(formatMilestonePercent(50)).toBe("50%");
    expect(formatMilestonePercent(100)).toBe("100%");
  });

  it("7.2 rounds decimals", () => {
    expect(formatMilestonePercent(33.4)).toBe("33%");
    expect(formatMilestonePercent(33.6)).toBe("34%");
  });

  it("7.3 clamps out-of-range values", () => {
    expect(formatMilestonePercent(-5)).toBe("0%");
    expect(formatMilestonePercent(150)).toBe("100%");
  });
});

// ── 8. buildCelebrationAriaLabel ─────────────────────────────────────────────

describe("8. buildCelebrationAriaLabel", () => {
  it("8.1 includes milestone label and campaign name when both provided", () => {
    const m = makeMilestone({ label: "50% Funded" });
    const result = buildCelebrationAriaLabel(m, "My Campaign");
    expect(result).toBe("Milestone reached: 50% Funded for campaign My Campaign");
  });

  it("8.2 omits campaign name when not provided", () => {
    const m = makeMilestone({ label: "50% Funded" });
    const result = buildCelebrationAriaLabel(m);
    expect(result).toBe("Milestone reached: 50% Funded");
  });

  it("8.3 uses fallback label when milestone label is empty", () => {
    const m = makeMilestone({ label: "" });
    const result = buildCelebrationAriaLabel(m);
    expect(result).toBe("Milestone reached: Milestone");
  });

  it("8.4 sanitizes campaign name", () => {
    const m = makeMilestone({ label: "25% Funded" });
    const result = buildCelebrationAriaLabel(m, "Campaign\u0000Name");
    expect(result).toContain("Campaign Name");
  });
});

// ── 9. MILESTONE_ICONS and MILESTONE_STATUS_LABELS constants ─────────────────

describe("9. Constants", () => {
  it("9.1 MILESTONE_ICONS has an entry for every status", () => {
    const statuses = ["pending", "reached", "celebrated", "failed"] as const;
    statuses.forEach((s) => {
      expect(typeof MILESTONE_ICONS[s]).toBe("string");
      expect(MILESTONE_ICONS[s].length).toBeGreaterThan(0);
    });
  });

  it("9.2 MILESTONE_STATUS_LABELS has an entry for every status", () => {
    const statuses = ["pending", "reached", "celebrated", "failed"] as const;
    statuses.forEach((s) => {
      expect(typeof MILESTONE_STATUS_LABELS[s]).toBe("string");
      expect(MILESTONE_STATUS_LABELS[s].length).toBeGreaterThan(0);
    });
  });

  it("9.3 DEFAULT_AUTO_DISMISS_MS is a positive number", () => {
    expect(DEFAULT_AUTO_DISMISS_MS).toBeGreaterThan(0);
  });

  it("9.4 MAX_CAMPAIGN_NAME_LENGTH is a positive number", () => {
    expect(MAX_CAMPAIGN_NAME_LENGTH).toBeGreaterThan(0);
  });

  it("9.5 MAX_MILESTONE_LABEL_LENGTH is a positive number", () => {
    expect(MAX_MILESTONE_LABEL_LENGTH).toBeGreaterThan(0);
  });
});

// ── 10. MilestoneProgressBar ──────────────────────────────────────────────────

describe("10. MilestoneProgressBar", () => {
  it("10.1 renders the progress track", () => {
    render(<MilestoneProgressBar currentPercent={50} milestones={[]} />);
    expect(screen.getByTestId("milestone-progress-track")).toBeTruthy();
  });

  it("10.2 renders the fill element", () => {
    render(<MilestoneProgressBar currentPercent={50} milestones={[]} />);
    expect(screen.getByTestId("milestone-progress-fill")).toBeTruthy();
  });

  it("10.3 sets aria-valuenow to clamped percent", () => {
    render(<MilestoneProgressBar currentPercent={75} milestones={[]} />);
    const track = screen.getByTestId("milestone-progress-track");
    expect(track).toHaveAttribute("aria-valuenow", "75");
  });

  it("10.4 sets aria-valuemin to 0 and aria-valuemax to 100", () => {
    render(<MilestoneProgressBar currentPercent={50} milestones={[]} />);
    const track = screen.getByTestId("milestone-progress-track");
    expect(track).toHaveAttribute("aria-valuemin", "0");
    expect(track).toHaveAttribute("aria-valuemax", "100");
  });

  it("10.5 clamps aria-valuenow for out-of-range values", () => {
    render(<MilestoneProgressBar currentPercent={-20} milestones={[]} />);
    expect(screen.getByTestId("milestone-progress-track")).toHaveAttribute("aria-valuenow", "0");

    render(<MilestoneProgressBar currentPercent={200} milestones={[]} />);
    const tracks = screen.getAllByTestId("milestone-progress-track");
    expect(tracks[tracks.length - 1]).toHaveAttribute("aria-valuenow", "100");
  });

  it("10.6 renders a tick for each milestone", () => {
    const ms = [
      makeMilestone({ id: "a", targetPercent: 25 }),
      makeMilestone({ id: "b", targetPercent: 50 }),
    ];
    render(<MilestoneProgressBar currentPercent={60} milestones={ms} />);
    expect(screen.getByTestId("milestone-tick-a")).toBeTruthy();
    expect(screen.getByTestId("milestone-tick-b")).toBeTruthy();
  });

  it("10.7 renders no ticks when milestones array is empty", () => {
    const { container } = render(
      <MilestoneProgressBar currentPercent={50} milestones={[]} />,
    );
    expect(container.querySelectorAll("[data-testid^='milestone-tick-']")).toHaveLength(0);
  });

  it("10.8 uses custom ariaLabel when provided", () => {
    render(
      <MilestoneProgressBar
        currentPercent={50}
        milestones={[]}
        ariaLabel="My custom label"
      />,
    );
    expect(screen.getByTestId("milestone-progress-track")).toHaveAttribute(
      "aria-label",
      "My custom label",
    );
  });

  it("10.9 shows percentage label in the labels row", () => {
    render(<MilestoneProgressBar currentPercent={42} milestones={[]} />);
    expect(screen.getByText("42%")).toBeTruthy();
  });

  it("10.10 shows 0% and 100% boundary labels", () => {
    render(<MilestoneProgressBar currentPercent={50} milestones={[]} />);
    expect(screen.getByText("0%")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
  });
});

// ── 11. MilestoneBadge ────────────────────────────────────────────────────────

describe("11. MilestoneBadge", () => {
  it("11.1 renders the badge with correct testid", () => {
    render(<MilestoneBadge milestone={makeMilestone({ id: "x1" })} />);
    expect(screen.getByTestId("milestone-badge-x1")).toBeTruthy();
  });

  it("11.2 renders the milestone label", () => {
    render(<MilestoneBadge milestone={makeMilestone({ label: "Half Way" })} />);
    expect(screen.getByText("Half Way")).toBeTruthy();
  });

  it("11.3 renders the formatted target percent", () => {
    render(<MilestoneBadge milestone={makeMilestone({ targetPercent: 50 })} />);
    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("11.4 renders the status label", () => {
    render(<MilestoneBadge milestone={makeMilestone({ status: "reached" })} />);
    expect(screen.getByText("Reached")).toBeTruthy();
  });

  it("11.5 sets data-status attribute correctly", () => {
    render(<MilestoneBadge milestone={makeMilestone({ id: "s1", status: "failed" })} />);
    expect(screen.getByTestId("milestone-badge-s1")).toHaveAttribute("data-status", "failed");
  });

  it("11.6 sanitizes label with control characters", () => {
    render(<MilestoneBadge milestone={makeMilestone({ label: "Bad\u0000Label" })} />);
    expect(screen.getByText("Bad Label")).toBeTruthy();
  });

  it("11.7 falls back to 'Milestone' for empty label", () => {
    render(<MilestoneBadge milestone={makeMilestone({ label: "" })} />);
    expect(screen.getByText("Milestone")).toBeTruthy();
  });

  it("11.8 applies active styling when isActive is true", () => {
    render(
      <MilestoneBadge milestone={makeMilestone({ id: "act" })} isActive={true} />,
    );
    const badge = screen.getByTestId("milestone-badge-act");
    expect(badge).toHaveStyle({ boxShadow: "0 0 0 2px #00C853" });
  });

  it("11.9 does not apply active styling when isActive is false", () => {
    render(
      <MilestoneBadge milestone={makeMilestone({ id: "inact" })} isActive={false} />,
    );
    const badge = screen.getByTestId("milestone-badge-inact");
    expect(badge).not.toHaveStyle({ boxShadow: "0 0 0 2px #00C853" });
  });

  it("11.10 resolves invalid status to 'pending'", () => {
    const m = makeMilestone({ id: "inv", status: "bogus" as any });
    render(<MilestoneBadge milestone={m} />);
    expect(screen.getByTestId("milestone-badge-inv")).toHaveAttribute("data-status", "pending");
  });
});

// ── 12. MilestoneCelebration – rendering ──────────────────────────────────────

describe("12. MilestoneCelebration – rendering", () => {
  it("12.1 renders the root element", () => {
    renderCelebration();
    expect(screen.getByTestId("milestone-celebration-root")).toBeTruthy();
  });

  it("12.2 renders the milestone list when milestones are provided", () => {
    renderCelebration();
    expect(screen.getByTestId("milestone-list")).toBeTruthy();
  });

  it("12.3 renders a badge for each milestone", () => {
    renderCelebration();
    MILESTONES.forEach((m) => {
      expect(screen.getByTestId(`milestone-badge-${m.id}`)).toBeTruthy();
    });
  });

  it("12.4 renders the progress bar by default", () => {
    renderCelebration();
    expect(screen.getByTestId("milestone-progress-track")).toBeTruthy();
  });

  it("12.5 hides the progress bar when showProgressBar is false", () => {
    renderCelebration({ showProgressBar: false });
    expect(screen.queryByTestId("milestone-progress-track")).toBeNull();
  });

  it("12.6 does not render the celebration panel when no milestone is 'reached'", () => {
    renderCelebration();
    expect(screen.queryByTestId("celebration-panel")).toBeNull();
  });

  it("12.7 renders the celebration panel when a milestone is 'reached'", () => {
    const ms = [makeMilestone({ id: "r1", status: "reached" })];
    renderCelebration({ milestones: ms });
    expect(screen.getByTestId("celebration-panel")).toBeTruthy();
  });

  it("12.8 shows 'Milestone Reached!' heading in the celebration panel", () => {
    const ms = [makeMilestone({ id: "r1", status: "reached" })] ;
    renderCelebration({ milestones: ms });
    expect(screen.getByText("Milestone Reached!")).toBeTruthy();
  });

  it("12.9 shows the milestone label in the celebration panel", () => {
    const ms = [makeMilestone({ id: "r1", label: "Half Way There", status: "reached" })];
    renderCelebration({ milestones: ms });
    expect(screen.getByText("Half Way There")).toBeTruthy();
  });

  it("12.10 shows the campaign name when provided", () => {
    const ms = [makeMilestone({ id: "r1", status: "reached" })];
    renderCelebration({ milestones: ms, campaignName: "Solar Farm" });
    expect(screen.getByText("Solar Farm")).toBeTruthy();
  });

  it("12.11 does not show campaign name when not provided", () => {
    const ms = [makeMilestone({ id: "r1", status: "reached" })];
    renderCelebration({ milestones: ms });
    expect(screen.queryByText("Solar Farm")).toBeNull();
  });

  it("12.12 applies custom id and className to root", () => {
    renderCelebration({ id: "my-id", className: "my-class" });
    const root = screen.getByTestId("milestone-celebration-root");
    expect(root).toHaveAttribute("id", "my-id");
    expect(root).toHaveClass("my-class");
  });

  it("12.13 renders no milestone list when milestones array is empty", () => {
    renderCelebration({ milestones: [] });
    expect(screen.queryByTestId("milestone-list")).toBeNull();
  });

  it("12.14 celebration panel has role='status' and aria-live='polite'", () => {
    const ms = [makeMilestone({ id: "r1", status: "reached" })];
    renderCelebration({ milestones: ms });
    const panel = screen.getByTestId("celebration-panel");
    expect(panel).toHaveAttribute("role", "status");
    expect(panel).toHaveAttribute("aria-live", "polite");
  });

  it("12.15 celebration panel aria-label includes milestone label", () => {
    const ms = [makeMilestone({ id: "r1", label: "25% Funded", status: "reached" })];
    renderCelebration({ milestones: ms });
    const panel = screen.getByTestId("celebration-panel");
    expect(panel.getAttribute("aria-label")).toContain("25% Funded");
  });
});

// ── 13. MilestoneCelebration – dismiss ────────────────────────────────────────

describe("13. MilestoneCelebration – dismiss", () => {
  it("13.1 renders the dismiss button in the celebration panel", () => {
    const ms = [makeMilestone({ id: "r1", status: "reached" })];
    renderCelebration({ milestones: ms });
    expect(screen.getByTestId("dismiss-button")).toBeTruthy();
  });

  it("13.2 dismiss button has correct aria-label", () => {
    const ms = [makeMilestone({ id: "r1", status: "reached" })];
    renderCelebration({ milestones: ms });
    expect(screen.getByTestId("dismiss-button")).toHaveAttribute(
      "aria-label",
      "Dismiss milestone celebration",
    );
  });

  it("13.3 clicking dismiss hides the celebration panel", () => {
    const ms = [makeMilestone({ id: "r1", status: "reached" })];
    renderCelebration({ milestones: ms });
    fireEvent.click(screen.getByTestId("dismiss-button"));
    expect(screen.queryByTestId("celebration-panel")).toBeNull();
  });

  it("13.4 clicking dismiss fires the onDismiss callback", () => {
    const onDismiss = jest.fn();
    const ms = [makeMilestone({ id: "r1", status: "reached" })];
    renderCelebration({ milestones: ms, onDismiss });
    fireEvent.click(screen.getByTestId("dismiss-button"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("13.5 does not throw when onDismiss is not provided", () => {
    const ms = [makeMilestone({ id: "r1", status: "reached" })];
    expect(() => {
      renderCelebration({ milestones: ms });
      fireEvent.click(screen.getByTestId("dismiss-button"));
    }).not.toThrow();
  });

  it("13.6 progress bar and milestone list remain visible after dismiss", () => {
    const ms = [makeMilestone({ id: "r1", status: "reached" })];
    renderCelebration({ milestones: ms });
    fireEvent.click(screen.getByTestId("dismiss-button"));
    expect(screen.getByTestId("milestone-progress-track")).toBeTruthy();
    expect(screen.getByTestId("milestone-list")).toBeTruthy();
  });
});

// ── 14. MilestoneCelebration – auto-dismiss ───────────────────────────────────

describe("14. MilestoneCelebration – auto-dismiss", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("14.1 auto-dismisses after autoDismissMs", () => {
    const ms = [makeMilestone({ id: "r1", status: "reached" })];
    renderCelebration({ milestones: ms, autoDismissMs: 3000 });
    expect(screen.getByTestId("celebration-panel")).toBeTruthy();
    act(() => { jest.advanceTimersByTime(3000); });
    expect(screen.queryByTestId("celebration-panel")).toBeNull();
  });

  it("14.2 fires onDismiss callback on auto-dismiss", () => {
    const onDismiss = jest.fn();
    const ms = [makeMilestone({ id: "r1", status: "reached" })];
    renderCelebration({ milestones: ms, autoDismissMs: 1000, onDismiss });
    act(() => { jest.advanceTimersByTime(1000); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("14.3 does not auto-dismiss when autoDismissMs is 0", () => {
    const ms = [makeMilestone({ id: "r1", status: "reached" })];
    renderCelebration({ milestones: ms, autoDismissMs: 0 });
    act(() => { jest.advanceTimersByTime(10_000); });
    expect(screen.getByTestId("celebration-panel")).toBeTruthy();
  });

  it("14.4 shows auto-dismiss hint when autoDismissMs > 0", () => {
    const ms = [makeMilestone({ id: "r1", status: "reached" })];
    renderCelebration({ milestones: ms, autoDismissMs: 5000 });
    expect(screen.getByText("This message will dismiss automatically.")).toBeTruthy();
  });

  it("14.5 does not show auto-dismiss hint when autoDismissMs is 0", () => {
    const ms = [makeMilestone({ id: "r1", status: "reached" })];
    renderCelebration({ milestones: ms, autoDismissMs: 0 });
    expect(screen.queryByText("This message will dismiss automatically.")).toBeNull();
  });

  it("14.6 manual dismiss before auto-dismiss fires onDismiss only once", () => {
    const onDismiss = jest.fn();
    const ms = [makeMilestone({ id: "r1", status: "reached" })];
    renderCelebration({ milestones: ms, autoDismissMs: 3000, onDismiss });
    fireEvent.click(screen.getByTestId("dismiss-button"));
    act(() => { jest.advanceTimersByTime(3000); });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

// ── 15. MilestoneCelebration – onMilestoneReach callback ─────────────────────

describe("15. MilestoneCelebration – onMilestoneReach callback", () => {
  it("15.1 fires onMilestoneReach when a 'reached' milestone is present", () => {
    const onMilestoneReach = jest.fn();
    const ms = [makeMilestone({ id: "r1", status: "reached" })];
    renderCelebration({ milestones: ms, onMilestoneReach });
    expect(onMilestoneReach).toHaveBeenCalledTimes(1);
    expect(onMilestoneReach).toHaveBeenCalledWith(ms[0]);
  });

  it("15.2 does not fire onMilestoneReach when no milestone is 'reached'", () => {
    const onMilestoneReach = jest.fn();
    renderCelebration({ onMilestoneReach });
    expect(onMilestoneReach).not.toHaveBeenCalled();
  });

  it("15.3 does not throw when onMilestoneReach is not provided", () => {
    const ms = [makeMilestone({ id: "r1", status: "reached" })];
    expect(() => renderCelebration({ milestones: ms })).not.toThrow();
  });
});

// ── 16. MilestoneCelebration – edge cases ────────────────────────────────────

describe("16. MilestoneCelebration – edge cases", () => {
  it("16.1 handles non-array milestones gracefully", () => {
    expect(() =>
      render(
        <MilestoneCelebration
          milestones={null as any}
          currentPercent={50}
          autoDismissMs={0}
        />,
      ),
    ).not.toThrow();
  });

  it("16.2 handles currentPercent of NaN without crashing", () => {
    expect(() =>
      renderCelebration({ currentPercent: NaN }),
    ).not.toThrow();
  });

  it("16.3 handles currentPercent > 100 by clamping", () => {
    renderCelebration({ currentPercent: 200 });
    const track = screen.getByTestId("milestone-progress-track");
    expect(track).toHaveAttribute("aria-valuenow", "100");
  });

  it("16.4 handles currentPercent < 0 by clamping", () => {
    renderCelebration({ currentPercent: -50 });
    const track = screen.getByTestId("milestone-progress-track");
    expect(track).toHaveAttribute("aria-valuenow", "0");
  });

  it("16.5 sanitizes campaignName with control characters", () => {
    const ms = [makeMilestone({ id: "r1", status: "reached" })];
    renderCelebration({ milestones: ms, campaignName: "Camp\u0000aign" });
    expect(screen.getByText("Camp aign")).toBeTruthy();
  });

  it("16.6 truncates a very long campaignName", () => {
    const ms = [makeMilestone({ id: "r1", status: "reached" })];
    const longName = "A".repeat(200);
    renderCelebration({ milestones: ms, campaignName: longName });
    const panel = screen.getByTestId("celebration-panel");
    // The displayed name should be truncated to MAX_CAMPAIGN_NAME_LENGTH
    const displayed = panel.querySelector("p")?.textContent ?? "";
    expect(displayed.length).toBeLessThanOrEqual(MAX_CAMPAIGN_NAME_LENGTH);
  });

  it("16.7 only the first 'reached' milestone triggers the celebration panel", () => {
    const ms: Milestone[] = [
      makeMilestone({ id: "r1", label: "First", status: "reached" }),
      makeMilestone({ id: "r2", label: "Second", status: "reached" }),
    ];
    renderCelebration({ milestones: ms });
    expect(screen.getByText("First")).toBeTruthy();
    // "Second" label appears in the badge list but not in the celebration heading area
    const panel = screen.getByTestId("celebration-panel");
    expect(panel.textContent).toContain("First");
  });

  it("16.8 renders without error when only required props are supplied", () => {
    expect(() =>
      render(<MilestoneCelebration milestones={[]} currentPercent={0} />),
    ).not.toThrow();
  });

  it("16.9 XSS: milestone label with script tag is rendered as text, not HTML", () => {
    const xssLabel = "<script>alert(1)</script>";
    const ms = [makeMilestone({ id: "xss", label: xssLabel, status: "reached" })];
    renderCelebration({ milestones: ms });
    // The text should appear as-is (React escapes it), no script execution
    expect(screen.getByTestId("celebration-panel").innerHTML).not.toContain(
      "<script>",
    );
  });

  it("16.10 progress bar aria-label includes campaign name when provided", () => {
    renderCelebration({ campaignName: "Green Energy" });
    const track = screen.getByTestId("milestone-progress-track");
    expect(track.getAttribute("aria-label")).toContain("Green Energy");
  });
});
