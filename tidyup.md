# Tidy Up Notes

These are follow-up items to revisit after the live app and all app-store builds have moved past compatibility constraints.

## Task Link Migration

- Keep `tasks.parent_id` and `tasks.goal_index` for now so older builds keep working.
- Task hierarchy is back on `tasks.parent_id`; only task-to-goal relationships use `task_goal_links`.
- Once all supported builds understand `task_goal_links`, decide whether `tasks.goal_index` should remain as the primary goal field or become purely denormalized compatibility data.
- `note_task_links` remains in the schema because primary task notes depend on it, but free notes are currently linkable only to goals. Revisit whether user-visible note-to-task links should return.
- Consider extracting the duplicated note/task link UI into a shared component after both paths settle.
