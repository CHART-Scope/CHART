import type { CollectionConfig } from "payload";

function isAuthenticated() {
  return ({ req }: { req: { user?: unknown } }) => Boolean(req.user);
}

export const Media: CollectionConfig = {
  slug: "media",
  admin: {
    useAsTitle: "filename",
    defaultColumns: ["filename", "alt", "updatedAt"],
  },
  access: {
    read: () => true,
    create: isAuthenticated(),
    update: isAuthenticated(),
    delete: isAuthenticated(),
  },
  upload: {
    staticDir: "public/uploads",
    mimeTypes: ["image/*", "application/pdf"],
  },
  fields: [
    {
      name: "alt",
      type: "text",
    },
    {
      name: "source",
      type: "text",
    },
  ],
};
