<script>
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import HaradaHeader from '$components/HaradaHeader.svelte';
  import HaradaFooter from '$components/HaradaFooter.svelte';
  import HaradaTodoPanel from '$components/HaradaTodoPanel.svelte';
  import { store } from '$stores/store.svelte.js';
  import { authStore } from '$stores/auth.svelte.js';

	const defaultCell = () => ({ text: '', status: 'todo', readme: '' });

	// Load initial data in JSON format (matching Supabase structure)
	// Note: goalIndices will be computed later from the grid, so we use empty array here
	const initialData = store.loadData(defaultCell, []);
	let grid = $state(initialData.grid);
	let todos = $state(normalizeTodos(initialData.todos));
	let isLoadingFromSupabase = $state(false);

	// Handle auth state changes - load from Supabase when user logs in
	$effect(() => {
		if (!browser) return;
		
		const user = authStore.user;
		
		if (user && !isLoadingFromSupabase) {
			loadFromSupabaseAndMigrate();
		} else if (!user) {
			// User logged out - unsubscribe from realtime
			store.unsubscribeFromRealtimeUpdates();
		}
	});

	async function loadFromSupabaseAndMigrate() {
		isLoadingFromSupabase = true;
		
		try {
			// Try to load from Supabase first
			const supabaseData = await store.loadFromSupabase();
			
			if (supabaseData) {
				// Use Supabase data
				grid = supabaseData.grid;
				todos = normalizeTodos(supabaseData.todos);
				// Save Supabase data locally in JSON format
				store.saveData(grid, todos);
			} else {
				// No Supabase data, migrate local data
				// Note: goalIndices computed later, empty array uses default goal index (40)
				const localData = store.loadData(defaultCell, []);
				
				const hasLocalData = localData.grid.some(c => c.text.trim()) || localData.todos.length > 0;
				
				if (hasLocalData) {
					// Upload local data to Supabase
					await store.saveToSupabase(localData.grid, normalizeTodos(localData.todos));
					grid = localData.grid;
					todos = normalizeTodos(localData.todos);
				}
			}
			
			// Subscribe to realtime updates
			store.subscribeToRealtimeUpdates((update) => {
				// Only update if data is different (avoid infinite loops)
				const currentGridStr = JSON.stringify(grid);
				const updateGridStr = JSON.stringify(update.grid);
				
				if (currentGridStr !== updateGridStr || JSON.stringify(todos) !== JSON.stringify(update.todos)) {
					grid = update.grid;
					todos = normalizeTodos(update.todos);
					// Save realtime updates locally in JSON format
					store.saveData(grid, todos);
				}
			});
		} catch (error) {
			console.error('Error loading from Supabase:', error);
		} finally {
			isLoadingFromSupabase = false;
		}
	}

	// Save to persistent storage whenever grid or todos change
	let saveTimeout;
	$effect(() => {
		if (!browser || isLoadingFromSupabase) return;
		
		const gridSnapshot = grid;
		const todosSnapshot = todos;
		
		// Save to localStorage immediately (local-first) in JSON format
		store.saveData(gridSnapshot, todosSnapshot);
		
		// Debounce sync to Supabase (if logged in)
		if (authStore.user) {
			clearTimeout(saveTimeout);
			saveTimeout = setTimeout(() => {
				store.syncWithSupabase(gridSnapshot, todosSnapshot);
			}, 1000);
		}
	});

	// Get the block index (0-8) for a given cell
	function getBlockIndex(row, col) {
		const blockRow = Math.floor(row / 3);
		const blockCol = Math.floor(col / 3);
		return blockRow * 3 + blockCol;
	}

	// Check if cell is the center of its 3x3 block
	function isBlockCenter(row, col) {
		return row % 3 === 1 && col % 3 === 1;
	}

	// Check if cell is in the center 3x3 block
	function isCenterBlock(row, col) {
		return row >= 3 && row <= 5 && col >= 3 && col <= 5;
	}

	// The main goal cell (very center)
	function isMainGoal(row, col) {
		return row === 4 && col === 4;
	}

	// Sub-goal cells (center block, not main goal)
	function isSubGoal(row, col) {
		return isCenterBlock(row, col) && !isMainGoal(row, col);
	}

	// Get the linked cell index for sub-goals
	// Sub-goals in center block link to centers of outer blocks
	function getLinkedCellIndex(row, col) {
		if (!isCenterBlock(row, col) || isMainGoal(row, col)) return null;

		// Map position in center block to outer block center
		const localRow = row - 3; // 0, 1, or 2
		const localCol = col - 3; // 0, 1, or 2

		// The outer block's row/col
		const blockRow = localRow;
		const blockCol = localCol;

		// Skip center block (1, 1)
		if (blockRow === 1 && blockCol === 1) return null;

		// Center of that outer block
		const targetRow = blockRow * 3 + 1;
		const targetCol = blockCol * 3 + 1;

		return targetRow * 9 + targetCol;
	}

	// Get the linked cell for outer block centers
	function getCenterBlockLinkedIndex(row, col) {
		if (isCenterBlock(row, col)) return null;
		if (!isBlockCenter(row, col)) return null;

		const blockRow = Math.floor(row / 3);
		const blockCol = Math.floor(col / 3);

		// Map to center block position
		const centerRow = 3 + blockRow;
		const centerCol = 3 + blockCol;

		return centerRow * 9 + centerCol;
	}

	function getPairedGoalIndex(index) {
		const row = Math.floor(index / 9);
		const col = index % 9;
		return getLinkedCellIndex(row, col) ?? getCenterBlockLinkedIndex(row, col);
	}

	function syncPairedGoalCell(index) {
		const pairIndex = getPairedGoalIndex(index);
		if (pairIndex === null) return;
		grid[pairIndex].text = grid[index].text;
		grid[pairIndex].status = grid[index].status;
		grid[pairIndex].readme = grid[index].readme;
	}

	function normalizeTodoGoalIndex(goalIndex) {
		if (typeof goalIndex !== 'number' || goalIndex < 0 || goalIndex > 80) {
			return goalIndex;
		}
		const row = Math.floor(goalIndex / 9);
		const col = goalIndex % 9;
		const linkedOuter = getLinkedCellIndex(row, col);
		return linkedOuter ?? goalIndex;
	}

	function normalizeTodos(nextTodos) {
		return (nextTodos ?? []).map((todo) => {
			const normalizedGoalIndex = normalizeTodoGoalIndex(todo?.goalIndex);
			if (!todo || normalizedGoalIndex === todo.goalIndex) return todo;
			return { ...todo, goalIndex: normalizedGoalIndex };
		});
	}

	// Update cell text and sync linked cells
	function updateCell(index, value) {
		grid[index].text = value;
		syncPairedGoalCell(index);
	}

	function cycleStatus(index) {
		const current = grid[index].status;
		const next = current === 'todo' ? 'underway' : current === 'underway' ? 'done' : 'todo';
		grid[index].status = next;
		syncPairedGoalCell(index);
	}

	function clearAll() {
		if (confirm('Clear all cells? This cannot be undone.')) {
			grid = Array.from({ length: 81 }, () => defaultCell());
		}
	}

	// Get color class based on block
	function getBlockColor(row, col) {
		const blockIndex = getBlockIndex(row, col);
		const colors = [
			'bg-rose-950/40 border-rose-800/30',
			'bg-amber-950/40 border-amber-800/30',
			'bg-lime-950/40 border-lime-800/30',
			'bg-cyan-950/40 border-cyan-800/30',
			'bg-violet-950/60 border-violet-700/50',
			'bg-sky-950/40 border-sky-800/30',
			'bg-fuchsia-950/40 border-fuchsia-800/30',
			'bg-teal-950/40 border-teal-800/30',
			'bg-orange-950/40 border-orange-800/30'
		];
		return colors[blockIndex];
	}

	function getCellClasses(row, col, index) {
		let classes = 'relative ';
		const status = grid[index]?.status ?? 'todo';

		// Main goal: strong green when done, otherwise original styling
		if (isMainGoal(row, col)) {
			if (status === 'done') {
				classes +=
					'bg-gradient-to-br from-emerald-500 to-green-500 border-2 border-emerald-300 text-white font-bold shadow-lg shadow-emerald-400/50 z-10';
			} else if (status === 'underway') {
				classes +=
					'bg-gradient-to-br from-yellow-500 to-amber-500 border-2 border-yellow-300 text-white font-bold shadow-lg shadow-yellow-400/50 z-10';
			} else {
				classes +=
					'bg-gradient-to-br from-violet-600 to-fuchsia-600 border-2 border-violet-400 text-white font-bold shadow-lg shadow-violet-500/30 z-10';
			}
		} else if (isSubGoal(row, col)) {
			// Sub-goals: strong green when done, otherwise original styling
			if (status === 'done') {
				classes +=
					'bg-gradient-to-br from-emerald-600 to-green-600 border border-emerald-400 text-white font-semibold shadow-lg shadow-emerald-500/40';
			} else if (status === 'underway') {
				classes +=
					'bg-gradient-to-br from-yellow-600 to-amber-600 border border-yellow-400 text-white font-semibold shadow-lg shadow-yellow-500/40';
			} else {
				classes +=
					'bg-gradient-to-br from-violet-800/80 to-fuchsia-800/80 border border-violet-500/50 text-violet-100 font-semibold';
			}
		} else if (isBlockCenter(row, col)) {
			// Linked sub-goals: strong green when done, otherwise original styling
			if (status === 'done') {
				classes +=
					'bg-gradient-to-br from-emerald-600 to-green-600 border border-emerald-400 text-white font-semibold shadow-lg shadow-emerald-500/40';
			} else if (status === 'underway') {
				classes +=
					'bg-gradient-to-br from-yellow-600 to-amber-600 border border-yellow-400 text-white font-semibold shadow-lg shadow-yellow-500/40';
			} else {
				classes +=
					'bg-gradient-to-br from-slate-700/80 to-slate-800/80 border border-slate-500/50 text-slate-100 font-semibold';
			}
		} else {
			// Action / task squares: color driven by status
			if (status === 'underway') {
				classes +=
					'bg-yellow-900/80 border-yellow-500/70 text-yellow-50 shadow-inner shadow-yellow-500/20';
			} else if (status === 'done') {
				classes +=
					'bg-emerald-900/80 border-emerald-500/80 text-emerald-50 shadow-inner shadow-emerald-500/25';
			} else {
				classes += getBlockColor(row, col) + ' border border-slate-700/50 text-slate-200';
			}
		}

		return classes;
	}

	/* --- To-do list state --- */

	const goalIndices = Array.from({ length: 81 }, (_, i) => i);

	// Track which goal square has expanded readme view
	let expandedReadmeIndex = $state(null);

	// Get preview of readme (first line, max ~30 chars)
	function getReadmePreview(readme) {
		if (!readme || !readme.trim()) return '';
		const firstLine = readme.split('\n')[0].trim();
		if (firstLine.length <= 30) return firstLine;
		return firstLine.slice(0, 27) + '...';
	}

	// Check if readme has more content than preview
	function hasMoreReadme(readme) {
		if (!readme || !readme.trim()) return false;
		const lines = readme.split('\n');
		return lines.length > 1 || lines[0].trim().length > 30;
	}

	function createId() {
		if (typeof crypto !== 'undefined' && crypto.randomUUID) {
			return crypto.randomUUID();
		}
		return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
	}

	function defaultTodo() {
		return {
			id: createId(),
			goalIndex: goalIndices[0] ?? 40, // center cell fallback
			title: '',
			markdown: '',
			status: 'todo',
			createdAt: Date.now()
		};
	}

	function loadTodos() {
		const saved = localGet(TODO_STORAGE_KEY, []);
		if (!Array.isArray(saved)) return [];

		return saved
			.map((t) => {
				if (!t || typeof t !== 'object') return null;
				const goalIndex =
					typeof t.goalIndex === 'number' && goalIndices.includes(t.goalIndex)
						? t.goalIndex
						: goalIndices[0] ?? 40;

				return {
					...defaultTodo(),
					...t,
					id: t.id || createId(),
					goalIndex
				};
			})
			.filter(Boolean);
	}

	// Convert goal index to an alphanumeric route key, e.g. 40 -> "E5".
	// (column E, row 5). This is purely a display/URL concern; todos
	// still use the numeric grid index internally.
	function indexToNomenclature(index) {
		const row = Math.floor(index / 9) + 1; // 1-9
		const col = (index % 9) + 1; // 1-9
		const colLetter = String.fromCharCode(64 + col); // A-I
		return `${colLetter}${row}`;
	}

	// Convert route key back to a goal index.
	// Primary format is column-letter+row (e.g. "E5"), but we also
	// accept a plain numeric index (e.g. "40") for backwards
	// compatibility.
	function nomenclatureToIndex(nomenclature) {
		if (!nomenclature) return null;

		// First, try column-letter+row code (e.g. "E5")
		if (nomenclature.length >= 2) {
			const match = nomenclature.match(/^([A-I])(\d)$/i);
			if (match) {
				const col = match[1].toUpperCase().charCodeAt(0) - 64; // A=1, B=2, etc.
				const row = parseInt(match[2], 10) - 1; // 0-8
				if (row >= 0 && row <= 8 && col >= 1 && col <= 9) {
					const index = row * 9 + (col - 1);
					if (goalIndices.includes(index)) return index;
				}
			}
		}

		// Legacy fallback: row+column-letter (e.g. "5E")
		if (nomenclature.length >= 2) {
			const legacyMatch = nomenclature.match(/^(\d)([A-I])$/i);
			if (legacyMatch) {
				const row = parseInt(legacyMatch[1], 10) - 1; // 0-8
				const col = legacyMatch[2].toUpperCase().charCodeAt(0) - 64; // A=1, B=2, etc.
				if (row >= 0 && row <= 8 && col >= 1 && col <= 9) {
					const index = row * 9 + (col - 1);
					if (goalIndices.includes(index)) return index;
				}
			}
		}

		// Fallback: plain numeric key (e.g. "40")
		if (/^\d+$/.test(nomenclature)) {
			const numericIndex = parseInt(nomenclature, 10);
			if (Number.isNaN(numericIndex)) return null;
			return goalIndices.includes(numericIndex) ? numericIndex : null;
		}

		return null;
	}

	// Make the current path and goal param reactive via runes
	const pathname = $derived(page.url.pathname);
	const goalRouteParam = $derived(page.params.goal);

	// Read URL parameter on mount and when URL changes
	$effect(() => {
		if (!browser) return;

		const path = pathname;

		// Handle /todo route - show all tasks

		// Handle /todo/[goal] route - show specific goal's tasks
		if (path.startsWith('/todo/')) {
			const goalParam = goalRouteParam || path.slice('/todo/'.length);
			if (goalParam && goalParam !== '') {
				const goalIndex = nomenclatureToIndex(goalParam);
				if (goalIndex !== null) {
					store.selectedGoalFilter = String(normalizeTodoGoalIndex(goalIndex));
					store.activeTab = 'todo';
				} else {
					// Invalid goal param, redirect to /todo
					goto('/todo', { replaceState: true });
				}
			}
			return;
		}

		// On root route, default to harada tab
		if (path === '/') {
			store.activeTab = 'harada';
		}
	});

	function getGoalLabelFromIndex(index) {
		const i = typeof index === 'string' ? parseInt(index, 10) : index;
		if (Number.isNaN(i) || i < 0 || i > 80) return 'Unknown goal';

		const row = Math.floor(i / 9);
		const col = i % 9;
		const cell = grid[i];
		const text = (cell?.text ?? '').trim();

		let prefix = 'Square';
		if (isMainGoal(row, col)) {
			prefix = 'CENTRAL GOAL';
		} else if (isSubGoal(row, col)) {
			prefix = 'Sub-goal';
		} else if (isBlockCenter(row, col)) {
			prefix = 'Goal';
		}

		if (text) return `${prefix}: ${text}`;
		return `${prefix} (${row + 1},${col + 1})`;
	}

	// Get goals in the proper order: CENTRAL GOAL, then each goal area (outer block center + sub-goal)
	function getOrderedGoalIndices() {
		const ordered = [40];
		for (let i = 0; i < 81; i++) {
			if (i !== 40) ordered.push(i);
		}
		return ordered;
	}
	
	// Pre-computed goal options for the to-do panel
	const goalOptions = $derived(
		[...new Set(getOrderedGoalIndices().map((idx) => normalizeTodoGoalIndex(idx)))].map(
			(idx, i) => ({
				index: idx,
				code: indexToNomenclature(idx),
				label:
					i === 0
						? `CENTRAL GOAL: ${getGoalLabelFromIndex(idx).replace(/^CENTRAL GOAL:\s*/, '')}`
						: getGoalLabelFromIndex(idx)
			})
		)
	);

	function addTodo() {
		if (!store.selectedGoalForNew) return;
		const goalIndex = parseInt(store.selectedGoalForNew, 10);
		if (Number.isNaN(goalIndex)) return;

		const todo = {
			...defaultTodo(),
			goalIndex: normalizeTodoGoalIndex(goalIndex)
		};
		todos = [...todos, todo];
	}

	function updateTodo(id, patch) {
		const nextPatch =
			typeof patch?.goalIndex === 'number'
				? { ...patch, goalIndex: normalizeTodoGoalIndex(patch.goalIndex) }
				: patch;
		todos = todos.map((t) => (t.id === id ? { ...t, ...nextPatch } : t));
	}

	function deleteTodo(id) {
		if (!confirm('Delete this to-do item?')) return;
		todos = todos.filter((t) => t.id !== id);
	}

	function cycleTodoStatus(id) {
		const statuses = ['todo', 'underway', 'done'];
		todos = todos.map((t) => {
			if (t.id !== id) return t;
			const currentIndex = statuses.indexOf(t.status ?? 'todo');
			const next = statuses[(currentIndex + 1) % statuses.length];
			return { ...t, status: next };
		});
	}

	function escapeHtml(str) {
		return str
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function renderMarkdown(md) {
		if (!md) return '';
		let html = escapeHtml(md);

		// Headings
		html = html.replace(/^### (.*)$/gim, '<h3 class="text-xs font-semibold mb-1">$1</h3>');
		html = html.replace(/^## (.*)$/gim, '<h2 class="text-xs font-semibold mb-1">$1</h2>');
		html = html.replace(/^# (.*)$/gim, '<h1 class="text-xs font-semibold mb-1">$1</h1>');

		// Bold / italic / code
		html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
		html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');
		html = html.replace(/`([^`]+)`/gim, '<code class="rounded bg-slate-800 px-1 py-0.5 text-[10px]">$1</code>');

		// Simple unordered lists
		html = html.replace(/^(?:-|\*) (.*)$/gim, '<li class="ml-4 list-disc">$1</li>');
		html = html.replace(/(<li[\s\S]*?<\/li>)/gim, '<ul class="mb-1">$1</ul>');

		// Line breaks
		html = html.replace(/\n/g, '<br />');

		return html;
	}

	/* --- Markdown serialization --- */

	// Escape markdown special characters in code blocks
	function escapeMarkdownInCodeBlock(text) {
		return text.replace(/```/g, '\\`\\`\\`');
	}

	// Get sub-goal indices (center block excluding main goal)
	function getSubGoalIndices() {
		const indices = [];
		for (let row = 3; row <= 5; row++) {
			for (let col = 3; col <= 5; col++) {
				if (row === 4 && col === 4) continue; // Skip main goal
				indices.push(row * 9 + col);
			}
		}
		return indices;
	}

	// Get action item indices around an outer block center
	function getActionItemsAroundBlockCenter(blockCenterIndex) {
		const row = Math.floor(blockCenterIndex / 9);
		const col = blockCenterIndex % 9;
		const blockRow = Math.floor(row / 3);
		const blockCol = Math.floor(col / 3);
		
		const actionItems = [];
		for (let r = blockRow * 3; r < blockRow * 3 + 3; r++) {
			for (let c = blockCol * 3; c < blockCol * 3 + 3; c++) {
				// Skip the center itself
				if (r % 3 === 1 && c % 3 === 1) continue;
				actionItems.push(r * 9 + c);
			}
		}
		return actionItems;
	}

	// Serialize grid and todos to markdown
	function serializeToMarkdown(currentGrid, currentTodos) {
		const gridToUse = currentGrid ?? grid;
		const todosToUse = currentTodos ?? todos;
		const lines = [];
		
		// Main goal (H1)
		const mainGoalIndex = 40;
		const mainGoal = gridToUse[mainGoalIndex];
		const mainGoalText = (mainGoal?.text ?? '').trim() || 'Overall (central) goal';
		lines.push(`# ${mainGoalText}`);
		
		if (mainGoal?.text?.trim()) {
			// Add status info if underway or done
			if (mainGoal.status === 'underway') {
				lines.push('Status: Underway');
			} else if (mainGoal.status === 'done') {
				lines.push('Status: Done');
			}
		}
		
		// Add README content if present
		const mainGoalReadme = (mainGoal?.readme ?? '').trim();
		if (mainGoalReadme) {
			if (mainGoal?.text?.trim() && (mainGoal.status === 'underway' || mainGoal.status === 'done')) {
				lines.push('');
			}
			lines.push(mainGoalReadme);
		}
		
		lines.push('');

		// Sub-goals (H2) - Always save all 8, even if blank, to preserve ordering
		const subGoalIndices = getSubGoalIndices();
		for (const subGoalIndex of subGoalIndices) {
			const subGoal = gridToUse[subGoalIndex];
			const subGoalText = (subGoal?.text ?? '').trim();
			
			// Get linked outer block center
			const row = Math.floor(subGoalIndex / 9);
			const col = subGoalIndex % 9;
			const linkedOuterIndex = getLinkedCellIndex(row, col);
			
			// Verify linked outer block center matches center block sub-goal
			if (linkedOuterIndex !== null) {
				const linkedCell = gridToUse[linkedOuterIndex];
				const linkedText = (linkedCell?.text ?? '').trim();
				// They should be synced, but use center block text as source of truth
				if (linkedText !== subGoalText) {
					// Sync them - center block is source of truth
					gridToUse[linkedOuterIndex].text = subGoalText;
				}
			}
			
			// Get action items around the outer block center
			const actionItemIndices = linkedOuterIndex !== null 
				? getActionItemsAroundBlockCenter(linkedOuterIndex)
				: [];
			
			// Get todos for this sub-goal
			const subGoalTodos = todosToUse.filter(
				(t) => t.goalIndex === subGoalIndex || t.goalIndex === linkedOuterIndex
			);
			
			// Always save the sub-goal (H2), even if blank, to preserve ordering
			const displayText = subGoalText || 'Subgoal';
			lines.push(`## ${displayText}`);
			
			if (subGoal?.text?.trim()) {
				if (subGoal.status === 'underway') {
					lines.push('Status: Underway');
				} else if (subGoal.status === 'done') {
					lines.push('Status: Done');
				}
			}
			
			// Add README content if present
			const subGoalReadme = (subGoal?.readme ?? '').trim();
			if (subGoalReadme) {
				if (subGoal?.text?.trim() && (subGoal.status === 'underway' || subGoal.status === 'done')) {
					lines.push('');
				}
				lines.push(subGoalReadme);
			}

			// Always save all 8 action items (H3), even if blank, to preserve ordering
			if (actionItemIndices.length > 0) {
				for (const actionIndex of actionItemIndices) {
					const actionCell = gridToUse[actionIndex];
					const actionText = (actionCell?.text ?? '').trim();
					const actionStatus = actionCell?.status ?? 'todo';
					
					// Always include action items, even if blank
					const actionTitle = actionText || 'Action item';
					lines.push(`### ${actionTitle}`);
					
					if (actionStatus === 'underway') {
						lines.push('Status: Underway');
					} else if (actionStatus === 'done') {
						lines.push('Status: Done');
					}
					
					// Add README content if present
					const actionReadme = (actionCell?.readme ?? '').trim();
					if (actionReadme) {
						if (actionStatus === 'underway' || actionStatus === 'done') {
							lines.push('');
						}
						lines.push(actionReadme);
					}
					
					lines.push('');
				}
			}

			// Add blank line before todos if we have sub-goal content or action items
			if (subGoalText || actionItemIndices.length > 0) {
				if (subGoalTodos.length > 0) {
					lines.push('');
				}
			}

			// Add todos for this sub-goal as H3
			for (const todo of subGoalTodos) {
				const todoTitle = (todo.title ?? '').trim() || 'To-do item';
				lines.push(`### ${todoTitle}`);
				
				// Add status
				if (todo.status === 'underway') {
					lines.push('Status: Underway');
				} else if (todo.status === 'done') {
					lines.push('Status: Done');
				}

				// Separate markdown into notes (non-task content) and tasks
				const markdownLines = (todo.markdown ?? '').split('\n');
				const tasks = [];
				const notesLines = [];
				
				for (const line of markdownLines) {
					const trimmed = line.trim();
					if (trimmed.match(/^-\s*\[[ xX]\]/)) {
						tasks.push(line);
					} else {
						notesLines.push(line);
					}
				}

				// Add markdown notes in code block if present (excluding tasks)
				const notesContent = notesLines.join('\n').trim();
				if (notesContent) {
					lines.push('```notes');
					lines.push(escapeMarkdownInCodeBlock(notesContent));
					lines.push('```');
				}

				// Add tasks separately after notes block
				if (tasks.length > 0) {
					for (const task of tasks) {
						lines.push(task);
					}
				}

				lines.push('');
			}

			lines.push('');
		}

		return lines.join('\n');
	}

	// Parse markdown back to grid and todos
	function parseFromMarkdown(markdown) {
		if (!markdown || !markdown.trim()) {
			return { grid: Array.from({ length: 81 }, () => defaultCell()), todos: [] };
		}

		const newGrid = Array.from({ length: 81 }, () => defaultCell());
		const newTodos = [];
		const lines = markdown.split('\n');
		
		let currentMainGoal = null;
		let currentSubGoal = null;
		let currentTodo = null;
		let currentActionItemIndex = null;
		let inNotesBlock = false;
		let notesContent = [];
		let afterNotesBlock = false;
		// Track action items for current sub-goal
		let currentSubGoalActionItems = [];
		// Track README content for current section
		let currentReadmeContent = [];
		let collectingReadme = false;

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmed = line.trim();

			// Check for notes code block - stop collecting README
			if (trimmed.startsWith('```notes')) {
				// Save README before starting code block
				if (collectingReadme && currentReadmeContent.length > 0) {
					if (currentMainGoal !== null) {
						newGrid[currentMainGoal].readme = currentReadmeContent.join('\n').trim();
					} else if (currentSubGoal !== null) {
						newGrid[currentSubGoal].readme = currentReadmeContent.join('\n').trim();
					} else if (currentActionItemIndex !== null) {
						newGrid[currentActionItemIndex].readme = currentReadmeContent.join('\n').trim();
					}
					currentReadmeContent = [];
				}
				collectingReadme = false;
				inNotesBlock = true;
				notesContent = [];
				afterNotesBlock = false;
				continue;
			}
			if (trimmed === '```' && inNotesBlock) {
				inNotesBlock = false;
				afterNotesBlock = true;
				if (currentTodo) {
					// Add notes content to markdown
					const notesText = notesContent.join('\n').trim();
					if (notesText) {
						currentTodo.markdown = notesText;
					}
				}
				continue;
			}
			if (inNotesBlock) {
				notesContent.push(line);
				continue;
			}

			// H1 - Main goal
			if (trimmed.startsWith('# ') && !trimmed.startsWith('##') && !trimmed.startsWith('###')) {
				// Save previous README content if any
				if (currentMainGoal !== null && currentReadmeContent.length > 0) {
					newGrid[currentMainGoal].readme = currentReadmeContent.join('\n').trim();
					currentReadmeContent = [];
				}
				
				const text = trimmed.slice(2).trim();
				if (text && text !== 'Overall (central) goal') {
					newGrid[40].text = text;
				}
				currentMainGoal = 40;
				currentSubGoal = null;
				currentTodo = null;
				currentActionItemIndex = null;
				collectingReadme = true;
				continue;
			}

			// H2 - Sub-goal
			if (trimmed.startsWith('## ') && !trimmed.startsWith('###')) {
				// Save previous README content if any
				if (currentSubGoal !== null && currentReadmeContent.length > 0) {
					newGrid[currentSubGoal].readme = currentReadmeContent.join('\n').trim();
					currentReadmeContent = [];
				} else if (currentActionItemIndex !== null && currentReadmeContent.length > 0) {
					newGrid[currentActionItemIndex].readme = currentReadmeContent.join('\n').trim();
					currentReadmeContent = [];
				}
				
				const text = trimmed.slice(3).trim();
				const subGoalIndices = getSubGoalIndices();
				
				// Find next sub-goal index in order (preserve ordering)
				// Track which sub-goal we're on by counting H2s we've seen
				let subGoalCounter = 0;
				for (let j = i - 1; j >= 0; j--) {
					const prevLine = lines[j].trim();
					if (prevLine.startsWith('## ') && !prevLine.startsWith('###')) {
						subGoalCounter++;
					} else if (prevLine.startsWith('# ') && !prevLine.startsWith('##')) {
						break; // Reached main goal, stop counting
					}
				}
				
				// Use the sub-goal at the position we're at
				if (subGoalCounter < subGoalIndices.length) {
					currentSubGoal = subGoalIndices[subGoalCounter];
					
					// Set text if it's not a placeholder
					if (text && text !== 'Subgoal') {
						newGrid[currentSubGoal].text = text;
						// Sync to linked outer block center
						const row = Math.floor(currentSubGoal / 9);
						const col = currentSubGoal % 9;
						const linkedOuterIndex = getLinkedCellIndex(row, col);
						if (linkedOuterIndex !== null) {
							newGrid[linkedOuterIndex].text = text;
						}
					}
				} else {
					// Fallback: use first available
					currentSubGoal = subGoalIndices.find(idx => !newGrid[idx].text.trim()) || subGoalIndices[0];
					if (text && text !== 'Subgoal' && currentSubGoal !== null) {
						newGrid[currentSubGoal].text = text;
					}
				}
				
				currentTodo = null;
				currentActionItemIndex = null;
				// Reset action items tracking for new sub-goal
				if (currentSubGoal !== null) {
					const row = Math.floor(currentSubGoal / 9);
					const col = currentSubGoal % 9;
					const linkedOuterIndex = getLinkedCellIndex(row, col);
					currentSubGoalActionItems = linkedOuterIndex !== null 
						? getActionItemsAroundBlockCenter(linkedOuterIndex)
						: [];
				} else {
					currentSubGoalActionItems = [];
				}
				collectingReadme = true;
				continue;
			}

			// H3 - Action item or Todo
			if (trimmed.startsWith('### ')) {
				// Save previous README content if any
				if (currentActionItemIndex !== null && currentReadmeContent.length > 0) {
					newGrid[currentActionItemIndex].readme = currentReadmeContent.join('\n').trim();
					currentReadmeContent = [];
				}
				
				const text = trimmed.slice(4).trim();
				if (currentSubGoal !== null) {
					// Action items always come first (exactly 8 per sub-goal), then todos
					// Check if we still have action item slots available
					if (currentSubGoalActionItems.length > 0) {
						// Check if this looks like a todo (has markdown content following it)
						// Look ahead to see if there's markdown content
						let isTodo = false;
						for (let j = i + 1; j < lines.length && j < i + 10; j++) {
							const nextLine = lines[j].trim();
							if (nextLine.startsWith('```notes')) {
								isTodo = true;
								break;
							}
							if (nextLine.match(/^-\s*\[[ xX]\]/)) {
								isTodo = true;
								break;
							}
							if (nextLine.startsWith('### ') || nextLine.startsWith('## ') || nextLine.startsWith('# ')) {
								// Reached next section, this was an action item
								break;
							}
						}
						
						// If it's not a todo and we have action item slots, treat as action item
						if (!isTodo) {
							const nextActionIndex = currentSubGoalActionItems.shift();
							if (nextActionIndex !== undefined) {
								// Only set text if it's not a placeholder
								if (text && text !== 'Action item') {
									newGrid[nextActionIndex].text = text;
								}
								currentActionItemIndex = nextActionIndex;
								currentTodo = null;
								collectingReadme = true;
								continue;
							}
						}
					}
					// Otherwise, treat as todo
					const todo = {
						...defaultTodo(),
						goalIndex: normalizeTodoGoalIndex(currentSubGoal),
						title: text || 'To-do item'
					};
					newTodos.push(todo);
					currentTodo = todo;
					currentActionItemIndex = null;
					collectingReadme = false; // Todos don't have README, they have markdown
				}
				continue;
			}

			// Status lines - stop collecting README
			if (trimmed === 'Status: Underway' || trimmed === 'Status: Done') {
				if (collectingReadme && currentReadmeContent.length > 0) {
					// Save README content before processing status
					if (currentMainGoal !== null) {
						newGrid[currentMainGoal].readme = currentReadmeContent.join('\n').trim();
					} else if (currentSubGoal !== null) {
						newGrid[currentSubGoal].readme = currentReadmeContent.join('\n').trim();
					} else if (currentActionItemIndex !== null) {
						newGrid[currentActionItemIndex].readme = currentReadmeContent.join('\n').trim();
					}
					currentReadmeContent = [];
				}
				collectingReadme = false;
				
				if (trimmed === 'Status: Underway') {
					if (currentTodo) {
						currentTodo.status = 'underway';
					} else if (currentActionItemIndex !== null) {
						newGrid[currentActionItemIndex].status = 'underway';
					} else if (currentSubGoal !== null) {
						newGrid[currentSubGoal].status = 'underway';
					} else if (currentMainGoal !== null) {
						newGrid[currentMainGoal].status = 'underway';
					}
				} else {
					if (currentTodo) {
						currentTodo.status = 'done';
					} else if (currentActionItemIndex !== null) {
						newGrid[currentActionItemIndex].status = 'done';
					} else if (currentSubGoal !== null) {
						newGrid[currentSubGoal].status = 'done';
					} else if (currentMainGoal !== null) {
						newGrid[currentMainGoal].status = 'done';
					}
				}
				continue;
			}

			// Task checkboxes (- [ ] or - [x]) - stop collecting README, add to markdown after notes block
			if (trimmed.match(/^-\s*\[[ xX]\]/)) {
				// Stop collecting README if we hit a task
				if (collectingReadme && currentReadmeContent.length > 0) {
					if (currentMainGoal !== null) {
						newGrid[currentMainGoal].readme = currentReadmeContent.join('\n').trim();
					} else if (currentSubGoal !== null) {
						newGrid[currentSubGoal].readme = currentReadmeContent.join('\n').trim();
					} else if (currentActionItemIndex !== null) {
						newGrid[currentActionItemIndex].readme = currentReadmeContent.join('\n').trim();
					}
					currentReadmeContent = [];
				}
				collectingReadme = false;
				
				if (currentTodo) {
					if (!currentTodo.markdown) {
						currentTodo.markdown = '';
					}
					if (currentTodo.markdown && !currentTodo.markdown.endsWith('\n')) {
						currentTodo.markdown += '\n';
					}
					currentTodo.markdown += line;
					afterNotesBlock = false; // Reset after processing task
				}
				continue;
			}

			// Other content after notes block - add to current todo's markdown
			// (but skip empty lines, headings, and status lines)
			if (currentTodo && trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('Status:') && trimmed !== '') {
				if (!currentTodo.markdown) {
					currentTodo.markdown = '';
				}
				if (currentTodo.markdown && !currentTodo.markdown.endsWith('\n')) {
					currentTodo.markdown += '\n';
				}
				currentTodo.markdown += line;
				afterNotesBlock = false;
				continue;
			}

			// Collect README content - any content after headings until we hit special markers
			if (collectingReadme && !currentTodo && trimmed !== '') {
				// Check if next line is a special marker (heading, status, code block, task)
				const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
				const isSpecialMarker = 
					nextLine.startsWith('#') ||
					nextLine === 'Status: Underway' ||
					nextLine === 'Status: Done' ||
					nextLine.startsWith('```') ||
					nextLine.match(/^-\s*\[[ xX]\]/);
				
				// If this is the last line before a special marker or empty line, collect it
				if (!isSpecialMarker || (trimmed && !nextLine)) {
					currentReadmeContent.push(line);
				} else {
					// Save README and stop collecting
					if (currentReadmeContent.length > 0) {
						if (currentMainGoal !== null) {
							newGrid[currentMainGoal].readme = currentReadmeContent.join('\n').trim();
						} else if (currentSubGoal !== null) {
							newGrid[currentSubGoal].readme = currentReadmeContent.join('\n').trim();
						} else if (currentActionItemIndex !== null) {
							newGrid[currentActionItemIndex].readme = currentReadmeContent.join('\n').trim();
						}
						currentReadmeContent = [];
					}
					collectingReadme = false;
				}
				continue;
			}

			// Reset afterNotesBlock flag when we hit empty line or new section
			if (trimmed === '' && afterNotesBlock) {
				afterNotesBlock = false;
			}
			
			// Handle empty lines - stop collecting README if we hit an empty line followed by special content
			if (trimmed === '' && collectingReadme) {
				const nextNonEmptyLine = (() => {
					for (let j = i + 1; j < lines.length; j++) {
						const nl = lines[j].trim();
						if (nl) return nl;
					}
					return '';
				})();
				
				if (nextNonEmptyLine.startsWith('#') || 
					nextNonEmptyLine === 'Status: Underway' || 
					nextNonEmptyLine === 'Status: Done' ||
					nextNonEmptyLine.startsWith('```') ||
					nextNonEmptyLine.match(/^-\s*\[[ xX]\]/)) {
					// Save README before special marker
					if (currentReadmeContent.length > 0) {
						if (currentMainGoal !== null) {
							newGrid[currentMainGoal].readme = currentReadmeContent.join('\n').trim();
						} else if (currentSubGoal !== null) {
							newGrid[currentSubGoal].readme = currentReadmeContent.join('\n').trim();
						} else if (currentActionItemIndex !== null) {
							newGrid[currentActionItemIndex].readme = currentReadmeContent.join('\n').trim();
						}
						currentReadmeContent = [];
					}
					collectingReadme = false;
				} else if (currentReadmeContent.length > 0) {
					// Keep empty line if we have content (preserves formatting)
					currentReadmeContent.push('');
				}
			}
		}
		
		// Save any remaining README content at the end
		if (currentReadmeContent.length > 0) {
			if (currentMainGoal !== null) {
				newGrid[currentMainGoal].readme = currentReadmeContent.join('\n').trim();
			} else if (currentSubGoal !== null) {
				newGrid[currentSubGoal].readme = currentReadmeContent.join('\n').trim();
			} else if (currentActionItemIndex !== null) {
				newGrid[currentActionItemIndex].readme = currentReadmeContent.join('\n').trim();
			}
		}

		// Verify and sync linked cells - keep shadow pairs mirrored for all goal fields.
		const subGoalIndices = getSubGoalIndices();
		for (const subGoalIndex of subGoalIndices) {
			const row = Math.floor(subGoalIndex / 9);
			const col = subGoalIndex % 9;
			const linkedOuterIndex = getLinkedCellIndex(row, col);
			
			if (linkedOuterIndex !== null) {
				const centerCell = newGrid[subGoalIndex];
				const outerCell = newGrid[linkedOuterIndex];
				const outerHasData =
					(outerCell?.text ?? '').trim() ||
					(outerCell?.readme ?? '').trim() ||
					(outerCell?.status ?? 'todo') !== 'todo';
				const source = outerHasData ? outerCell : centerCell;
				const target = outerHasData ? centerCell : outerCell;
				target.text = source.text;
				target.readme = source.readme;
				target.status = source.status;
			}
		}

		return { grid: newGrid, todos: newTodos };
	}

	// Export markdown to file – delegate to store
	function exportMarkdown() {
		store.exportMarkdown(serializeToMarkdown, grid, todos);
	}

	// Import markdown from file – delegate to store, then replace local state
	function importMarkdown() {
		store.importMarkdown(parseFromMarkdown, (parsed) => {
			grid = parsed.grid;
			todos = parsed.todos;
		});
	}
</script>

<div
	class="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950"
	style="font-family: 'Outfit', sans-serif;"
>
	<!-- Sidebar overlay for mobile/tablet -->
	{#if store.sidebarOpen}
		<div
			class="fixed inset-0 z-40 bg-black/50 lg:hidden"
			onclick={() => (store.sidebarOpen = false)}
			onkeydown={(e) => e.key === 'Escape' && (store.sidebarOpen = false)}
			role="button"
			tabindex="-1"
			aria-label="Close sidebar"
		></div>
	{/if}

	<!-- Right Sidebar -->
	<aside
		class="fixed right-0 top-0 z-50 h-full w-64 transform border-l border-slate-700/50 bg-slate-900/95 backdrop-blur-sm transition-transform duration-300 ease-in-out {store.sidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}"
	>
		<div class="flex h-full flex-col p-4">
			<!-- Header in sidebar -->
			<div class="mb-6 flex items-center justify-between">
				<div class="flex items-center gap-2">
					<h1
						class="bg-gradient-to-r from-violet-400 via-fuchsia-400 to-violet-400 bg-clip-text text-xl font-bold tracking-tight text-transparent"
					>
						Haradato
					</h1>
				</div>
				<!-- Close button for mobile/tablet -->
				<button
					type="button"
					class="lg:hidden cursor-pointer rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
					onclick={() => (sidebarOpen = false)}
					aria-label="Close menu"
				>
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<span
				class="mb-6 rounded-full bg-violet-900/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-200"
			>
				Harada chart & to-do
			</span>

			<!-- Navigation tabs -->
			<div class="mb-6 flex flex-col gap-2">
				<button
					type="button"
					class="cursor-pointer rounded-md px-4 py-2 text-left text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/70
						{store.activeTab === 'harada'
							? 'bg-violet-500 text-slate-950 shadow-sm'
							: 'text-slate-300 hover:bg-slate-800'}"
					onclick={() => {
						goto('/', { replaceState: false });
						store.sidebarOpen = false;
					}}
				>
					Harada
				</button>
				<button
					type="button"
					class="cursor-pointer rounded-md px-4 py-2 text-left text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/70
						{store.activeTab === 'todo'
							? 'bg-violet-500 text-slate-950 shadow-sm'
							: 'text-slate-300 hover:bg-slate-800'}"
					onclick={() => {
						goto('/todo', { replaceState: false });
						store.sidebarOpen = false;
					}}
				>
					To-do
				</button>
			</div>

			<!-- Export/Import buttons -->
			<div class="mt-auto flex flex-col gap-2">
				<button
					type="button"
					onclick={() => {
						exportMarkdown();
						sidebarOpen = false;
					}}
					class="cursor-pointer rounded-md border border-slate-700 bg-slate-900/80 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/70"
					title="Export to markdown file"
				>
					Export
				</button>
				<button
					type="button"
					onclick={() => {
						importMarkdown();
						sidebarOpen = false;
					}}
					class="cursor-pointer rounded-md border border-slate-700 bg-slate-900/80 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/70"
					title="Import from markdown file"
				>
					Import
				</button>
			</div>
		</div>
	</aside>

	<!-- Main content area -->
	<div class="lg:mr-64">
		<div class="p-4 md:p-8">
			<div class="mx-auto max-w-6xl">
				<!-- Hamburger button for mobile/tablet -->
				<button
					type="button"
					class="mb-4 lg:hidden cursor-pointer rounded-md p-2 text-slate-400 transition hover:bg-slate-800/50 hover:text-slate-200"
					onclick={() => (store.sidebarOpen = true)}
					aria-label="Open menu"
				>
					<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
					</svg>
				</button>

				<div class="overflow-x-auto rounded-2xl border border-slate-700/50 bg-slate-900/50 p-2 md:p-4">
			{#if store.activeTab === 'harada'}
				<div
					class="mx-auto grid min-w-[600px] gap-0.5 md:gap-1"
					style="grid-template-columns: repeat(9, minmax(0, 1fr));"
				>
					{#each { length: 81 } as _, i}
						{@const row = Math.floor(i / 9)}
						{@const col = i % 9}
						{@const cellClasses = getCellClasses(row, col, i)}

						<div
							class="group aspect-square transition-all duration-200 hover:scale-[1.02] hover:z-20 {cellClasses} rounded-lg"
							class:mt-1={row === 3 || row === 6}
							class:ml-1={col === 3 || col === 6}
						>
							<div class="relative flex h-full w-full flex-col items-stretch justify-stretch">
								<textarea
									class="flex-shrink-0 w-full resize-none bg-transparent p-1 text-center text-[10px] leading-tight placeholder-slate-500/50 outline-none transition-colors focus:ring-2 focus:ring-violet-500/50 md:p-2 md:text-xs"
									placeholder={isMainGoal(row, col)
										? 'MAIN GOAL'
										: isSubGoal(row, col) || isBlockCenter(row, col)
											? 'Sub-goal'
											: ''}
									bind:value={grid[i].text}
									oninput={(e) => updateCell(i, e.target.value)}
								></textarea>

								{#if goalIndices.includes(i) && grid[i]?.readme?.trim()}
									<button
										type="button"
										class="flex-1 w-full text-center text-[10px] leading-tight text-slate-300/80 px-1 cursor-pointer hover:text-slate-200 transition-colors {expandedReadmeIndex === i ? 'overflow-y-auto' : 'overflow-hidden line-clamp-2'} md:text-xs"
										onclick={() => {
											expandedReadmeIndex = expandedReadmeIndex === i ? null : i;
										}}
										title={expandedReadmeIndex === i ? 'Click to collapse' : 'Click to expand'}
									>
										{#if expandedReadmeIndex === i}
											{grid[i].readme.trim()}
										{:else}
											{getReadmePreview(grid[i].readme)}
											{#if hasMoreReadme(grid[i].readme)}
												<span class="text-slate-400">...</span>
											{/if}
										{/if}
									</button>
								{/if}

								<button
									type="button"
									class={`absolute bottom-1 left-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-900/80 text-[9px] text-slate-300 shadow-sm ring-1 ring-slate-600/60 transition hover:scale-110 md:h-5 md:w-5 ${
										grid[i].status === 'underway'
											? 'bg-yellow-400/90 text-slate-900'
											: grid[i].status === 'done'
												? 'bg-emerald-400/90 text-emerald-950'
												: ''
									}` }
									onclick={() => cycleStatus(i)}
								>
									{grid[i].status === 'todo' ? '' : grid[i].status === 'underway' ? '⏳' : '✓'}
								</button>

								{#if goalIndices.includes(i)}
									<button
										type="button"
										class="absolute bottom-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-slate-900/80 text-[9px] text-slate-300 shadow-sm ring-1 ring-slate-600/60 transition hover:scale-110 hover:bg-violet-500/90 hover:text-slate-950 md:h-5 md:w-5"
										onclick={() => {
											const nomenclature = indexToNomenclature(i);
											goto(`/todo/${nomenclature}`, { replaceState: false });
										}}
										title="Open to-do list for this goal"
									>
										📋
									</button>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<HaradaTodoPanel
					{todos}
					{goalOptions}
					{addTodo}
					{updateTodo}
					{deleteTodo}
					{cycleTodoStatus}
				/>
			{/if}
			</div>

			<HaradaFooter />
		</div>
		</div>
	</div>
</div>