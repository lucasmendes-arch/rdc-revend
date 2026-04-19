-- Princípio de menor privilégio: restringe EXECUTE das funções de webhook de parceiro.
-- Por padrão PostgreSQL concede EXECUTE a PUBLIC; revogamos para limitar superfície de ataque.
-- Apenas pg_cron (service_role) e admins precisam chamar estas funções.

REVOKE EXECUTE ON FUNCTION build_partner_order_payload(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION send_pending_partner_order_webhooks() FROM PUBLIC;
