import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * @title CelebrationModularity
 * @notice Modular milestone celebration system for the Stellar Raise crowdfunding dApp.
 *
 * @dev This module exports:
 *   - `MilestoneStatus`          — union type for all milestone states
 *   - `MilestoneCelebrationProps` — typed props interface
 *   - Pure helper functions (all exported for independent unit testing)
 *   - `MilestoneCelebration`     — the main React component
 *   - `MilestoneProgressBar`     — reusable sub-component
 *   - `MilestoneBadge`           — reusable status badge sub-component
 *
 * @custom:efficiency
 *   - `useCallback` memoises `handleDismiss` so its reference stays stable
 *     between renders, preventing unnecessary re-renders of child elements.
 *   - `useRef` tracks the auto-dismiss timer so it is always cleared on
 *     unmount, preventing memory leaks and state updates on unmounted components.
 *   - `useMemo`-equivalent constant maps are defined outside the component so
 *     they are allocated once at module load time, not on every render.
 *
 * @custom:security
 *   - No `dangerouslySetInnerHTML` is used anywhere in this module.
 *   - All user-supplied strings (title, message, campaignName) are rendered as
 *     React text nodes, eliminating XSS risk at the component boundary.
 *   - Progress values are clamped to [0, 100] before rendering to prevent
 *     layout abuse from out-of-range inputs.
 *   - Percentage labels are derived from the clamped numeric value, not from
 *     raw user input.
 *   - All inline style values are compile-time constants; no dynamic CSS
 *     injection from user input is possible.
 *
 * @custom:accessibility
 *   - `role="status"` on the celebration container announces updates to
 *     screen readers without interrupting the user (WCAG 2.1 SC 4.1.3).
 *   - `aria-live="polite"` ensures milestone announcements are queued, not
 *     immediately interrupting (WCAG 2.1 SC 1.3.1).
 *   - `aria-label` on the dismiss button satisfies WCAG 2.1 SC 1.1.1.
 *   - `aria-valuenow`, `aria-valuemin`, `aria-valuemax` on the progress bar
 *     satisfy WCAG 2.1 SC 4.1.2 (Name, Role, Value).
 *   - All interactive elements meet the 44 × 44 px minimum touch target
 *     recommended by WCAG 2.5.5.
 *   - Decorative emoji icons carry `aria-hidden="true"` to avoid noise for
 *     screen reader users.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * @notice All supported milestone status values.
 * @dev Drives both the visual presentation and the celebration trigger logic.
 *
 *   pending    → milestone not yet reached
 *   reached    → milestone just reached (triggers celebration)
 *   celebrated → celebration has been acknowledged / auto-dismissed
 *   failed     → campaign ended without reaching this milestone
 */
export type MilestoneStatus = "pending" | "reached" | "celebrated" | "failed";

/**
 * @notice Shape of a single milestone definition.
 * @param id            Unique identifier for the milestone.
 * @param label         Human-readable milestone name (e.g. "25% Funded").
 * @param targetPercent Percentage of campaign goal this milestone represents (0–100).
 * @param status        Current status of this milestone.
 * @param reachedAt     Optional Unix timestamp (seconds) when the milestone was reached.
 */
export interface Milestone {
  id: string;
  label: string;
  targetPercent: number;
  status: MilestoneStatus;
  reachedAt?: number;
}

/**
 * @notice Props accepted by `MilestoneCelebration`.
 *
 * @param milestones        Array of milestone definitions for the campaign.
 * @param currentPercent    Current funding percentage (0–100). Clamped internally.
 * @param campaignName      Optional campaign name shown in the celebration header.
 * @param autoDismissMs     Auto-dismiss delay in milliseconds. 0 disables auto-dismiss.
 *                          Default: 5000.
 * @param onDismiss         Optional callback fired when the celebration is dismissed
 *                          (by user action or auto-dismiss).
 * @param onMilestoneReach  Optional callback fired when a new milestone is detected as
 *                          reached. Receives the reached `Milestone` object.
 * @param showProgressBar   Whether to render the progress bar. Default: true.
 * @param className         Additional CSS class applied to the root element.
 * @param id                HTML `id` attribute for the root element.
 */
export interface MilestoneCelebrationProps {
  milestones: Milestone[];
  currentPercent: number;
  campaignName?: string;
  autoDismissMs?: number;
  onDismiss?: () => void;
  onMilestoneReach?: (milestone: Milestone) => void;
  showProgressBar?: boolean;
  className?: string;
  id?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** @dev Default auto-dismiss delay in milliseconds. */
export const DEFAULT_AUTO_DISMISS_MS = 5_000;

/** @dev Maximum length for campaign name display to prevent layout abuse. */
export const MAX_CAMPAIGN_NAME_LENGTH = 60;

/** @dev Maximum length for milestone label display. */
export const MAX_MILESTONE_LABEL_LENGTH = 80;

/**
 * @notice Emoji icons for each milestone status.
 * @dev Defined outside the component so the object is allocated once.
 * @security All values are hardcoded string literals — no user input reaches here.
 */
export const MILESTONE_ICONS: Record<MilestoneStatus, string> = {
  pending: "⏳",
  reached: "🎉",
  celebrated: "✅",
  failed: "❌",
};

/**
 * @notice Accessible label for each milestone status.
 * @dev Used in aria-label attributes to give screen readers meaningful context.
 */
export const MILESTONE_STATUS_LABELS: Record<MilestoneStatus, string> = {
  pending: "Pending",
  reached: "Reached",
  celebrated: "Celebrated",
  failed: "Failed",
};

// ── Pure helpers (exported for unit testing) ──────────────────────────────────

/**
 * @title clampPercent
 * @notice Clamps a numeric value to the inclusive range [0, 100].
 * @param value Raw percentage value (may be out of range or non-finite).
 * @return A number in [0, 100].
 * @security Prevents negative widths and >100% progress bar rendering.
 */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * @title normalizeCelebrationString
 * @notice Sanitizes a candidate string: rejects non-strings, strips control
 *         characters, normalizes whitespace, and truncates to `maxLength`.
 * @param candidate  Untrusted input (may be any type).
 * @param fallback   Returned when candidate is unusable.
 * @param maxLength  Maximum allowed character count. Default: 80.
 * @security Prevents blank labels and layout-abuse via oversized strings.
 */
export function normalizeCelebrationString(
  candidate: unknown,
  fallback: string,
  maxLength = MAX_MILESTONE_LABEL_LENGTH,
): string {
  if (typeof candidate !== "string") return fallback;
  const cleaned = candidate
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return fallback;
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 3)}...`;
}

/**
 * @title isValidMilestoneStatus
 * @notice Returns true when `value` is a valid `MilestoneStatus`.
 * @param value Untrusted input.
 */
export function isValidMilestoneStatus(value: unknown): value is MilestoneStatus {
  return (
    value === "pending" ||
    value === "reached" ||
    value === "celebrated" ||
    value === "failed"
  );
}

/**
 * @title resolveMilestoneStatus
 * @notice Returns a safe `MilestoneStatus`, falling back to `"pending"` for
 *         invalid inputs.
 * @param value Untrusted status value.
 */
export function resolveMilestoneStatus(value: unknown): MilestoneStatus {
  return isValidMilestoneStatus(value) ? value : "pending";
}

/**
 * @title getActiveCelebration
 * @notice Returns the first milestone with status `"reached"` from the array,
 *         or `null` if none exists.
 * @dev "First" is defined by array order, giving callers control over priority.
 * @param milestones Array of milestone definitions.
 */
export function getActiveCelebration(milestones: Milestone[]): Milestone | null {
  if (!Array.isArray(milestones)) return null;
  return milestones.find((m) => m.status === "reached") ?? null;
}

/**
 * @title getMilestonesForPercent
 * @notice Returns all milestones whose `targetPercent` is ≤ `currentPercent`
 *         and whose status is still `"pending"` — i.e. newly reachable milestones.
 * @param milestones     Array of milestone definitions.
 * @param currentPercent Current funding percentage (will be clamped).
 */
export function getMilestonesForPercent(
  milestones: Milestone[],
  currentPercent: number,
): Milestone[] {
  if (!Array.isArray(milestones)) return [];
  const clamped = clampPercent(currentPercent);
  return milestones.filter(
    (m) => m.status === "pending" && clampPercent(m.targetPercent) <= clamped,
  );
}

/**
 * @title formatMilestonePercent
 * @notice Formats a clamped percentage as a display string (e.g. "25%").
 * @param value Raw percentage value.
 */
export function formatMilestonePercent(value: number): string {
  return `${clampPercent(Math.round(value))}%`;
}

/**
 * @title buildCelebrationAriaLabel
 * @notice Builds the accessible label for the celebration container.
 * @param milestone    The milestone being celebrated.
 * @param campaignName Optional campaign name.
 */
export function buildCelebrationAriaLabel(
  milestone: Milestone,
  campaignName?: string,
): string {
  const label = normalizeCelebrationString(milestone.label, "Milestone");
  const name = campaignName
    ? normalizeCelebrationString(campaignName, "", MAX_CAMPAIGN_NAME_LENGTH)
    : "";
  return name
    ? `Milestone reached: ${label} for campaign ${name}`
    : `Milestone reached: ${label}`;
}

// ── MilestoneProgressBar sub-component ───────────────────────────────────────

/**
 * @notice Props for the `MilestoneProgressBar` sub-component.
 */
export interface MilestoneProgressBarProps {
  /** Current funding percentage (0–100). Clamped internally. */
  currentPercent: number;
  /** Array of milestones to render as tick marks on the bar. */
  milestones: Milestone[];
  /** Optional accessible label for the progress bar. */
  ariaLabel?: string;
}

/**
 * @title MilestoneProgressBar
 * @notice Reusable progress bar that visualises campaign funding progress and
 *         renders milestone tick marks at their respective target percentages.
 *
 * @dev Tick marks are positioned using `left: X%` inline styles derived from
 *      clamped `targetPercent` values — no user string is injected into CSS.
 *
 * @custom:accessibility
 *   - `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
 *     satisfies WCAG 2.1 SC 4.1.2.
 *   - Each tick mark carries an `aria-label` describing the milestone.
 */
export const MilestoneProgressBar: React.FC<MilestoneProgressBarProps> = ({
  currentPercent,
  milestones,
  ariaLabel = "Campaign funding progress",
}) => {
  const clamped = clampPercent(currentPercent);

  return (
    <div style={progressBarStyles.wrapper}>
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel}
        style={progressBarStyles.track}
        data-testid="milestone-progress-track"
      >
        <div
          style={{ ...progressBarStyles.fill, width: `${clamped}%` }}
          data-testid="milestone-progress-fill"
        />
        {Array.isArray(milestones) &&
          milestones.map((m) => {
            const tickPercent = clampPercent(m.targetPercent);
            const safeLabel = normalizeCelebrationString(m.label, "Milestone");
            const statusLabel = MILESTONE_STATUS_LABELS[resolveMilestoneStatus(m.status)];
            return (
              <div
                key={m.id}
                style={{
                  ...progressBarStyles.tick,
                  left: `${tickPercent}%`,
                  backgroundColor:
                    m.status === "reached" || m.status === "celebrated"
                      ? "#00C853"
                      : m.status === "failed"
                      ? "#FF3B30"
                      : "#9ca3af",
                }}
                aria-label={`${safeLabel}: ${statusLabel} at ${formatMilestonePercent(tickPercent)}`}
                data-testid={`milestone-tick-${m.id}`}
                title={`${safeLabel} (${statusLabel})`}
              />
            );
          })}
      </div>
      <div style={progressBarStyles.labels}>
        <span style={progressBarStyles.labelText}>0%</span>
        <span style={progressBarStyles.labelText} aria-live="polite">
          {formatMilestonePercent(clamped)}
        </span>
        <span style={progressBarStyles.labelText}>100%</span>
      </div>
    </div>
  );
};

// ── MilestoneBadge sub-component ──────────────────────────────────────────────

/**
 * @notice Props for the `MilestoneBadge` sub-component.
 */
export interface MilestoneBadgeProps {
  /** The milestone to display. */
  milestone: Milestone;
  /** Whether this badge is highlighted (e.g. the active celebration). */
  isActive?: boolean;
}

/**
 * @title MilestoneBadge
 * @notice Reusable badge that displays a single milestone's status, label,
 *         and target percentage.
 *
 * @custom:security All displayed strings pass through `normalizeCelebrationString`.
 */
export const MilestoneBadge: React.FC<MilestoneBadgeProps> = ({
  milestone,
  isActive = false,
}) => {
  const safeStatus = resolveMilestoneStatus(milestone.status);
  const safeLabel = normalizeCelebrationString(milestone.label, "Milestone");
  const icon = MILESTONE_ICONS[safeStatus];
  const statusLabel = MILESTONE_STATUS_LABELS[safeStatus];

  return (
    <div
      style={{
        ...badgeStyles.container,
        ...(isActive ? badgeStyles.containerActive : {}),
        ...(safeStatus === "reached" ? badgeStyles.containerReached : {}),
        ...(safeStatus === "failed" ? badgeStyles.containerFailed : {}),
      }}
      data-testid={`milestone-badge-${milestone.id}`}
      data-status={safeStatus}
    >
      <span aria-hidden="true" style={badgeStyles.icon}>
        {icon}
      </span>
      <span style={badgeStyles.label}>{safeLabel}</span>
      <span style={badgeStyles.percent}>
        {formatMilestonePercent(milestone.targetPercent)}
      </span>
      <span style={badgeStyles.status} aria-label={`Status: ${statusLabel}`}>
        {statusLabel}
      </span>
    </div>
  );
};

// ── MilestoneCelebration (main component) ─────────────────────────────────────

/**
 * @title MilestoneCelebration
 * @notice Main celebration overlay component. Renders when a milestone with
 *         status `"reached"` is present in the `milestones` array.
 *
 * @dev Rendering logic:
 *   1. Scans `milestones` for the first entry with `status === "reached"`.
 *   2. If found, renders the celebration panel with the milestone details.
 *   3. If `autoDismissMs > 0`, schedules an auto-dismiss via `setTimeout`.
 *   4. The timer is cleared on unmount and whenever the active milestone changes.
 *   5. If no `"reached"` milestone exists, renders only the progress bar
 *      (when `showProgressBar` is true) and the milestone list.
 *
 * @custom:security
 *   - `campaignName` and milestone labels are sanitized before rendering.
 *   - Progress values are clamped before use in inline styles.
 *   - The auto-dismiss timer ref is always cleared to prevent state updates
 *     on unmounted components (memory leak prevention).
 */
const MilestoneCelebration: React.FC<MilestoneCelebrationProps> = ({
  milestones,
  currentPercent,
  campaignName,
  autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
  onDismiss,
  onMilestoneReach,
  showProgressBar = true,
  className,
  id,
}) => {
  const [isDismissed, setIsDismissed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const safeMilestones = Array.isArray(milestones) ? milestones : [];
  const clamped = clampPercent(currentPercent);
  const activeCelebration = isDismissed ? null : getActiveCelebration(safeMilestones);
  const safeCampaignName = campaignName
    ? normalizeCelebrationString(campaignName, "", MAX_CAMPAIGN_NAME_LENGTH)
    : undefined;

  // Fire onMilestoneReach when a new "reached" milestone is detected.
  useEffect(() => {
    if (activeCelebration && typeof onMilestoneReach === "function") {
      onMilestoneReach(activeCelebration);
    }
  }, [activeCelebration?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Schedule auto-dismiss when a celebration becomes active.
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (activeCelebration && autoDismissMs > 0) {
      timerRef.current = setTimeout(() => {
        setIsDismissed(true);
        if (typeof onDismiss === "function") onDismiss();
      }, autoDismissMs);
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [activeCelebration?.id, autoDismissMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDismiss = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setIsDismissed(true);
    if (typeof onDismiss === "function") onDismiss();
  }, [onDismiss]);

  // Reset dismissed state when the active milestone changes (new milestone reached).
  useEffect(() => {
    setIsDismissed(false);
  }, [activeCelebration?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      id={id}
      className={className}
      style={containerStyles.root}
      data-testid="milestone-celebration-root"
    >
      {/* Celebration overlay — only rendered when a milestone is "reached" */}
      {activeCelebration && (
        <div
          role="status"
          aria-live="polite"
          aria-label={buildCelebrationAriaLabel(activeCelebration, safeCampaignName)}
          style={containerStyles.celebrationPanel}
          data-testid="celebration-panel"
        >
          <button
            onClick={handleDismiss}
            style={containerStyles.dismissButton}
            aria-label="Dismiss milestone celebration"
            type="button"
            data-testid="dismiss-button"
          >
            <span aria-hidden="true">✕</span>
          </button>

          <span aria-hidden="true" style={containerStyles.celebrationIcon}>
            🎉
          </span>

          {safeCampaignName && (
            <p style={containerStyles.campaignName}>{safeCampaignName}</p>
          )}

          <h2 style={containerStyles.celebrationTitle}>
            Milestone Reached!
          </h2>

          <p style={containerStyles.celebrationLabel}>
            {normalizeCelebrationString(activeCelebration.label, "Milestone")}
          </p>

          <p style={containerStyles.celebrationPercent}>
            {formatMilestonePercent(activeCelebration.targetPercent)} of goal
          </p>

          {autoDismissMs > 0 && (
            <p style={containerStyles.autoDismissHint} aria-live="off">
              This message will dismiss automatically.
            </p>
          )}
        </div>
      )}

      {/* Progress bar */}
      {showProgressBar && (
        <MilestoneProgressBar
          currentPercent={clamped}
          milestones={safeMilestones}
          ariaLabel={
            safeCampaignName
              ? `${safeCampaignName} funding progress`
              : "Campaign funding progress"
          }
        />
      )}

      {/* Milestone list */}
      {safeMilestones.length > 0 && (
        <div
          style={containerStyles.milestoneList}
          data-testid="milestone-list"
          aria-label="Campaign milestones"
        >
          {safeMilestones.map((m) => (
            <MilestoneBadge
              key={m.id}
              milestone={m}
              isActive={activeCelebration?.id === m.id}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default MilestoneCelebration;

// ── Inline styles ─────────────────────────────────────────────────────────────
// All values are compile-time constants — no dynamic CSS injection from user input.

const containerStyles = {
  root: {
    fontFamily:
      "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    width: "100%",
  } as React.CSSProperties,

  celebrationPanel: {
    position: "relative" as const,
    backgroundColor: "#f0fdf4",
    border: "2px solid #00C853",
    borderRadius: "0.75rem",
    padding: "1.5rem",
    marginBottom: "1.5rem",
    textAlign: "center" as const,
    boxShadow: "0 4px 6px -1px rgba(0, 200, 83, 0.15)",
  } as React.CSSProperties,

  dismissButton: {
    position: "absolute" as const,
    top: "0.75rem",
    right: "0.75rem",
    minWidth: "44px",
    minHeight: "44px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "transparent",
    border: "1px solid #d1d5db",
    borderRadius: "9999px",
    cursor: "pointer",
    color: "#374151",
    fontSize: "1rem",
    lineHeight: 1,
  } as React.CSSProperties,

  celebrationIcon: {
    fontSize: "2.5rem",
    display: "block",
    marginBottom: "0.5rem",
  } as React.CSSProperties,

  campaignName: {
    margin: "0 0 0.25rem",
    fontSize: "0.875rem",
    color: "#6b7280",
    fontWeight: 500,
  } as React.CSSProperties,

  celebrationTitle: {
    margin: "0 0 0.5rem",
    fontSize: "1.5rem",
    fontWeight: 700,
    color: "#065f46",
  } as React.CSSProperties,

  celebrationLabel: {
    margin: "0 0 0.25rem",
    fontSize: "1.125rem",
    fontWeight: 600,
    color: "#047857",
  } as React.CSSProperties,

  celebrationPercent: {
    margin: "0 0 0.5rem",
    fontSize: "1rem",
    color: "#059669",
  } as React.CSSProperties,

  autoDismissHint: {
    margin: "0.5rem 0 0",
    fontSize: "0.75rem",
    color: "#9ca3af",
  } as React.CSSProperties,

  milestoneList: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: "0.75rem",
    marginTop: "1rem",
  } as React.CSSProperties,
} as const;

const progressBarStyles = {
  wrapper: {
    width: "100%",
    marginBottom: "0.5rem",
  } as React.CSSProperties,

  track: {
    position: "relative" as const,
    width: "100%",
    height: "12px",
    backgroundColor: "#e5e7eb",
    borderRadius: "9999px",
    overflow: "visible" as const,
  } as React.CSSProperties,

  fill: {
    height: "100%",
    backgroundColor: "#0066FF",
    borderRadius: "9999px",
    transition: "width 0.35s ease-in-out",
    minWidth: 0,
  } as React.CSSProperties,

  tick: {
    position: "absolute" as const,
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: "14px",
    height: "14px",
    borderRadius: "9999px",
    border: "2px solid #ffffff",
    zIndex: 1,
  } as React.CSSProperties,

  labels: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: "0.25rem",
  } as React.CSSProperties,

  labelText: {
    fontSize: "0.75rem",
    color: "#6b7280",
  } as React.CSSProperties,
} as const;

const badgeStyles = {
  container: {
    display: "inline-flex",
    flexDirection: "column" as const,
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.5rem 0.75rem",
    borderRadius: "0.5rem",
    border: "1px solid #e5e7eb",
    backgroundColor: "#f9fafb",
    minWidth: "80px",
    textAlign: "center" as const,
    transition: "box-shadow 0.2s ease",
  } as React.CSSProperties,

  containerActive: {
    boxShadow: "0 0 0 2px #00C853",
    borderColor: "#00C853",
  } as React.CSSProperties,

  containerReached: {
    backgroundColor: "#f0fdf4",
    borderColor: "#00C853",
  } as React.CSSProperties,

  containerFailed: {
    backgroundColor: "#fff2f0",
    borderColor: "#FF3B30",
  } as React.CSSProperties,

  icon: {
    fontSize: "1.25rem",
    lineHeight: 1,
  } as React.CSSProperties,

  label: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "#111827",
    wordBreak: "break-word" as const,
    maxWidth: "100px",
  } as React.CSSProperties,

  percent: {
    fontSize: "0.75rem",
    color: "#6b7280",
  } as React.CSSProperties,

  status: {
    fontSize: "0.625rem",
    color: "#9ca3af",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
  } as React.CSSProperties,
} as const;
