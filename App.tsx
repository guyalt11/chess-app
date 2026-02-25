import React, { useRef, useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  StatusBar,
  SafeAreaView,
  TouchableOpacity,
  Text,
  Alert,
  TextInput,
  Platform,
  ScrollView,
} from 'react-native';

import ChessBoardWebView, { ChessBoardWebViewRef } from './ChessBoardWebView';
import SettingsModal from './SettingsModal';
import engine from './StockfishEngine';
import { parse } from '@mliebelt/pgn-parser';
import { Chess } from 'chess.js';

type PgnTree = Record<string, string[]>;

const buildPgnTree = (pgnText: string): PgnTree => {
  const gamesResult = parse(pgnText, { startRule: 'games' } as any);
  const games = Array.isArray(gamesResult) ? gamesResult : [gamesResult];

  const tree: Record<string, Set<string>> = {};
  // Normalize FEN by taking only first 3 parts (board, turn, castling) - ignore en passant
  const norm = (fen: string) => fen.split(' ').slice(0, 3).join(' ');

  const proc = (movesList: any[], startFen: string) => {
    if (!movesList) return;
    const c = new Chess(startFen);
    for (const m of movesList) {
      if (!m || !m.notation || !m.notation.notation) continue;
      const san = m.notation.notation;
      const key = norm(c.fen());

      if (!tree[key]) tree[key] = new Set();
      tree[key].add(san);

      if (m.variations && m.variations.length > 0) {
        for (const v of m.variations) {
          proc(v, c.fen());
        }
      }

      try {
        c.move(san);
      } catch {
        break;
      }
    }
  };

  for (const g of games as any[]) {
    proc(g.moves, new Chess().fen());
  }

  const result: PgnTree = {};
  for (const k in tree) {
    result[k] = Array.from(tree[k]);
  }
  return result;
};

function App(): React.JSX.Element {
  const boardRef = useRef<ChessBoardWebViewRef>(null);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [evaluation, setEvaluation] = useState<number>(0); // 0 is balanced
  const [turn, setTurn] = useState<'w' | 'b'>('w');
  const turnRef = useRef<'w' | 'b'>('w');
  const [computerColor, setComputerColor] = useState<'w' | 'b'>('b');
  const computerColorRef = useRef<'w' | 'b'>('b');
  const currentFenRef = useRef<string>('startpos');
  const startFenRef = useRef<string>('startpos'); // The position the current game started from
  const [promotionData, setPromotionData] = useState<{ from: string; to: string } | null>(null);
  const [isFenModalVisible, setIsFenModalVisible] = useState(false);
  const [fenInput, setFenInput] = useState('');
  const [isPgnModalVisible, setIsPgnModalVisible] = useState(false);
  const [pgnInput, setPgnInput] = useState('');
  const [pgnTree, setPgnTree] = useState<PgnTree | null>(null);
  const pgnTreeRef = useRef<PgnTree | null>(null);
  const [pgnMode, setPgnMode] = useState(false);
  const [moveHistory, setMoveHistory] = useState<{ san: string; fen: string }[]>([]);
  const historyIndexRef = useRef<number>(-1); // -1 means at latest position
  const isReviewingRef = useRef<boolean>(false);
  const historyScrollRef = useRef<ScrollView>(null);
  const [botElo, setBotElo] = useState<number>(1500);
  const botEloRef = useRef<number>(1500);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const isEvalOnlyRef = useRef<boolean>(false); // evaluate only, don't play bestmove
  const [isEngineMode, setIsEngineMode] = useState(false);
  const isEngineModeRef = useRef(false);
  const [computerMode, setComputerMode] = useState<'Database' | 'PGN' | 'Engine'>('Database');
  const [showPossibleMoves, setShowPossibleMoves] = useState(false);
  const [possibleMoves, setPossibleMoves] = useState<string[]>([]);
  const [loadedType, setLoadedType] = useState<'none' | 'pgn' | 'fen'>('none');
  const loadedTypeRef = useRef<'none' | 'pgn' | 'fen'>('none');
  const pgnExhaustionIndexRef = useRef<number | null>(null); // Track when PGN was exhausted
  const lichessExhaustionIndexRef = useRef<number | null>(null); // Track when Lichess was exhausted

  useEffect(() => {
    const setupEngine = async () => {
      try {
        console.log('Initializing Stockfish...');
        await engine.init();
        await engine.start();

        engine.onOutput((line) => {
          // Parse Evaluation Score
          if (line.includes('score cp') || line.includes('score mate')) {
            const parts = line.split(' ');
            const scoreIndex = parts.indexOf('cp');
            const mateIndex = parts.indexOf('mate');

            if (scoreIndex !== -1) {
              let score = parseInt(parts[scoreIndex + 1], 10) / 100;
              // Use turnRef for latest value
              setEvaluation(turnRef.current === 'w' ? score : -score);
            } else if (mateIndex !== -1) {
              const mateIn = parseInt(parts[mateIndex + 1], 10);
              const score = mateIn > 0 ? 10 : -10;
              setEvaluation(turnRef.current === 'w' ? score : -score);
            }
          }

          if (line.startsWith('bestmove')) {
            // Swallow bestmove if we're doing eval-only or in review mode
            if (isEvalOnlyRef.current) {
              isEvalOnlyRef.current = false;
              return;
            }
            if (isReviewingRef.current) {
              return; // Leftover engine search from before navigation started
            }
            const move = line.split(' ')[1];
            if (move) {
              const from = move.substring(0, 2);
              const to = move.substring(2, 4);
              const promotion = move.length === 5 ? move.substring(4, 5) : 'q';

              const script = `
                if (window.board && window.game) {
                  var move = window.game.move({
                    from: '${from}',
                    to: '${to}',
                    promotion: '${promotion}'
                  });
                  if (move) {
                    window.board.position(window.game.fen());
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                      type: 'MOVE',
                      move: { from: '${from}', to: '${to}', san: move.san, fen: window.game.fen() }
                    }));
                    checkStatus();
                  }
                }
              `;
              boardRef.current?.injectJavaScript?.(script);
            }
          }
        });

        engine.send('uci');
        // Apply ELO limit on startup
        engine.send('setoption name UCI_LimitStrength value true');
        engine.send(`setoption name UCI_Elo value ${botEloRef.current}`);
        engine.send('isready');
      } catch (error) {
        console.error('Engine Error:', error);
      }
    };

    setupEngine();
    return () => engine.stop();
  }, []); // Run once on mount

  // Consolidate computer move trigger into a helper
  const triggerComputerIfItsTurn = (currentTurn: 'w' | 'b', currentFen: string) => {
    if (isReviewingRef.current) return; // Don't play during history review
    if (currentTurn === computerColorRef.current) {
      setTimeout(() => {
        // 1) Try PGN-based move if PGN mode is on and we have a tree
        if (loadedTypeRef.current === 'pgn' && pgnTreeRef.current) {
          console.log('PGN mode active, checking for moves in tree...');
          console.log('Current FEN before normalization:', currentFen);
          const fenParts = currentFen.split(' ');
          console.log('FEN parts:', fenParts);
          const normFen =
            currentFen === 'startpos'
              ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq'
              : fenParts.slice(0, 3).join(' ');

          console.log(`Looking for moves at position: ${normFen}`);
          const movesFromPgn = pgnTreeRef.current[normFen];
          
          if (movesFromPgn && movesFromPgn.length > 0) {
            const san = movesFromPgn[Math.floor(Math.random() * movesFromPgn.length)];
            console.log(`Found ${movesFromPgn.length} PGN moves, selected: ${san}`);
            console.log('Available PGN moves:', movesFromPgn);

            const script = `
              if (window.board && window.game) {
                var move = window.game.move('${san}');
                if (move) {
                  window.board.position(window.game.fen());
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'MOVE',
                    move: { from: move.from, to: move.to, san: move.san, fen: window.game.fen() }
                  }));
                  checkStatus();
                }
              }
            `;
            boardRef.current?.injectJavaScript?.(script);
            return;
          } else {
            console.log('No PGN moves available for this position, switching to Stockfish.');
            console.log('Current position FEN:', normFen);
            // Track the position where PGN was exhausted
            pgnExhaustionIndexRef.current = historyIndexRef.current;
            console.log('PGN exhausted at history index:', pgnExhaustionIndexRef.current);
            setComputerMode('Engine');
            setPgnMode(false);
            setIsEngineMode(true);
            isEngineModeRef.current = true;
          }
        }

        // 2) Fallback: DB/engine logic as before
        if (isEngineModeRef.current) {
          // Engine mode: let Stockfish decide
          const pos = currentFen === 'startpos' ? 'startpos' : `fen ${currentFen}`;
          engine.send(`position ${pos}`);
          engine.send('go depth 15');
        } else {
          // DB mode: query Lichess opening explorer
          playLichessDbMove(currentFen);
        }
      }, 400);
    }
  };

  // Fetch a valid move from the Lichess opening explorer
  const playLichessDbMove = async (fen: string) => {
    try {
      const fenForApi =
        fen === 'startpos'
          ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
          : fen;
      const url = `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(fenForApi)}&moves=15&topGames=0&recentGames=0`;
      const response = await fetch(url);
      
      // Check for rate limiting
      if (response.status === 429) {
        console.log('Lichess API rate limit exceeded.');
        setComputerMode('Engine');
        setIsEngineMode(true);
        isEngineModeRef.current = true;
        const pos = fen === 'startpos' ? 'startpos' : `fen ${fen}`;
        engine.send(`position ${pos}`);
        engine.send('go depth 15');
        return;
      }
      
      const data = await response.json();

      const validMoves = (data.moves || []).filter((m: any) => (m.white + m.draws + m.black) > 50);

      if (validMoves.length === 0) {
        console.log('No DB moves with > 50 games found. Switching to Engine.');
        // Track the position where Lichess was exhausted
        lichessExhaustionIndexRef.current = historyIndexRef.current;
        console.log('Lichess exhausted at history index:', lichessExhaustionIndexRef.current);
        setComputerMode('Engine');
        setIsEngineMode(true);
        isEngineModeRef.current = true;
        // Fallback to engine
        const pos = fen === 'startpos' ? 'startpos' : `fen ${fen}`;
        engine.send(`position ${pos}`);
        engine.send('go depth 15');
        return;
      }

      console.log('Available DB Moves (> 50 games):', validMoves.map((m: any) => ({ uci: m.uci, games: m.white + m.draws + m.black })));

      // Pick a random valid move
      const randomIndex = Math.floor(Math.random() * validMoves.length);
      const bestMove: string = validMoves[randomIndex].uci; // e.g. "e2e4"
      const from = bestMove.substring(0, 2);
      const to = bestMove.substring(2, 4);
      const promotion = bestMove.length === 5 ? bestMove.substring(4, 5) : 'q';

      const script = `
        if (window.board && window.game) {
          var move = window.game.move({
            from: '${from}',
            to: '${to}',
            promotion: '${promotion}'
          });
          if (move) {
            window.board.position(window.game.fen());
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'MOVE',
              move: { from: '${from}', to: '${to}', san: move.san, fen: window.game.fen() }
            }));
            checkStatus();
          }
        }
      `;
      boardRef.current?.injectJavaScript?.(script);
    } catch (error) {
      console.log('DB Error:', error);
      // Check if it's a rate limit error
      if (error instanceof Error && error.message.includes('429')) {
        console.log('Rate limit error in catch block');
        setComputerMode('Engine');
      } else {
        console.log('Connection error in catch block');
        setComputerMode('Engine');
      }
      setIsEngineMode(true);
      isEngineModeRef.current = true;
      const pos = fen === 'startpos' ? 'startpos' : `fen ${fen}`;
      engine.send(`position ${pos}`);
      engine.send('go depth 15');
    }
  };

  // Evaluate a position without playing a move (used during history navigation)
  const evalPositionOnly = (fen: string, turn: 'w' | 'b') => {
    isEvalOnlyRef.current = true;
    turnRef.current = turn;
    const pos = fen === 'startpos' ? 'startpos' : `fen ${fen}`;
    engine.send(`position ${pos}`);
    engine.send('go depth 12');
  };

  const handleMove = (moveInfo: { from: string; to: string; fen: string; san?: string }) => {
    const nextTurn = moveInfo.fen.split(' ')[1] as 'w' | 'b';
    currentFenRef.current = moveInfo.fen;
    setTurn(nextTurn);
    turnRef.current = nextTurn;

    // Capture BEFORE resetting — the setState callback runs async so refs may have changed by then
    const wasReviewing = isReviewingRef.current;
    const reviewIdx = historyIndexRef.current;
    isReviewingRef.current = false;

    // Record move in history, truncating any future moves if we were in review mode
    setMoveHistory(prev => {
      const truncated = wasReviewing
        ? prev.slice(0, reviewIdx + 1)
        : prev;
      const updated = [...truncated, { san: moveInfo.san || `${moveInfo.from}-${moveInfo.to}`, fen: moveInfo.fen }];
      historyIndexRef.current = updated.length - 1;
      return updated;
    });

    // Scroll to end of history
    setTimeout(() => historyScrollRef.current?.scrollToEnd({ animated: true }), 100);

    // Trigger computer if it's its turn
    triggerComputerIfItsTurn(nextTurn, moveInfo.fen);
  };

  const handleGameOver = (result: string) => {
    Alert.alert('Game Over', result, [{ text: 'OK' }]);
  };

  const handleReset = () => {
    setEvaluation(0);
    setTurn('w');
    turnRef.current = 'w';
    setMoveHistory([]);
    historyIndexRef.current = -1;
    isReviewingRef.current = false;
    setIsEngineMode(false); // Reset to DB mode on new game
    isEngineModeRef.current = false;
    
    // Clear exhaustion tracking on reset
    pgnExhaustionIndexRef.current = null;
    lichessExhaustionIndexRef.current = null;
    
    // Reset to appropriate position based on what's loaded
    if (loadedType === 'pgn' && pgnTree) {
      // Reset to starting position with PGN
      currentFenRef.current = 'startpos';
      startFenRef.current = 'startpos';
      setComputerMode('PGN');
      setPgnMode(true);
      boardRef.current?.reset();
      engine.send('ucinewgame');
      engine.send('isready');
      engine.send('position startpos');
      triggerComputerIfItsTurn('w', 'startpos');
    } else if (loadedType === 'fen') {
      // Reset to loaded FEN position
      const fenPosition = startFenRef.current;
      currentFenRef.current = fenPosition;
      const turn = (fenPosition.split(' ')[1] || 'w') as 'w' | 'b';
      setTurn(turn);
      turnRef.current = turn;
      setComputerMode('Database');
      boardRef.current?.setFen(fenPosition);
      engine.send('ucinewgame');
      engine.send(`position fen ${fenPosition}`);
      triggerComputerIfItsTurn(turn, fenPosition);
    } else {
      // Normal reset to starting position
      currentFenRef.current = 'startpos';
      startFenRef.current = 'startpos';
      setComputerMode('Database');
      setPgnMode(false);
      boardRef.current?.reset();
      engine.send('ucinewgame');
      engine.send('isready');
      engine.send('position startpos');
      triggerComputerIfItsTurn('w', 'startpos');
    }
  };

  const handleFlip = () => {
    const newOrientation = orientation === 'white' ? 'black' : 'white';
    const newComputerColor = computerColor === 'w' ? 'b' : 'w';

    setOrientation(newOrientation);
    setComputerColor(newComputerColor);
    computerColorRef.current = newComputerColor;
    boardRef.current?.setOrientation(newOrientation);

    // Check if it became the computer's turn after flipping colors
    triggerComputerIfItsTurn(turnRef.current, currentFenRef.current);
  };

  // Calculate Eval Bar percentage (White relative: 100% is full white, 0% is full black)
  const getEvalPercentage = () => {
    const clamped = Math.max(-5, Math.min(5, evaluation));
    // -5 (black) -> 0%
    // 0 (draw) -> 50%
    // 5 (white) -> 100%
    return ((clamped + 5) / 10) * 100;
  };

  const handlePromotionNeeded = (from: string, to: string) => {
    setPromotionData({ from, to });
  };

  const handlePromotionSelect = (piece: string) => {
    if (promotionData) {
      boardRef.current?.confirmPromotion(promotionData.from, promotionData.to, piece);
      setPromotionData(null);
    }
  };

  const handleLoadPgnFromText = () => {
    const text = pgnInput.trim();
    if (!text) {
      Alert.alert('Error', 'Please paste a PGN first.');
      return;
    }

    try {
      const tree = buildPgnTree(text);
      if (Object.keys(tree).length === 0) {
        Alert.alert('Error', 'No moves found in this PGN.');
        return;
      }

      // Log the PGN tree structure
      console.log('PGN Tree loaded:', JSON.stringify(tree, null, 2));
      console.log('Total positions in PGN tree:', Object.keys(tree).length);
      
      // Log possible moves for each position
      Object.entries(tree).forEach(([fen, moves]) => {
        console.log(`Position ${fen}: ${moves.length} possible moves:`, moves);
      });

      setPgnTree(tree);
      pgnTreeRef.current = tree;
      setPgnMode(true);
      setComputerMode('PGN');
      setLoadedType('pgn');
      loadedTypeRef.current = 'pgn';
      setIsEngineMode(false); // Ensure we're not in engine mode when loading PGN
      isEngineModeRef.current = false;
      
      // Reset exhaustion tracking when loading new PGN
      pgnExhaustionIndexRef.current = null;
      lichessExhaustionIndexRef.current = null;
      
      // Reset the board to starting position manually (don't call handleReset to avoid mode conflicts)
      currentFenRef.current = 'startpos';
      startFenRef.current = 'startpos';
      setTurn('w');
      turnRef.current = 'w';
      setEvaluation(0);
      setMoveHistory([]);
      historyIndexRef.current = -1;
      isReviewingRef.current = false;
      
      boardRef.current?.reset();
      engine.send('ucinewgame');
      engine.send('isready');
      engine.send('position startpos');
      
      // Check if computer should move immediately (e.g., if computer is White)
      // Use refs directly to avoid state timing issues
      console.log('Checking if computer should move after PGN load...');
      console.log('Computer color:', computerColorRef.current);
      console.log('Current turn:', 'w');
      console.log('Loaded type state:', loadedType);
      console.log('Loaded type ref:', loadedTypeRef.current);
      console.log('PGN tree state:', !!pgnTree);
      console.log('PGN tree ref:', !!pgnTreeRef.current);
      
      // Debug: Check if starting position has moves in PGN tree
      const startFen = 'rnbqkbnr/pppppppp/8/8/8/PPPPPPPP/RNBQKBNR w KQkq';
      console.log('Starting position FEN:', startFen);
      console.log('Moves available for starting position:', pgnTreeRef.current?.[startFen]);
      
      // Call triggerComputerIfItsTurn immediately - refs should be available
      triggerComputerIfItsTurn('w', 'startpos');
      
      Alert.alert('Success', 'PGN loaded. Board reset. Computer will play from this PGN.');
      setIsPgnModalVisible(false);
      setPgnInput('');
    } catch (e) {
      console.error('PGN parse error', e);
      Alert.alert('Error', 'Failed to parse PGN text.');
    }
  };

  const handleLoadFen = () => {
    if (!fenInput.trim()) return;

    const cleanFen = fenInput.trim();
    const parts = cleanFen.split(' ');
    const newTurn = (parts[1] || 'w') as 'w' | 'b';

    currentFenRef.current = cleanFen;
    startFenRef.current = cleanFen; // Remember this as the game's starting point
    setTurn(newTurn);
    turnRef.current = newTurn;
    setEvaluation(0);
    setMoveHistory([]);
    historyIndexRef.current = -1;
    isReviewingRef.current = false;
    setIsEngineMode(false); // Reset mode on new position
    isEngineModeRef.current = false;
    setLoadedType('fen');
    setComputerMode('Database'); // FEN positions use Database mode by default

    boardRef.current?.setFen(cleanFen);
    engine.send('ucinewgame');
    engine.send(`position fen ${cleanFen}`);

    setIsFenModalVisible(false);
    setFenInput('');
    triggerComputerIfItsTurn(newTurn, cleanFen);
  };

  const handleStepBack = () => {
    // Already at the very start — nowhere to go further back
    if (historyIndexRef.current === -1) return;

    // Set review mode synchronously BEFORE anything async,
    // so any in-flight bestmove is caught by the guard above.
    isReviewingRef.current = true;
    engine.send('stop'); // cancel any ongoing engine search

    setMoveHistory(prev => {
      // Use the actual current index directly — never derive from -1 to prev.length-1 here
      const currentIdx = historyIndexRef.current;
      const newIdx = Math.max(-1, currentIdx - 2);
      historyIndexRef.current = newIdx;
      setShowPossibleMoves(false); // Hide moves modal when navigating back
      // isReviewingRef stays true (we always go back into history)

      if (newIdx >= 0) {
        const targetFen = prev[newIdx]?.fen;
        const t = (targetFen.split(' ')[1] || 'w') as 'w' | 'b';
        boardRef.current?.setFen(targetFen);
        setTurn(t);
        turnRef.current = t;
        
        // Check if we should restore PGN or Lichess mode
        if (loadedType === 'pgn' && pgnExhaustionIndexRef.current !== null && newIdx < pgnExhaustionIndexRef.current) {
          console.log('Restoring PGN mode - went back to index:', newIdx, 'PGN exhausted at:', pgnExhaustionIndexRef.current);
          setPgnMode(true);
          setComputerMode('PGN');
          setIsEngineMode(false);
          isEngineModeRef.current = false;
        } else if (loadedType === 'fen' && lichessExhaustionIndexRef.current !== null && newIdx < lichessExhaustionIndexRef.current) {
          console.log('Restoring Database mode for FEN - went back to index:', newIdx, 'Lichess exhausted at:', lichessExhaustionIndexRef.current);
          setComputerMode('Database');
          setIsEngineMode(false);
          isEngineModeRef.current = false;
        } else if (loadedType === 'none' && lichessExhaustionIndexRef.current !== null && newIdx < lichessExhaustionIndexRef.current) {
          console.log('Restoring Database mode - went back to index:', newIdx, 'Lichess exhausted at:', lichessExhaustionIndexRef.current);
          setComputerMode('Database');
          setIsEngineMode(false);
          isEngineModeRef.current = false;
        }
        
        evalPositionOnly(targetFen, t);
      } else {
        // Back to the game's starting position (could be a loaded FEN, not necessarily standard start)
        const startFen = startFenRef.current;
        if (startFen === 'startpos') {
          boardRef.current?.injectJavaScript?.(`
            if (window.board && window.game) {
              window.game.reset();
              window.board.start();
            }
          `);
        } else {
          boardRef.current?.setFen(startFen);
        }
        const startTurn = startFen === 'startpos' ? 'w' : (startFen.split(' ')[1] || 'w') as 'w' | 'b';
        setTurn(startTurn);
        turnRef.current = startTurn;
        
        // Always restore appropriate mode when going back to start
        if (loadedType === 'pgn' && pgnTree) {
          console.log('Restoring PGN mode - went back to starting position');
          setPgnMode(true);
          setComputerMode('PGN');
          setIsEngineMode(false);
          isEngineModeRef.current = false;
          pgnExhaustionIndexRef.current = null; // Reset exhaustion tracking
        } else if (loadedType === 'fen') {
          console.log('Restoring Database mode for FEN - went back to starting position');
          setComputerMode('Database');
          setIsEngineMode(false);
          isEngineModeRef.current = false;
          lichessExhaustionIndexRef.current = null; // Reset exhaustion tracking
        } else if (lichessExhaustionIndexRef.current !== null) {
          console.log('Restoring Database mode - went back to starting position');
          setComputerMode('Database');
          setIsEngineMode(false);
          isEngineModeRef.current = false;
          lichessExhaustionIndexRef.current = null; // Reset exhaustion tracking
        } else {
          // Default to Database mode when nothing is loaded
          setComputerMode('Database');
        }
        
        evalPositionOnly(startFen === 'startpos' ? 'startpos' : startFen, startTurn);
      }
      return prev;
    });
  };

  const handleStepForward = () => {
    // Set review mode synchronously BEFORE anything async
    isReviewingRef.current = true;
    setShowPossibleMoves(false); // Hide moves modal when navigating forward
    engine.send('stop'); // cancel any ongoing engine search

    setMoveHistory(prev => {
      const currentIdx = historyIndexRef.current;
      if (currentIdx >= prev.length - 1) {
        isReviewingRef.current = false;
        historyIndexRef.current = prev.length - 1;
        return prev;
      }
      // Move 2 half-moves forward, clamped to the last available move
      const newIdx = Math.min(prev.length - 1, currentIdx + 2);
      historyIndexRef.current = newIdx;
      isReviewingRef.current = newIdx < prev.length - 1;

      const targetFen = prev[newIdx]?.fen;
      if (targetFen) {
        boardRef.current?.setFen(targetFen);
        const t = (targetFen.split(' ')[1] || 'w') as 'w' | 'b';
        setTurn(t);
        turnRef.current = t;

        if (!isReviewingRef.current) {
          // Reached the latest position — re-enable engine if it's computer's turn
          currentFenRef.current = targetFen;
          triggerComputerIfItsTurn(t, targetFen);
        } else {
          evalPositionOnly(targetFen, t);
        }
      }
    setIsSettingsVisible(false);
    });
  };

  const handleEloChange = (elo: number) => {
    botEloRef.current = elo;
    // Apply new ELO to the engine immediately
    engine.send('setoption name UCI_LimitStrength value true');
    engine.send(`setoption name UCI_Elo value ${elo}`);
    engine.send('isready');
    // Reset game so new ELO takes effect cleanly, but preserve loaded content
    if (loadedType === 'pgn') {
      // For PGN, reset to starting position with PGN mode preserved
      currentFenRef.current = 'startpos';
      startFenRef.current = 'startpos';
      setTurn('w');
      turnRef.current = 'w';
      setEvaluation(0);
      setMoveHistory([]);
      historyIndexRef.current = -1;
      isReviewingRef.current = false;
      
      boardRef.current?.reset();
      engine.send('ucinewgame');
      engine.send('isready');
      engine.send('position startpos');
      
      setTimeout(() => {
        triggerComputerIfItsTurn('w', 'startpos');
      }, 500);
    } else {
      // For FEN or none, use normal reset
      handleReset();
    }
    setIsSettingsVisible(false);
  };

  const handleClearLoaded = () => {
    // Clear all loaded content
    setPgnTree(null);
    setPgnMode(false);
    setLoadedType('none');
    setComputerMode('Database');
    setIsEngineMode(false);
    isEngineModeRef.current = false;
    
    // Reset to normal starting position
    currentFenRef.current = 'startpos';
    startFenRef.current = 'startpos';
    setTurn('w');
    turnRef.current = 'w';
    setEvaluation(0);
    setMoveHistory([]);
    historyIndexRef.current = -1;
    isReviewingRef.current = false;
    
    // Clear exhaustion tracking
    pgnExhaustionIndexRef.current = null;
    lichessExhaustionIndexRef.current = null;
    
    // Reset board
    boardRef.current?.reset();
    engine.send('ucinewgame');
    engine.send('isready');
    engine.send('position startpos');
    
    // Check if computer should move
    triggerComputerIfItsTurn('w', 'startpos');
  };

  const handleShowPossibleMoves = async () => {
    const currentFen = currentFenRef.current;
    console.log('handleShowPossibleMoves called with FEN:', currentFen);
    console.log('loadedType:', loadedType);
    console.log('computerMode:', computerMode);
    console.log('pgnTree exists:', !!pgnTree);
    
    if (loadedType === 'pgn' && pgnTree) {
      // Get PGN moves for current position
      const normFen = currentFen === 'startpos'
        ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq'
        : currentFen.split(' ').slice(0, 3).join(' ');
      
      const moves = pgnTree[normFen] || [];
      setPossibleMoves(moves);
      setShowPossibleMoves(true);
      console.log('PGN moves available:', moves);
    } else if (loadedType === 'fen' || loadedType === 'none') {
      // Get Lichess moves for current position
      try {
        const fenForApi = currentFen === 'startpos'
          ? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
          : currentFen;
        const url = `https://explorer.lichess.ovh/masters?fen=${encodeURIComponent(fenForApi)}&moves=15&topGames=0&recentGames=0`;
        const response = await fetch(url);
        
        if (response.status === 429) {
          setPossibleMoves(['Rate limit exceeded']);
          setShowPossibleMoves(true);
          return;
        }
        
        const data = await response.json();
        const validMoves = (data.moves || []).filter((m: any) => (m.white + m.draws + m.black) > 50);
        const moveSanList = validMoves.map((m: any) => `${m.uci} (${m.white + m.draws + m.black} games)`);
        setPossibleMoves(moveSanList);
        setShowPossibleMoves(true);
        console.log('Lichess moves available:', moveSanList);
      } catch (error) {
        setPossibleMoves(['Error fetching moves']);
        setShowPossibleMoves(true);
        console.log('Error fetching Lichess moves:', error);
      }
    } else {
      // Engine mode - show message
      setPossibleMoves(['Engine mode - no opening book']);
      setShowPossibleMoves(true);
    }
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <View style={styles.header}>
          <Text style={styles.title}>BookWarm</Text>
          <TouchableOpacity
            style={styles.gearButton}
            onPress={() => setIsSettingsVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.gearButtonText}>⚙</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.contentContainer}>
          {/* Computer Mode Indicator */}
          <View style={styles.modeIndicatorContainer}>
            <Text style={styles.modeIndicatorText}>
              Computer: {computerMode}
            </Text>
          </View>
          
          <View style={styles.boardContainer}>
            <ChessBoardWebView
              ref={boardRef}
              onMove={handleMove}
              onGameOver={handleGameOver}
              onPromotionNeeded={handlePromotionNeeded}
            />
          </View>

          {/* Horizontal Evaluation Bar */}
          <View style={styles.evalBarContainer}>
            <View style={[styles.evalBarBackground, { width: '100%' }]}>
              <View style={[styles.evalBarFill, {
                width: `${getEvalPercentage()}%`,
                backgroundColor: '#FFFFFF'
              }]} />
              <View style={[styles.evalBarFill, {
                width: `${100 - getEvalPercentage()}%`,
                backgroundColor: '#404040'
              }]} />
            </View>
            <View style={styles.evalTextContainer}>
              <Text style={styles.evalText}>
                {evaluation > 0 ? `+${evaluation.toFixed(1)}` : evaluation.toFixed(1)}
              </Text>
            </View>
          </View>

          {/* Move History + Navigation */}
          <View style={styles.historyContainer}>
            <View style={styles.historyNavRow}>
              <TouchableOpacity style={styles.navButton} onPress={handleStepBack}>
                <Text style={styles.navButtonText}>◀</Text>
              </TouchableOpacity>
              <ScrollView
                ref={historyScrollRef}
                horizontal
                style={styles.historyScroll}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.historyScrollContent}
              >
                {moveHistory.length === 0 ? (
                  <Text style={styles.noMovesText}>No moves yet</Text>
                ) : (
                  Array.from({ length: Math.ceil(moveHistory.length / 2) }, (_, i) => (
                    <View key={i} style={styles.movePair}>
                      <Text style={styles.moveNumber}>{i + 1}.</Text>
                      {moveHistory[i * 2] && (
                        <TouchableOpacity
                          onPress={() => {
                            historyIndexRef.current = i * 2;
                            isReviewingRef.current = i * 2 < moveHistory.length - 1;
                            boardRef.current?.setFen(moveHistory[i * 2].fen);
                            const t = (moveHistory[i * 2].fen.split(' ')[1] || 'w') as 'w' | 'b';
                            setTurn(t);
                            turnRef.current = t;
                            setShowPossibleMoves(false); // Hide moves modal when navigating
                            
                            // Restore appropriate mode based on loaded type and exhaustion
                            if (loadedType === 'pgn' && pgnExhaustionIndexRef.current !== null && i * 2 < pgnExhaustionIndexRef.current) {
                              console.log('Restoring PGN mode from move click');
                              setPgnMode(true);
                              setComputerMode('PGN');
                              setIsEngineMode(false);
                              isEngineModeRef.current = false;
                            } else if (loadedType === 'fen' && lichessExhaustionIndexRef.current !== null && i * 2 < lichessExhaustionIndexRef.current) {
                              console.log('Restoring Database mode for FEN from move click');
                              setComputerMode('Database');
                              setIsEngineMode(false);
                              isEngineModeRef.current = false;
                            } else if (loadedType === 'none' && lichessExhaustionIndexRef.current !== null && i * 2 < lichessExhaustionIndexRef.current) {
                              console.log('Restoring Database mode from move click');
                              setComputerMode('Database');
                              setIsEngineMode(false);
                              isEngineModeRef.current = false;
                            }
                          }}
                        >
                          <Text style={[
                            styles.moveText,
                            historyIndexRef.current === i * 2 && styles.moveTextActive
                          ]}>
                            {moveHistory[i * 2].san}
                          </Text>
                        </TouchableOpacity>
                      )}
                      {moveHistory[i * 2 + 1] && (
                        <TouchableOpacity
                          onPress={() => {
                            historyIndexRef.current = i * 2 + 1;
                            isReviewingRef.current = (i * 2 + 1) < moveHistory.length - 1;
                            boardRef.current?.setFen(moveHistory[i * 2 + 1].fen);
                            const t = (moveHistory[i * 2 + 1].fen.split(' ')[1] || 'w') as 'w' | 'b';
                            setTurn(t);
                            turnRef.current = t;
                            setShowPossibleMoves(false); // Hide moves modal when navigating
                            
                            // Restore appropriate mode based on loaded type and exhaustion
                            if (loadedType === 'pgn' && pgnExhaustionIndexRef.current !== null && (i * 2 + 1) < pgnExhaustionIndexRef.current) {
                              console.log('Restoring PGN mode from black move click');
                              setPgnMode(true);
                              setComputerMode('PGN');
                              setIsEngineMode(false);
                              isEngineModeRef.current = false;
                            } else if (loadedType === 'fen' && lichessExhaustionIndexRef.current !== null && (i * 2 + 1) < lichessExhaustionIndexRef.current) {
                              console.log('Restoring Database mode for FEN from black move click');
                              setComputerMode('Database');
                              setIsEngineMode(false);
                              isEngineModeRef.current = false;
                            } else if (loadedType === 'none' && lichessExhaustionIndexRef.current !== null && (i * 2 + 1) < lichessExhaustionIndexRef.current) {
                              console.log('Restoring Database mode from black move click');
                              setComputerMode('Database');
                              setIsEngineMode(false);
                              isEngineModeRef.current = false;
                            }
                          }}
                        >
                          <Text style={[
                            styles.moveText,
                            historyIndexRef.current === i * 2 + 1 && styles.moveTextActive
                          ]}>
                            {moveHistory[i * 2 + 1].san}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))
                )}
              </ScrollView>
              <TouchableOpacity style={styles.navButton} onPress={handleStepForward}>
                <Text style={styles.navButtonText}>▶</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.actionIcon, { backgroundColor: '#E3B23C', shadowColor: '#E3B23C' }]}
            onPress={handleReset}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIconText}>↺</Text>
          </TouchableOpacity>
          <View style={{ width: 16 }} />
          <TouchableOpacity
            style={[styles.actionIcon, { backgroundColor: '#3F8F88', shadowColor: '#3F8F88' }]}
            onPress={handleFlip}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIconText}>⇅</Text>
          </TouchableOpacity>
          <View style={{ width: 16 }} />
          <TouchableOpacity
            style={[
              styles.fenButtonSmall, 
              loadedType === 'fen' ? { backgroundColor: '#E74C3C', shadowColor: '#E74C3C' } : {}
            ]}
            onPress={loadedType === 'fen' ? handleClearLoaded : () => setIsFenModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.fenButtonTextSmall}>
              {loadedType === 'fen' ? '✕' : 'FEN'}
            </Text>
          </TouchableOpacity>
          <View style={{ width: 8 }} />
          <TouchableOpacity
            style={[
              styles.fenButtonSmall,
              loadedType === 'pgn' ? { backgroundColor: '#E74C3C', shadowColor: '#E74C3C' } : {}
            ]}
            onPress={loadedType === 'pgn' ? handleClearLoaded : () => setIsPgnModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.fenButtonTextSmall}>
              {loadedType === 'pgn' ? '✕' : 'PGN'}
            </Text>
          </TouchableOpacity>
          <View style={{ width: 8 }} />
          <TouchableOpacity
            style={[styles.fenButtonSmall, { backgroundColor: '#9C27B0', shadowColor: '#9C27B0' }]}
            onPressIn={handleShowPossibleMoves}
            onPressOut={() => setShowPossibleMoves(false)}
            activeOpacity={0.7}
          >
            <Text style={styles.fenButtonTextSmall}>Moves</Text>
          </TouchableOpacity>
        </View>

        {/* Promotion Selection Modal */}
        {promotionData && (
          <View style={styles.modalOverlay}>
            <View style={styles.promotionModal}>
              <Text style={styles.modalTitle}>Choose Promotion</Text>
              <View style={styles.promotionOptions}>
                {[
                  { label: 'Queen', key: 'q' },
                  { label: 'Knight', key: 'n' },
                  { label: 'Rook', key: 'r' },
                  { label: 'Bishop', key: 'b' },
                ].map((item) => (
                  <TouchableOpacity
                    key={item.key}
                    style={styles.promotionButton}
                    onPress={() => handlePromotionSelect(item.key)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.promotionButtonText}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* FEN Input Modal */}
        {isFenModalVisible && (
          <View style={styles.modalOverlay}>
            <View style={styles.promotionModal}>
              <Text style={styles.modalTitle}>Load FEN Position</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Paste FEN here..."
                  placeholderTextColor="#666"
                  value={fenInput}
                  onChangeText={setFenInput}
                  multiline
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setIsFenModalVisible(false);
                    setFenInput('');
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.loadButton]}
                  onPress={handleLoadFen}
                >
                  <Text style={styles.buttonText}>Load</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* PGN Input Modal */}
        {isPgnModalVisible && (
          <View style={styles.modalOverlay}>
            <View style={styles.promotionModal}>
              <Text style={styles.modalTitle}>Load PGN</Text>
              <View style={styles.inputContainer}>
                <ScrollView style={{ maxHeight: 200 }}>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Paste PGN here..."
                    placeholderTextColor="#666"
                    value={pgnInput}
                    onChangeText={setPgnInput}
                    multiline
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </ScrollView>
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setIsPgnModalVisible(false);
                    setPgnInput('');
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.loadButton]}
                  onPress={handleLoadPgnFromText}
                >
                  <Text style={styles.buttonText}>Load</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Possible Moves Modal */}
        {showPossibleMoves && (
          <View style={styles.modalOverlay}>
            <View style={styles.possibleMovesModal}>
              <Text style={styles.modalTitle}>Possible Moves</Text>
              <View style={styles.inputContainer}>
                <ScrollView style={{ maxHeight: 300 }}>
                  {possibleMoves.map((move, index) => (
                    <Text key={index} style={styles.possibleMoveText}>
                      {move}
                    </Text>
                  ))}
                </ScrollView>
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.loadButton]}
                  onPress={() => setShowPossibleMoves(false)}
                >
                  <Text style={styles.buttonText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* Settings Modal */}
        <SettingsModal
          visible={isSettingsVisible}
          currentElo={botElo}
          onSelectElo={handleEloChange}
          onClose={() => setIsSettingsVisible(false)}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#D9FDF8', // Light Cyan background
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gearButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E3B23C', // Gold
    justifyContent: 'center',
    alignItems: 'center',
  },
  gearButtonText: {
    fontSize: 20,
    color: '#121212',
  },
  title: {
    fontSize: 32,
    fontWeight: '900',
    color: '#3F8F88', // Teal
    letterSpacing: 2,
    textAlign: 'center',
    flex: 1,
    marginLeft: 38, // offset the gear button width to keep it centered
  },
  contentContainer: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  evalBarContainer: {
    width: '90%',
    height: 12,
    backgroundColor: '#3F8F88',
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 10,
    position: 'relative',
    borderWidth: 1,
    borderColor: '#3F8F88',
  },
  evalBarBackground: {
    height: '100%',
    flexDirection: 'row',
    backgroundColor: '#1E504A', // Darker Teal
  },
  evalBarFill: {
    height: '100%',
  },
  evalTextContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  evalText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#D9FDF8',
    backgroundColor: 'rgba(30,80,74,0.7)',
    paddingHorizontal: 4,
    borderRadius: 2,
  },
  historyContainer: {
    width: '100%',
    marginTop: 8,
    paddingHorizontal: 6,
  },
  historyNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyScroll: {
    flex: 1,
    backgroundColor: '#3F8F88', // Teal
    borderRadius: 8,
    maxHeight: 44,
  },
  historyScrollContent: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  movePair: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  moveNumber: {
    color: '#D9FDF8',
    fontSize: 12,
    marginRight: 2,
    opacity: 0.8,
  },
  moveText: {
    color: '#D9FDF8',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 5,
    paddingVertical: 6,
    borderRadius: 4,
  },
  moveTextActive: {
    color: '#121212',
    backgroundColor: '#E3B23C', // Gold indicator
  },
  noMovesText: {
    color: '#D9FDF8',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 12,
    fontStyle: 'italic',
  },
  navButton: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  navButtonText: {
    color: '#E3B23C', // Gold text
    fontSize: 18,
    fontWeight: 'bold',
  },
  boardContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  controls: {
    paddingBottom: 40,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
  },
  actionIconText: {
    fontSize: 28,
    color: '#121212',
    fontWeight: 'bold',
  },
  fenButton: {
    backgroundColor: '#3F8F88',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 30,
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fenButtonSmall: {
    backgroundColor: '#3F8F88',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 60,
  },
  fenButtonText: {
    color: '#D9FDF8',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  fenButtonTextSmall: {
    color: '#D9FDF8',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
  buttonText: {
    color: '#121212',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  cancelButtonText: {
    color: '#D9FDF8',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 26, 24, 0.8)', // Matching dark teal backdrop
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  promotionModal: {
    backgroundColor: '#D9FDF8',
    width: '80%',
    padding: 24,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#3F8F88',
    alignItems: 'center',
  },
  modalTitle: {
    color: '#3F8F88',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  promotionOptions: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  promotionButton: {
    backgroundColor: '#3F8F88',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    margin: 8,
    minWidth: 100,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3F8F88',
  },
  promotionButtonText: {
    color: '#D9FDF8',
    fontSize: 16,
    fontWeight: '600',
  },
  inputContainer: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#3F8F88',
  },
  textInput: {
    color: '#3F8F88',
    fontSize: 14,
    textAlignVertical: 'top',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#3F8F88',
  },
  loadButton: {
    backgroundColor: '#E3B23C',
  },
  modeIndicatorContainer: {
    backgroundColor: '#3F8F88',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'center',
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E3B23C',
  },
  modeIndicatorText: {
    color: '#D9FDF8',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  possibleMovesModal: {
    backgroundColor: '#D9FDF8',
    width: '85%',
    padding: 24,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#3F8F88',
    alignItems: 'center',
  },
  possibleMoveText: {
    color: '#3F8F88',
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E3B23C',
    marginBottom: 2,
  },
});

export default App;
