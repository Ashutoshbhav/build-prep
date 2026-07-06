import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Chromium binary + puppeteer must not be bundled by the build
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  turbopack: { root: __dirname },
};

export default nextConfig;
