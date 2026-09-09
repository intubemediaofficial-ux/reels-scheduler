"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import type { ComponentProps } from "react";

/**
 * Two-step destructive action: first click reveals confirm/cancel, second
 * click submits the surrounding form. Keeps the accessible <form> semantics.
 */
export function ConfirmButton({ confirmText = "Confirm", children, ...props }: ComponentProps<typeof Button> & { confirmText?: string }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <Button type="button" onClick={() => setArmed(true)} {...props}>
        {children}
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Button type="submit" variant="danger" className={props.className}>
        {confirmText}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </span>
  );
}
