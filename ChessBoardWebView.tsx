import React, { useRef, useImperativeHandle, forwardRef } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

export interface ChessBoardWebViewRef {
  setFen: (fen: string) => void;
  setOrientation: (orientation: 'white' | 'black') => void;
  reset: () => void;
  injectJavaScript: (script: string) => void;
  confirmPromotion: (from: string, to: string, piece: string) => void;
}

interface Props {
  onMove?: (move: { from: string; to: string; fen: string }) => void;
  onGameOver?: (result: string) => void;
  onPromotionNeeded?: (from: string, to: string) => void;
}

const ChessBoardWebView = forwardRef<ChessBoardWebViewRef, Props>(
  ({ onMove, onGameOver, onPromotionNeeded }, ref) => {
    const webViewRef = useRef<WebView>(null);
    const boardSize = Math.floor(Dimensions.get('window').width - 20);

    useImperativeHandle(ref, () => ({
      setFen: (fen: string) => {
        const script = `
          if (window.board) {
            window.game.load('${fen}');
            window.board.position(window.game.fen());
            checkStatus();
          }
        `;
        webViewRef.current?.injectJavaScript(script);
      },
      setOrientation: (orientation: 'white' | 'black') => {
        const script = `
          if (window.board) {
            window.board.orientation('${orientation}');
          }
        `;
        webViewRef.current?.injectJavaScript(script);
      },
      reset: () => {
        const script = `
          if (window.board) {
            window.game.reset();
            window.board.start();
            removeHighlights();
            sourceSquare = null;
          }
        `;
        webViewRef.current?.injectJavaScript(script);
      },
      injectJavaScript: (script: string) => {
        webViewRef.current?.injectJavaScript(script);
      },
      confirmPromotion: (from: string, to: string, piece: string) => {
        const script = `
          var move = window.game.move({
            from: '${from}',
            to: '${to}',
            promotion: '${piece}'
          });
          if (move) {
            window.board.position(window.game.fen());
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'MOVE',
              move: { from: '${from}', to: '${to}', fen: window.game.fen() }
            }));
            checkStatus();
          }
        `;
        webViewRef.current?.injectJavaScript(script);
      },
    }));

    const onMessage = (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'MOVE' && onMove) {
          onMove(data.move);
        } else if (data.type === 'GAME_OVER' && onGameOver) {
          onGameOver(data.result);
        } else if (data.type === 'PROMOTION_NEEDED' && onPromotionNeeded) {
          onPromotionNeeded(data.from, data.to);
        }
      } catch (e) {
        console.error('WebView Message Error:', e);
      }
    };

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <script src="https://code.jquery.com/jquery-3.5.1.min.js"></script>
        <script src="https://unpkg.com/@chrisoakman/chessboardjs@1.0.0/dist/chessboard-1.0.0.min.js"></script>
        <link rel="stylesheet" href="https://unpkg.com/@chrisoakman/chessboardjs@1.0.0/dist/chessboard-1.0.0.min.css">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js"></script>
        <style>
          body { 
            margin: 0; 
            padding: 0; 
            background-color: #121212; 
            display: flex; 
            justify-content: center; 
            align-items: center; 
            height: 100vh; 
            overflow: hidden; 
            touch-action: none;
          }
          #myBoard { 
            width: ${boardSize}px; 
            height: ${boardSize}px;
          }
          .white-1e1d7 { background-color: #ebecd0; color: #779556; }
          .black-3b82a { background-color: #779556; color: #ebecd0; }
          
          .highlight-move {
            box-shadow: inset 0 0 3px 3px rgba(255, 255, 0, 0.75);
          }
          .highlight-source {
            background-color: rgba(255, 255, 0, 0.5) !important;
          }
          .highlight-hint {
            background: radial-gradient(rgba(0,0,0,0.1) 19%, rgba(0,0,0,0) 20%);
            background-position: center;
            background-size: 100% 100%;
            background-repeat: no-repeat;
          }
          .square-55d63 {
            touch-action: none;
            -webkit-tap-highlight-color: transparent;
          }
        </style>
      </head>
      <body>
        <div id="myBoard"></div>
        <script>
          var board = null;
          var game = new Chess();
          var sourceSquare = null;

          function removeHighlights () {
            $('#myBoard .square-55d63').removeClass('highlight-move highlight-source highlight-hint');
          }

          function addHighlight (square) {
            $('.square-' + square).addClass('highlight-hint');
          }

          function checkStatus() {
            if (game.in_checkmate()) {
              var winner = game.turn() === 'w' ? 'Black' : 'White';
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'GAME_OVER',
                result: 'Checkmate! ' + winner + ' wins.'
              }));
            } else if (game.in_draw()) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'GAME_OVER',
                result: 'Draw!'
              }));
            }
          }

          function isPromotion(from, to) {
            var moves = game.moves({ square: from, verbose: true });
            var move = moves.find(m => m.from === from && m.to === to);
            return move && move.flags.indexOf('p') !== -1;
          }

          function onSquareClick(square) {
            if (sourceSquare) {
              if (isPromotion(sourceSquare, square)) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'PROMOTION_NEEDED',
                  from: sourceSquare,
                  to: square
                }));
                sourceSquare = null;
                removeHighlights();
                return;
              }

              var move = game.move({
                from: sourceSquare,
                to: square,
                promotion: 'q'
              });

              if (move === null) {
                var piece = game.get(square);
                if (piece && piece.color === game.turn()) {
                  sourceSquare = square;
                  removeHighlights();
                  $('.square-' + square).addClass('highlight-source');
                  
                  var moves = game.moves({
                    square: square,
                    verbose: true
                  });
                  moves.forEach(m => addHighlight(m.to));
                  return;
                }
                
                sourceSquare = null;
                removeHighlights();
                return;
              }

              board.position(game.fen());
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'MOVE',
                move: { from: move.from, to: move.to, san: move.san, fen: game.fen() }
              }));
              sourceSquare = null;
              removeHighlights();
              checkStatus();
              return;
            }

            var piece = game.get(square);
            if (piece && piece.color === game.turn()) {
              sourceSquare = square;
              removeHighlights();
              $('.square-' + square).addClass('highlight-source');
              
              var moves = game.moves({
                square: square,
                verbose: true
              });
              moves.forEach(m => addHighlight(m.to));
            }
          }

          function onDragStart (source, piece, position, orientation) {
            if (game.game_over()) return false;
            if ((game.turn() === 'w' && piece.search(/^b/) !== -1) ||
                (game.turn() === 'b' && piece.search(/^w/) !== -1)) {
              return false;
            }
          }

          function onDrop (source, target) {
            if (isPromotion(source, target)) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'PROMOTION_NEEDED',
                from: source,
                to: target
              }));
              return 'snapback';
            }

            var move = game.move({
              from: source,
              to: target,
              promotion: 'q'
            });

            if (move === null) return 'snapback';

            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'MOVE',
              move: { from: source, to: target, san: move.san, fen: game.fen() }
            }));
            sourceSquare = null;
            removeHighlights();
            checkStatus();
          }

          function onSnapEnd () {
            board.position(game.fen());
          }

          var config = {
            draggable: true,
            position: 'start',
            onDragStart: onDragStart,
            onDrop: onDrop,
            onSnapEnd: onSnapEnd,
            pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png'
          };
          board = Chessboard('myBoard', config);
          window.board = board;
          window.game = game;

          $('#myBoard').on('click', '.square-55d63', function() {
            var square = $(this).data('square');
            onSquareClick(square);
          });
        </script>
      </body>
      </html>
    `;

    return (
      <View style={[styles.container, { width: boardSize, height: boardSize }]}>
        <WebView
          ref={webViewRef}
          originWhitelist={['*']}
          source={{ html: htmlContent }}
          onMessage={onMessage}
          scrollEnabled={false}
          style={styles.webview}
          containerStyle={{ width: boardSize, height: boardSize }}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          bounces={false}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  webview: {
    backgroundColor: 'transparent',
  },
});

export default ChessBoardWebView;
