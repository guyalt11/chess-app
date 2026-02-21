import React, { useRef } from 'react';
import {
  StyleSheet,
  View,
  StatusBar,
  SafeAreaView,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Chessboard, { ChessboardRef } from 'react-native-chessboard';

function App(): React.JSX.Element {
  const chessboardRef = useRef<ChessboardRef>(null);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
