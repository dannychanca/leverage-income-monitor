import { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-lg bg-hero-gradient p-5 text-white md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-xl font-semibold md:text-2xl">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-cyan-50/90">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
