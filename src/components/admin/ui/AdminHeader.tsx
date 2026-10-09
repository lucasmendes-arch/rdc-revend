import React from 'react';

/**
 * @deprecated Use `AdminPage` (src/components/admin/ui/AdminPage.tsx), que
 * cuida do cabeçalho E do padding do conteúdo. Mantido com o mesmo visual do
 * cabeçalho do AdminPage para não destoar onde ainda for usado.
 */
interface AdminHeaderProps {
  title: string;
  subtitle?: string | React.ReactNode;
  badge?: React.ReactNode;
  actionNode?: React.ReactNode;
}

export function AdminHeader({ title, subtitle, badge, actionNode }: AdminHeaderProps) {
  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 pt-6 sm:pt-7 pb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-[22px] sm:text-[26px] leading-[1.15] text-foreground">{title}</h1>
          {badge}
        </div>
        {subtitle && <div className="mt-1 text-[13.5px] text-muted-foreground">{subtitle}</div>}
      </div>
      {actionNode && <div className="flex flex-wrap items-center gap-2 shrink-0">{actionNode}</div>}
    </div>
  );
}
