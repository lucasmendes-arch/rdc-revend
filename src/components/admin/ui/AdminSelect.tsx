import React from 'react';
import { ChevronDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';

export interface AdminSelectOption {
  value: string;
  label: string;
}

interface AdminSelectProps {
  options: AdminSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  icon?: React.ElementType;
  allLabel?: string;
  className?: string;
}

export function AdminSelect({
  options,
  value,
  onChange,
  placeholder = 'Selecionar',
  icon: Icon,
  allLabel = 'Todos',
  className = '',
}: AdminSelectProps) {
  const selectedLabel = options.find(o => o.value === value)?.label;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`flex items-center gap-1.5 h-9 px-3 text-[13px] rounded-md border bg-card font-medium hover:border-ink-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background shrink-0 cursor-pointer transition-colors ${value ? 'border-brand-border text-foreground' : 'border-border text-ink-600'} ${className}`}
        >
          {Icon && <Icon className="w-3.5 h-3.5 text-ink-400" />}
          <span>{selectedLabel || placeholder}</span>
          <ChevronDown className="w-3.5 h-3.5 text-ink-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        <DropdownMenuItem
          onClick={() => onChange('')}
          className={`text-[13px] cursor-pointer ${!value ? 'text-foreground font-semibold' : ''}`}
        >
          {allLabel}
        </DropdownMenuItem>
        {options.map(opt => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`text-[13px] cursor-pointer ${value === opt.value ? 'text-foreground font-semibold' : ''}`}
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
