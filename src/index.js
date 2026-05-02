/**
 * High-level Engine class — public API for the chess engine.
 *
 * Usage:
 *   const eng = Engine.fromFEN('...');
 *   const moves = eng.legalMoves();              // array of move objects
 *   const movesFromE2 = eng.legalMovesFrom('e2'); // filter by source square
 *   eng.makeMove({ from: 'e2', to: 'e4' });
 *   eng.makeMove({ from: 'g7', to: 'g8', promotion: 'Q' });
 *   eng.status();        // 'in-progress' | 'check' | 'checkmate' |
 *                        // 'stalemate' | 'draw-fifty-move' |
 *                        // 'draw-threefold' | 'draw-insufficient-material'
 *   eng.fen();           // current position as FEN
 *   eng.toLegacyMap();   // { 'e4': 'wP', ... } (for legacy server integration)
 */
'use strict';

const {
  parseFEN, toFEN, START_FEN,
  algToIdx, idxToAlg,
  cloneBoard,
  pieceType, isWhite,
  boardToLegacyMap,
} = require('./board.js');

const {
  genLegalMoves, applyMove, undoMove,
  isInCheck, isSquareAttacked, findKing,
  findLegalMove,
} = require('./moves.js');

const {
  randomChess960FEN, backRankToFEN, generateRandomBackRank,
} = require('./chess960.js');

class Engine {
  /** @param {object} pos  parsed position from parseFEN */
  constructor(pos, opts = {}) {
    this.pos = pos;
    this.chess960 = !!opts.chess960;
    this.history = []; // { move, undo, fen-key-position }
    this.positionCounts = new Map(); // for threefold detection: key -> count
    this._recordPosition();
  }

  static fromFEN(fen, opts = {}) {
    const pos = parseFEN(fen);
    pos._chess960 = !!opts.chess960;
    return new Engine(pos, opts);
  }

  static newStandardGame() {
    return Engine.fromFEN(START_FEN);
  }

  static newChess960Game() {
    return Engine.fromFEN(randomChess960FEN(), { chess960: true });
  }

  /** Current FEN. */
  fen() {
    return toFEN(this.pos);
  }

  /** Whose turn: 'w' | 'b'. */
  turn() { return this.pos.turn; }

  /** Halfmove clock (50-move-rule counter). */
  halfmoveClock() { return this.pos.halfmove; }

  /** Fullmove number. */
  fullmoveNumber() { return this.pos.fullmove; }

  /** Are we in check? */
  inCheck() { return isInCheck(this.pos); }

  /** All legal moves for the side to move. */
  legalMoves() {
    return genLegalMoves(this.pos);
  }

  /**
   * Legal moves from a given square. `from` accepts algebraic ('e2') or 0..63 idx.
   * Returns array of move objects (each with .from .to .promotion etc.) — destinations
   * are 0..63 indices but you can map them via idxToAlg.
   */
  legalMovesFrom(from) {
    const fromIdx = typeof from === 'number' ? from : algToIdx(from);
    return this.legalMoves().filter(m => m.from === fromIdx);
  }

  /**
   * Convenience for clients: get destination squares (algebraic) for a piece on `from`.
   * Returns Set of strings.
   */
  legalDestinationsFrom(from) {
    const moves = this.legalMovesFrom(from);
    return new Set(moves.map(m => idxToAlg(m.to)));
  }

  /**
   * Make a move. Accepts:
   *   { from, to, promotion? }       where from/to are algebraic ('e2', 'e4') or idx
   *   a move object returned from legalMoves()
   * Throws if the move is illegal.
   */
  makeMove(input) {
    let move;
    if (input && typeof input === 'object' && Number.isInteger(input.from) && input.color) {
      // Already a fully-formed move object — verify it's still legal.
      const legal = this.legalMoves();
      move = legal.find(m =>
        m.from === input.from && m.to === input.to &&
        m.promotion === (input.promotion ?? null)
      );
      if (!move) throw new Error('Illegal move: not in current legal-move list');
    } else {
      const fromIdx = typeof input.from === 'number' ? input.from : algToIdx(input.from);
      const toIdx = typeof input.to === 'number' ? input.to : algToIdx(input.to);
      if (fromIdx < 0 || toIdx < 0) {
        throw new Error(`Invalid move squares: ${input.from} -> ${input.to}`);
      }
      move = findLegalMove(this.pos, fromIdx, toIdx, input.promotion || null);
      if (!move) {
        throw new Error(`Illegal move: ${input.from} -> ${input.to}`);
      }
    }
    const undo = applyMove(this.pos, move);
    this.history.push({ move, undo });
    this._recordPosition();
    return move;
  }

  /** Undo the last move. Returns the move that was undone, or null. */
  undo() {
    if (this.history.length === 0) return null;
    this._unrecordPosition();
    const { move, undo } = this.history.pop();
    undoMove(this.pos, move, undo);
    return move;
  }

  /**
   * Game status:
   *   'in-progress'                — game continues, not in check
   *   'check'                      — game continues, in check
   *   'checkmate'                  — checkmate (winner is opposite of turn())
   *   'stalemate'                  — stalemate, draw
   *   'draw-fifty-move'            — 50-move rule reached
   *   'draw-threefold'             — same position reached 3 times
   *   'draw-insufficient-material' — neither side can mate
   */
  status() {
    const legal = this.legalMoves();
    if (legal.length === 0) {
      return this.inCheck() ? 'checkmate' : 'stalemate';
    }
    if (this.pos.halfmove >= 100) return 'draw-fifty-move';
    if (this._isThreefold()) return 'draw-threefold';
    if (this._isInsufficientMaterial()) return 'draw-insufficient-material';
    return this.inCheck() ? 'check' : 'in-progress';
  }

  /** Is the game over? */
  isGameOver() {
    const s = this.status();
    return s === 'checkmate' || s === 'stalemate'
      || s === 'draw-fifty-move' || s === 'draw-threefold'
      || s === 'draw-insufficient-material';
  }

  /** Winner: 'w', 'b', or null (draw or in-progress). */
  winner() {
    if (this.status() === 'checkmate') {
      return this.pos.turn === 'w' ? 'b' : 'w';
    }
    return null;
  }

  /** Castling rights (snapshot — files of rooks involved, or null). */
  castlingRights() { return { ...this.pos.castling }; }

  /** Active en-passant target as algebraic, or null. */
  enPassantTarget() {
    return this.pos.ep < 0 ? null : idxToAlg(this.pos.ep);
  }

  /** Legacy {alg: 'wK'} map for the existing chess server. */
  toLegacyMap() {
    return boardToLegacyMap(this.pos.board);
  }

  /** Internal 64-array of FEN piece chars (defensive copy). */
  boardArray() {
    return cloneBoard(this.pos.board);
  }

  // ============ Draw detection helpers ============

  _positionKey() {
    // Threefold uses board + turn + castling + ep — NOT move counters.
    const { board, turn, castling, ep } = this.pos;
    return board.join('') + '|' + turn
      + '|' + (castling.wK ?? 'x') + (castling.wQ ?? 'x')
      + (castling.bK ?? 'x') + (castling.bQ ?? 'x')
      + '|' + ep;
  }

  _recordPosition() {
    const k = this._positionKey();
    this.positionCounts.set(k, (this.positionCounts.get(k) || 0) + 1);
  }

  _unrecordPosition() {
    const k = this._positionKey();
    const c = this.positionCounts.get(k);
    if (c <= 1) this.positionCounts.delete(k);
    else this.positionCounts.set(k, c - 1);
  }

  _isThreefold() {
    return (this.positionCounts.get(this._positionKey()) || 0) >= 3;
  }

  _isInsufficientMaterial() {
    const counts = { w: { N: 0, B: 0, R: 0, Q: 0, P: 0 }, b: { N: 0, B: 0, R: 0, Q: 0, P: 0 } };
    const bishopColors = { w: [], b: [] }; // square color (0 light, 1 dark)
    for (let i = 0; i < 64; i++) {
      const p = this.pos.board[i];
      if (p === '.' || p === '') continue;
      const t = pieceType(p);
      if (t === 'K') continue;
      const c = isWhite(p) ? 'w' : 'b';
      counts[c][t]++;
      if (t === 'B') {
        // Square color: (file + rank) % 2 — light (1) when sum is odd, dark (0) when even
        bishopColors[c].push((i + (i >> 3)) & 1);
      }
    }
    const total = (c) => counts[c].N + counts[c].B + counts[c].R + counts[c].Q + counts[c].P;
    // K vs K
    if (total('w') === 0 && total('b') === 0) return true;
    // K + minor vs K
    const isMinorOnly = (c) =>
      counts[c].R === 0 && counts[c].Q === 0 && counts[c].P === 0
      && (counts[c].N + counts[c].B) === 1;
    if (isMinorOnly('w') && total('b') === 0) return true;
    if (isMinorOnly('b') && total('w') === 0) return true;
    // K + B vs K + B with bishops on same color squares
    if (counts.w.R === 0 && counts.w.Q === 0 && counts.w.P === 0
        && counts.w.N === 0 && counts.w.B === 1
        && counts.b.R === 0 && counts.b.Q === 0 && counts.b.P === 0
        && counts.b.N === 0 && counts.b.B === 1
        && bishopColors.w[0] === bishopColors.b[0]) {
      return true;
    }
    return false;
  }
}

module.exports = {
  Engine,
  // FEN + algebraic helpers
  parseFEN,
  toFEN,
  algToIdx,
  idxToAlg,
  START_FEN,
  // Chess960 helpers
  randomChess960FEN,
  backRankToFEN,
  generateRandomBackRank,
  // Lower-level move-generation primitives (useful for bots, search, analysis)
  genLegalMoves,
  applyMove,
  undoMove,
  isInCheck,
  isSquareAttacked,
  findKing,
  findLegalMove,
  pieceType,
  isWhite,
};
