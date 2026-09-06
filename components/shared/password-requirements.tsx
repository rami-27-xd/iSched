import { Check, X } from "lucide-react"
import { checkPassword, PASSWORD_REQUIREMENTS } from "@/lib/password"

/**
 * Live checklist that lights up each password rule as the user types.
 * Presentational only — no hooks — so it drops into any form.
 */
export function PasswordRequirements({ password, className = "" }: { password: string; className?: string }) {
  const result = checkPassword(password)
  return (
    <ul className={`mt-2 space-y-1 ${className}`}>
      {PASSWORD_REQUIREMENTS.map(({ key, label }) => {
        const ok = result[key]
        return (
          <li
            key={key}
            className={`flex items-center gap-1.5 text-xs ${ok ? "text-green-600" : "text-muted-foreground"}`}
          >
            {ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : <X className="h-3.5 w-3.5 shrink-0" />}
            {label}
          </li>
        )
      })}
    </ul>
  )
}
