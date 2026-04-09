import React from 'react';

interface AdminHeaderProps {
  title: string;
  subtitle?: string | React.ReactNode;
  badge?: React.ReactNode;
  actionNode?: React.ReactNode;
}

export function AdminHeader({ title, subtitle, badge, actionNode }: AdminHeaderProps) {
  return (
    <div className="w-full">
      <div className="px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Bloco Esquerdo (Título e Subtítulo) */}
        <div className="flex flex-col gap-1 items-start w-full sm:w-auto shrink-0 justify-center">
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">{title}</h1>
            {badge && (
               <div className="flex items-center">
                 {badge}
               </div>
            )}
          </div>
          {subtitle && (
            <div className="text-xs text-muted-foreground mt-0.5 font-medium">
              {subtitle}
            </div>
          )}
        </div>

        {/* Bloco Direito (Ações, Botões Secundários) */}
        {actionNode && (
          <div className="flex flex-wrap items-center gap-3 justify-start sm:justify-end sm:ml-auto w-full sm:w-auto shrink-0">
            {actionNode}
          </div>
        )}
      </div>
    </div>
  );
}
