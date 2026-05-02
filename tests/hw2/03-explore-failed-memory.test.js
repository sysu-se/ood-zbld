import { describe, expect, it } from 'vitest'
import { loadDomainApi, makePuzzle } from '../hw1/helpers/domain-api.js'

describe('HW2 explore failed memory', () => {
  it('detects conflicts and remembers failed states across paths', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    game.startExplore()

    // 在 row0 放两个 1，制造冲突
    game.guess({ row: 0, col: 2, value: 1 })
    game.guess({ row: 0, col: 3, value: 1 })

    let status = game.getExploreStatus()
    expect(status.hasConflict).toBe(true)
    expect(status.knownFailed).toBe(true)

    // 回到起点后，按同一路径回放，应该能识别已失败状态
    game.undo()
    game.undo()
    game.guess({ row: 0, col: 2, value: 1 })
    game.guess({ row: 0, col: 3, value: 1 })

    status = game.getExploreStatus()
    expect(status.knownFailed).toBe(true)
    expect(typeof status.failedReason).toBe('string')
  })
})
