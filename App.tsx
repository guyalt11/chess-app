import React, { useRef, useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  StatusBar,
  SafeAreaView,
  TouchableOpacity,
  Text,
  Alert,
} from 'react-native';

import ChessBoardWebView, { ChessBoardWebViewRef } from './ChessBoardWebView';
import engine from './StockfishEngine';

function App(): React.JSX.Element {
  const boardRef = useRef<ChessBoardWebViewRef>(null);
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [evaluation, setEvaluation] = useState<number>(0); // 0 is balanced
  const [turn, setTurn] = useState<'w' | 'b'>('w');
  const turnRef = useRef<'w' | 'b'>('w');

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

              const script = `
                if (window.board && window.game) {
                  var move = window.game.move({
                    from: '${from}',
                    to: '${to}',
                    promotion: 'q'
                  });
                  window.board.position(window.game.fen());
                  checkStatus();
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

  const handleMove = (moveInfo: { from: string; to: string; fen: string }) => {
    const nextTurn = moveInfo.fen.split(' ')[1] as 'w' | 'b';
    setTurn(nextTurn);
    turnRef.current = nextTurn;
    engine.send(`position fen ${moveInfo.fen}`);
    engine.send('go depth 15');
  };

  const handleGameOver = (result: string) => {
    Alert.alert('Game Over', result, [{ text: 'OK' }]);
  };

  const handleReset = () => {
    setEvaluation(0);
    setTurn('w');
    turnRef.current = 'w';
    boardRef.current?.reset();
    engine.send('ucinewgame');
    engine.send('isready');
    engine.send('position startpos');
  };

  const handleFlip = () => {
    const newOrientation = orientation === 'white' ? 'black' : 'white';
    setOrientation(newOrientation);
    boardRef.current?.setOrientation(newOrientation);
  };

  // Calculate Eval Bar percentage (White relative: 100% is full white, 0% is full black)
  const getEvalPercentage = () => {
    const clamped = Math.max(-5, Math.min(5, evaluation));
    // -5 (black) -> 0%
    // 0 (draw) -> 50%
    // 5 (white) -> 100%
    return ((clamped + 5) / 10) * 100;
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          <Text style={styles.title}>Grandmaster Chess</Text>
        </View>

        <View style={styles.contentContainer}>
          <View style={styles.boardContainer}>
            <ChessBoardWebView
              ref={boardRef}
              onMove={handleMove}
              onGameOver={handleGameOver}
            />
          </View>

          {/* Horizontal Evaluation Bar */}
          <View style={styles.evalBarContainer}>
            <View style={[styles.evalBarBackground, { width: '100%' }]}>
              {/* White part (left) */}
              <View style={[styles.evalBarFill, {
                width: `${getEvalPercentage()}%`,
                backgroundColor: '#FFFFFF'
              }]} />
              {/* Black part (right) */}
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
        </View>
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
    marginTop: 20,
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
  boardContainer: {
    flex: 1,
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
    paddingHorizontal: 30,
    borderRadius: 30,
    elevation: 8,
    shadowColor: '#BB86FC',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    minWidth: 120,
    alignItems: 'center',
  },
  flipButton: {
    backgroundColor: '#03DAC6',
    shadowColor: '#03DAC6',
  },
  buttonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});

export default App;
