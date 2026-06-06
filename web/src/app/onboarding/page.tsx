import { countryOptions } from "../../lib/countries";
import { OnboardingRoutePage } from "../../modules/routes/OnboardingRoutePage";

export default function Page() {
  return <OnboardingRoutePage countryOptions={countryOptions} />;
}
