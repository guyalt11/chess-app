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

  useEffect(() => {
    const setupEngine = async () => {
      try {
        console.log('Initializing Stockfish...');
        await engine.init();
        await engine.start();

        engine.onOutput((line) => {
          // console.log('STOCKFISH:', line);

          // Parse Evaluation Score
          if (line.includes('score cp') || line.includes('score mate')) {
            const parts = line.split(' ');
            const scoreIndex = parts.indexOf('cp');
            const mateIndex = parts.indexOf('mate');

            if (scoreIndex !== -1) {
              let score = parseInt(parts[scoreIndex + 1], 10) / 100;
              // UCI score is relative to side-to-move. 
              // We'll need to flip it if it's black's turn to get white-relative score.
              // For simplicity, let's assume engine is calculating for side-to-move.
              setEvaluation(score);
            } else if (mateIndex !== -1) {
              // Mate in X turns
              const mateIn = parseInt(parts[mateIndex + 1], 10);
              setEvaluation(mateIn > 0 ? 10 : -10); // Show max/min for mate
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
  }, []);

  const handleMove = (moveInfo: { from: string; to: string; fen: string }) => {
    const turn = moveInfo.fen.split(' ')[1];
    // console.log('Move made:', moveInfo, 'Turn:', turn);
    engine.send(`position fen ${moveInfo.fen}`);
    engine.send('go depth 15');
  };

  const handleGameOver = (result: string) => {
    Alert.alert('Game Over', result, [{ text: 'OK' }]);
  };

  const handleReset = () => {
    setEvaluation(0);
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

  // Calculate Eval Bar height (from -5 to +5 range clamped)
  const getEvalPercentage = () => {
    const clamped = Math.max(-5, Math.min(5, evaluation));
    // 0 is 50%, 5 is 100%, -5 is 0%
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
          {/* Vertical Evaluation Bar */}
          <View style={styles.evalBarContainer}>
            <View style={[styles.evalBarBackground, { height: '100%' }]}>
              {/* Black part (top) */}
              <View style={[styles.evalBarFill, {
                height: `${100 - getEvalPercentage()}%`,
                backgroundColor: '#404040'
              }]} />
              {/* White part (bottom) */}
              <View style={[styles.evalBarFill, {
                height: `${getEvalPercentage()}%`,
                backgroundColor: '#FFFFFF'
              }]} />
            </View>
            <Text style={styles.evalText}>
              {evaluation > 0 ? `+${evaluation.toFixed(1)}` : evaluation.toFixed(1)}
            </Text>
          </View>

          <View style={styles.boardContainer}>
            <ChessBoardWebView
              ref={boardRef}
              onMove={handleMove}
              onGameOver={handleGameOver}
            />
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  evalBarContainer: {
    width: 30,
    height: '80%',
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginRight: 10,
  },
  evalBarBackground: {
    width: '100%',
    backgroundColor: '#000',
  },
  evalBarFill: {
    width: '100%',
  },
  evalText: {
    position: 'absolute',
    top: 5,
    fontSize: 10,
    fontWeight: 'bold',
    color: '#BB86FC',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 2,
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
