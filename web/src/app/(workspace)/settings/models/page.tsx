import { redirect } from "next/navigation";

/** Model releases now live in the Models tab of Settings; old links land there. */
export default function ModelsPage() {
  redirect("/settings?tab=models");
}
