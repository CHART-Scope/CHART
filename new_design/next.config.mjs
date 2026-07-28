import path from "node:path";

/** @type {import("next").NextConfig} */
const nextConfig = {
  images: { disableStaticImages: true },
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, ".."),
  async rewrites() {
    const apiBaseUrl =
      process.env.CHART_PYTHON_API_INTERNAL_URL ??
      process.env.CHART_API_INTERNAL_URL ??
      process.env.NEXT_PUBLIC_CHART_API_URL ??
      "http://127.0.0.1:3210";

    return [
      {
        source: "/api/chart/:path*",
        destination: `${apiBaseUrl.replace(/\/$/, "")}/:path*`,
      },
    ];
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.(png|svg|jpg|jpeg|gif|webp)$/i,
      type: "asset/resource",
    });
    return config;
  },
};

export default nextConfig;
