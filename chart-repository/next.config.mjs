import path from "node:path";
import { fileURLToPath } from "node:url";

import { withPayload } from "@payloadcms/next/withPayload";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
  outputFileTracingRoot: dirname,
  images: {
    disableStaticImages: true,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@payload-config": path.resolve(dirname, "payload.config.ts"),
      "@/*": path.resolve(dirname, "src"),
    };

    config.module.rules.push({
      test: /\.(png|svg|jpg|jpeg|gif|webp)$/i,
      type: "asset/resource",
    });

    return config;
  },
};

export default withPayload(nextConfig);
