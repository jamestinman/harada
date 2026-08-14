<script>
	import { Tween } from 'svelte/motion';
	import { cubicInOut } from 'svelte/easing';

	const CELL = 100;
	const GAP = 14;
	const PAD = 18;
	const GRID = 9 * CELL + 8 * GAP;
	const FULL = PAD * 2 + GRID;
	const RADIUS = 22;

	const BLOCK_FILL = [
		'#e8d4dc',
		'#e4dcc8',
		'#d4e0d0',
		'#d0dbe6',
		'#c4b5fd',
		'#d0dce8',
		'#e0d4e8',
		'#d0ddd8',
		'#e4d5dc'
	];
	const FILL_MAIN = '#c026d3';
	const FILL_GOAL_1 = '#7c3aed';
	const FILL_SUB = '#a78bfa';
	const FILL_LINKED = '#64748b';

	/** @param {number} row @param {number} col */
	function origin(row, col) {
		return {
			x: PAD + col * (CELL + GAP),
			y: PAD + row * (CELL + GAP)
		};
	}

	/** @param {number} r0 @param {number} c0 @param {number} r1 @param {number} c1 @param {number} [margin] */
	function viewFor(r0, c0, r1, c1, margin = 12) {
		const a = origin(r0, c0);
		const b = origin(r1, c1);
		return {
			x: a.x - margin,
			y: a.y - margin,
			w: b.x + CELL - a.x + margin * 2,
			h: b.y + CELL - a.y + margin * 2
		};
	}

	const VIEWS = {
		center: viewFor(4, 4, 4, 4, 18),
		mid: viewFor(3, 3, 5, 5, 16),
		quad: viewFor(0, 0, 5, 5, 14),
		full: { x: 0, y: 0, w: FULL, h: FULL }
	};

	/** @param {number} row @param {number} col */
	function cellFill(row, col) {
		if (row === 4 && col === 4) return FILL_MAIN;
		if (row === 3 && col === 3) return FILL_GOAL_1;
		if (row >= 3 && row <= 5 && col >= 3 && col <= 5) return FILL_SUB;
		if (row % 3 === 1 && col % 3 === 1) return FILL_LINKED;
		const block = Math.floor(row / 3) * 3 + Math.floor(col / 3);
		return BLOCK_FILL[block];
	}

	const CELLS = Array.from({ length: 81 }, (_, i) => {
		const row = Math.floor(i / 9);
		const col = i % 9;
		const { x, y } = origin(row, col);
		return { i, row, col, x, y, fill: cellFill(row, col) };
	});

	const TODO_CELLS = [
		[0, 0],
		[0, 1],
		[0, 2],
		[1, 0],
		[1, 2],
		[2, 0],
		[2, 1],
		[2, 2]
	];

	const LABELS = [
		{
			id: 'center',
			row: 4,
			col: 4,
			line1: 'Central',
			line2: 'Goal',
			fill: '#fff',
			size: 18,
			weight: 700
		},
		{
			id: 'main',
			row: 3,
			col: 3,
			line1: 'Main goal',
			line2: '#1',
			fill: '#fff',
			size: 15,
			weight: 650
		},
		{
			id: 'linked',
			row: 1,
			col: 1,
			line1: 'Main goal',
			line2: '#1',
			fill: '#fff',
			size: 15,
			weight: 650
		},
		...TODO_CELLS.map(([row, col], n) => ({
			id: `todo-${n}`,
			row,
			col,
			line1: 'To-do list',
			line2: `#${n + 1}`,
			fill: '#334155',
			size: 13,
			weight: 600,
			n
		}))
	].map((label) => {
		const { x, y } = origin(label.row, label.col);
		return { ...label, cx: x + CELL / 2, cy: y + CELL / 2 };
	});

	const vb = new Tween(VIEWS.center, { duration: 900, easing: cubicInOut });

	let showMain = $state(false);
	let showLinked = $state(false);
	let todos = $state(0);

	/** @param {{ id: string, n?: number }} label */
	function labelOn(label) {
		if (label.id === 'center') return true;
		if (label.id === 'main') return showMain;
		if (label.id === 'linked') return showLinked;
		return todos > (label.n ?? 0);
	}

	function snapReduced() {
		vb.set(VIEWS.full, { duration: 0 });
		showMain = true;
		showLinked = true;
		todos = 8;
	}

	/** @param {SVGSVGElement} node */
	function attachExplainer(node) {
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
		if (reduced.matches) {
			const idle = setTimeout(snapReduced, 0);
			return () => clearTimeout(idle);
		}

		let generation = 0;
		let myPlaying = false;
		/** @type {ReturnType<typeof setTimeout>[]} */
		const timers = [];
		/** @type {Array<() => void>} */
		const waitResolvers = [];

		/** @param {number} ms */
		const wait = (ms) =>
			new Promise((resolve) => {
				const timer = setTimeout(() => {
					const timerIndex = timers.indexOf(timer);
					if (timerIndex >= 0) timers.splice(timerIndex, 1);
					const resolverIndex = waitResolvers.indexOf(resolve);
					if (resolverIndex >= 0) waitResolvers.splice(resolverIndex, 1);
					resolve();
				}, ms);
				timers.push(timer);
				waitResolvers.push(resolve);
			});

		const clearTimers = () => {
			for (const timer of timers) clearTimeout(timer);
			timers.length = 0;
			const pending = waitResolvers.splice(0, waitResolvers.length);
			for (const resolve of pending) resolve();
		};

		async function play() {
			if (myPlaying) return;
			myPlaying = true;
			const myGeneration = ++generation;
			const stopped = () => myGeneration !== generation;

			try {
				while (!stopped()) {
					if (reduced.matches) {
						snapReduced();
						return;
					}

					showMain = false;
					showLinked = false;
					todos = 0;
					await vb.set(VIEWS.center, { duration: 0 });
					await wait(1500);
					if (stopped()) break;

					const toMid = vb.set(VIEWS.mid, { duration: 900 });
					await wait(450);
					if (stopped()) break;
					showMain = true;
					await toMid;
					if (stopped()) break;

					await wait(700);
					if (stopped()) break;

					const toQuad = vb.set(VIEWS.quad, { duration: 1000 });
					await wait(350);
					if (stopped()) break;
					showLinked = true;
					await toQuad;
					if (stopped()) break;

					for (let i = 1; i <= 8; i += 1) {
						await wait(260);
						if (stopped()) break;
						todos = i;
					}
					if (stopped()) break;

					await wait(650);
					if (stopped()) break;
					await vb.set(VIEWS.full, { duration: 1100 });
					if (stopped()) break;

					await wait(1800);
					if (stopped()) break;

					showMain = false;
					showLinked = false;
					todos = 0;
					await wait(350);
					if (stopped()) break;
					await vb.set(VIEWS.center, { duration: 1100 });
					if (stopped()) break;
					await wait(250);
				}
			} finally {
				myPlaying = false;
			}
		}

		const io = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					play();
				} else {
					generation += 1;
					clearTimers();
				}
			},
			{ threshold: 0.35 }
		);
		io.observe(node);

		return () => {
			generation += 1;
			clearTimers();
			io.disconnect();
		};
	}
</script>

<svg
	{@attach attachExplainer}
	class="h-auto w-full rounded-2xl"
	viewBox="{vb.current.x} {vb.current.y} {vb.current.w} {vb.current.h}"
	xmlns="http://www.w3.org/2000/svg"
	role="img"
	aria-label="How a Harada chart is built: a central goal, eight main goals around it, a to-do list for the first goal, then the full nine-by-nine grid."
>
	<rect x="0" y="0" width={FULL} height={FULL} fill="#f1f5f9" />

	{#each CELLS as cell (cell.i)}
		<rect
			x={cell.x}
			y={cell.y}
			width={CELL}
			height={CELL}
			rx={RADIUS}
			ry={RADIUS}
			fill={cell.fill}
		/>
	{/each}

	{#each LABELS as label (label.id)}
		<text
			x={label.cx}
			y={label.cy}
			text-anchor="middle"
			dominant-baseline="middle"
			fill={label.fill}
			font-size={label.size}
			font-weight={label.weight}
			class={['cell-label', labelOn(label) && 'is-on']}
		>
			<tspan x={label.cx} dy="-0.58em">{label.line1}</tspan>
			<tspan x={label.cx} dy="1.22em">{label.line2}</tspan>
		</text>
	{/each}
</svg>

<style>
	svg {
		font-family: inherit;
		background: #f1f5f9;
		display: block;
		aspect-ratio: 1;
	}

	.cell-label {
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.32s ease;
	}

	.cell-label.is-on {
		opacity: 1;
	}

	@media (prefers-reduced-motion: reduce) {
		.cell-label {
			transition: none;
		}
	}
</style>
