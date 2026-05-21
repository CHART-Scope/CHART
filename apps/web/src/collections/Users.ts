import type { CollectionConfig } from "payload";

export const Users: CollectionConfig = {
  slug: "users",
  admin: {
    useAsTitle: "email",
  },
  auth: true,
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
    },
    {
      name: "role",
      type: "select",
      defaultValue: "editor",
      options: [
        {
          label: "Editor",
          value: "editor",
        },
        {
          label: "Admin",
          value: "admin",
        },
      ],
      required: true,
    },
  ],
};
