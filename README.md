# @bundbary/chess-engine

A clean-room JavaScript chess engine with first-class **Fischer Random (Chess960)** support. Zero runtime dependencies, MIT-licensed, validated with Perft.

## Why

Most JS chess libraries treat Chess960 as an afterthought. This one was written with both standard and Chess960 in mind from day one — castling rules, FEN parsing, and starting-position generation all handle the 960-position case natively.

## Features

- Standard chess and Fischer Random (Chess960) — same API, opt in via `{ chess960: true }`.
- Full move generation: pawn pushes/captures/promotion, en passant, castling (both standard and 960-style), pin and check resolution.
- End-of-game detection: checkmate, stalemate, fifty-move rule, threefold repetition, insufficient-material draw.
- Validated with **Perft** at depth 3 across 5 positions including the standard test set used by the chess-programming community.
- FEN in, FEN out. Algebraic notation in (`e2`, `e4`), move objects out.
- Zero runtime dependencies. Pure CommonJS, runs on Node 18+.

## Install

This package is distributed via GitHub:

```bash
npm install github:Bundbary/chess-engine
```

Or clone directly:

```bash
git clone https://github.com/Bundbary/chess-engine.git
```

## Quick start

```js
const { Engine, START_FEN } = require('@bundbary/chess-engine');

const eng = Engine.newStandardGame();

// Or from a FEN
const fromFen = Engine.fromFEN('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');

// Or a random Chess960 game
const { randomChess960FEN } = require('@bundbary/chess-engine');
const fr = Engine.fromFEN(randomChess960FEN(), { chess960: true });

eng.makeMove({ from: 'e2', to: 'e4' });
eng.makeMove({ from: 'e7', to: 'e5' });

console.log(eng.fen());          // FEN of the current position
console.log(eng.legalMoves());   // [{ from, to, ... }, ...]
console.log(eng.status());       // 'in-progress' | 'check' | 'checkmate' | 'stalemate' |
                                 // 'draw-fifty-move' | 'draw-threefold' | 'draw-insufficient-material'
```

## Public API

### Class `Engine`

| Method | Returns | Notes |
|---|---|---|
| `Engine.fromFEN(fen, opts?)` | `Engine` | Pass `{ chess960: true }` for Chess960. |
| `Engine.newStandardGame()` | `Engine` | Convenience for the standard starting position. |
| `eng.makeMove(move)` | `boolean` | Move shape: `{ from, to, promotion? }`. Returns `true` if applied. |
| `eng.legalMoves()` | `Move[]` | All legal moves in the current position. |
| `eng.legalMovesFrom(square)` | `Move[]` | Legal moves from a given square (`'e2'`). |
| `eng.status()` | `string` | `'in-progress'`, `'check'`, `'checkmate'`, `'stalemate'`, `'draw-fifty-move'`, `'draw-threefold'`, `'draw-insufficient-material'`. |
| `eng.fen()` | `string` | FEN of the current position. |
| `eng.toLegacyMap()` | `object` | `{ 'e4': 'wP', ... }` board representation. |

### Module exports

```js
const {
  Engine, START_FEN,
  // FEN + algebraic
  parseFEN, toFEN, algToIdx, idxToAlg,
  // Chess960
  randomChess960FEN, backRankToFEN, generateRandomBackRank,
  // Lower-level primitives (for bots, search, custom analysis)
  genLegalMoves, applyMove, undoMove,
  isInCheck, isSquareAttacked, findKing, findLegalMove,
  pieceType, isWhite,
} = require('@bundbary/chess-engine');
```

## Tests

```bash
npm test          # all tests including Perft
npm run test:perft # just Perft (move-generation correctness)
```

Perft compares total leaf-node counts at varying depths against known-correct reference values across multiple starting positions. Any move-generation bug — missed legal moves, illegal moves leaking through, mishandled promotions/en-passant/castling — would produce a mismatch.

## Bots

Five chess bots that play with this engine will be released as a sibling package: `@bundbary/chess-engine-bots` (coming soon).

## Notable bug fix during development

While building Chess960 castling, a subtle bug surfaced in `undoMove`: in tight-pack starting positions where the king and an adjacent rook share files (e.g. king on d-file, rook on c-file), the queenside castle has `rookFrom == king's destination square`. The undo path correctly restored the rook to that square, then immediately wiped it via the post-castle clear, silently deleting the rook from the engine's internal state.

Because `genLegalMoves` applies and undoes every pseudo-move during legality testing, this corruption was triggered by *any* turn where a queenside castle happened to be considered — leading to a "ghost rook" symptom: a rook that vanished mid-game with no capture recorded.

The fix: only clear `move.to` during castle undo if neither `rookTo` nor `rookFrom` equals it. A regression test replays the exact two-move sequence that triggers it.

If you're implementing your own Chess960 engine, this is the kind of edge case that won't show up in standard chess and is easy to miss.

## License

MIT — see [LICENSE](./LICENSE).
