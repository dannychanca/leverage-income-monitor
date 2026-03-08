import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SummaryCard({
  title,
  value,
  subtitle,
  tone = "neutral",
}: {
  title: string;
  value: string;
  subtitle?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    neutral: "border-cyan-100",
    success: "border-emerald-200",
    warning: "border-amber-200",
    danger: "border-red-200",
  }[tone];

  return (
    <Card className={`${toneClass} flex h-full min-h-[180px] flex-col`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        <p className="mt-2 min-h-[2.5rem] text-xs text-muted-foreground">{subtitle ?? "\u00A0"}</p>
      </CardContent>
    </Card>
  );
}
