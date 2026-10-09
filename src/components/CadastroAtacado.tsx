import { useState } from "react";
import { Button } from "@/components/ui/button";

import { useTrackConversion } from '@/lib/hooks/useFacebookConversion';

interface CadastroAtacadoValues {
  name: string;
  email: string;
  phone: string;
  city: string;
  state: string;
}

export interface CadastroAtacadoProps {
  onSubmit?: (values: CadastroAtacadoValues) => Promise<{ userId?: string } | void> | { userId?: string } | void;
}

function splitFullName(name: string): { firstName?: string; lastName?: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return {};
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ') || undefined,
  };
}

/**
 * Componente de exemplo mostrando como disparar o evento Lead após o cadastro.
 */
export function CadastroAtacado({ onSubmit }: CadastroAtacadoProps) {
  const trackConversion = useTrackConversion();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [formData, setFormData] = useState<CadastroAtacadoValues>({
    name: '',
    email: '',
    phone: '',
    city: '',
    state: '',
  });

  const handleChange = (field: keyof CadastroAtacadoValues, value: string) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const result = await onSubmit?.(formData);
      const { firstName, lastName } = splitFullName(formData.name);
      const externalId = result && typeof result === 'object' ? result.userId : undefined;

      trackConversion({
        eventName: 'Lead',
        email: formData.email,
        phone: formData.phone,
        firstName,
        lastName,
        city: formData.city,
        state: formData.state,
        country: 'br',
        contentName: 'Cadastro atacado',
        contentType: 'lead_form',
        externalId,
      });

      setMessage('Cadastro enviado. O evento Lead foi disparado.');
    } catch (error) {
      console.error('❌ Erro ao submeter CadastroAtacado:', error);
      setMessage('Não foi possível concluir o cadastro de exemplo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-5 shadow-xs">
      <div>
        <h2 className="text-[15px] font-semibold text-foreground tracking-tight">Cadastro atacado</h2>
        <p className="text-[13px] text-muted-foreground">
          Exemplo de uso do hook <code>useTrackConversion</code> após um cadastro concluído.
        </p>
      </div>

      <input
        required
        value={formData.name}
        onChange={(event) => handleChange('name', event.target.value)}
        placeholder="Nome completo"
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm text-foreground placeholder:text-ink-400 hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />

      <input
        required
        type="email"
        value={formData.email}
        onChange={(event) => handleChange('email', event.target.value)}
        placeholder="E-mail"
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm text-foreground placeholder:text-ink-400 hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />

      <input
        required
        value={formData.phone}
        onChange={(event) => handleChange('phone', event.target.value)}
        placeholder="WhatsApp"
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm text-foreground placeholder:text-ink-400 hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <input
          value={formData.city}
          onChange={(event) => handleChange('city', event.target.value)}
          placeholder="Cidade"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm text-foreground placeholder:text-ink-400 hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />

        <input
          value={formData.state}
          onChange={(event) => handleChange('state', event.target.value)}
          placeholder="Estado"
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm text-foreground placeholder:text-ink-400 hover:border-ink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
      </div>

      <Button
        type="submit"
        disabled={loading}
        size="lg"
        className="w-full"
      >
        {loading ? 'Enviando...' : 'Cadastrar e rastrear Lead'}
      </Button>

      {message ? <p className="text-[13px] text-muted-foreground">{message}</p> : null}
    </form>
  );
}
