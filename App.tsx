import React, { useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Chessboard, { ChessboardRef } from 'react-native-chessboard';
import engine from './StockfishEngine';

function App(): React.JSX.Element {
  const chessboardRef = useRef<ChessboardRef>(null);

  useEffect(() => {
    const setupEngine = async () => {
      try {
        console.log('Initializing Stockfish...');
        const initPath = await engine.init();
        console.log('Binary extracted to:', initPath);

        const startMsg = await engine.start();
        console.log(startMsg);

        // Listen for output
        const removeListener = engine.onOutput((line) => {
          console.log('STOCKFISH:', line);
        });

        // Test UCI handshake
        engine.send('uci');

        return () => {
          removeListener();
          engine.stop();
        };
      } catch (error) {
        console.error('Engine Error:', error);
      }
    };

    setupEngine();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.boardContainer}>
          <Chessboard ref={chessboardRef} />
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#F5FCFF',
  },
  boardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 10,
  },
});

export default App;
