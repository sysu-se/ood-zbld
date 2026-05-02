import { describe, expect, it } from 'vitest'
import { loadDomainApi, makePuzzle } from '../hw1/helpers/domain-api.js'

describe('HW2 serialization compatibility', () => {
  it('serializes and restores explore state', async () => {
    const { createGame, createGameFromJSON, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    game.startExplore()
    game.guess({ row: 0, col: 2, value: 4 })

    const restored = createGameFromJSON(JSON.parse(JSON.stringify(game.toJSON())))

    expect(restored.isExploring()).toBe(true)
    expect(restored.getSudoku().getGrid()[0][2]).toBe(4)

    restored.abandonExplore()
    expect(restored.getSudoku().getGrid()[0][2]).toBe(0)
  })
})
