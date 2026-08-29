import type { Metadata } from "next";
import { DecisionWorkspace } from "@/components/workspace/DecisionWorkspace";

export const metadata: Metadata = {
  title: "Decision Workspace — DecisionCart",
  description:
    "Compare products with transparent, deterministic scoring. Adjust priorities and see rankings change in real time.",
};

export default function WorkspacePage() {
  return <DecisionWorkspace />;
}
