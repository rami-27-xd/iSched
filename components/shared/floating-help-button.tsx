"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { HelpCircle, Lightbulb } from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useUserRole } from "@/components/layout/dashboard-shell"
import { getPageHelp } from "@/lib/page-help"

/**
 * Fixed bottom-right FAB — replaces the standalone User Manual nav link. Opens a
 * popover with a handful of brief, page-specific tips for whatever the signed-in
 * role is currently looking at (lib/page-help.ts). The full per-role workflow
 * manual still exists at /dashboard/manual, just no longer linked from the sidebar.
 */
export function FloatingHelpButton() {
  const pathname = usePathname()
  const role = useUserRole()
  const [open, setOpen] = React.useState(false)
  const content = getPageHelp(pathname, role)

  return (
    <div className="fixed bottom-5 right-5 z-40 sm:bottom-6 sm:right-6">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1B4332] text-[#D4AF37] shadow-lg ring-2 ring-[#D4AF37] transition-transform hover:scale-105 hover:bg-[#2D6A4F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] focus-visible:ring-offset-2"
          aria-label="Help for this page"
        >
          <HelpCircle className="h-6 w-6" />
        </PopoverTrigger>
        <PopoverContent align="end" side="top" sideOffset={10} className="w-80 p-0">
          <div className="flex items-center gap-2 rounded-t-lg bg-[#1B4332] px-4 py-2.5 text-white">
            <Lightbulb className="h-4 w-4 text-[#D4AF37]" />
            <h3 className="text-sm font-semibold">{content.title}</h3>
          </div>
          <ul className="space-y-2 px-4 py-3">
            {content.tips.map((tip, i) => (
              <li key={i} className="flex gap-2 text-xs text-popover-foreground">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#D4AF37]" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
    </div>
  )
}
