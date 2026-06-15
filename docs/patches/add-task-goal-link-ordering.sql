-- Per-goal task ordering for tasks linked to multiple goals.
-- Primary goal position remains on tasks.ordering; secondary appearances use task_goal_links.ordering.

ALTER TABLE task_goal_links
  ADD COLUMN IF NOT EXISTS ordering DOUBLE PRECISION NULL;

CREATE OR REPLACE FUNCTION upsert_task_goal_links_if_newer(in_rows jsonb)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_data jsonb;
  affected_count INTEGER := 0;
BEGIN
  IF in_rows IS NULL OR jsonb_typeof(in_rows) <> 'array' THEN
    RETURN 0;
  END IF;

  FOR row_data IN SELECT value FROM jsonb_array_elements(in_rows) AS t(value)
  LOOP
    IF (row_data->>'user_id')::uuid IS DISTINCT FROM auth.uid() THEN
      CONTINUE;
    END IF;

    INSERT INTO task_goal_links (
      id, user_id, task_id, goal_index, ordering, created_at, updated_at, deleted_at
    )
    VALUES (
      row_data->>'id',
      (row_data->>'user_id')::uuid,
      row_data->>'task_id',
      NULLIF(row_data->>'goal_index', '')::integer,
      NULLIF(row_data->>'ordering', '')::double precision,
      COALESCE((row_data->>'created_at')::timestamptz, NOW()),
      COALESCE((row_data->>'updated_at')::timestamptz, NOW()),
      NULLIF(row_data->>'deleted_at', '')::timestamptz
    )
    ON CONFLICT (user_id, task_id, goal_index) DO UPDATE
    SET
      ordering = EXCLUDED.ordering,
      updated_at = EXCLUDED.updated_at,
      deleted_at = EXCLUDED.deleted_at
    WHERE
      task_goal_links.user_id = auth.uid()
      AND EXCLUDED.updated_at > task_goal_links.updated_at;

    IF FOUND THEN
      affected_count := affected_count + 1;
    END IF;
  END LOOP;

  RETURN affected_count;
END;
$$;

REVOKE ALL ON FUNCTION upsert_task_goal_links_if_newer(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_task_goal_links_if_newer(jsonb) TO authenticated;
