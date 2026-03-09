# Rei dos Cachos — Plataforma B2B

Plataforma de vendas B2B para profissionais e revendedores de produtos capilares Rei dos Cachos.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Estilização | Tailwind CSS + design system customizado (gold brand) |
| Estado | TanStack Query + Context API |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions + RLS) |
| Deploy | Vercel (push to main → deploy automático) |
| Integrações | Fiqon (webhook), MercadoPago, Nuvemshop |

## Desenvolvimento local

```bash
npm install
npm run dev        # inicia servidor de desenvolvimento
npm run build      # build de produção
```

## Supabase

```bash
npx supabase db push          # aplica migrations pendentes
npx supabase functions deploy <nome>  # deploy de edge function
```

Projeto Supabase: `kjfsmwtwbreapipifjtu`

## Estrutura relevante

```
src/
  pages/           — páginas (Catalogo, Checkout, admin/*)
  components/      — componentes reutilizáveis
  hooks/           — hooks de tracking, produtos, upsell
  services/        — crm.ts (CRM service)
  types/           — crm.ts (tipos CRM)
  contexts/        — AuthContext, CartContext
supabase/
  migrations/      — SQL versionado (YYYYMMDDXXXXXX_nome.sql)
  functions/       — Edge functions Deno
docs/              — documentação operacional do projeto
```

## Documentação operacional

- [Arquitetura](./docs/architecture.md)
- [Roadmap CRM](./docs/roadmap.md)
- [Decisões técnicas](./docs/decisions.md)
- [Registro de prompts](./docs/prompt_registry.md)
- [Checklists de QA](./docs/qa_checklists.md)
- [Backlog futuro](./docs/backlog_future.md)
