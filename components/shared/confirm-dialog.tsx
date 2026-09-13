"use client"

import * as React from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Body copy — say what is about to happen and whether it can be undone. */
  description: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button for delete / deactivate style actions. */
  destructive?: boolean
  /** Disables both buttons and shows a spinner while the action runs. */
  pending?: boolean
  onConfirm: () => void
}

/**
 * One confirmation dialog for every destructive action (Delete, Deactivate,
 * Set Inactive …). Consistent copy layout and button placement across pages,
 * instead of the browser's native confirm() or a hand-rolled dialog each time.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  pending = false,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!pending) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground">{description}</div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            className={destructive ? "bg-red-600 text-white hover:bg-red-700" : "bg-[#1B4332] text-white hover:bg-[#2D6A4F]"}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
