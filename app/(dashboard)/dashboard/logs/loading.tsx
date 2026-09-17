import { PageSkeleton } from "@/components/shared/loading-skeletons"

// Shown by Next.js the instant a navigation to this route starts — same pieces
// the page's own loading state uses, so the two states look identical.
export default function Loading() {
  return <PageSkeleton variant="table" label="Loading system logs" />
}
