import { redirect } from "next/navigation";

export default function Home() {
  // The app shell lives under (app); the dashboard is the landing surface.
  redirect("/dashboard");
}
