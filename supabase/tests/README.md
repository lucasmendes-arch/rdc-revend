# Testes — Supabase

Scripts de validação para funções SQL, RPCs e comportamentos críticos.
Executar no **Supabase Dashboard > SQL Editor**, bloco por bloco.

## Índice

| Arquivo | O que testa | Funções cobertas |
|---|---|---|
| `test_partner_order_webhook.sql` | Disparo do webhook n8n em pedidos de parceiros, payload com kits expandidos e separation_list por categoria | `build_partner_order_payload`, `send_pending_partner_order_webhooks` |
| `test_webhook_revoke_execute.sql` | Valida que PUBLIC/anon/authenticated não têm EXECUTE nas funções de webhook; confirma owner e SECURITY DEFINER intactos | `build_partner_order_payload`, `send_pending_partner_order_webhooks` |

## Convenções

- Cada bloco é independente — selecione e rode separadamente
- Dados de teste são limpos ao final ou usam reset de flags (`partner_webhook_sent_at = NULL`)
- Consulte `docs/SCHEMA.md` antes de escrever queries (armadilhas de nomenclatura documentadas lá)
- Funções em feature freeze (`create-order`) não devem ser modificadas pelos scripts
