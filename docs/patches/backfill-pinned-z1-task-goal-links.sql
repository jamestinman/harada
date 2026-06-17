-- Backfill task_goal_links rows for pinned tasks (pseudo-goal Z1, goal_index = -1).
--
-- Prerequisites (run in order if not already applied):
--   1. docs/patches/add-task-link-tables.sql          (creates task_goal_links)
--   2. docs/patches/add-task-goal-link-ordering.sql    (adds ordering column)
--   3. docs/patches/add-task-goal-link-parent-id.sql (adds parent_id column)
--
-- Then run this backfill.

INSERT INTO task_goal_links (id, user_id, task_id, goal_index, ordering, parent_id, created_at, updated_at, deleted_at)
SELECT
  'tgl_' || replace(gen_random_uuid()::text, '-', ''),
  t.user_id,
  t.id,
  -1,
  t.ordering,
  CASE
    WHEN t.parent_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM tasks p
      WHERE p.id = t.parent_id
        AND p.user_id = t.user_id
        AND p.pinned = true
        AND p.deleted_at IS NULL
    ) THEN t.parent_id
    ELSE NULL
  END,
  COALESCE(t.created_at, NOW()),
  COALESCE(t.updated_at, NOW()),
  NULL
FROM tasks t
WHERE t.pinned = true
  AND t.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM task_goal_links l
    WHERE l.user_id = t.user_id
      AND l.task_id = t.id
      AND l.goal_index = -1
      AND l.deleted_at IS NULL
  );

-- Backfill note_goal_links for notes that should appear in pinned (optional: none by default).
