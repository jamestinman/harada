-- Patch: add chart_events - an append-only log of structural chart operations
-- (goal moves, merges, clears). Safe to run multiple times.
--
-- Why:
-- State-based last-write-wins sync cannot tell "this goal was merged away on
-- another device" apart from "my copy still has it". Devices now record the
-- INTENT (the operation) here; other devices replay operations they have not
-- seen yet BEFORE running the snapshot merge, so moved/merged/deleted goals
-- stop resurrecting. The inverse column stores enough data for a future undo.
--
-- seq is server-assigned and gives every device the same canonical order,
-- independent of device clocks.

CREATE TABLE IF NOT EXISTS chart_events (
  seq BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  batch_id TEXT NOT NULL,
  client_event_id TEXT NOT NULL,
  op TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  inverse JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, client_event_id)
);

CREATE INDEX IF NOT EXISTS idx_chart_events_user_seq ON chart_events(user_id, seq);

ALTER TABLE chart_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    CREATE POLICY chart_events_select_own ON chart_events
      FOR SELECT USING (auth.uid() = user_id);
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;

-- Append-only: no UPDATE/DELETE policies. Inserts go through the RPC below so
-- user_id can never be spoofed. No direct INSERT policy either.

CREATE OR REPLACE FUNCTION append_chart_events(in_rows jsonb)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_data jsonb;
  inserted_count INTEGER := 0;
BEGIN
  IF in_rows IS NULL OR jsonb_typeof(in_rows) <> 'array' THEN
    RETURN 0;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;

  FOR row_data IN SELECT value FROM jsonb_array_elements(in_rows) AS t(value)
  LOOP
    -- Idempotent: a retried push of the same client_event_id is a no-op.
    INSERT INTO chart_events (user_id, device_id, batch_id, client_event_id, op, payload, inverse)
    VALUES (
      auth.uid(),
      COALESCE(row_data->>'device_id', 'unknown'),
      COALESCE(row_data->>'batch_id', ''),
      row_data->>'client_event_id',
      row_data->>'op',
      COALESCE(row_data->'payload', '{}'::jsonb),
      row_data->'inverse'
    )
    ON CONFLICT (user_id, client_event_id) DO NOTHING;

    IF FOUND THEN
      inserted_count := inserted_count + 1;
    END IF;
  END LOOP;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION append_chart_events(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION append_chart_events(jsonb) TO authenticated;

-- Live multi-device sessions: notify other devices about new events.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE chart_events;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
