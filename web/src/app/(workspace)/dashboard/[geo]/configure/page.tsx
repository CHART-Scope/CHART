"use client";

import { use } from "react";

import { ConfigurePlan } from "@/features/planConfigure";

type PageProps = {
  params: Promise<{ geo: string }>;
  searchParams: Promise<{
    admin_unit?: string;
    outcome?: string;
    plan?: string;
    step?: string;
  }>;
};

/** Configure plan (canvas frames 10-14) for a place and outcome. */
export default function ConfigurePlanPage(props: PageProps) {
  const geographyId = use(props.params).geo;
  const query = use(props.searchParams);
  return (
    <ConfigurePlan
      geographyId={geographyId}
      adminUnit={query.admin_unit ?? null}
      outcome={query.outcome ?? "lbw"}
      planId={query.plan ?? null}
      step={query.step ?? null}
    />
  );
}
