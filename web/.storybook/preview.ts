import type { Preview } from "@storybook/nextjs-vite";

import "../src/app/styles.css";

const preview: Preview = {
  parameters: {
    nextjs: {
      appDirectory: true,
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: "centered",
    options: {
      storySort: {
        order: ["UI", "Pages", "Repository"],
      },
    },
  },
};

export default preview;
