import { createFileRoute } from "@tanstack/react-router";
import { WardGame } from "@/components/WardGame";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <WardGame />;
}
