import { redirect } from "next/navigation"

/** Hub URL is not a working destination; sidebar opens child routes directly. */
export default function ConfigurationPage() {
  redirect("/configuration/meter-profiles")
}
