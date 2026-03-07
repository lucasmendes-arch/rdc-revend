-- Migrate old status values to new funnel statuses
UPDATE client_sessions SET status = 'adicionou_carrinho' WHERE status = 'escolhendo';
