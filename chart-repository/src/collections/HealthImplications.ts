import type { CollectionConfig } from "payload";

import { impactGroupOptions } from "../lib/chartRepositoryOptions";

function isAuthenticated() {
  return ({ req }: { req: { user?: unknown } }) => Boolean(req.user);
}

export const HealthImplications: CollectionConfig = {
  slug: "health-implications",
  admin: {
    useAsTitle: "label",
    defaultColumns: ["label", "impactGroup", "hazards", "sortOrder", "updatedAt"],
  },
  access: {
    read: () => true,
    create: isAuthenticated(),
    update: isAuthenticated(),
    delete: isAuthenticated(),
  },
  timestamps: true,
  fields: [
    {
      name: "externalId",
      type: "text",
      required: true,
      unique: true,
      admin: {
        description: "Stable public API ID, for example health-waterborne.",
      },
    },
    {
      name: "label",
      type: "text",
      required: true,
      unique: true,
    },
    {
      name: "impactGroup",
      type: "select",
      required: true,
      options: [...impactGroupOptions],
    },
    {
      name: "examples",
      type: "textarea",
    },
    {
      name: "hazards",
      type: "relationship",
      relationTo: "hazards",
      hasMany: true,
      required: true,
      admin: {
        description: "Hazards this health implication is associated with.",
      },
    },
    {
      name: "sortOrder",
      type: "number",
      defaultValue: 0,
      required: true,
    },
  ],
};
