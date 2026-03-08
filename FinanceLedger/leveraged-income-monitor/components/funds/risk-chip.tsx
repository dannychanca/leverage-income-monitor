import { Badge } from "@/components/ui/badge";

export function RiskChip({ label, level }: { label: string; level: "ok" | "warning" | "danger" }) {
  if (level === "danger") return <Badge variant="destructive">{label}</Badge>;
  if (level === "warning") return <Badge variant="warning">{label}</Badge>;
  return <Badge variant="success">{label}</Badge>;
}
