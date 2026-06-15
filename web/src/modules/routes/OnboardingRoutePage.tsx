"use client";

import { OnboardingPage } from "../onboarding/OnboardingPage";
import type { CountryOption } from "../../lib/countries";
import { useChartNavigator } from "./useChartNavigator";

type OnboardingRoutePageProps = {
  countryOptions: CountryOption[];
};

export function OnboardingRoutePage({ countryOptions }: OnboardingRoutePageProps) {
  const navigate = useChartNavigator();

  return <OnboardingPage countryOptions={countryOptions} onNavigate={navigate} />;
}
