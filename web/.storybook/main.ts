import type { StorybookConfig } from "@storybook/nextjs-vite";

const config: StorybookConfig = {
  stories: ["../src/modules/**/*.stories.@(ts|tsx|mdx)"],
  staticDirs: ["../public"],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
  framework: {
    name: "@storybook/nextjs-vite",
    options: {},
  },
  async viteFinal(config) {
    const stableOutputNames = {
      assetFileNames: "assets/[name][extname]",
      chunkFileNames: "assets/[name].js",
      entryFileNames: "assets/[name].js",
    };
    const existingOutput = config.build?.rollupOptions?.output;
    const base = process.env.STORYBOOK_BASE_URL
      ? `${process.env.STORYBOOK_BASE_URL}/`
      : "/";

    return {
      ...config,
      base,
      build: {
        ...config.build,
        rollupOptions: {
          ...config.build?.rollupOptions,
          output: Array.isArray(existingOutput)
            ? existingOutput.map((output) => ({
                ...output,
                ...stableOutputNames,
              }))
            : {
                ...existingOutput,
                ...stableOutputNames,
              },
        },
      },
    };
  },
};

export default config;
