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
  const [promotionData, setPromotionData] = useState<{ from: string; to: string } | null>(null);
  const [isFenModalVisible, setIsFenModalVisible] = useState(false);
  const [fenInput, setFenInput] = useState('');
  const [moveHistory, setMoveHistory] = useState<{ san: string; fen: string }[]>([]);
  const historyIndexRef = useRef<number>(-1); // -1 means at latest position
  const isReviewingRef = useRef<boolean>(false);
  const historyScrollRef = useRef<ScrollView>(null);

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
        const pos = currentFen === 'startpos' ? 'startpos' : `fen ${currentFen}`;
        engine.send(`position ${pos}`);
        engine.send('go depth 15');
      }, 400);
    }
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
    setMoveHistory([]);
    historyIndexRef.current = -1;
    isReviewingRef.current = false;
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
    setTurn(newTurn);
    turnRef.current = newTurn;
    setEvaluation(0);
    setMoveHistory([]);
    historyIndexRef.current = -1;
    isReviewingRef.current = false;

    boardRef.current?.setFen(cleanFen);
    engine.send('ucinewgame');
    engine.send(`position fen ${cleanFen}`);

    setIsFenModalVisible(false);
    setFenInput('');

    triggerComputerIfItsTurn(newTurn, cleanFen);
  };

  const handleStepBack = () => {
    setMoveHistory(prev => {
      const currentIdx = historyIndexRef.current === -1 ? prev.length - 1 : historyIndexRef.current;
      const newIdx = Math.max(-1, currentIdx - 1);
      historyIndexRef.current = newIdx;
      isReviewingRef.current = newIdx < prev.length - 1;

      const targetFen = newIdx === -1 ? null : prev[newIdx]?.fen;
      if (targetFen) {
        boardRef.current?.setFen(targetFen);
        const t = (targetFen.split(' ')[1] || 'w') as 'w' | 'b';
        setTurn(t);
        turnRef.current = t;
      } else if (newIdx === -1) {
        // Back to start
        boardRef.current?.injectJavaScript?.(`
          if (window.board && window.game) {
            window.game.reset();
            window.board.start();
          }
        `);
        setTurn('w');
        turnRef.current = 'w';
      }
      return prev;
    });
  };

  const handleStepForward = () => {
    setMoveHistory(prev => {
      const currentIdx = historyIndexRef.current;
      if (currentIdx >= prev.length - 1) {
        // Already at latest
        isReviewingRef.current = false;
        historyIndexRef.current = prev.length - 1;
        return prev;
      }
      const newIdx = currentIdx + 1;
      historyIndexRef.current = newIdx;
      isReviewingRef.current = newIdx < prev.length - 1;

      const targetFen = prev[newIdx]?.fen;
      if (targetFen) {
        boardRef.current?.setFen(targetFen);
        const t = (targetFen.split(' ')[1] || 'w') as 'w' | 'b';
        setTurn(t);
        turnRef.current = t;

        if (!isReviewingRef.current) {
          // Reached latest position – re-enable engine if it's computer's turn
          currentFenRef.current = targetFen;
          triggerComputerIfItsTurn(t, targetFen);
        }
      }
      return prev;
    });
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
        <View style={styles.header}>
          <Text style={styles.title}>Grandmaster Chess</Text>
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
            style={styles.button}
            onPress={handleReset}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonText}>Reset</Text>
          </TouchableOpacity>
          <View style={{ width: 20 }} />
          <TouchableOpacity
            style={[styles.button, styles.flipButton]}
            onPress={handleFlip}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonText}>Flip</Text>
          </TouchableOpacity>
          <View style={{ width: 10 }} />
          <TouchableOpacity
            style={[styles.button, styles.fenButton]}
            onPress={() => setIsFenModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.buttonText}>FEN</Text>
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
                  <Text style={styles.buttonText}>Cancel</Text>
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
    backgroundColor: '#121212',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    paddingTop: 20,
    paddingBottom: 10,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1,
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
    backgroundColor: '#333',
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 10,
    position: 'relative',
  },
  evalBarBackground: {
    height: '100%',
    flexDirection: 'row',
    backgroundColor: '#000',
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
    color: '#BB86FC',
    backgroundColor: 'rgba(0,0,0,0.6)',
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
    backgroundColor: '#1A1A1A',
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
    color: '#666',
    fontSize: 12,
    marginRight: 2,
  },
  moveText: {
    color: '#CCC',
    fontSize: 13,
    fontWeight: '500',
    paddingHorizontal: 5,
    paddingVertical: 6,
    borderRadius: 4,
  },
  moveTextActive: {
    color: '#BB86FC',
    backgroundColor: 'rgba(187, 134, 252, 0.15)',
  },
  noMovesText: {
    color: '#555',
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
    color: '#BB86FC',
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
  button: {
    backgroundColor: '#BB86FC',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 30,
    elevation: 8,
    shadowColor: '#BB86FC',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    minWidth: 100,
    alignItems: 'center',
  },
  flipButton: {
    backgroundColor: '#03DAC6',
    shadowColor: '#03DAC6',
  },
  fenButton: {
    backgroundColor: '#779556',
    shadowColor: '#779556',
  },
  buttonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  promotionModal: {
    backgroundColor: '#1E1E1E',
    width: '80%',
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  modalTitle: {
    color: '#FFF',
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
    backgroundColor: '#333',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    margin: 8,
    minWidth: 100,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BB86FC',
  },
  promotionButtonText: {
    color: '#BB86FC',
    fontSize: 16,
    fontWeight: '600',
  },
  inputContainer: {
    width: '100%',
    backgroundColor: '#000',
    borderRadius: 8,
    padding: 10,
    marginBottom: 20,
    minHeight: 80,
  },
  textInput: {
    color: '#FFF',
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
    backgroundColor: '#444',
  },
  loadButton: {
    backgroundColor: '#BB86FC',
  },
});

export default App;
