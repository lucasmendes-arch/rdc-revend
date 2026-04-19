-- Complementa a migration 000005: revoga EXECUTE também de anon e authenticated.
-- Teste (20260419) revelou grants explícitos residuais nesses roles após REVOKE FROM PUBLIC.

REVOKE EXECUTE ON FUNCTION build_partner_order_payload(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION send_pending_partner_order_webhooks() FROM anon, authenticated;
