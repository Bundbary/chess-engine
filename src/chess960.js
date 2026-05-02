/**
 * Generate Fischer Random / Chess960 starting positions.
 *
 * Constraints (Fischer 1996):
 *   - King between two rooks (anywhere, but rooks on either side of king)
 *   - Bishops on opposite-colored squares
 *   - Black mirror of white
 *
 * Each of the 960 valid arrangements has a unique ID 0..959 (Reinhard
 * Scharnagl numbering). We do NOT require this exact numbering — we just
 * generate a valid arrangement.
 */
'use strict';

const { sq } = require('./board.js');

/** Random integer in [0, n). */
function rand(n) { return Math.floor(Math.random() * n); }

/**
 * Generate a random Chess960 back-rank arrangement.
 * Returns an array of 8 piece chars (uppercase, white pieces).
 *
 * Algorithm (sample-and-validate; very fast since ~14% of permutations are valid
 * but we use a constructive approach):
 *   1. Place bishops on opposite-colored squares.
 *   2. Place queen and knights on remaining empty squares.
 *   3. Place king and rooks on the 3 remaining squares such that king is between rooks.
 */
function generateRandomBackRank() {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const back = new Array(8).fill('.');

    // 1) Bishops on opposite-colored squares.
    // Light squares on rank 1: files 1, 3, 5, 7 (b1, d1, f1, h1)
    // Dark squares on rank 1: files 0, 2, 4, 6 (a1, c1, e1, g1)
    const lightFiles = [1, 3, 5, 7];
    const darkFiles = [0, 2, 4, 6];
    back[lightFiles[rand(4)]] = 'B';
    back[darkFiles[rand(4)]] = 'B';

    // 2) Queen on a random empty square
    let empties = back.map((p, i) => p === '.' ? i : -1).filter(i => i >= 0);
    back[empties[rand(empties.length)]] = 'Q';

    // 3) Two knights on random empty squares
    empties = back.map((p, i) => p === '.' ? i : -1).filter(i => i >= 0);
    const n1 = empties.splice(rand(empties.length), 1)[0];
    const n2 = empties.splice(rand(empties.length), 1)[0];
    back[n1] = 'N';
    back[n2] = 'N';

    // 4) Remaining 3 squares get R K R (in file order, automatically satisfies "king between rooks")
    empties = back.map((p, i) => p === '.' ? i : -1).filter(i => i >= 0);
    if (empties.length !== 3) continue;
    empties.sort((a, b) => a - b);
    back[empties[0]] = 'R';
    back[empties[1]] = 'K';
    back[empties[2]] = 'R';

    return back;
  }
  // Should never happen
  throw new Error('Failed to generate valid Chess960 back rank');
}

/**
 * Build a FEN starting position from a back-rank arrangement.
 * @param {string[]} back  array of 8 white piece chars
 * @returns {string} X-FEN
 */
function backRankToFEN(back) {
  if (!back || back.length !== 8) throw new Error('back rank must be 8 squares');
  const whiteRank = back.join('');
  const blackRank = back.join('').toLowerCase();
  // Find rook files for X-FEN castling field
  const whiteKingFile = back.indexOf('K');
  const rookFiles = [];
  for (let i = 0; i < 8; i++) if (back[i] === 'R') rookFiles.push(i);
  if (rookFiles.length !== 2) throw new Error('back rank must have exactly 2 rooks');
  const [qsRook, ksRook] = rookFiles[0] < whiteKingFile
    ? [rookFiles[0], rookFiles[1]]
    : [rookFiles[1], rookFiles[0]];
  const wKs = 'ABCDEFGH'[ksRook];
  const wQs = 'ABCDEFGH'[qsRook];
  const bKs = 'abcdefgh'[ksRook];
  const bQs = 'abcdefgh'[qsRook];
  const castling = `${wKs}${wQs}${bKs}${bQs}`;
  return `${blackRank}/pppppppp/8/8/8/8/PPPPPPPP/${whiteRank} w ${castling} - 0 1`;
}

/** Convenience: random Chess960 starting FEN. */
function randomChess960FEN() {
  return backRankToFEN(generateRandomBackRank());
}

const STANDARD_BACK_RANK = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];

module.exports = {
  generateRandomBackRank,
  backRankToFEN,
  randomChess960FEN,
  STANDARD_BACK_RANK,
};
