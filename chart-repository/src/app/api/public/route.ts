import { NextResponse } from "next/server";

export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json({
    service: "CHART Repository Public API",
    endpoints: [
      {
        label: "OpenAPI",
        href: "/api/public/openapi.json",
      },
      {
        label: "Solutions",
        href: "/api/public/solutions",
      },
      {
        label: "Solution taxonomies",
        href: "/api/public/solutions/taxonomies",
      },
      {
        label: "Hazards",
        href: "/api/public/hazards",
      },
      {
        label: "Health implications",
        href: "/api/public/health-implications",
      },
    ],
  });
}
