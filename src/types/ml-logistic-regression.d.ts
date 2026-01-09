/**
 * Type definitions for ml-logistic-regression
 */

declare module 'ml-logistic-regression' {
  import { Matrix } from 'ml-matrix';

  interface LogisticRegressionOptions {
    numSteps?: number;
    learningRate?: number;
  }

  interface Classifier {
    theta: Matrix;
  }

  class LogisticRegression {
    classifiers?: Classifier[];
    constructor(options?: LogisticRegressionOptions);
    train(X: Matrix, y: Matrix): void;
    predict(X: Matrix): number[];
  }

  export default LogisticRegression;
}
