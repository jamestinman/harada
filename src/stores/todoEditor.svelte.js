/** Keeps full-task editor open across TodoItem remounts (e.g. after linking a goal). */
class TodoEditorStore {
	expandedTaskId = $state(/** @type {string | null} */ (null));
	draftTitle = $state('');
	draftMarkdown = $state('');

	open(taskId, { title = '', markdown = '' } = {}) {
		this.expandedTaskId = taskId;
		this.draftTitle = title;
		this.draftMarkdown = markdown;
	}

	syncDraft({ title, markdown }) {
		if (title !== undefined) this.draftTitle = title;
		if (markdown !== undefined) this.draftMarkdown = markdown;
	}

	close(taskId) {
		if (this.expandedTaskId === taskId) {
			this.expandedTaskId = null;
			this.draftTitle = '';
			this.draftMarkdown = '';
		}
	}

	clear() {
		this.expandedTaskId = null;
		this.draftTitle = '';
		this.draftMarkdown = '';
	}
}

export const todoEditorStore = new TodoEditorStore();
