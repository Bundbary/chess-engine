/**
 * Basic engine API tests.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { Engine, parseFEN, toFEN, algToIdx, idxToAlg, START_FEN } = require('../src/index.js');

test('FEN round-trip: starting position', () => {
  const pos = parseFEN(START_FEN);
  assert.strictEqual(toFEN(pos), START_FEN);
});

test('Algebraic <-> idx', () => {
  assert.strictEqual(algToIdx('a1'), 0);
  assert.strictEqual(algToIdx('h1'), 7);
  assert.strictEqual(algToIdx('a8'), 56);
  assert.strictEqual(algToIdx('h8'), 63);
  assert.strictEqual(algToIdx('e4'), 28);
  assert.strictEqual(idxToAlg(0), 'a1');
  assert.strictEqual(idxToAlg(28), 'e4');
  assert.strictEqual(idxToAlg(63), 'h8');
});

test('Starting position: 20 legal moves for white', () => {
  const e = Engine.newStandardGame();
  const moves = e.legalMoves();
  assert.strictEqual(moves.length, 20);
});

test('e2-e4 then e7-e5 gives same position as Sicilian-less canonical', () => {
  const e = Engine.newStandardGame();
  e.makeMove({ from: 'e2', to: 'e4' });
  assert.strictEqual(e.turn(), 'b');
  assert.strictEqual(e.enPassantTarget(), 'e3');
  e.makeMove({ from: 'e7', to: 'e5' });
  assert.strictEqual(e.turn(), 'w');
  assert.strictEqual(e.enPassantTarget(), 'e6');
  assert.strictEqual(e.fen(),
    'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2');
});

test('Illegal move throws', () => {
  const e = Engine.newStandardGame();
  assert.throws(() => e.makeMove({ from: 'e2', to: 'e5' }));
});

test("Fool's Mate: f2-f3 e7-e5 g2-g4 Qd8-h4#", () => {
  const e = Engine.newStandardGame();
  e.makeMove({ from: 'f2', to: 'f3' });
  e.makeMove({ from: 'e7', to: 'e5' });
  e.makeMove({ from: 'g2', to: 'g4' });
  e.makeMove({ from: 'd8', to: 'h4' });
  assert.strictEqual(e.status(), 'checkmate');
  assert.strictEqual(e.winner(), 'b');
});

test("Scholar's Mate: 4-move checkmate", () => {
  const e = Engine.newStandardGame();
  e.makeMove({ from: 'e2', to: 'e4' });
  e.makeMove({ from: 'e7', to: 'e5' });
  e.makeMove({ from: 'f1', to: 'c4' });
  e.makeMove({ from: 'b8', to: 'c6' });
  e.makeMove({ from: 'd1', to: 'h5' });
  e.makeMove({ from: 'g8', to: 'f6' }); // blunder
  e.makeMove({ from: 'h5', to: 'f7' });
  assert.strictEqual(e.status(), 'checkmate');
});

test('Stalemate detection', () => {
  // King-and-pawn stalemate: black to move, k on a8, white K on c7, P on b6 — but
  // actually the canonical stalemate is: 7k/5K2/6Q1/8/8/8/8/8 b - - 0 1 (Qg6 stalemate)
  // Let's use a confirmed simple stalemate.
  // FEN for stalemate: '7k/8/6QK/8/8/8/8/8 b - - 0 1' — black king h8 has no moves, not in check
  // Actually that's not stalemate because Qg6 controls h7. Let me think.
  // Classic: 7k/5K2/6Q1/8/8/8/8/8 b - - 0 1  — Kh8, queen g6, white king f7, black to move
  // From h8: only g8 escape, but Q controls g8 (g6-g7-g8 diagonal blocked? no g-file is direct)
  // Yeah this is stalemate.
  const e = Engine.fromFEN('7k/5K2/6Q1/8/8/8/8/8 b - - 0 1');
  assert.strictEqual(e.legalMoves().length, 0);
  assert.strictEqual(e.inCheck(), false);
  assert.strictEqual(e.status(), 'stalemate');
});

test('Insufficient material: K vs K', () => {
  const e = Engine.fromFEN('8/8/8/4k3/8/4K3/8/8 w - - 0 1');
  assert.strictEqual(e.status(), 'draw-insufficient-material');
});

test('Insufficient material: K+B vs K', () => {
  const e = Engine.fromFEN('8/8/8/4k3/8/4K3/8/4B3 w - - 0 1');
  assert.strictEqual(e.status(), 'draw-insufficient-material');
});

test('Insufficient material: K+N vs K', () => {
  const e = Engine.fromFEN('8/8/8/4k3/8/4K3/8/4N3 w - - 0 1');
  assert.strictEqual(e.status(), 'draw-insufficient-material');
});

test('SUFFICIENT material: K+R vs K is NOT a draw', () => {
  const e = Engine.fromFEN('8/8/8/4k3/8/4K3/8/4R3 w - - 0 1');
  assert.notStrictEqual(e.status(), 'draw-insufficient-material');
});

test('Castling: standard chess kingside', () => {
  const e = Engine.fromFEN('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
  const moves = e.legalMovesFrom('e1');
  // Should include kingside castle: e1-g1
  const castle = moves.find(m => m.castle === 'K');
  assert.ok(castle, 'kingside castle should be legal');
  assert.strictEqual(castle.to, algToIdx('g1'));
  assert.strictEqual(castle.rookFrom, algToIdx('h1'));
  assert.strictEqual(castle.rookTo, algToIdx('f1'));
});

test('Castling: blocked by check on path', () => {
  // White king e1, white rook h1, black rook on f8 attacks f1 — blocking castling path
  const e = Engine.fromFEN('5r2/8/8/8/8/8/8/4K2R w K - 0 1');
  const moves = e.legalMovesFrom('e1');
  const castle = moves.find(m => m.castle === 'K');
  assert.ok(!castle, 'kingside castle should be blocked when path attacked');
});

test('En passant: pawn-on-pawn capture', () => {
  const e = Engine.fromFEN('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3');
  const moves = e.legalMovesFrom('e5');
  const ep = moves.find(m => m.enPassant);
  assert.ok(ep, 'en passant should be legal');
  assert.strictEqual(ep.to, algToIdx('f6'));
  assert.strictEqual(ep.capturedSquare, algToIdx('f5'));
});

test('Promotion: pawn reaches 8th rank, four promotion options', () => {
  const e = Engine.fromFEN('8/4P3/8/8/8/8/8/4K2k w - - 0 1');
  const moves = e.legalMovesFrom('e7');
  const pushes = moves.filter(m => m.to === algToIdx('e8'));
  assert.strictEqual(pushes.length, 4, 'four promotion options on push');
  const promoTypes = pushes.map(m => m.promotion).sort();
  assert.deepStrictEqual(promoTypes, ['B', 'N', 'Q', 'R']);
});

test('Threefold repetition', () => {
  const e = Engine.newStandardGame();
  // Knight shuffle: Nb1-c3, Nb8-c6, Nc3-b1, Nc6-b8 — back to start. Repeat 3 times.
  const seq = [
    ['b1', 'c3'], ['b8', 'c6'],
    ['c3', 'b1'], ['c6', 'b8'],
  ];
  // After one full cycle, position is reached 2nd time
  for (const [f, t] of seq) e.makeMove({ from: f, to: t });
  assert.notStrictEqual(e.status(), 'draw-threefold');
  // After second full cycle, position reached 3rd time -> draw
  for (const [f, t] of seq) e.makeMove({ from: f, to: t });
  assert.strictEqual(e.status(), 'draw-threefold');
});

test('Chess960 random FEN parses and has 20 legal moves... wait no, varies', () => {
  const { randomChess960FEN } = require('../src/index.js');
  const fen = randomChess960FEN();
  const e = Engine.fromFEN(fen, { chess960: true });
  // Just verify it parses and has SOME legal moves.
  const moves = e.legalMoves();
  assert.ok(moves.length > 0, 'random 960 position should have legal moves');
  assert.strictEqual(e.turn(), 'w');
});

test('Chess960 undoMove preserves rook in tight-pack castle (regression: c8 ghost rook)', () => {
  // Repros a real bug from a bot match: starting position nbrkbnrq has
  // king on d-file and rook adjacent on c-file. When the legal-move
  // generator hypothetically tested the queenside castle (king d→c,
  // rook c→d), undoMove was clearing the king's destination square
  // (move.to == c-file) AFTER restoring the rook there, permanently
  // erasing the rook from pos.board. Subsequent moves looked fine but
  // the rook was gone forever.
  const fen = 'nbrkbnrq/pppppppp/8/8/8/8/PPPPPPPP/NBRKBNRQ w GCgc - 0 1';
  const e = Engine.fromFEN(fen, { chess960: true });
  // Rank 8 should have: nbrkbnrq with rook on c8.
  const before = e.boardArray();
  assert.strictEqual(before[58], 'r', 'c8 starts with black rook');
  // White castles queenside (d1->c1).
  e.makeMove({ from: 'd1', to: 'c1' });
  // Black plays a non-castle move. Internally, genLegalMoves tests every
  // pseudo-move including the hypothetical queenside castle for black.
  // Before the fix, that hypothetical undo corrupts c8.
  e.makeMove({ from: 'a8', to: 'b6' });
  const after = e.boardArray();
  assert.strictEqual(after[58], 'r', 'c8 rook must survive after a black non-castle move that triggers castle generation');
});

test('Chess960 castling: edge-case position with rook adjacent to king', () => {
  // A specific 960 position: RKR----- on white back rank
  // Actually the constraint is K between rooks, so RKR... with bishops/etc filled in
  // Let's use a known 960 position. Reference: "RBQKBNRN" arrangement — one of the 960
  // Here's one: bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w HFhf - 0 1
  const fen = 'bbqnnrkr/pppppppp/8/8/8/8/PPPPPPPP/BBQNNRKR w HFhf - 0 1';
  const e = Engine.fromFEN(fen, { chess960: true });
  // White king is on g1. Rooks on f1 and h1. Castling kingside means king g1->g1 (already there),
  // rook h1->f1; queenside means king g1->c1, rook f1->d1.
  const moves = e.legalMovesFrom('g1');
  // Kingside: king and rook need to swap-ish; should not be available because pieces in the way
  // Queenside has many pieces between g1 and c1
  // Just verify it doesn't crash.
  assert.ok(Array.isArray(moves));
});
