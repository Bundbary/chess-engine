/**
 * Move generation, legality checking, and move application.
 *
 * Move object shape:
 *   {
 *     from: idx, to: idx,
 *     piece: 'P'|'N'|...|'K',          // uppercase regardless of color
 *     color: 'w'|'b',
 *     capture: bool,
 *     capturedPiece: piece char | null,
 *     capturedSquare: idx | null,       // differs from `to` for en passant
 *     promotion: 'Q'|'R'|'B'|'N' | null,
 *     castle: 'K'|'Q' | null,
 *     rookFrom: idx | null,             // castling only
 *     rookTo: idx | null,               // castling only
 *     enPassant: bool,
 *     doublePawnPush: bool,
 *   }
 */
'use strict';

const {
  sq, fileOf, rankOf, idxToAlg,
  isWhite, isBlack, colorOf, pieceType, asColor,
  cloneBoard,
} = require('./board.js');

// ============ Direction tables ============
const KNIGHT_OFFSETS = [
  [+1, +2], [+2, +1], [+2, -1], [+1, -2],
  [-1, -2], [-2, -1], [-2, +1], [-1, +2],
];
const KING_OFFSETS = [
  [+1, 0], [+1, +1], [0, +1], [-1, +1],
  [-1, 0], [-1, -1], [0, -1], [+1, -1],
];
const ROOK_DIRS = [[+1, 0], [-1, 0], [0, +1], [0, -1]];
const BISHOP_DIRS = [[+1, +1], [+1, -1], [-1, +1], [-1, -1]];
const QUEEN_DIRS = [...ROOK_DIRS, ...BISHOP_DIRS];

const PROMO_PIECES = ['Q', 'R', 'B', 'N'];

// ============ Square attack detection ============

/**
 * Is `target` (idx) attacked by any piece of color `byColor`?
 * Used both for check detection and castling-path checks.
 */
function isSquareAttacked(board, target, byColor) {
  const tf = fileOf(target);
  const tr = rankOf(target);

  // Pawn attacks: pawns of byColor attacking `target` would come from one rank back
  // (relative to byColor's forward direction).
  const pawnDir = byColor === 'w' ? +1 : -1;
  const enemyPawn = byColor === 'w' ? 'P' : 'p';
  // A pawn on (tf-1, tr-pawnDir) or (tf+1, tr-pawnDir) attacks target.
  for (const df of [-1, +1]) {
    const f = tf + df;
    const r = tr - pawnDir;
    if (f >= 0 && f < 8 && r >= 0 && r < 8) {
      if (board[sq(f, r)] === enemyPawn) return true;
    }
  }

  // Knight attacks
  const enemyKnight = byColor === 'w' ? 'N' : 'n';
  for (const [df, dr] of KNIGHT_OFFSETS) {
    const f = tf + df;
    const r = tr + dr;
    if (f >= 0 && f < 8 && r >= 0 && r < 8) {
      if (board[sq(f, r)] === enemyKnight) return true;
    }
  }

  // King attacks (adjacent)
  const enemyKing = byColor === 'w' ? 'K' : 'k';
  for (const [df, dr] of KING_OFFSETS) {
    const f = tf + df;
    const r = tr + dr;
    if (f >= 0 && f < 8 && r >= 0 && r < 8) {
      if (board[sq(f, r)] === enemyKing) return true;
    }
  }

  // Sliding pieces: rook+queen on rook directions, bishop+queen on bishop directions
  const enemyRook = byColor === 'w' ? 'R' : 'r';
  const enemyBishop = byColor === 'w' ? 'B' : 'b';
  const enemyQueen = byColor === 'w' ? 'Q' : 'q';

  for (const [df, dr] of ROOK_DIRS) {
    let f = tf + df;
    let r = tr + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const p = board[sq(f, r)];
      if (p !== '.') {
        if (p === enemyRook || p === enemyQueen) return true;
        break;
      }
      f += df;
      r += dr;
    }
  }
  for (const [df, dr] of BISHOP_DIRS) {
    let f = tf + df;
    let r = tr + dr;
    while (f >= 0 && f < 8 && r >= 0 && r < 8) {
      const p = board[sq(f, r)];
      if (p !== '.') {
        if (p === enemyBishop || p === enemyQueen) return true;
        break;
      }
      f += df;
      r += dr;
    }
  }
  return false;
}

function findKing(board, color) {
  const target = color === 'w' ? 'K' : 'k';
  for (let i = 0; i < 64; i++) {
    if (board[i] === target) return i;
  }
  return -1;
}

function isInCheck(pos, color = pos.turn) {
  const k = findKing(pos.board, color);
  if (k < 0) return false; // no king on board (used in some test setups)
  return isSquareAttacked(pos.board, k, color === 'w' ? 'b' : 'w');
}

// ============ Pseudo-legal move generation ============

function genPseudoMoves(pos) {
  const { board, turn } = pos;
  const moves = [];
  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (piece === '.' || piece === '') continue;
    const color = isWhite(piece) ? 'w' : 'b';
    if (color !== turn) continue;
    const t = pieceType(piece);
    switch (t) {
      case 'P': genPawnMoves(pos, i, color, moves); break;
      case 'N': genKnightMoves(board, i, color, moves); break;
      case 'B': genSlidingMoves(board, i, color, BISHOP_DIRS, moves); break;
      case 'R': genSlidingMoves(board, i, color, ROOK_DIRS, moves); break;
      case 'Q': genSlidingMoves(board, i, color, QUEEN_DIRS, moves); break;
      case 'K': genKingMoves(pos, i, color, moves); break;
    }
  }
  return moves;
}

function genPawnMoves(pos, from, color, moves) {
  const { board, ep } = pos;
  const f = fileOf(from);
  const r = rankOf(from);
  const dir = color === 'w' ? +1 : -1;
  const startRank = color === 'w' ? 1 : 6;
  const promoRank = color === 'w' ? 7 : 0;
  const piece = color === 'w' ? 'P' : 'p';

  // Single push
  const r1 = r + dir;
  if (r1 >= 0 && r1 < 8 && board[sq(f, r1)] === '.') {
    if (r1 === promoRank) {
      for (const promo of PROMO_PIECES) {
        moves.push(makeMove({ from, to: sq(f, r1), piece: 'P', color, promotion: promo }));
      }
    } else {
      moves.push(makeMove({ from, to: sq(f, r1), piece: 'P', color }));
      // Double push
      if (r === startRank) {
        const r2 = r + 2 * dir;
        if (board[sq(f, r2)] === '.') {
          moves.push(makeMove({ from, to: sq(f, r2), piece: 'P', color, doublePawnPush: true }));
        }
      }
    }
  }

  // Captures (incl. en passant)
  for (const df of [-1, +1]) {
    const cf = f + df;
    if (cf < 0 || cf > 7) continue;
    const cr = r + dir;
    if (cr < 0 || cr > 7) continue;
    const target = sq(cf, cr);
    const targetPiece = board[target];
    if (targetPiece !== '.' && colorOf(targetPiece) !== color) {
      if (cr === promoRank) {
        for (const promo of PROMO_PIECES) {
          moves.push(makeMove({
            from, to: target, piece: 'P', color, promotion: promo,
            capture: true, capturedPiece: targetPiece, capturedSquare: target,
          }));
        }
      } else {
        moves.push(makeMove({
          from, to: target, piece: 'P', color,
          capture: true, capturedPiece: targetPiece, capturedSquare: target,
        }));
      }
    } else if (target === ep && ep >= 0) {
      // En passant: captured pawn sits one rank behind the ep target
      const capturedSquare = sq(cf, r);
      moves.push(makeMove({
        from, to: target, piece: 'P', color,
        capture: true, capturedPiece: color === 'w' ? 'p' : 'P', capturedSquare,
        enPassant: true,
      }));
    }
  }
}

function genKnightMoves(board, from, color, moves) {
  const f = fileOf(from);
  const r = rankOf(from);
  for (const [df, dr] of KNIGHT_OFFSETS) {
    const nf = f + df;
    const nr = r + dr;
    if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
    const target = sq(nf, nr);
    const tp = board[target];
    if (tp === '.') {
      moves.push(makeMove({ from, to: target, piece: 'N', color }));
    } else if (colorOf(tp) !== color) {
      moves.push(makeMove({
        from, to: target, piece: 'N', color,
        capture: true, capturedPiece: tp, capturedSquare: target,
      }));
    }
  }
}

function genSlidingMoves(board, from, color, dirs, moves) {
  const f = fileOf(from);
  const r = rankOf(from);
  const piece = pieceType(board[from]);
  for (const [df, dr] of dirs) {
    let nf = f + df;
    let nr = r + dr;
    while (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) {
      const target = sq(nf, nr);
      const tp = board[target];
      if (tp === '.') {
        moves.push(makeMove({ from, to: target, piece, color }));
      } else {
        if (colorOf(tp) !== color) {
          moves.push(makeMove({
            from, to: target, piece, color,
            capture: true, capturedPiece: tp, capturedSquare: target,
          }));
        }
        break;
      }
      nf += df;
      nr += dr;
    }
  }
}

function genKingMoves(pos, from, color, moves) {
  const { board, castling } = pos;
  const f = fileOf(from);
  const r = rankOf(from);
  for (const [df, dr] of KING_OFFSETS) {
    const nf = f + df;
    const nr = r + dr;
    if (nf < 0 || nf > 7 || nr < 0 || nr > 7) continue;
    const target = sq(nf, nr);
    const tp = board[target];
    if (tp === '.') {
      moves.push(makeMove({ from, to: target, piece: 'K', color }));
    } else if (colorOf(tp) !== color) {
      moves.push(makeMove({
        from, to: target, piece: 'K', color,
        capture: true, capturedPiece: tp, capturedSquare: target,
      }));
    }
  }
  // Castling — Chess960 aware
  genCastling(pos, from, color, moves);
}

function genCastling(pos, kingFrom, color, moves) {
  const { board, castling } = pos;
  const rank = color === 'w' ? 0 : 7;
  const sides = [
    { side: 'K', rookFile: castling[color + 'K'], kingDestFile: 6, rookDestFile: 5 },
    { side: 'Q', rookFile: castling[color + 'Q'], kingDestFile: 2, rookDestFile: 3 },
  ];
  const enemy = color === 'w' ? 'b' : 'w';
  for (const { side, rookFile, kingDestFile, rookDestFile } of sides) {
    if (rookFile == null) continue;
    const rookFrom = sq(rookFile, rank);
    const rookExpected = color === 'w' ? 'R' : 'r';
    if (board[rookFrom] !== rookExpected) continue;
    const kingTo = sq(kingDestFile, rank);
    const rookTo = sq(rookDestFile, rank);

    // Squares the king will traverse (inclusive of source and destination)
    const kingPath = inclusiveFileRange(fileOf(kingFrom), kingDestFile, rank);
    // Squares the rook will traverse (inclusive of source and destination)
    const rookPath = inclusiveFileRange(rookFile, rookDestFile, rank);

    // Path emptiness: every square in king and rook paths must be empty,
    // except that the king's source square holds the king and the rook's
    // source square holds the rook.
    let blocked = false;
    for (const s of kingPath) {
      if (s === kingFrom || s === rookFrom) continue;
      if (board[s] !== '.') { blocked = true; break; }
    }
    if (blocked) continue;
    for (const s of rookPath) {
      if (s === kingFrom || s === rookFrom) continue;
      if (board[s] !== '.') { blocked = true; break; }
    }
    if (blocked) continue;

    // Check rules: king cannot start in check, pass through check, or end in check.
    let throughCheck = false;
    for (const s of kingPath) {
      // Temporarily remove king so it doesn't shield itself when checking attacks
      const saved = board[kingFrom];
      board[kingFrom] = '.';
      const attacked = isSquareAttacked(board, s, enemy);
      board[kingFrom] = saved;
      if (attacked) { throughCheck = true; break; }
    }
    if (throughCheck) continue;

    moves.push(makeMove({
      from: kingFrom, to: kingTo, piece: 'K', color,
      castle: side, rookFrom, rookTo,
    }));
  }
}

function inclusiveFileRange(fromFile, toFile, rank) {
  const result = [];
  const lo = Math.min(fromFile, toFile);
  const hi = Math.max(fromFile, toFile);
  for (let f = lo; f <= hi; f++) result.push(sq(f, rank));
  return result;
}

function makeMove(props) {
  return {
    from: -1, to: -1,
    piece: '?', color: '?',
    capture: false, capturedPiece: null, capturedSquare: null,
    promotion: null,
    castle: null, rookFrom: null, rookTo: null,
    enPassant: false, doublePawnPush: false,
    ...props,
  };
}

// ============ Legal move filter ============

function genLegalMoves(pos) {
  const pseudo = genPseudoMoves(pos);
  const legal = [];
  for (const move of pseudo) {
    const undo = applyMove(pos, move);
    // After applying, position.turn has flipped to the opponent.
    // We need to verify the side that just moved is not in check.
    const moverColor = move.color;
    if (!isInCheck(pos, moverColor)) {
      legal.push(move);
    }
    undoMove(pos, move, undo);
  }
  return legal;
}

// ============ Make / Unmake ============

/**
 * Apply `move` to `pos` IN PLACE. Returns an `undo` token to be passed to undoMove.
 */
function applyMove(pos, move) {
  const { board } = pos;
  const undo = {
    castling: { ...pos.castling },
    ep: pos.ep,
    halfmove: pos.halfmove,
    fullmove: pos.fullmove,
    turn: pos.turn,
  };

  const piece = board[move.from];
  const movingType = pieceType(piece);
  const movingColor = move.color;

  // Halfmove clock: reset on pawn move or capture
  if (movingType === 'P' || move.capture) {
    pos.halfmove = 0;
  } else {
    pos.halfmove++;
  }

  // Fullmove: increment after black's move
  if (movingColor === 'b') pos.fullmove++;

  // Move the piece
  board[move.from] = '.';
  if (move.capture && move.capturedSquare !== move.to) {
    // En passant: captured pawn is on a different square than the destination
    board[move.capturedSquare] = '.';
  }
  // Place piece on destination (handles promotion)
  if (move.promotion) {
    board[move.to] = asColor(move.promotion, movingColor);
  } else {
    board[move.to] = piece;
  }
  // Capture replacement on `to` square is implicit (overwrite). If the capture
  // was on `to`, no further work. If it was en passant, we handled `capturedSquare` above.

  // Castling: also move the rook.
  if (move.castle) {
    const rookPiece = board[move.rookFrom];
    // It's possible rookFrom === move.to in tightly packed Chess960 positions —
    // in that case the king already overwrote the rook. We need to re-place
    // the rook at rookTo regardless.
    if (move.rookFrom !== move.to) {
      board[move.rookFrom] = '.';
    }
    // Likewise, if rookTo === move.from (unusual but possible), we want to
    // place the rook there. This is fine.
    board[move.rookTo] = movingColor === 'w' ? 'R' : 'r';
  }

  // Update castling rights:
  // - If a king moved, lose both rights for that color.
  // - If a rook moved from a square that was a castling rook, lose that right.
  // - If a rook was captured on a castling-rook square, lose that right.
  pos.castling = { ...pos.castling };
  if (movingType === 'K') {
    pos.castling[movingColor + 'K'] = null;
    pos.castling[movingColor + 'Q'] = null;
  }
  if (movingType === 'R') {
    const rank = movingColor === 'w' ? 0 : 7;
    if (rankOf(move.from) === rank) {
      const f = fileOf(move.from);
      if (pos.castling[movingColor + 'K'] === f) pos.castling[movingColor + 'K'] = null;
      if (pos.castling[movingColor + 'Q'] === f) pos.castling[movingColor + 'Q'] = null;
    }
  }
  if (move.capture) {
    const capturedColor = colorOf(move.capturedPiece);
    if (move.capturedPiece && pieceType(move.capturedPiece) === 'R') {
      const rank = capturedColor === 'w' ? 0 : 7;
      if (rankOf(move.capturedSquare) === rank) {
        const f = fileOf(move.capturedSquare);
        if (pos.castling[capturedColor + 'K'] === f) pos.castling[capturedColor + 'K'] = null;
        if (pos.castling[capturedColor + 'Q'] === f) pos.castling[capturedColor + 'Q'] = null;
      }
    }
  }

  // En passant target update
  if (move.doublePawnPush) {
    const dir = movingColor === 'w' ? +1 : -1;
    pos.ep = sq(fileOf(move.from), rankOf(move.from) + dir);
  } else {
    pos.ep = -1;
  }

  // Flip turn
  pos.turn = movingColor === 'w' ? 'b' : 'w';
  return undo;
}

function undoMove(pos, move, undo) {
  const { board } = pos;
  const movingColor = move.color;

  // Restore meta
  pos.castling = undo.castling;
  pos.ep = undo.ep;
  pos.halfmove = undo.halfmove;
  pos.fullmove = undo.fullmove;
  pos.turn = undo.turn;

  // Reverse the rook move if castling.
  if (move.castle) {
    // Clear rookTo (unless it's the king's source, handled below)
    if (move.rookTo !== move.from) {
      board[move.rookTo] = '.';
    }
    board[move.rookFrom] = movingColor === 'w' ? 'R' : 'r';
  }

  // Put the moving piece back on `from`
  const movingPiece = move.promotion
    ? (movingColor === 'w' ? 'P' : 'p')
    : asColor(move.piece, movingColor);
  board[move.from] = movingPiece;

  // Restore captured piece (if any) at its original square; clear `to` if no capture there.
  if (move.capture) {
    if (move.capturedSquare === move.to) {
      board[move.to] = move.capturedPiece;
    } else {
      // En passant: `to` was empty (the ep target square), `capturedSquare` had the pawn
      board[move.to] = '.';
      board[move.capturedSquare] = move.capturedPiece;
    }
  } else if (!move.castle) {
    board[move.to] = '.';
  } else if (move.castle) {
    // Castling without capture: clear the king's destination only if no piece
    // belongs there post-undo. Two ways a piece does belong on `move.to`:
    //  1. The rook landed on `move.to` post-castle (rookTo === to). Standard.
    //  2. The rook ORIGINATED on `move.to` (rookFrom === to). Chess960 tight-pack
    //     case where king d1 castles to c1 onto its own rook (king d1↔c1,
    //     rook c1↔d1). After undo, the rook should be back on its source
    //     square, which equals `move.to`. The earlier rook-restore step
    //     (`board[move.rookFrom] = R/r`) already put it there, and we must
    //     not clobber it.
    if (move.rookTo !== move.to && move.rookFrom !== move.to) {
      board[move.to] = '.';
    }
  }
}

// ============ Move parsing helpers ============

/**
 * Find a legal move in `pos` from `fromAlg` to `toAlg`. If `promotion` is given,
 * matches the promotion piece. Returns the matching move object or null.
 */
function findLegalMove(pos, fromIdx, toIdx, promotion = null) {
  const legal = genLegalMoves(pos);
  for (const m of legal) {
    if (m.from === fromIdx && m.to === toIdx) {
      if (promotion) {
        if (m.promotion === promotion.toUpperCase()) return m;
      } else {
        if (!m.promotion) return m;
      }
    }
  }
  // For Chess960 castling, the king's `to` is g/c file, but UIs sometimes
  // report castling as king-onto-rook. Handle that.
  for (const m of legal) {
    if (m.castle && m.from === fromIdx && m.rookFrom === toIdx) return m;
  }
  return null;
}

module.exports = {
  isSquareAttacked,
  findKing,
  isInCheck,
  genPseudoMoves,
  genLegalMoves,
  applyMove,
  undoMove,
  findLegalMove,
};
