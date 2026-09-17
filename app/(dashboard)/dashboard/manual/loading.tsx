import { PageSkeleton } from "@/components/shared/loading-skeletons"

// Shown by Next.js the instant a navigation to this route starts.
export default function Loading() {
  return <PageSkeleton variant="cards" label="Loading user manual" />
}
