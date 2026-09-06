import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to THIS folder. The project lives at `c:\iSched` (directly
  // under the drive root) and stray package.json/lockfiles exist elsewhere on the
  // machine, so Next/Turbopack can otherwise mis-infer the root as `c:\` and then fail
  // to resolve `tailwindcss` (looks in `c:\node_modules`, which doesn't exist).
  turbopack: {
    root: __dirname,
  },
  outputFileTracingRoot: __dirname,
  images: {
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
