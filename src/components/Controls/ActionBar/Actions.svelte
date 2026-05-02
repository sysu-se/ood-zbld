<script>
	// ====== Stores: UI 状态与领域桥接 ======
	import { candidates } from '@sudoku/stores/candidates';
	import { userGrid } from '@sudoku/stores/grid';
	import { cursor } from '@sudoku/stores/cursor';
	import { hints } from '@sudoku/stores/hints';
	import { notes } from '@sudoku/stores/notes';
	import { settings } from '@sudoku/stores/settings';
	import { keyboardDisabled } from '@sudoku/stores/keyboard';
	import { gamePaused } from '@sudoku/stores/game';
	import { gameStore } from '@sudoku/stores/domain';

	// ====== 派生状态：用于 UI 快速判断 ======
	$: hintsAvailable = $hints > 0;
	$: exploring = $gameStore.isExploring;
	$: exploreKnownFailed = $gameStore.exploreStatus?.knownFailed;
	$: lastHint = $gameStore.lastHint;
	$: hintReasonText = getHintReasonText(lastHint?.reason, lastHint?.type);
	$: hintLevelText = getHintLevelText(lastHint?.level);

	// ====== 提示原因与等级文案 ======
	function getHintReasonText(reason, type) {
		if (type === 'candidates') return '候选提示：展示当前格可填数字';
		switch (reason) {
			case 'naked-single':
				return '裸单元：该格只有 1 个候选';
			case 'hidden-single-row':
				return '隐性单元（行）：该数字在本行仅出现一次';
			case 'hidden-single-col':
				return '隐性单元（列）：该数字在本列仅出现一次';
			case 'hidden-single-box':
				return '隐性单元（宫）：该数字在本宫仅出现一次';
			case 'min-candidates-cell':
				return '高阶提示：选择候选最少的空格';
			case 'unsolved-no-unique-step':
				return '高阶提示：求解器未给出唯一确定值';
			case 'solver-derived':
				return '高阶提示：由求解器推导的下一步';
			default:
				return reason ? `提示原因：${reason}` : '';
		}
	}

	function getHintLevelText(level) {
		switch (level) {
			case 'easy':
				return '等级：简单';
			case 'medium':
				return '等级：中等';
			case 'hard':
				return '等级：困难';
			default:
				return '';
		}
	}

	// ====== 候选提示按钮：只展示候选，不落子 ======
	function handleCandidatesHint() {
		// 必须有光标选中格
		if ($cursor.x === null || $cursor.y === null) return;
		// 没有提示次数则不响应
		if (!hintsAvailable) return;

		// 调用领域层获取该格候选
		const hint = gameStore.getCandidatesHint({ row: $cursor.y, col: $cursor.x });
		const list = hint?.candidates;
		// 没有候选则不做任何变化
		if (!Array.isArray(list) || list.length === 0) return;

		// 清空旧候选 → 添加新候选
		candidates.clear($cursor);
		for (const value of list) {
			candidates.add($cursor, value);
		}
		// 消耗一次提示
		hints.useHint();
	}

	// ====== 下一步提示按钮：直接落子 ======
	function handleHint() {
		// 没有提示次数则不响应
		if (!hintsAvailable) return;
		// 让领域层给出并应用下一步建议
		const hint = gameStore.applyNextValueHint();
		// 无可用提示则不消耗
		if (!hint) return;
		// 成功应用后消耗提示次数
		hints.useHint();
	}

	// ====== Explore 模式控制 ======
	function handleStartExplore() {
		gameStore.startExplore();
	}

	function handleCommitExplore() {
		gameStore.commitExplore();
	}

	function handleAbandonExplore() {
		gameStore.abandonExplore();
	}

	function handleMarkExploreFailed() {
		gameStore.markExploreFailed('manual');
	}
</script>

<!-- ====== 操作按钮区 ====== -->
<div class="action-buttons space-x-3">

	<!-- Undo：在暂停或无历史时禁用 -->
	<button class="btn btn-round" disabled={$gamePaused || !$gameStore.canUndo} on:click={() => gameStore.undo()} title="Undo">
		<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
		</svg>
	</button>

	<!-- Redo：在暂停或无未来栈时禁用 -->
	<button class="btn btn-round" disabled={$gamePaused || !$gameStore.canRedo} on:click={() => gameStore.redo()} title="Redo">
		<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10h-10a8 8 90 00-8 8v2M21 10l-6 6m6-6l-6-6" />
		</svg>
	</button>

	<!-- Candidates Hint：仅显示候选，需光标在空格且键盘可用 -->
	<button class="btn btn-round btn-badge" disabled={$keyboardDisabled || !hintsAvailable || $cursor.x === null || $cursor.y === null || $userGrid[$cursor.y][$cursor.x] !== 0} on:click={handleCandidatesHint} title="Candidates Hint ({$hints})">
		<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h10M7 12h6m-6 5h3M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" />
		</svg>

		{#if $settings.hintsLimited}
			<span class="badge" class:badge-primary={hintsAvailable}>{$hints}</span>
		{/if}
	</button>

	<!-- Next Step Hint：直接落子，消耗一次提示 -->
	<button class="btn btn-round btn-badge" disabled={$gamePaused || !hintsAvailable} on:click={handleHint} title="Next Step Hint ({$hints})">
		<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
		</svg>

		{#if $settings.hintsLimited}
			<span class="badge" class:badge-primary={hintsAvailable}>{$hints}</span>
		{/if}
	</button>

	<!-- Notes：切换笔记模式 -->
	<button class="btn btn-round btn-badge" on:click={notes.toggle} title="Notes ({$notes ? 'ON' : 'OFF'})">
		<svg class="icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
		</svg>

		<span class="badge tracking-tighter" class:badge-primary={$notes}>{$notes ? 'ON' : 'OFF'}</span>
	</button>

	<!-- Explore 模式入口/出口 -->
	{#if !exploring}
		<button class="btn btn-small" disabled={$gamePaused} on:click={handleStartExplore} title="Start Explore Mode">EXP</button>
	{:else}
		<button class="btn btn-small btn-primary" disabled={$gamePaused} on:click={handleCommitExplore} title="Commit Explore Result">APPLY</button>
		<button class="btn btn-small" disabled={$gamePaused} on:click={handleAbandonExplore} title="Abandon Explore Result">BACK</button>
		<button class="btn btn-small" disabled={$gamePaused} on:click={handleMarkExploreFailed} title="Mark Explore Path Failed">FAIL</button>
	{/if}

	<!-- 若当前路径被标记为失败，则展示警示标签 -->
	{#if exploreKnownFailed}
		<span class="explore-status">FAILED PATH</span>
	{/if}

</div>

<!-- ====== 提示信息展示 ====== -->
{#if lastHint && (hintReasonText || hintLevelText)}
	<div class="hint-info">
		{#if hintReasonText}
			<span class="hint-reason">{hintReasonText}</span>
		{/if}
		{#if hintLevelText}
			<span class="hint-level">{hintLevelText}</span>
		{/if}
	</div>
{/if}


<style>
	/* ====== 布局与徽标样式 ====== */
	.action-buttons {
		@apply flex flex-wrap justify-evenly self-end;
	}

	.btn-badge {
		@apply relative;
	}

	.badge {
		min-height: 20px;
		min-width:  20px;
		@apply p-1 rounded-full leading-none text-center text-xs text-white bg-gray-600 inline-block absolute top-0 left-0;
	}

	.badge-primary {
		@apply bg-primary;
	}

	.explore-status {
		@apply inline-flex items-center px-3 py-2 rounded-xl bg-red-100 text-red-700 text-sm font-semibold;
	}

	.hint-info {
		@apply mt-2 text-sm text-gray-600 flex flex-col gap-1;
	}

	.hint-reason {
		@apply font-medium;
	}

	.hint-level {
		@apply text-xs text-gray-500;
	}
</style>