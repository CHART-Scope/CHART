import type { CollectionConfig } from "payload";

function isAuthenticated() {
  return ({ req }: { req: { user?: unknown } }) => Boolean(req.user);
}

export const Submissions: CollectionConfig = {
  slug: "submissions",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "organization", "state", "received"],
  },
  access: {
    read: isAuthenticated(),
    create: isAuthenticated(),
    update: isAuthenticated(),
    delete: isAuthenticated(),
  },
  fields: [
    {
      name: "organization",
      type: "text",
      required: true,
    },
    {
      name: "origin",
      type: "text",
      required: true,
    },
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "description",
      type: "textarea",
      required: true,
    },
    {
      name: "tags",
      type: "array",
      fields: [
        {
          name: "value",
          type: "text",
          required: true,
        },
      ],
    },
    {
      name: "received",
      type: "date",
      required: true,
    },
    {
      name: "state",
      type: "select",
      required: true,
      defaultValue: "new",
      options: [
        { label: "New", value: "new" },
        { label: "Imported", value: "imported" },
        { label: "Waiting", value: "waiting" },
      ],
    },
  ],
};
