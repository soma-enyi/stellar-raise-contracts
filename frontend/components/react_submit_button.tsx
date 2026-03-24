/**
 * @title React Submit Button Component
 * @notice Standardized submit button with consistent states for testing and developer experience.
 * @dev Implements idle, loading, disabled, and variant states. Prevents double-submit when loading.
 * @custom:security Prevents injection via children; uses type="submit" for form semantics.
 */

import React from "react";

import "./forms/Forms.css";

/** @dev Button variant matching Forms.css classes */
export type SubmitButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "outline";

/** @dev Standardized state for testing and DX */
export type SubmitButtonState = "idle" | "loading" | "disabled";

export interface ReactSubmitButtonProps
  extends Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    "type" | "disabled" | "children"
  > {
  /** @dev Button label. Use string only; avoids injection. */
  children: React.ReactNode;
  /** @dev When true, shows spinner and prevents click. Prevents double-submit. */
  isLoading?: boolean;
  /** @dev Explicit disabled state (e.g. form validation). */
  disabled?: boolean;
  /** @dev Visual variant. Default: primary. */
  variant?: SubmitButtonVariant;
  /** @dev Full-width layout. Default: false. */
  fullWidth?: boolean;
  /** @dev Accessible label when loading. Default: "Loading..." */
  loadingLabel?: string;
  /** @dev Form id to associate with (optional). */
  form?: string;
}

const VARIANT_CLASS: Record<SubmitButtonVariant, string> = {
  primary: "btn btn--primary",
  secondary: "btn btn--secondary",
  danger: "btn btn--danger",
  outline: "btn btn--outline",
};

/**
 * @title SubmitButton
 * @notice Standardized submit button component with consistent states.
 * @dev Renders a <button type="submit"> with loading spinner, disabled handling, and variant styles.
 *      When isLoading, button is disabled and shows loadingLabel. Combines disabled + isLoading for explicit control.
 */
const ReactSubmitButton = ({
  children,
  isLoading = false,
  disabled = false,
  variant = "primary",
  fullWidth = false,
  loadingLabel = "Loading...",
  form,
  className = "",
  onClick,
  "aria-busy": ariaBusy,
  ...rest
}: ReactSubmitButtonProps) => {
  const isDisabled = disabled || isLoading;
  const baseClass = VARIANT_CLASS[variant];
  const fullClass = fullWidth ? "btn--full" : "";
  const combinedClassName = [baseClass, fullClass, className].filter(Boolean).join(" ");

  const handleClick = isDisabled
    ? undefined
    : (e: React.MouseEvent<HTMLButtonElement>) => onClick?.(e);

  return (
    <button
      type="submit"
      form={form}
      className={combinedClassName}
      disabled={isDisabled}
      aria-busy={ariaBusy ?? isLoading}
      aria-disabled={isDisabled}
      onClick={handleClick}
      {...rest}
    >
      {isLoading ? (
        <>
          <span
            className="btn__spinner"
            role="status"
            aria-hidden="true"
          />
          <span>{loadingLabel}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
};

export default ReactSubmitButton;
