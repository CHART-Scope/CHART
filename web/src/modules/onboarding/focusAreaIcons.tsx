import type { ImgHTMLAttributes } from "react";

type FocusAreaIconId =
  | "health"
  | "climate-environment"
  | "water-sanitation"
  | "education"
  | "agriculture"
  | "disaster-management"
  | "other";

type OnboardingIconId =
  | FocusAreaIconId
  | "extreme-heat"
  | "flooding"
  | "air-quality"
  | "drought"
  | "maternal-child-health"
  | "infectious-disease"
  | "nutrition"
  | "health-facilities"
  | "emergency-preparedness"
  | "heat-stroke"
  | "cardiovascular-disease";

type OnboardingIconProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "alt" | "height" | "src" | "width"
> & {
  id: string;
};

const iconSources: Record<OnboardingIconId, string> = {
  "air-quality": new URL("./assets/icons/air-quality.png", import.meta.url).toString(),
  agriculture: new URL("./assets/icons/agriculture.png", import.meta.url).toString(),
  "climate-environment": new URL(
    "./assets/icons/climate-environment.png",
    import.meta.url,
  ).toString(),
  "disaster-management": new URL(
    "./assets/icons/disaster-management.png",
    import.meta.url,
  ).toString(),
  drought: new URL("./assets/icons/drought.png", import.meta.url).toString(),
  education: new URL("./assets/icons/education.png", import.meta.url).toString(),
  "emergency-preparedness": new URL(
    "./assets/icons/emergency-preparedness.png",
    import.meta.url,
  ).toString(),
  "extreme-heat": new URL(
    "./assets/icons/extreme-heat.png",
    import.meta.url,
  ).toString(),
  flooding: new URL("./assets/icons/flooding.png", import.meta.url).toString(),
  health: new URL("./assets/icons/health.png", import.meta.url).toString(),
  "health-facilities": new URL(
    "./assets/icons/health-facilities.png",
    import.meta.url,
  ).toString(),
  "infectious-disease": new URL(
    "./assets/icons/infectious-disease.png",
    import.meta.url,
  ).toString(),
  "maternal-child-health": new URL(
    "./assets/icons/maternal-child-health.png",
    import.meta.url,
  ).toString(),
  nutrition: new URL("./assets/icons/nutrition.png", import.meta.url).toString(),
  other: new URL("./assets/icons/other.png", import.meta.url).toString(),
  "water-sanitation": new URL(
    "./assets/icons/water-sanitation.png",
    import.meta.url,
  ).toString(),
  "heat-stroke": new URL("./assets/icons/extreme-heat.png", import.meta.url).toString(),
  "cardiovascular-disease": new URL(
    "./assets/icons/health.png",
    import.meta.url,
  ).toString(),
};

export function OnboardingIcon({ id, ...props }: OnboardingIconProps) {
  const source = iconSources[id as OnboardingIconId] ?? iconSources.other;

  return (
    <img
      alt=""
      aria-hidden="true"
      draggable={false}
      height={160}
      src={source}
      width={160}
      {...props}
    />
  );
}

export type { FocusAreaIconId, OnboardingIconId };
