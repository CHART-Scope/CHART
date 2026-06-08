/** @type {import("next").NextConfig} */
const nextConfig = {
  images: {
    disableStaticImages: true,
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
