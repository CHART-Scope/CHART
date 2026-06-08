import type { CollectionConfig } from "payload";

import {
  costOptions,
  hazardOptions,
  solutionTypeOptions,
} from "../lib/solutionRepositoryOptions";

function isAuthenticated() {
  return ({ req }: { req: { user?: unknown } }) => Boolean(req.user);
}

export const ContentItems: CollectionConfig = {
  slug: "content-items",
  admin: {
    useAsTitle: "title",
    defaultColumns: [
      "title",
      "workflowState",
      "solutionTypes",
      "climateHazards",
      "costOfImplementation",
      "updatedAt",
    ],
  },
  access: {
    read: () => true,
    create: isAuthenticated(),
    update: isAuthenticated(),
    delete: isAuthenticated(),
  },
  timestamps: true,
  versions: {
    drafts: true,
  },
  fields: [
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "tag",
      type: "select",
      required: true,
      admin: {
        description:
          "Derived from the first solution type. Kept for compatibility with older content cards.",
        hidden: true,
      },
      options: [...solutionTypeOptions],
    },
    {
      name: "workflowState",
      type: "select",
      required: true,
      defaultValue: "draft",
      options: [
        { label: "Draft", value: "draft" },
        { label: "In review", value: "review" },
        { label: "Scheduled", value: "scheduled" },
        { label: "Published", value: "published" },
      ],
    },
    {
      name: "owner",
      type: "text",
      defaultValue: "Editorial team",
    },
    {
      name: "scheduledDate",
      type: "date",
    },
    {
      name: "summary",
      type: "textarea",
      required: true,
      label: "Short summary",
      admin: {
        description:
          "Short text for cards and search results. Keep this shorter than the full description.",
      },
    },
    {
      name: "body",
      type: "textarea",
      required: true,
      label: "Description",
    },
    {
      type: "tabs",
      tabs: [
        {
          label: "Media",
          fields: [
            {
              name: "image",
              type: "relationship",
              relationTo: "media",
              label: "Cover image",
            },
            {
              name: "externalImage",
              type: "group",
              label: "Imported image metadata",
              admin: {
                description:
                  "Used for imported source images that have not been uploaded to the repository.",
              },
              fields: [
                {
                  name: "url",
                  type: "text",
                },
                {
                  name: "filename",
                  type: "text",
                },
                {
                  name: "type",
                  type: "text",
                },
                {
                  name: "size",
                  type: "number",
                },
              ],
            },
            {
              name: "caseStudies",
              type: "array",
              label: "Case study files and references",
              labels: {
                singular: "Case study",
                plural: "Case studies",
              },
              fields: [
                {
                  name: "title",
                  type: "text",
                },
                {
                  name: "file",
                  type: "relationship",
                  relationTo: "media",
                  label: "Uploaded file",
                  admin: {
                    description: "Upload or select a PDF, image, or video.",
                  },
                },
                {
                  name: "filename",
                  type: "text",
                  admin: {
                    description:
                      "Imported filename or display filename when no uploaded file exists.",
                  },
                },
                {
                  name: "url",
                  type: "text",
                  label: "External URL",
                },
                {
                  name: "type",
                  type: "text",
                },
                {
                  name: "size",
                  type: "number",
                },
              ],
            },
          ],
        },
        {
          label: "Solution repository",
          fields: [
            {
              name: "solutionTypes",
              type: "select",
              label: "Solution types",
              hasMany: true,
              options: [...solutionTypeOptions],
            },
            {
              name: "climateHazards",
              type: "select",
              label: "Climate hazards",
              hasMany: true,
              options: [...hazardOptions],
            },
            {
              name: "costOfImplementation",
              type: "select",
              label: "Cost of implementation",
              options: [...costOptions],
            },
            {
              name: "usefulLinks",
              type: "array",
              fields: [
                {
                  name: "label",
                  type: "text",
                },
                {
                  name: "url",
                  type: "text",
                  required: true,
                },
              ],
            },
          ],
        },
        {
          label: "System",
          admin: {
            hidden: true,
          },
          fields: [
            {
              name: "externalSource",
              type: "text",
            },
            {
              name: "externalId",
              type: "text",
            },
            {
              name: "sourceTable",
              type: "text",
            },
          ],
        },
      ],
    },
  ],
};
