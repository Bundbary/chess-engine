/**
 * Board representation and coordinate utilities.
 *
 * Squares are addressed two ways:
 *   - As a 0..63 index where 0 = a1, 7 = h1, 56 = a8, 63 = h8 (rank-major, white at bottom).
 *   - As algebraic notation strings like 'e4'.
 *
 * Pieces are FEN-style single characters:
 *   White: P N B R Q K
 *   Black: p n b r q k
 *   Empty: '.'
 */
'use strict';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const FILE_OF = { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6, h: 7 };

/** Convert (file, rank) where both are 0..7 to a 0..63 index. */
function sq(file, rank) {
  return rank * 8 + file;
}

/** Convert an index 0..63 to (file, rank). */
function fileOf(idx) { return idx & 7; }
function rankOf(idx) { return idx >> 3; }

/** Convert an index to algebraic notation, e.g. 28 -> 'e4'. */
function idxToAlg(idx) {
  return FILES[fileOf(idx)] + (rankOf(idx) + 1);
}

/** Convert algebraic notation to index, e.g. 'e4' -> 28. Returns -1 if invalid. */
function algToIdx(alg) {
  if (typeof alg !== 'string' || alg.length !== 2) return -1;
  const f = FILE_OF[alg[0]];
  const r = parseInt(alg[1], 10) - 1;
  if (f === undefined || isNaN(r) || r < 0 || r > 7) return -1;
  return r * 8 + f;
}

/** True if a piece char is white (uppercase letter). */
function isWhite(piece) {
  return piece >= 'A' && piece <= 'Z';
}
function isBlack(piece) {
  return piece >= 'a' && piece <= 'z';
}
function colorOf(piece) {
  if (piece === '.' || piece === '' || piece == null) return null;
  return isWhite(piece) ? 'w' : 'b';
}
function pieceType(piece) {
  // Returns 'P' 'N' 'B' 'R' 'Q' 'K' regardless of color, or '.' for empty.
  if (piece === '.' || piece === '' || piece == null) return '.';
  return piece.toUpperCase();
}
function asColor(piece, color) {
  // Force a piece type to a given color.
  return color === 'w' ? piece.toUpperCase() : piece.toLowerCase();
}

/** Create a fresh empty 64-cell board (array of '.'). */
function emptyBoard() {
  return new Array(64).fill('.');
}

/** Deep-copy a board array. */
function cloneBoard(board) {
  return board.slice();
}

/**
 * Parse a FEN string (or X-FEN for Chess960) to a position object.
 * Returns: { board, turn, castling, ep, halfmove, fullmove }
 *   - board: 64-array of FEN piece chars
 *   - turn: 'w' | 'b'
 *   - castling: { wK: fileIdx|null, wQ: fileIdx|null, bK, bQ }   (file index 0..7 of the rook on that side; null if no right)
 *   - ep: idx of en-passant square, or -1
 *   - halfmove: int (50-move-rule counter)
 *   - fullmove: int
 *
 * Castling field accepts standard FEN ('KQkq') and X-FEN with file letters
 * (e.g. 'HAha' for Chess960). Either is interpreted as the file of the
 * rook involved on that side.
 */
function parseFEN(fen) {
  if (typeof fen !== 'string') throw new Error('FEN must be a string');
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) throw new Error('FEN must have at least 4 fields');
  const [boardField, turnField, castleField, epField, halfmoveField, fullmoveField] = parts;

  // 1) board
  const board = emptyBoard();
  const ranks = boardField.split('/');
  if (ranks.length !== 8) throw new Error('FEN board must have 8 ranks');
  // FEN ranks come top-down (8 first, 1 last)
  for (let i = 0; i < 8; i++) {
    const rank = 7 - i; // 8-i but 0-indexed
    const row = ranks[i];
    let file = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') {
        file += parseInt(ch, 10);
      } else {
        if (file > 7) throw new Error(`FEN rank ${rank + 1} has too many squares`);
        board[sq(file, rank)] = ch;
        file++;
      }
    }
    if (file !== 8) throw new Error(`FEN rank ${rank + 1} does not have 8 squares`);
  }

  // 2) turn
  if (turnField !== 'w' && turnField !== 'b') {
    throw new Error(`FEN turn must be 'w' or 'b', got: ${turnField}`);
  }

  // 3) castling — interpret each char.
  // Standard: K Q k q.
  // X-FEN: file letters (A-H or a-h) indicating the rook file involved.
  // We always store the rook's *file* (0..7) in castling.{wK,wQ,bK,bQ}.
  // For standard 'K' we look up the white rook on the kingside (rightmost rook on rank 0)
  // and similarly for the others.
  const castling = { wK: null, wQ: null, bK: null, bQ: null };
  if (castleField !== '-') {
    for (const ch of castleField) {
      if (ch === 'K' || ch === 'Q' || ch === 'k' || ch === 'q') {
        const color = (ch === 'K' || ch === 'Q') ? 'w' : 'b';
        const side = (ch === 'K' || ch === 'k') ? 'K' : 'Q';
        const rank = color === 'w' ? 0 : 7;
        const kingPiece = color === 'w' ? 'K' : 'k';
        const rookPiece = color === 'w' ? 'R' : 'r';
        // Find king
        let kingFile = -1;
        for (let f = 0; f < 8; f++) {
          if (board[sq(f, rank)] === kingPiece) { kingFile = f; break; }
        }
        if (kingFile < 0) continue; // tolerate; it'll just be unusable
        // Find appropriate rook: kingside = first rook *right* of king; queenside = first rook left of king
        let rookFile = -1;
        if (side === 'K') {
          for (let f = kingFile + 1; f < 8; f++) {
            if (board[sq(f, rank)] === rookPiece) { rookFile = f; break; }
          }
        } else {
          for (let f = kingFile - 1; f >= 0; f--) {
            if (board[sq(f, rank)] === rookPiece) { rookFile = f; break; }
          }
        }
        if (rookFile < 0) continue;
        castling[color + side] = rookFile;
      } else if (ch >= 'A' && ch <= 'H') {
        // X-FEN white rook file
        const file = ch.charCodeAt(0) - 'A'.charCodeAt(0);
        const kingFile = findKingFile(board, 0);
        if (kingFile < 0) continue;
        if (file > kingFile) castling.wK = file;
        else if (file < kingFile) castling.wQ = file;
      } else if (ch >= 'a' && ch <= 'h') {
        const file = ch.charCodeAt(0) - 'a'.charCodeAt(0);
        const kingFile = findKingFile(board, 7);
        if (kingFile < 0) continue;
        if (file > kingFile) castling.bK = file;
        else if (file < kingFile) castling.bQ = file;
      }
    }
  }

  // 4) en passant
  const ep = (epField === '-') ? -1 : algToIdx(epField);

  // 5/6) move counters (optional in some test FENs)
  const halfmove = halfmoveField !== undefined ? parseInt(halfmoveField, 10) : 0;
  const fullmove = fullmoveField !== undefined ? parseInt(fullmoveField, 10) : 1;

  return { board, turn: turnField, castling, ep, halfmove, fullmove };
}

function findKingFile(board, rank) {
  const target = rank === 0 ? 'K' : 'k';
  for (let f = 0; f < 8; f++) {
    if (board[sq(f, rank)] === target) return f;
  }
  return -1;
}

/**
 * Serialize a position object to a FEN string.
 * If position._chess960 is truthy, emit X-FEN with file letters.
 */
function toFEN(pos) {
  const { board, turn, castling, ep, halfmove, fullmove } = pos;
  // 1) board
  const ranks = [];
  for (let r = 7; r >= 0; r--) {
    let row = '';
    let empties = 0;
    for (let f = 0; f < 8; f++) {
      const piece = board[sq(f, r)];
      if (piece === '.' || piece === '' || piece == null) {
        empties++;
      } else {
        if (empties > 0) { row += empties; empties = 0; }
        row += piece;
      }
    }
    if (empties > 0) row += empties;
    ranks.push(row);
  }
  const boardField = ranks.join('/');

  // 2) castling
  let castleField = '';
  const xfen = !!pos._chess960;
  // White
  if (castling.wK != null) castleField += xfen ? 'ABCDEFGH'[castling.wK] : 'K';
  if (castling.wQ != null) castleField += xfen ? 'ABCDEFGH'[castling.wQ] : 'Q';
  if (castling.bK != null) castleField += xfen ? 'abcdefgh'[castling.bK] : 'k';
  if (castling.bQ != null) castleField += xfen ? 'abcdefgh'[castling.bQ] : 'q';
  if (castleField === '') castleField = '-';

  // 3) ep
  const epField = ep < 0 ? '-' : idxToAlg(ep);

  return `${boardField} ${turn} ${castleField} ${epField} ${halfmove} ${fullmove}`;
}

/** Standard chess starting position FEN. */
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * Convert an internal piece char to legacy 'wK' / 'bK' format used by the chess server.
 * Returns null for empty squares.
 */
function pieceToLegacy(piece) {
  if (piece === '.' || piece === '' || piece == null) return null;
  return (isWhite(piece) ? 'w' : 'b') + piece.toUpperCase();
}

/** Inverse of pieceToLegacy. Accepts 'wK', 'bK', null/undefined/empty. */
function pieceFromLegacy(legacy) {
  if (!legacy || legacy.length !== 2) return '.';
  const color = legacy[0]; // 'w' or 'b'
  const type = legacy[1];  // 'K' etc
  return color === 'w' ? type.toUpperCase() : type.toLowerCase();
}

/**
 * Convert an internal board (64-array of FEN chars) to a legacy { 'e4': 'wP', ... } map.
 * Empty squares are omitted from the map (matches existing server behavior).
 */
function boardToLegacyMap(board) {
  const out = {};
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (p && p !== '.') out[idxToAlg(i)] = pieceToLegacy(p);
  }
  return out;
}

/** Inverse of boardToLegacyMap. */
function legacyMapToBoard(map) {
  const b = emptyBoard();
  for (const [alg, legacyPiece] of Object.entries(map || {})) {
    const idx = algToIdx(alg);
    if (idx >= 0) b[idx] = pieceFromLegacy(legacyPiece);
  }
  return b;
}

module.exports = {
  FILES,
  sq,
  fileOf,
  rankOf,
  idxToAlg,
  algToIdx,
  isWhite,
  isBlack,
  colorOf,
  pieceType,
  asColor,
  emptyBoard,
  cloneBoard,
  parseFEN,
  toFEN,
  START_FEN,
  pieceToLegacy,
  pieceFromLegacy,
  boardToLegacyMap,
  legacyMapToBoard,
};
