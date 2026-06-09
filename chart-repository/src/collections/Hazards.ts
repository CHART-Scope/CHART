import type { CollectionConfig } from "payload";

function isAuthenticated() {
  return ({ req }: { req: { user?: unknown } }) => Boolean(req.user);
}

export const Hazards: CollectionConfig = {
  slug: "hazards",
  admin: {
    useAsTitle: "label",
    defaultColumns: ["label", "hazardGroup", "active", "sortOrder", "updatedAt"],
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
        description: "Stable public API ID, for example hazard-flood.",
      },
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
    },
    {
      name: "label",
      type: "text",
      required: true,
      unique: true,
    },
    {
      name: "description",
      type: "textarea",
    },
    {
      name: "hazardGroup",
      type: "select",
      label: "Hazard group",
      options: [
        { label: "Climatological", value: "climatological" },
        { label: "Environmental change", value: "environmental_change" },
        { label: "Geophysical", value: "geophysical" },
        { label: "Hydrological", value: "hydrological" },
        { label: "Meteorological", value: "meteorological" },
      ],
    },
    {
      name: "imageUrl",
      type: "text",
      label: "Image URL",
    },
    {
      name: "active",
      type: "checkbox",
      defaultValue: true,
      required: true,
    },
    {
      name: "sortOrder",
      type: "number",
      defaultValue: 0,
      required: true,
    },
  ],
};
