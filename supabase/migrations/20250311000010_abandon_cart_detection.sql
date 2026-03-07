-- Function to detect abandoned carts (added to cart or started checkout but didn't buy in 2+ hours)
CREATE OR REPLACE FUNCTION detect_abandoned_carts()
RETURNS integer AS $$
DECLARE
  abandoned_count integer := 0;
BEGIN
  UPDATE client_sessions
  SET status = 'abandonou', updated_at = NOW()
  WHERE status IN ('adicionou_carrinho', 'iniciou_checkout')
    AND updated_at < NOW() - INTERVAL '2 hours';

  GET DIAGNOSTICS abandoned_count = ROW_COUNT;

  IF abandoned_count > 0 THEN
    RAISE NOTICE 'Marked % sessions as abandoned', abandoned_count;
  END IF;

  RETURN abandoned_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Schedule abandon detection every 10 minutes
SELECT cron.schedule(
  'detect-abandoned-carts',
  '*/10 * * * *',
  'SELECT detect_abandoned_carts()'
);
