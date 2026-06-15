import React from "react";
import type { Decorator, Preview } from "@storybook/nextjs-vite";

import "../src/app/styles.css";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

const withAssetBasePath: Decorator = (Story) => {
  React.useEffect(() => {
    if (!BASE) return;
    function patchImgs(root: Element | Document) {
      root.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
        const src = img.getAttribute("src");
        if (src?.startsWith("/") && !src.startsWith("//") && !src.startsWith(BASE)) {
          img.src = BASE + src;
        }
      });
    }
    patchImgs(document);
    const observer = new MutationObserver((mutations) => {
      for (const { addedNodes } of mutations) {
        for (const node of addedNodes) {
          if (node instanceof Element) patchImgs(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return React.createElement(Story);
};

const preview: Preview = {
  decorators: [withAssetBasePath],
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
