-- Consolidate duplicate client_sessions: keep only the most advanced session per user_id
-- Step 1: For each user_id with multiple sessions, keep the one with highest status rank
-- Step 2: Delete the duplicates

DO $$
DECLARE
  status_order text[] := ARRAY['abandonou', 'visitou', 'visualizou_produto', 'adicionou_carrinho', 'iniciou_checkout', 'comprou'];
BEGIN
  -- Delete duplicate sessions, keeping only the most advanced one per user_id
  DELETE FROM client_sessions
  WHERE id IN (
    SELECT cs.id
    FROM client_sessions cs
    INNER JOIN (
      -- For each user_id, find the "best" session (highest status + most recent)
      SELECT DISTINCT ON (user_id) id AS keep_id, user_id
      FROM client_sessions
      WHERE user_id IS NOT NULL
      ORDER BY user_id,
        array_position(ARRAY['abandonou', 'visitou', 'visualizou_produto', 'adicionou_carrinho', 'iniciou_checkout', 'comprou'], status) DESC,
        updated_at DESC
    ) best ON cs.user_id = best.user_id AND cs.id != best.keep_id
    WHERE cs.user_id IS NOT NULL
  );

  -- Update remaining sessions to use user_${user_id} as session_id
  UPDATE client_sessions
  SET session_id = 'user_' || user_id::text
  WHERE user_id IS NOT NULL
    AND session_id NOT LIKE 'user_%';
END $$;
