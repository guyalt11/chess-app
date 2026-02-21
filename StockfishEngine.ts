import { NativeModules, NativeEventEmitter } from 'react-native';

const { StockfishModule } = NativeModules;
const stockfishEmitter = new NativeEventEmitter(StockfishModule);

export interface StockfishEngine {
    init: () => Promise<string>;
    start: () => Promise<string>;
    send: (command: string) => void;
    onOutput: (callback: (line: string) => void) => () => void;
    stop: () => void;
}

const engine: StockfishEngine = {
    init: () => StockfishModule.initEngine(),
    start: () => StockfishModule.startEngine(),
    send: (command: string) => StockfishModule.sendCommand(command),
    onOutput: (callback: (line: string) => void) => {
        const subscription = stockfishEmitter.addListener('onStockfishOutput', callback);
        return () => subscription.remove();
    },
    stop: () => StockfishModule.stopEngine(),
};

export default engine;
