-- Backfill task_goal_links rows for unassigned no-goal tasks (pseudo-goal Z2, goal_index = -2).
--
-- Prerequisites (run in order if not already applied):
--   1. docs/patches/add-task-link-tables.sql
--   2. docs/patches/add-task-goal-link-ordering.sql
--   3. docs/patches/add-task-goal-link-parent-id.sql
--   4. docs/patches/backfill-pinned-z1-task-goal-links.sql (optional, independent)
--
-- Then run this backfill.

INSERT INTO task_goal_links (id, user_id, task_id, goal_index, ordering, parent_id, created_at, updated_at, deleted_at)
SELECT
  'tgl_' || replace(gen_random_uuid()::text, '-', ''),
  t.user_id,
  t.id,
  -2,
  t.ordering,
  CASE
    WHEN t.parent_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM tasks p
      WHERE p.id = t.parent_id
        AND p.user_id = t.user_id
        AND p.goal_index IS NULL
        AND (p.list_type IS NULL OR p.list_type = 'goal')
        AND p.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM task_goal_links pl
          WHERE pl.task_id = p.id
            AND pl.user_id = p.user_id
            AND pl.goal_index >= 0
            AND pl.deleted_at IS NULL
        )
    ) THEN t.parent_id
    ELSE NULL
  END,
  COALESCE(t.created_at, NOW()),
  COALESCE(t.updated_at, NOW()),
  NULL
FROM tasks t
WHERE t.deleted_at IS NULL
  AND (t.list_type IS NULL OR t.list_type = 'goal')
  AND t.goal_index IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM task_goal_links l
    WHERE l.user_id = t.user_id
      AND l.task_id = t.id
      AND l.goal_index >= 0
      AND l.deleted_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM task_goal_links l
    WHERE l.user_id = t.user_id
      AND l.task_id = t.id
      AND l.goal_index = -2
      AND l.deleted_at IS NULL
  );
