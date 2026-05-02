import { describe, expect, it } from 'vitest'
import { loadDomainApi, makePuzzle } from '../hw1/helpers/domain-api.js'

describe('HW2 explore branching and independent undo/redo', () => {
  it('keeps an exploration tree and allows branch traversal', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    game.startExplore()

    game.guess({ row: 0, col: 2, value: 1 })
    game.undo()
    game.guess({ row: 0, col: 2, value: 2 })

    // 回到根，走另一分支
    expect(game.gotoExplorePath([])).toBe(true)
    expect(game.guess({ row: 0, col: 2, value: 1 })).toBe(true)

    const tree = game.getExploreTree()
    expect(tree).toBeTruthy()
    expect(Array.isArray(tree.children)).toBe(true)
    expect(tree.children.length).toBeGreaterThanOrEqual(2)

    // 探索模式下 Undo/Redo 独立存在
    expect(game.getExploreStatus().canUndo).toBe(true)
    game.undo()
    expect(game.getExploreStatus().canRedo).toBe(true)
    game.redo()
    expect(game.getSudoku().getGrid()[0][2]).toBe(1)
  })
})
