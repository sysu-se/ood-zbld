## 1) 你如何实现提示功能？

我把提示能力放在领域层实现，而不是放在 UI。实现步骤与思路如下：

1) **先补齐领域层“规则接口”**（只依赖棋盘规则，不依赖 UI）：
   - `Sudoku.getCandidates(row, col)`：计算某格候选集合（同行/同列/同宫过滤）。
   - `Sudoku.findNextStep()`：低成本、可解释策略（先裸单元、再隐性单元）。
2) **在领域层封装“提示输出格式”**，统一向上层返回可读结构：
   - `Sudoku.getCandidatesHint({ row, col })`：返回 `{ type, row, col, candidates, reason }`。
   - `Sudoku.getNextValueHint()`：返回 `{ type, row, col, value, candidates, level, reason, directValue }`。
3) **在 Game 侧做会话编排**（保持 UI 只调用 Game）：
   - `Game.getCandidatesHint()` / `Game.getNextValueHint()` 直接委托 Sudoku。
   - `Game.applyNextValueHint()`：拿到 hint 后直接落子（并写入历史）。
4) **UI 层对应两个按钮**：

   1. 候选提示按钮（只展示候选，不修改棋盘）：
       - 调用 `Sudoku.getCandidatesHint({ row, col })`。
       - 内部先用 `Sudoku.getCandidates(row, col)` 计算候选，再返回统一结构。

   2. 下一步提示按钮（直接落子）：
       - 第一步走“可解释策略” `Sudoku.findNextStep()`：
          - 裸单元：某一格只有一个候选值时，那么这个格只能填该候选值
          - 隐性单元：某个数字在同一宫/列/行内的所有格的候选值中只出现一次，则该格必填
       - 若找不到显式步骤，则进入 `Sudoku.getNextValueHint()` 的高阶策略：
          - 在局面内寻找一个候选值最少的格：候选越少，越可能缩小分支
          - 用求解器在当前局面上尝试求解：
             - 若能求解，则返回该格在解中的确定值（`directValue`）
             - 若无法求解，则只返回该格候选集合，提示“暂无唯一确定值”

提示原因与多等级：

- `reason`：例如 `naked-single`、`hidden-single`、`min-candidates-cell`、`solver-derived`
- `level`：`easy / medium / hard`（对应裸单元 / 隐性单元 / 高阶提示）

因此 UI 只调用 `Game/Sudoku` 的领域接口，不拼临时逻辑，并在界面展示提示原因与等级。

---

## 2) 你认为提示功能更属于 `Sudoku` 还是 `Game`？为什么？

核心求解与候选分析属于 `Sudoku`，因为它只依赖棋盘约束规则。

`Game` 的职责是会话级编排（普通模式/探索模式、历史、状态），所以提示对外入口放在 `Game`，但计算委托给 `Sudoku`。

即：

- **规则与推断**：`Sudoku`
- **会话与交互编排**：`Game`

---

## 3) 你如何实现探索模式？

新增 `Game` 探索态，核心思路是“**Game 进入新状态 + 临时子会话 + 局面快照回滚**”三者结合：
- `Game` 进入 explore 状态（与 normal 区分）
- 维护独立探索子会话（探索 history/future）
- 以快照方式保存基线局面，便于提交/回滚

实现步骤如下：

1) **进入探索**：`startExplore()`
   - 复制当前 `sudoku` 作为 `baseSudoku`（深拷贝，避免共享对象与引用污染）。
   - 初始化探索用 `history/future`，与主会话分离。
   - 建立探索树根节点（当前局面快照 + 签名）。

2) **探索中落子**：`guess()`
   - 写入探索历史（`before/after` 快照）。
   - 更新探索树当前节点。
   - 触发一致性分析（冲突/死局），并记录失败签名。

3) **探索中回退**：`undo/redo()`
   - 只作用于探索历史。
   - 同步探索树节点指针。
   - 重新刷新失败状态。

4) **应用探索**：`commitExplore()`
   - 若探索产生变化，将 `base -> current` 作为一次**主 history**操作写入（合并方式是“快照替换”，而非逐步 replay）。
   - 清空主 `future`，退出探索态。

5) **放弃探索**：`abandonExplore()`
   - 直接恢复 `baseSudoku`（快照回滚），退出探索态。

6) **失败记忆**：`getExploreStatus()`
   - 通过 `Sudoku.analyze()` 判断冲突/死局。
   - 失败局面签名写入 `failedSignatures`，重复遇到同签名则提示“已知失败”。

探索期间：

用 `_activeHistory()` / `_activeFuture()` 返回对应的 history/future；处于探索模式时，`guess/undo/redo` 自动作用于探索子会话的独立 history。

---

## 4) 主局面与探索局面的关系是什么？

我采用“**主局面 + 探索会话快照**”模型：

- 进入探索时，保存主局面的快照为 `baseSudoku`（深拷贝）
- 探索中操作当前 `sudoku`
- 提交时把 `base -> current` 作为一次主历史操作写入（合并成单个快照）
- 放弃时直接恢复 `baseSudoku`（快照回滚）

这样避免引用污染与浅拷贝问题。

---

## 5) 你的 history 结构在本次作业中是否发生了变化？

有变化：

- 统一使用 `grid` 级快照记录（`before/after`）
- 探索过程拥有独立 history/future（主会话仍然是线性栈）
- 提交时以“一次快照”进入主 history
- 探索树用于分支可视化与跳转（主 history 仍保持线性）

收益：

- 能自然支持探索提交（作为单个快照操作）
- 能保持 Undo/Redo 一致性
- 更容易做分支与状态回放

---

## 6) Homework 1 中的哪些设计，在 Homework 2 中暴露出了局限？

主要局限：

1. 之前使用的 history 只支持线性单步 cell 变更，不适合“探索提交”这种复合操作。
2. `Game` 没有明确模式状态，导致探索语义难落地。
3. 缺少统一的冲突/死局分析接口，探索失败难以在领域层集中判断。
4. 缺少探索态的序列化字段，难以稳定保存/恢复探索树与失败记忆。
5. 历史记录缺少“操作来源/类型”标识，不利于调试与区分普通落子/探索提交等语义。

---

## 7) 如果重做一次 Homework 1，你会如何修改原设计？

我会从一开始就做：

1. 明确 `Game` 会话状态机（normal/explore/...）。
2. 历史抽象为通用操作（operation）而非仅 cell 回写。
3. 在 `Sudoku` 内部沉淀候选、分析、冲突检测接口。
4. 序列化结构预留“会话扩展字段”（例如探索树）。

---

## 加分项实现说明

### A. 提示原因说明

`getCandidatesHint / getNextValueHint` 返回 `reason` 字段，便于在提示时给出提示的类型例如：

- `naked-single`
- `hidden-single-row / col / box`
- `min-candidates-cell`
- `solver-derived`

### B. 多等级提示

通过 `level` 输出：

- `easy`：裸单元
- `medium`：隐性单元
- `hard`：最少候选/求解器推导

### C. 提示原因与等级展示（UI）

store 记录最近一次提示 `lastHint`，UI 在操作区下方展示：

- 提示原因文案（根据 `reason` 映射）
- 提示等级（`easy/medium/hard`）

### D. 树状探索分支

探索会话维护节点树：

- `getExploreTree()` 可读分支结构
- `gotoExplorePath(path)` 可回到历史分支路径

### E. 探索过程独立 Undo/Redo

探索态维护独立 `history/future`，不污染主会话。

### F. 失败路径记忆

维护 `failedSignatures`：

- 探索出现冲突或死局时记录签名
- 允许手动标记探索失败的局面
- 再次走到同一签名，`knownFailed=true` 并给出失败原因

### G. 测试覆盖

新增 `tests/hw2`：

- 提示能力
- 探索进入/提交/放弃
- 冲突与失败记忆
- 分支遍历与探索独立 undo/redo
- HW2 序列化恢复
