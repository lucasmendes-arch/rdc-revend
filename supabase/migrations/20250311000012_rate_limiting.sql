-- Rate limiting table for edge functions
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT NOW(),
  request_count int NOT NULL DEFAULT 1,
  PRIMARY KEY (key)
);

-- Auto-cleanup old entries
CREATE INDEX idx_rate_limits_window ON public.rate_limits(window_start);

-- Function: check and increment rate limit
-- Returns TRUE if request is allowed, FALSE if rate limited
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key text,
  p_max_requests int,
  p_window_seconds int
) RETURNS boolean AS $$
DECLARE
  v_count int;
  v_window_start timestamptz;
BEGIN
  -- Try to get existing record
  SELECT request_count, window_start INTO v_count, v_window_start
  FROM rate_limits WHERE key = p_key FOR UPDATE;

  IF NOT FOUND THEN
    -- First request: create entry
    INSERT INTO rate_limits (key, window_start, request_count)
    VALUES (p_key, NOW(), 1)
    ON CONFLICT (key) DO UPDATE SET request_count = rate_limits.request_count + 1;
    RETURN TRUE;
  END IF;

  -- Check if window has expired
  IF v_window_start < NOW() - (p_window_seconds || ' seconds')::interval THEN
    -- Reset window
    UPDATE rate_limits SET window_start = NOW(), request_count = 1 WHERE key = p_key;
    RETURN TRUE;
  END IF;

  -- Within window: check count
  IF v_count >= p_max_requests THEN
    RETURN FALSE;
  END IF;

  -- Increment
  UPDATE rate_limits SET request_count = request_count + 1 WHERE key = p_key;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup old rate limit entries every hour
SELECT cron.schedule(
  'cleanup-rate-limits',
  '0 * * * *',
  $$DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 hour'$$
);

-- Disable RLS (internal system table)
ALTER TABLE public.rate_limits DISABLE ROW LEVEL SECURITY;
