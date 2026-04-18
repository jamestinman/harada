/**
 * Per-route overrides for Nav composer callbacks from todo pages.
 * Layout passes defaults; active todo route registers stronger handlers here.
 */
class NavComposerHandlers {
	onCreateTodo = $state(/** @type {null | ((payload: unknown) => void)} */ (null));
	onCreateNote = $state(/** @type {null | (() => void)} */ (null));

	clear() {
		this.onCreateTodo = null;
		this.onCreateNote = null;
	}
}

export const navComposerHandlers = new NavComposerHandlers();
