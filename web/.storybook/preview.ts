import type { Preview } from "@storybook/nextjs-vite";
import { createElement } from "react";

import { QueryProvider } from "../src/lib/queryClient";

import "../src/styles/tokens.css";
import "../src/styles/globals.css";

const preview: Preview = {
  // Components read through the app's shared query cache.
  decorators: [(Story) => createElement(QueryProvider, null, createElement(Story))],
  parameters: {
    nextjs: { appDirectory: true },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    layout: "padded",
    options: {
      storySort: {
        order: ["Foundations", "Primitives", "Composites", "Pages"],
      },
    },
    backgrounds: {
      default: "ivory",
      values: [
        { name: "ivory", value: "#F7F5F3" },
        { name: "white", value: "#ffffff" },
        { name: "charcoal", value: "#2B2D31" },
      ],
    },
  },
};

export default preview;
