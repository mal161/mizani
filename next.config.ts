import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Separate build folders let the e2e server (.next-e2e) and test builds run while a developer's own
  // `npm run dev` keeps using .next: two servers sharing one folder corrupt each other.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Self-contained server in .next/standalone for the Docker image and ACC servers (see docs/handover/self-hosting.md).
  output: "standalone",
  experimental: {
    // Enables forbidden() for 403 responses on staff pages a role may not open.
    authInterrupts: true,
    // Complaint evidence: up to 5 files x 10 MB, plus form fields.
    serverActions: { bodySizeLimit: "52mb" },
  },
};

export default withNextIntl(nextConfig);
