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
      const data = await response.json();

      const validMoves = (data.moves || []).filter((m: any) => (m.white + m.draws + m.black) > 50);

      if (validMoves.length === 0) {
        console.log('No DB moves with > 50 games found. Switching to Engine.');
        Alert.alert('Database Exhausted', 'No common moves found. Switching to Stockfish.', [{ text: 'OK' }]);
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
      Alert.alert('Connection Error', 'Could not reach the Lichess database. Switching to Stockfish.', [{ text: 'OK' }]);
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
    currentFenRef.current = 'startpos';
    startFenRef.current = 'startpos';
    setMoveHistory([]);
    historyIndexRef.current = -1;
    isReviewingRef.current = false;
    setIsEngineMode(false); // Reset to DB mode on new game
    isEngineModeRef.current = false;
    boardRef.current?.reset();
    engine.send('ucinewgame');
    engine.send('isready');
    engine.send('position startpos');

    // Check if computer should move (e.g. if it is currently White)
    triggerComputerIfItsTurn('w', 'startpos');
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
      // isReviewingRef stays true (we always go back into history)

      if (newIdx >= 0) {
        const targetFen = prev[newIdx]?.fen;
        const t = (targetFen.split(' ')[1] || 'w') as 'w' | 'b';
        boardRef.current?.setFen(targetFen);
        setTurn(t);
        turnRef.current = t;
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
        evalPositionOnly(startFen === 'startpos' ? 'startpos' : startFen, startTurn);
      }
      return prev;
    });
  };

  const handleStepForward = () => {
    // Set review mode synchronously BEFORE anything async
    isReviewingRef.current = true;
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
      return prev;
    });
  };

  const handleEloChange = (elo: number) => {
    setBotElo(elo);
    botEloRef.current = elo;
    // Apply new ELO to the engine immediately
    engine.send('setoption name UCI_LimitStrength value true');
    engine.send(`setoption name UCI_Elo value ${elo}`);
    engine.send('isready');
    // Reset the game so the new ELO takes effect cleanly
    handleReset();
    setIsSettingsVisible(false);
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
          <View style={{ width: 24 }} />
          <TouchableOpacity
            style={[styles.actionIcon, { backgroundColor: '#3F8F88', shadowColor: '#3F8F88' }]}
            onPress={handleFlip}
            activeOpacity={0.7}
          >
            <Text style={styles.actionIconText}>⇅</Text>
          </TouchableOpacity>
          <View style={{ width: 24 }} />
          <TouchableOpacity
            style={styles.fenButton}
            onPress={() => setIsFenModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.fenButtonText}>Paste FEN</Text>
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
  fenButtonText: {
    color: '#D9FDF8',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
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
});

export default App;
