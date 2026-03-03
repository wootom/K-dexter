export { runBacktest, saveBacktestResult, loadBacktestResult, listBacktestResults } from './engine.js';
export { runParameterSweep } from './parameter-sweep.js';
export type {
    OhlcvRecord,
    BacktestConfig,
    BacktestTrade,
    BacktestResult,
    ParameterSweepResult,
    SwingGradeWeights,
    SwingGradeThresholds,
} from './types.js';
