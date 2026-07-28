import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Standalone output so the Docker image (ADR-0012, Kamal) stays small.
  output: "standalone",
  typedRoutes: true,
};

export default withNextIntl(nextConfig);
