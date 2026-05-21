import type { CollectionConfig } from "payload";

function isAuthenticated() {
  return ({ req }: { req: { user?: unknown } }) => Boolean(req.user);
}

export const ContentItems: CollectionConfig = {
  slug: "content-items",
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "type", "workflowState", "solutionType", "updatedAt"],
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
      name: "type",
      type: "select",
      required: true,
      options: [
        { label: "Solution", value: "solution" },
        { label: "Model", value: "model" },
        { label: "VRA", value: "vra" },
        { label: "Landing", value: "landing" },
      ],
    },
    {
      name: "title",
      type: "text",
      required: true,
    },
    {
      name: "tag",
      type: "text",
      required: true,
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
              name: "solutionType",
              type: "text",
            },
            {
              name: "solutionGroup",
              type: "text",
            },
            {
              name: "climateHazards",
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
              name: "healthDomains",
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
              name: "resiliencePhases",
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
              name: "costOfImplementation",
              type: "text",
            },
            {
              name: "implementationEffort",
              type: "text",
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
            {
              name: "organizationName",
              type: "text",
            },
            {
              name: "contactInformation",
              type: "text",
            },
          ],
        },
        {
          label: "Source",
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
