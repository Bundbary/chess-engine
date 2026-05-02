/**
 * Perft (PERformance Test) — count legal positions at depth N from a known
 * starting position, compared to published reference values. This is the
 * gold-standard correctness test for a chess move generator: if Perft matches,
 * the move generator + make/unmake is provably correct.
 *
 * Reference numbers from https://www.chessprogramming.org/Perft_Results
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { Engine, parseFEN } = require('../src/index.js');
const { genLegalMoves, applyMove, undoMove } = require('../src/moves.js');

function perft(pos, depth) {
  if (depth === 0) return 1;
  const moves = genLegalMoves(pos);
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const move of moves) {
    const undo = applyMove(pos, move);
    nodes += perft(pos, depth - 1);
    undoMove(pos, move, undo);
  }
  return nodes;
}

test('Perft: starting position', async (t) => {
  const e = Engine.newStandardGame();
  await t.test('depth 1 = 20', () => assert.strictEqual(perft(e.pos, 1), 20));
  await t.test('depth 2 = 400', () => assert.strictEqual(perft(e.pos, 2), 400));
  await t.test('depth 3 = 8902', () => assert.strictEqual(perft(e.pos, 3), 8902));
  await t.test('depth 4 = 197281', () => assert.strictEqual(perft(e.pos, 4), 197281));
});

test('Perft: Kiwipete', async (t) => {
  const fen = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
  const e = Engine.fromFEN(fen);
  await t.test('depth 1 = 48', () => assert.strictEqual(perft(e.pos, 1), 48));
  await t.test('depth 2 = 2039', () => assert.strictEqual(perft(e.pos, 2), 2039));
  await t.test('depth 3 = 97862', () => assert.strictEqual(perft(e.pos, 3), 97862));
});

test('Perft: position 3 (endgame)', async (t) => {
  const fen = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';
  const e = Engine.fromFEN(fen);
  await t.test('depth 1 = 14', () => assert.strictEqual(perft(e.pos, 1), 14));
  await t.test('depth 2 = 191', () => assert.strictEqual(perft(e.pos, 2), 191));
  await t.test('depth 3 = 2812', () => assert.strictEqual(perft(e.pos, 3), 2812));
  await t.test('depth 4 = 43238', () => assert.strictEqual(perft(e.pos, 4), 43238));
});

test('Perft: position 4 (mirror of position 5)', async (t) => {
  const fen = 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1';
  const e = Engine.fromFEN(fen);
  await t.test('depth 1 = 6', () => assert.strictEqual(perft(e.pos, 1), 6));
  await t.test('depth 2 = 264', () => assert.strictEqual(perft(e.pos, 2), 264));
  await t.test('depth 3 = 9467', () => assert.strictEqual(perft(e.pos, 3), 9467));
});

test('Perft: position 5 (Steven Edwards, talkchess)', async (t) => {
  const fen = 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8';
  const e = Engine.fromFEN(fen);
  await t.test('depth 1 = 44', () => assert.strictEqual(perft(e.pos, 1), 44));
  await t.test('depth 2 = 1486', () => assert.strictEqual(perft(e.pos, 2), 1486));
  await t.test('depth 3 = 62379', () => assert.strictEqual(perft(e.pos, 3), 62379));
});
