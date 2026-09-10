"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import type { ComponentProps } from "react";

/**
 * Two-step destructive action: first click reveals confirm/cancel, second
 * click either calls `onClick` or submits the surrounding form.
 */
export function ConfirmButton({ confirmText = "Confirm", children, onClick, ...props }: ComponentProps<typeof Button> & { confirmText?: string }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <Button {...props} type="button" onClick={() => setArmed(true)}>
        {children}
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type={onClick ? "button" : "submit"}
        variant="danger"
        className={props.className}
        disabled={props.disabled}
        onClick={(e) => {
          if (onClick) {
            onClick(e);
            setArmed(false);
          }
        }}
      >
        {confirmText}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </span>
  );
}
