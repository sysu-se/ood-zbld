function deepCopy(arr) {
    return arr.map(row => [...row]);
}

function is9x9Grid(grid) {
    return Array.isArray(grid) &&
        grid.length === 9 &&
        grid.every(row => Array.isArray(row) && row.length === 9 && row.every(n => Number.isInteger(n) && n >= 0 && n <= 9));
}

/**
 * 判断两张网格是否完全相同（逐格比较）。
 *
 * 用于：
 * - 判断一次 guess 是否产生真实变化
 * - 提交 Explore 时判断是否需要生成主历史记录
 */
function sameGrid(a, b) {
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (a[r][c] !== b[r][c]) return false;
        }
    }
    return true;
}

/**
 * 将网格序列化成稳定字符串签名。
 *
 * 用途：
 * - Explore 模式中的失败路径记忆（Set）
 * - 快速比较是否回到某个已知失败局面
 */
function serializeGrid(grid) {
    return grid.map(row => row.join('')).join('|');
}

/**
 * 判断一个「行/列/宫」是否无重复（忽略 0）。
 */
function isValidGroup(arr) {
    const nums = arr.filter(n => n !== 0);
    return new Set(nums).size === nums.length;
}

// {
//   getPuzzle(): number[][]
//   getGrid(): number[][]
//   getCell(row, col): number
//   isFixed(row, col): boolean
//   guess(move): void
//   clone(): Sudoku
//   validate(): boolean
//   toJSON(): any
//   toString(): string
// }
class Sudoku {
    /**
     * @param {number[][]} puzzle 题面（固定给定）
     * @param {number[][] | null} grid 当前局面；为空时默认等于 puzzle
     */
    constructor(puzzle, grid = null) {
        if (!is9x9Grid(puzzle)) {
            throw new Error('Invalid puzzle: must be a 9x9 array');
        }
        if (grid !== null && !is9x9Grid(grid)) {
            throw new Error('Invalid grid: must be a 9x9 array');
        }
        this.puzzle = deepCopy(puzzle);
        this.grid = grid ? deepCopy(grid) : deepCopy(puzzle);
    }

    getPuzzle() {
        // 返回防御性拷贝，避免调用方篡改内部状态
        return deepCopy(this.puzzle);
    }

    getGrid() {
        // 返回防御性拷贝，避免调用方篡改内部状态
        return deepCopy(this.grid);
    }

    getCell(row, col) {
        return this.grid[row][col];
    }

    /**
     * 用外部网格覆盖当前局面。
     *
     * 主要用于：
     * - Undo/Redo 的快照恢复
     * - Explore 分支跳转
     */
    setGrid(grid) {
        if (!is9x9Grid(grid)) {
            throw new Error('Invalid grid: must be a 9x9 array');
        }
        this.grid = deepCopy(grid);
    }

    isFixed(row, col) {
        return this.puzzle[row][col] !== 0;
    }

    /**
     * 进行一次落子：允许填 0（等价于清空该格）。
     *
     * 注意：
     * - 这里保持「无异常、弱校验」风格，非法参数直接忽略
     * - 不在本层维护历史，历史由 Game 负责
     */
    guess(move) {
        const { row, col, value } = move;
        if (row < 0 || row > 8 || col < 0 || col > 8) return;
        if (value < 0 || value > 9) return;
        if (this.isFixed(row, col)) return;
        this.grid[row][col] = value;
    }

    clone() {
        // 完整复制 puzzle + grid，保证克隆体与原对象彻底隔离
        return new Sudoku(this.puzzle, this.grid);
    }

    /**
     * 获取某个空格的候选数字。
     *
     * 规则：候选 = 1..9 中不在同行/同列/同宫出现的数字。
     * 若该格已填值或坐标无效，返回空数组。
     */
    getCandidates(row, col) {
        if (row < 0 || row > 8 || col < 0 || col > 8) return [];
        if (this.grid[row][col] !== 0) return [];

        const used = new Set();

        // 将同行列数字加入used
        for (let i = 0; i < 9; i++) {
            if (this.grid[row][i] !== 0) used.add(this.grid[row][i]);
            if (this.grid[i][col] !== 0) used.add(this.grid[i][col]);
        }
        // 将同宫数字加入used
        const boxRow = Math.floor(row / 3) * 3;
        const boxCol = Math.floor(col / 3) * 3;
        for (let r = boxRow; r < boxRow + 3; r++) {
            for (let c = boxCol; c < boxCol + 3; c++) {
                if (this.grid[r][c] !== 0) used.add(this.grid[r][c]);
            }
        }

        const candidates = [];
        for (let n = 1; n <= 9; n++) {
            if (!used.has(n)) candidates.push(n);
        }
        return candidates;
    }

    /**
     * 对当前局面做一致性分析。
     *
     * 输出包含两类失败信息：
     * 1) conflicts：已填数字冲突（重复）
     * 2) deadEnds：空格候选为空（逻辑死局）
     * 3) hasConflict：是否存在任一冲突
     */
    analyze() {
        const conflicts = [];

        // 扫描一个组（行/列/宫），找出重复值
        const scanGroup = (cells, type, index) => {
            const seen = new Map();
            for (const cell of cells) {
                const value = this.grid[cell.row][cell.col];
                if (value === 0) continue;
                if (!seen.has(value)) seen.set(value, []);
                seen.get(value).push(cell);
            }
            for (const [value, positions] of seen.entries()) {
                if (positions.length > 1) {
                    conflicts.push({ type, index, value, cells: positions.map(p => ({ row: p.row, col: p.col })) });
                }
            }
        };

        // 扫描所有行与列
        for (let i = 0; i < 9; i++) {
            scanGroup(Array.from({ length: 9 }, (_, c) => ({ row: i, col: c })), 'row', i);
            scanGroup(Array.from({ length: 9 }, (_, r) => ({ row: r, col: i })), 'col', i);
        }

        // 扫描所有 3x3 宫
        for (let br = 0; br < 3; br++) {
            for (let bc = 0; bc < 3; bc++) {
                const cells = [];
                for (let r = br * 3; r < br * 3 + 3; r++) {
                    for (let c = bc * 3; c < bc * 3 + 3; c++) {
                        cells.push({ row: r, col: c });
                    }
                }
                scanGroup(cells, 'box', br * 3 + bc);
            }
        }

        // 扫描死局：空格无候选
        const deadEnds = [];
        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                if (this.grid[row][col] === 0) {
                    const candidates = this.getCandidates(row, col);
                    if (candidates.length === 0) {
                        deadEnds.push({ row, col });
                    }
                }
            }
        }

        return {
            conflicts,
            deadEnds,
            hasConflict: conflicts.length > 0 || deadEnds.length > 0,
        };
    }

    hasConflict() {
        return this.analyze().hasConflict;
    }

    /**
     * 是否已完成（无 0 且整体合法）。
     */
    isSolved() {
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (this.grid[r][c] === 0) return false;
            }
        }
        return this.validate();
    }

    /**
     * 裸单元：候选数只有 1 个时，该数必填。
     */
    findNakedSingle() {
        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                if (this.grid[row][col] !== 0) continue;
                const candidates = this.getCandidates(row, col);
                if (candidates.length === 1) {
                    return {
                        row,
                        col,
                        value: candidates[0],
                        candidates,
                        type: 'next-step',
                        level: 'easy',
                        reason: 'naked-single',
                    };
                }
            }
        }
        return null;
    }

    /**
     * 隐性单元：在某个组内，某数字只出现在一个候选格中。
     *
     * 依次检查：行 -> 列 -> 宫，找到第一个可用结果即返回。
     */
    findHiddenSingle() {
        // 在一组 cells 内寻找“只出现一次”的候选数字
        // 用map保持每种数字的出现位置列表，最后找出仅出现一次的数字及其位置
        const findInGroups = (groups, reason) => {
            for (const cells of groups) {
                const appears = new Map();
                for (const { row, col } of cells) {
                    if (this.grid[row][col] !== 0) continue;
                    for (const candidate of this.getCandidates(row, col)) {
                        if (!appears.has(candidate)) appears.set(candidate, []);
                        appears.get(candidate).push({ row, col });
                    }
                }
                for (const [value, positions] of appears.entries()) {
                    if (positions.length === 1) {
                        const only = positions[0];
                        return {
                            row: only.row,
                            col: only.col,
                            value,
                            candidates: this.getCandidates(only.row, only.col),
                            type: 'next-step',
                            level: 'medium',
                            reason,
                        };
                    }
                }
            }
            return null;
        };
        //生成行/列/宫的 cell 列表，用于 findInGroups 查找隐性单元
        const rowGroups = Array.from({ length: 9 }, (_, row) =>
            Array.from({ length: 9 }, (_, col) => ({ row, col }))
        );
        const colGroups = Array.from({ length: 9 }, (_, col) =>
            Array.from({ length: 9 }, (_, row) => ({ row, col }))
        );
        const boxGroups = [];
        for (let br = 0; br < 3; br++) {
            for (let bc = 0; bc < 3; bc++) {
                const cells = [];
                for (let r = br * 3; r < br * 3 + 3; r++) {
                    for (let c = bc * 3; c < bc * 3 + 3; c++) {
                        cells.push({ row: r, col: c });
                    }
                }
                boxGroups.push(cells);
            }
        }

        return (
            findInGroups(rowGroups, 'hidden-single-row') ||
            findInGroups(colGroups, 'hidden-single-col') ||
            findInGroups(boxGroups, 'hidden-single-box')
        );
    }

    findNextStep() {
        // 先用低成本、可解释性强的策略
        return this.findNakedSingle() || this.findHiddenSingle();
    }

    /**
    * 回溯求解器（DFS + 最少候选优先）。
    *
    * 说明：
    * - 用于“高阶提示”给出建议值
    * - 不会修改原网格，内部在 work 副本上运行
     */
    static _solveGrid(grid) {
        const work = deepCopy(grid);

        // 与grid的getCandidates一样，但作用于work副本
        const getCandidatesFor = (row, col) => {
            if (work[row][col] !== 0) return [];
            const used = new Set();
            for (let i = 0; i < 9; i++) {
                if (work[row][i] !== 0) used.add(work[row][i]);
                if (work[i][col] !== 0) used.add(work[i][col]);
            }
            const boxRow = Math.floor(row / 3) * 3;
            const boxCol = Math.floor(col / 3) * 3;
            for (let r = boxRow; r < boxRow + 3; r++) {
                for (let c = boxCol; c < boxCol + 3; c++) {
                    if (work[r][c] !== 0) used.add(work[r][c]);
                }
            }
            const candidates = [];
            for (let n = 1; n <= 9; n++) {
                if (!used.has(n)) candidates.push(n);
            }
            return candidates;
        };

        // 深度优先搜索：每次选择候选最少的空格以减少分支
        const dfs = () => {
            let bestCell = null;
            let bestCandidates = null;

            for (let row = 0; row < 9; row++) {
                for (let col = 0; col < 9; col++) {
                    if (work[row][col] !== 0) continue;
                    const candidates = getCandidatesFor(row, col);
                    if (candidates.length === 0) return false;
                    if (!bestCell || candidates.length < bestCandidates.length) {
                        bestCell = { row, col };
                        bestCandidates = candidates;
                        if (candidates.length === 1) break;
                    }
                }
                if (bestCandidates && bestCandidates.length === 1) break;
            }

            // 没有空格了，说明已求解
            if (!bestCell) return true;

            // 尝试候选，失败则回溯
            for (const candidate of bestCandidates) {
                work[bestCell.row][bestCell.col] = candidate;
                if (dfs()) return true;
                work[bestCell.row][bestCell.col] = 0;
            }

            return false;
        };

        if (!dfs()) return null;
        return work;
    }


    /**
     * 候选提示：返回指定格子的候选列表。
     */
    getCandidatesHint(options = {}) {
        const { row, col } = options;
        if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
        return {
            type: 'candidates',
            row,
            col,
            candidates: this.getCandidates(row, col),
            reason: 'cell-candidates',
        };
    }

    /**
     * 下一步提示：返回可解释的下一步或高阶提示（尽量给出可填值）。
     */
    getNextValueHint() {

        // ① 尝试“可解释”的下一步（裸单元 / 隐性单元）
        const easyStep = this.findNextStep();
        if (easyStep) {
            return {
                ...easyStep,
                directValue: easyStep.value,
            };
        }

        // ② 没有显式下一步时，选“候选数最少的空格”作为高阶提示
        let best = null;
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (this.grid[r][c] !== 0) continue;
                const candidates = this.getCandidates(r, c);
                if (candidates.length === 0) continue;
                if (!best || candidates.length < best.candidates.length) {
                    best = { row: r, col: c, candidates };
                }
            }
        }

        // 没有空格（或全是无候选），返回 null 表示无可用提示
        if (!best) return null;

        // ③ 尝试求解器给出该格可填写的确定值
        const solved = Sudoku._solveGrid(this.grid);
        if (!solved) {
            // 求解失败：仍返回位置和候选，提醒“没有唯一确定值”
            return {
                type: 'next-step',
                row: best.row,
                col: best.col,
                value: null,
                candidates: best.candidates,
                level: 'hard',
                reason: 'unsolved-no-unique-step',
                directValue: null,
            };
        }

        // 求解成功：返回可直接填写的值
        return {
            type: 'next-step',
            row: best.row,
            col: best.col,
            value: solved[best.row][best.col],
            candidates: best.candidates,
            level: 'hard',
            reason: 'solver-derived',
            directValue: solved[best.row][best.col],
        };
    }

    getSignature() {
        return serializeGrid(this.grid);
    }

    /**
     * 检查当前网格是否满足数独约束（忽略空格）。
     */
    validate() {
        for (let i = 0; i < 9; i++) {
            if (!isValidGroup(this.grid[i])) return false;
            if (!isValidGroup(this.grid.map(row => row[i]))) return false;
        }
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                const box = [];
                for (let k = 0; k < 3; k++) {
                    for (let l = 0; l < 3; l++) {
                        box.push(this.grid[i * 3 + k][j * 3 + l]);
                    }
                }
                if (!isValidGroup(box)) return false;
            }
        }
        return true;
    }

    toJSON() {
        // 返回纯数据对象，便于 JSON round-trip
        return {
            puzzle: deepCopy(this.puzzle),
            grid: deepCopy(this.grid),
        };
    }

    static fromJSON(json) {
        return new Sudoku(json.puzzle, json.grid);
    }

    toString() {
        return this.grid
            .map(row => row.map(n => n === 0 ? '.' : n).join(' '))
            .join('\n') + '\n';
    }
}


// {
//   getSudoku(): Sudoku
//   guess(move): void
//   undo(): void
//   redo(): void
//   canUndo(): boolean
//   canRedo(): boolean
//   toJSON(): any
// }
class Game {
    /**
     * Game 负责会话态管理：
     * - 普通模式 history/future
     * - Explore 模式子会话（独立 history/future + 分支树 + 失败记忆）
     */
    constructor({ sudoku, history = [], future = [], explore = null }) {
        // Clone incoming sudoku so Game owns its own copy
        this.sudoku = sudoku.clone();
        this.history = history.map(m => this._cloneEntry(m));
        this.future = future.map(m => this._cloneEntry(m));
        this.explore = explore ? this._deserializeExplore(explore) : null;
    }

    // ============================
    // 基础工具与数据拷贝
    // ============================

    /**
     * 复制历史条目，避免共享引用。
     */
    _cloneEntry(entry) {
        if (!entry || typeof entry !== 'object') return entry;
        if (entry.kind === 'grid') {
            return {
                kind: 'grid',
                before: deepCopy(entry.before),
                after: deepCopy(entry.after),
                move: entry.move ? { ...entry.move } : null,
                source: entry.source || 'guess',
            };
        }
        return { ...entry };
    }

    // ============================
    // Explore 树结构（父子分支）
    // ============================

    /**
     * 创建 Explore 树节点。
     *
     * 每个节点代表一个局面：
     * - move: 从父节点到该节点所执行的落子
     * - signature/grid: 当前局面的签名与快照
     */
    _createExploreNode(parent, move, signature, grid) {
        return {
            parent,
            move: move ? { ...move } : null,
            signature,
            grid: deepCopy(grid),
            children: new Map(),
        };
    }

    /**
     * 将 Explore 树节点序列化为可 JSON 化结构。
     */
    _serializeExploreNode(node) {
        return {
            move: node.move ? { ...node.move } : null,
            signature: node.signature,
            grid: deepCopy(node.grid),
            children: Array.from(node.children.values()).map(child => this._serializeExploreNode(child)),
        };
    }

    /**
     * 从序列化结构恢复 Explore 树节点（递归）。
     */
    _deserializeExploreNode(serialized, parent = null) {
        const node = this._createExploreNode(parent, serialized.move || null, serialized.signature, serialized.grid);
        for (const child of serialized.children || []) {
            const childNode = this._deserializeExploreNode(child, node);
            const key = this._moveKey(childNode.move);
            node.children.set(key, childNode);
        }
        return node;
    }

    // ============================
    // Explore 会话序列化
    // ============================

    /**
     * 序列化 Explore 会话：
     * - baseSudoku
     * - explore 历史/未来栈
     * - 失败签名集合
     * - 分支树 + 当前路径
     */
    _serializeExploreState() {
        if (!this.explore) return null;
        const path = [];
        let cursor = this.explore.currentNode;
        while (cursor && cursor.parent) {
            path.push({ ...cursor.move });
            cursor = cursor.parent;
        }
        path.reverse();
        return {
            baseSudoku: this.explore.baseSudoku.toJSON(),
            history: this.explore.history.map(e => this._cloneEntry(e)),
            future: this.explore.future.map(e => this._cloneEntry(e)),
            failedSignatures: Array.from(this.explore.failedSignatures),
            knownFailed: this.explore.knownFailed,
            lastFailureReason: this.explore.lastFailureReason,
            root: this._serializeExploreNode(this.explore.root),
            currentPath: path,
        };
    }

    /**
     * 反序列化 Explore 会话并恢复 currentNode。
     */
    _deserializeExplore(serialized) {
        const baseSudoku = Sudoku.fromJSON(serialized.baseSudoku);
        const root = this._deserializeExploreNode(serialized.root);
        let currentNode = root;
        for (const move of serialized.currentPath || []) {
            const key = this._moveKey(move);
            if (currentNode.children.has(key)) {
                currentNode = currentNode.children.get(key);
            } else {
                break;
            }
        }
        return {
            baseSudoku,
            history: (serialized.history || []).map(e => this._cloneEntry(e)),
            future: (serialized.future || []).map(e => this._cloneEntry(e)),
            failedSignatures: new Set(serialized.failedSignatures || []),
            knownFailed: Boolean(serialized.knownFailed),
            lastFailureReason: serialized.lastFailureReason || null,
            root,
            currentNode,
        };
    }

    // ============================
    // 历史栈与指针辅助
    // ============================

    _moveKey(move) {
        return `${move.row},${move.col},${move.value}`;
    }

    /** 当前生效历史：探索态用 explore.history，否则用主 history */
    _activeHistory() {
        return this.isExploring() ? this.explore.history : this.history;
    }

    /** 当前生效 future：探索态用 explore.future，否则用主 future */
    _activeFuture() {
        return this.isExploring() ? this.explore.future : this.future;
    }

    // ============================
    // 历史记录写入
    // ============================

    /**
     * 记录一次网格快照变更。
     *
     * 特性：
     * - before===after 不入栈
     * - 写历史后清空对应 future（符合 undo/redo 语义）
     */
    _pushGridEntry(before, after, move = null, source = 'guess') {
        if (sameGrid(before, after)) return false;
        this._activeHistory().push({
            kind: 'grid',
            before: deepCopy(before),
            after: deepCopy(after),
            move: move ? { ...move } : null,
            source,
        });
        if (this.isExploring()) {
            this.explore.future = [];
        } else {
            this.future = [];
        }
        return true;
    }

    // ============================
    // Explore 状态刷新
    // ============================

    /**
     * Explore 下落子后更新：
     * - 分支树当前位置推进
     * - 更新节点签名和网格
     * - 冲突检测与失败记忆标记
     */
    _touchExploreAfterMove(move) {
        if (!this.explore) return;

        const key = this._moveKey(move);
        let nextNode = this.explore.currentNode.children.get(key);
        const signature = this.sudoku.getSignature();
        const grid = this.sudoku.getGrid();

        if (!nextNode) {
            nextNode = this._createExploreNode(this.explore.currentNode, move, signature, grid);
            this.explore.currentNode.children.set(key, nextNode);
        }

        nextNode.signature = signature;
        nextNode.grid = deepCopy(grid);
        this.explore.currentNode = nextNode;

        const analysis = this.sudoku.analyze();
        const revisitFailed = this.explore.failedSignatures.has(signature);
        const nowFailed = analysis.hasConflict;

        if (nowFailed) {
            this.explore.failedSignatures.add(signature);
        }

        this.explore.knownFailed = revisitFailed || nowFailed;
        this.explore.lastFailureReason = revisitFailed
            ? 'known-failed-state'
            : (nowFailed ? 'conflict-or-dead-end' : null);
    }

    /**
     * Explore 下“移动”后刷新失败状态。
     *
     * 移动包括：undo / redo / gotoExplorePath。
     */
    _touchExploreAfterTravel() {
        if (!this.explore) return;
        const signature = this.sudoku.getSignature();
        const analysis = this.sudoku.analyze();
        const revisitFailed = this.explore.failedSignatures.has(signature);
        const nowFailed = analysis.hasConflict;
        this.explore.knownFailed = revisitFailed || nowFailed;
        this.explore.lastFailureReason = revisitFailed
            ? 'known-failed-state'
            : (nowFailed ? 'conflict-or-dead-end' : null);
    }

    // ============================
    // 基础状态与查询
    // ============================

    // Returns an independent clone of the current sudoku state
    getSudoku() {
        return this.sudoku.clone();
    }

    getMode() {
        return this.isExploring() ? 'explore' : 'normal';
    }

    isExploring() {
        return this.explore !== null;
    }

    // ============================
    // 核心操作（落子/撤销/重做）
    // ============================

    /**
     * 会话层落子：
     * - 委托 Sudoku 修改网格
     * - 将 before/after 记录进当前模式历史
     * - 探索态下更新分支树和失败状态
     */
    guess(move) {
        if (!move || typeof move !== 'object') return false;
        if (!Number.isInteger(move.row) || !Number.isInteger(move.col) || !Number.isInteger(move.value)) return false;
        if (this.sudoku.isFixed(move.row, move.col)) return false;

        const before = this.sudoku.getGrid();
        this.sudoku.guess(move);
        const after = this.sudoku.getGrid();
        const changed = this._pushGridEntry(before, after, move, this.isExploring() ? 'explore-guess' : 'guess');
        if (!changed) return false;

        if (this.isExploring()) {
            this._touchExploreAfterMove(move);
        }

        return true;
    }

    canUndo() {
        return this._activeHistory().length > 0;
    }

    canRedo() {
        return this._activeFuture().length > 0;
    }

    /**
     * 撤销当前模式的一步：
     * - grid 记录：直接 setGrid(before)
     */
    undo() {
        if (!this.canUndo()) return;
        const history = this._activeHistory();
        const future = this._activeFuture();
        const last = history.pop();

        if (!last || last.kind !== 'grid') return;
        this.sudoku.setGrid(last.before);
        future.push(this._cloneEntry(last));
        // Explore 模式下，undo 一步通常对应回到父节点
        if (this.isExploring() && last.move && this.explore.currentNode.parent) {
            this.explore.currentNode = this.explore.currentNode.parent;
        }
        this._touchExploreAfterTravel();
    }

    /**
     * 重做当前模式的一步：
     * - grid 记录：直接 setGrid(after)
     */
    redo() {
        if (!this.canRedo()) return;
        const history = this._activeHistory();
        const future = this._activeFuture();
        const next = future.pop();

        if (!next || next.kind !== 'grid') return;
        this.sudoku.setGrid(next.after);
        history.push(this._cloneEntry(next));
        // Explore 模式下，若分支存在则推进 currentNode
        if (this.isExploring() && next.move) {
            const key = this._moveKey(next.move);
            if (this.explore.currentNode.children.has(key)) {
                this.explore.currentNode = this.explore.currentNode.children.get(key);
            }
        }
        this._touchExploreAfterTravel();
    }

    // ============================
    // 提示相关接口
    // ============================

    /** 候选提示（委托 Sudoku） */
    getCandidatesHint(options = {}) {
        return this.sudoku.getCandidatesHint(options);
    }

    /** 单格候选（委托 Sudoku） */
    getCellCandidates(row, col) {
        return this.sudoku.getCandidates(row, col);
    }

    /** 下一步提示（委托 Sudoku） */
    getNextValueHint() {
        return this.sudoku.getNextValueHint();
    }

    // ============================
    // Explore 模式控制
    // ============================

    /**
     * 进入 Explore 模式。
     *
     * 行为：
     * - 记录 baseSudoku（起点快照）
     * - 初始化 explore 历史/未来栈
     * - 构建分支树根节点
     */
    startExplore() {
        if (this.isExploring()) return false;
        const rootGrid = this.sudoku.getGrid();
        const root = this._createExploreNode(null, null, serializeGrid(rootGrid), rootGrid);
        this.explore = {
            baseSudoku: this.sudoku.clone(),
            history: [],
            future: [],
            failedSignatures: new Set(),
            knownFailed: false,
            lastFailureReason: null,
            root,
            currentNode: root,
        };
        return true;
    }

    /** 放弃 Explore，回滚到进入 Explore 前的基线局面 */
    abandonExplore() {
        if (!this.isExploring()) return false;
        this.sudoku = this.explore.baseSudoku.clone();
        this.explore = null;
        return true;
    }

    /**
     * 提交 Explore：
     * - 若有变更，将 base->current 作为一次主历史操作入栈
     * - 清空主 future
     * - 退出 Explore
     */
    commitExplore() {
        if (!this.isExploring()) return false;

        const before = this.explore.baseSudoku.getGrid();
        const after = this.sudoku.getGrid();

        if (!sameGrid(before, after)) {
            this.history.push({
                kind: 'grid',
                before: deepCopy(before),
                after: deepCopy(after),
                move: null,
                source: 'explore-commit',
            });
            this.future = [];
        }

        this.explore = null;
        return true;
    }

    /** 手动标记当前 Explore 局面为失败（可用于 UI 操作） */
    markExploreFailed(reason = 'manual') {
        if (!this.isExploring()) return false;
        const signature = this.sudoku.getSignature();
        this.explore.failedSignatures.add(signature);
        this.explore.knownFailed = true;
        this.explore.lastFailureReason = reason;
        return true;
    }

    /**
     * 获取 Explore 运行状态。
     *
     * 非探索态也返回统一结构，便于 UI 直接渲染。
     */
    getExploreStatus() {
        if (!this.isExploring()) {
            return {
                active: false,
                canUndo: false,
                canRedo: false,
                hasConflict: this.sudoku.hasConflict(),
                knownFailed: false,
                failedReason: null,
                failedCount: 0,
            };
        }

        const analysis = this.sudoku.analyze();
        return {
            active: true,
            canUndo: this.explore.history.length > 0,
            canRedo: this.explore.future.length > 0,
            hasConflict: analysis.hasConflict,
            knownFailed: this.explore.knownFailed,
            failedReason: this.explore.lastFailureReason,
            failedCount: this.explore.failedSignatures.size,
            conflictDetails: analysis.conflicts,
            deadEnds: analysis.deadEnds,
        };
    }

    /** 导出 Explore 分支树（用于调试或可视化） */
    getExploreTree() {
        if (!this.isExploring()) return null;
        return this._serializeExploreNode(this.explore.root);
    }

    /**
     * 跳转到 Explore 树中的某条路径。
     *
     * path 为 move 数组（从根到目标节点）。
     * 成功后会：
     * - 重置 explore history/future（把它视为新的编辑起点）
     * - 刷新失败状态
     */
    gotoExplorePath(path = []) {
        if (!this.isExploring()) return false;
        if (!Array.isArray(path)) return false;

        let node = this.explore.root;
        for (const move of path) {
            const key = this._moveKey(move);
            if (!node.children.has(key)) return false;
            node = node.children.get(key);
        }

        this.explore.currentNode = node;
        this.sudoku.setGrid(node.grid);
        this.explore.history = [];
        this.explore.future = [];
        this._touchExploreAfterTravel();
        return true;
    }

    // ============================
    // 序列化与反序列化
    // ============================

    // Returns a plain-object snapshot; all arrays are defensively copied
    toJSON() {
        // 会话完整快照：主会话 + 可选 Explore 子会话
        return {
            sudoku: this.sudoku.toJSON(),
            history: this.history.map(m => this._cloneEntry(m)),
            future: this.future.map(m => this._cloneEntry(m)),
            explore: this._serializeExploreState(),
        };
    }

    static fromJSON(json) {
        // 允许旧结构缺少 history/future/explore 字段
        return new Game({
            sudoku: Sudoku.fromJSON(json.sudoku),
            history: (json.history || []).map(m => ({ ...m })),
            future: (json.future || []).map(m => ({ ...m })),
            explore: json.explore || null,
        });
    }
}


export function createSudoku(input) {
    return new Sudoku(input);
}

export function createSudokuFromJSON(json) {
    return Sudoku.fromJSON(json);
}

export function createGame({ sudoku }) {
    return new Game({ sudoku });
}

export function createGameFromJSON(json) {
    return Game.fromJSON(json);
}