declare module 'ml-logistic-regression' {
  export default class LogisticRegression {
    constructor(options?: unknown);
    train(X: unknown, y: unknown): void;
    predict(X: unknown): unknown;
  }
}
