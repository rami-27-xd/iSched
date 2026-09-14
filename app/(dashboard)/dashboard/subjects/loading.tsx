import { PageSkeleton } from "@/components/shared/loading-skeletons"

// Shown by Next.js the instant a navigation to this route starts — before the
// page chunk and its data arrive — so every sidebar click gets a rendered
// placeholder instead of a blank pane. Same pieces the page's own loading
// state uses, so the two states look identical.
export default function Loading() {
  return <PageSkeleton variant="cards" label="Loading departments" />
}
