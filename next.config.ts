import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Chromium binary + puppeteer must not be bundled by the build
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  // ...and the binary files must be force-included in the serverless bundle,
  // or the function ships without /node_modules/@sparticuz/chromium/bin
  outputFileTracingIncludes: {
    "/api/generate": ["./node_modules/@sparticuz/chromium/bin/**"],
    "/api/render-pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
  },
  turbopack: { root: __dirname },
};

export default nextConfig;
