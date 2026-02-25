const { Chess } = require('chess.js');
const { parse } = require('@mliebelt/pgn-parser');

const pgn = `
1. e4 e5 2. Nf3 Nc6 (2... Nf6 3. Nxe5 d5 4. exd5 (4. d4 dxe4 5. c4) (4. Nc3 d4) 4... Nxd5 ) 3. Bb5
`;

function buildPgnTree(pgnText) {
    const games = parse(pgnText);
    const tree = {};

    const norm = fen => fen.split(' ').slice(0, 4).join(' ');

    function proc(movesList, startFen) {
        if (!movesList) return;
        let c = new Chess(startFen);
        for (const m of movesList) {
            if (!m || !m.notation || !m.notation.notation) continue;
            const san = m.notation.notation;
            const key = norm(c.fen());

            if (!tree[key]) tree[key] = new Set();
            tree[key].add(san);

            // Store the FEN *before* the move, process variations from the *same* start
            if (m.variations && m.variations.length > 0) {
                for (const v of m.variations) {
                    proc(v, c.fen());
                }
            }

            // Advance main line
            try {
                c.move(san);
            } catch (e) {
                break;
            }
        }
    }

    for (const g of games) {
        proc(g.moves, new Chess().fen());
    }

    const r = {};
    for (let k in tree) r[k] = [...tree[k]];
    return r;
}

try {
    console.log(JSON.stringify(buildPgnTree(pgn), null, 2));
} catch (e) {
    console.error(e);
}
