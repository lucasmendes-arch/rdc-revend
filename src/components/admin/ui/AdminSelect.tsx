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
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-border bg-white text-foreground font-medium hover:border-gold-border focus:outline-none focus:ring-2 focus:ring-gold/30 shadow-sm shrink-0 cursor-pointer transition-colors ${className}`}
        >
          {Icon && <Icon className="w-3 h-3 text-muted-foreground" />}
          <span>{selectedLabel || placeholder}</span>
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        <DropdownMenuItem
          onClick={() => onChange('')}
          className={`text-xs font-medium cursor-pointer ${!value ? 'text-gold-text font-bold' : ''}`}
        >
          {allLabel}
        </DropdownMenuItem>
        {options.map(opt => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`text-xs font-medium cursor-pointer ${value === opt.value ? 'text-gold-text font-bold' : ''}`}
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
