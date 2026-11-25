import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  experimental: {
    // Complaint evidence: up to 5 files x 10 MB, plus form fields.
    serverActions: { bodySizeLimit: "52mb" },
  },
};

export default withNextIntl(nextConfig);
