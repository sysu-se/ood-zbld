import { describe, expect, it } from 'vitest'
import { loadDomainApi, makePuzzle } from '../hw1/helpers/domain-api.js'

describe('HW2 hint features', () => {
  it('provides candidates for a target cell', async () => {
    const { createSudoku } = await loadDomainApi()
    const sudoku = createSudoku(makePuzzle())

    const candidates = sudoku.getCandidates(0, 2)

    expect(candidates).toEqual([1, 2, 4])
  })

  it('provides next-step hint from game domain API', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    const hint = game.getNextValueHint()

    expect(hint).toBeTruthy()
    expect(hint.type).toBe('next-step')
    expect(typeof hint.row).toBe('number')
    expect(typeof hint.col).toBe('number')
    expect(Array.isArray(hint.candidates)).toBe(true)
    expect(typeof hint.reason).toBe('string')
  })

  it('returns value hints when available', async () => {
    const { createGame, createSudoku } = await loadDomainApi()
    const game = createGame({ sudoku: createSudoku(makePuzzle()) })

    const hint = game.getNextValueHint()

    expect(hint).toBeTruthy()
    expect(hint.directValue === null || Number.isInteger(hint.directValue)).toBe(true)
  })
})
