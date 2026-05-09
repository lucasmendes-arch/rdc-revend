# supabase/tests

Scripts de teste para RPCs, edge functions e comportamentos críticos do sistema.

## Como executar

- **`.sql`** → Supabase Dashboard → SQL Editor → rodar bloco por bloco
- **`.sh`** → terminal local: `bash supabase/tests/<arquivo>.sh`

---

## Índice

| Arquivo | O que testa | Funções cobertas |
|---|---|---|
| [test_get_seller_commission_summary.sql](test_get_seller_commission_summary.sql) | RPC de resumo de comissão por vendedor e período | `get_seller_commission_summary` |
| [test_send_seller_commission_report.sh](test_send_seller_commission_report.sh) | Edge function de geração de PDF + upload Storage + envio WhatsApp | `send-seller-commission-report` |
| [test_cron_commission_reports.sh](test_cron_commission_reports.sh) | Cron mensal de comissão: disparo sem JWT, período automático, contadores processed/skipped/errors | `cron-commission-reports`, `get_seller_commission_summary_internal` |
