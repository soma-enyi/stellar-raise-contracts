/**
 * @title React Submit Button Component Tests
 * @notice Comprehensive tests for standardized submit button states.
 * @dev Covers idle, loading, disabled, variants, accessibility, and security.
 */

/// <reference types="@testing-library/jest-dom" />

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ReactSubmitButton, {
  type SubmitButtonVariant,
  type SubmitButtonState,
} from "./react_submit_button";

describe("ReactSubmitButton", () => {
  describe("rendering and states", () => {
    it("renders with default label", () => {
      render(<ReactSubmitButton>Submit</ReactSubmitButton>);
      expect(screen.getByRole("button", { name: /submit/i })).toBeInTheDocument();
    });

    it("renders idle state by default", () => {
      render(<ReactSubmitButton>Save</ReactSubmitButton>);
      const btn = screen.getByRole("button");
      expect(btn).not.toBeDisabled();
      expect(btn).toHaveAttribute("aria-busy", "false");
      expect(btn).toHaveTextContent("Save");
      expect(btn).not.toHaveTextContent("Loading");
    });

    it("renders loading state when isLoading is true", () => {
      render(
        <ReactSubmitButton isLoading>
          Submit
        </ReactSubmitButton>
      );
      const btn = screen.getByRole("button");
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute("aria-busy", "true");
      expect(btn).toHaveTextContent("Loading...");
      expect(btn.querySelector(".btn__spinner")).toBeInTheDocument();
    });

    it("renders custom loadingLabel when isLoading", () => {
      render(
        <ReactSubmitButton isLoading loadingLabel="Saving...">
          Save
        </ReactSubmitButton>
      );
      expect(screen.getByRole("button")).toHaveTextContent("Saving...");
    });

    it("renders disabled state when disabled is true", () => {
      render(<ReactSubmitButton disabled>Submit</ReactSubmitButton>);
      const btn = screen.getByRole("button");
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute("aria-disabled", "true");
    });

    it("is disabled when both disabled and isLoading", () => {
      render(
        <ReactSubmitButton disabled isLoading>
          Submit
        </ReactSubmitButton>
      );
      expect(screen.getByRole("button")).toBeDisabled();
    });
  });

  describe("variants", () => {
    const variants: SubmitButtonVariant[] = [
      "primary",
      "secondary",
      "danger",
      "outline",
    ];

    variants.forEach((variant) => {
      it(`applies ${variant} variant class`, () => {
        render(
          <ReactSubmitButton variant={variant}>Submit</ReactSubmitButton>
        );
        const btn = screen.getByRole("button");
        expect(btn).toHaveClass("btn");
        expect(btn).toHaveClass(`btn--${variant}`);
      });
    });
  });

  describe("fullWidth", () => {
    it("applies btn--full when fullWidth is true", () => {
      render(<ReactSubmitButton fullWidth>Submit</ReactSubmitButton>);
      expect(screen.getByRole("button")).toHaveClass("btn--full");
    });

    it("does not apply btn--full when fullWidth is false", () => {
      render(<ReactSubmitButton>Submit</ReactSubmitButton>);
      expect(screen.getByRole("button")).not.toHaveClass("btn--full");
    });
  });

  describe("DOM attributes", () => {
    it("renders type=submit", () => {
      render(<ReactSubmitButton>Submit</ReactSubmitButton>);
      expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
    });

    it("associates with form when form prop is provided", () => {
      render(
        <>
          <form id="test-form" data-testid="form" />
          <ReactSubmitButton form="test-form">Submit</ReactSubmitButton>
        </>
      );
      expect(screen.getByRole("button")).toHaveAttribute("form", "test-form");
    });

    it("passes through data-testid", () => {
      render(
        <ReactSubmitButton data-testid="custom-submit">Submit</ReactSubmitButton>
      );
      expect(screen.getByTestId("custom-submit")).toBeInTheDocument();
    });

    it("merges custom className", () => {
      render(
        <ReactSubmitButton className="custom-class">Submit</ReactSubmitButton>
      );
      const btn = screen.getByRole("button");
      expect(btn).toHaveClass("custom-class");
      expect(btn).toHaveClass("btn");
    });
  });

  describe("click behavior", () => {
    it("calls onClick when clicked in idle state", async () => {
      const handleClick = jest.fn();
      render(<ReactSubmitButton onClick={handleClick}>Submit</ReactSubmitButton>);
      await userEvent.click(screen.getByRole("button"));
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it("does not call onClick when disabled", async () => {
      const handleClick = jest.fn();
      render(
        <ReactSubmitButton disabled onClick={handleClick}>
          Submit
        </ReactSubmitButton>
      );
      const btn = screen.getByRole("button");
      await userEvent.click(btn);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it("does not call onClick when isLoading", async () => {
      const handleClick = jest.fn();
      render(
        <ReactSubmitButton isLoading onClick={handleClick}>
          Submit
        </ReactSubmitButton>
      );
      const btn = screen.getByRole("button");
      fireEvent.click(btn);
      expect(handleClick).not.toHaveBeenCalled();
    });

    it("does not call onClick when disabled and clicked", () => {
      const handleClick = jest.fn();
      render(
        <ReactSubmitButton disabled onClick={handleClick}>
          Submit
        </ReactSubmitButton>
      );
      fireEvent.click(screen.getByRole("button"));
      expect(handleClick).not.toHaveBeenCalled();
    });

  });

  describe("accessibility", () => {
    it("has role=status on spinner when loading", () => {
      const { container } = render(
        <ReactSubmitButton isLoading>Submit</ReactSubmitButton>
      );
      const spinner = container.querySelector(".btn__spinner");
      expect(spinner).toBeInTheDocument();
      expect(spinner).toHaveAttribute("role", "status");
    });

    it("has aria-busy=true when loading", () => {
      render(<ReactSubmitButton isLoading>Submit</ReactSubmitButton>);
      expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
    });

    it("allows aria-busy override", () => {
      render(
        <ReactSubmitButton aria-busy={true}>Submit</ReactSubmitButton>
      );
      expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
    });
  });

  describe("security and edge cases", () => {
    it("renders safe string children", () => {
      render(<ReactSubmitButton>Submit Form</ReactSubmitButton>);
      expect(screen.getByRole("button")).toHaveTextContent("Submit Form");
    });

    it("renders numeric children", () => {
      render(<ReactSubmitButton>{42}</ReactSubmitButton>);
      expect(screen.getByRole("button")).toHaveTextContent("42");
    });

    it("always renders type=submit for form semantics", () => {
      render(<ReactSubmitButton>Submit</ReactSubmitButton>);
      expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
    });

    it("disabled from rest props is overridden by component logic when isLoading", () => {
      render(
        <ReactSubmitButton disabled={false} isLoading>
          Submit
        </ReactSubmitButton>
      );
      expect(screen.getByRole("button")).toBeDisabled();
    });
  });

  describe("state transitions", () => {
    it("transitions from idle to loading", () => {
      const { rerender } = render(<ReactSubmitButton>Submit</ReactSubmitButton>);
      expect(screen.getByRole("button")).not.toBeDisabled();

      rerender(<ReactSubmitButton isLoading>Submit</ReactSubmitButton>);
      expect(screen.getByRole("button")).toBeDisabled();
      expect(screen.getByRole("button")).toHaveTextContent("Loading...");
    });

    it("transitions from loading to idle", () => {
      const { rerender } = render(
        <ReactSubmitButton isLoading>Submit</ReactSubmitButton>
      );
      expect(screen.getByRole("button")).toBeDisabled();

      rerender(<ReactSubmitButton>Submit</ReactSubmitButton>);
      expect(screen.getByRole("button")).not.toBeDisabled();
      expect(screen.getByRole("button")).toHaveTextContent("Submit");
    });
  });
});

describe("SubmitButtonState type", () => {
  it("has expected state values for type checking", () => {
    const states: SubmitButtonState[] = ["idle", "loading", "disabled"];
    expect(states).toContain("idle");
    expect(states).toContain("loading");
    expect(states).toContain("disabled");
  });
});
