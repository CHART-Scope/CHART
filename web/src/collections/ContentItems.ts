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
    defaultColumns: ["title", "tag", "workflowState", "solutionTypes", "updatedAt"],
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
    },
    {
      name: "body",
      type: "textarea",
      required: true,
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
            },
            {
              name: "externalImage",
              type: "group",
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
              fields: [
                {
                  name: "title",
                  type: "text",
                },
                {
                  name: "filename",
                  type: "text",
                },
                {
                  name: "url",
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
          ],
        },
        {
          label: "Solution repository",
          fields: [
            {
              name: "solutionTypes",
              type: "select",
              hasMany: true,
              options: [...solutionTypeOptions],
            },
            {
              name: "climateHazards",
              type: "select",
              hasMany: true,
              options: [...hazardOptions],
            },
            {
              name: "costOfImplementation",
              type: "select",
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
