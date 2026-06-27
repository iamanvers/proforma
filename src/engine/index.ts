export * from './types.ts';
export * from './schema.ts';
export * from './schedules.ts';
export * from './circular.ts';
export * from './dcf.ts';
export * from './lbo.ts';
export { buildModel } from './threeStatement.ts';

import type { Model } from './types.ts';
import { parseAssumptions } from './schema.ts';
import { buildModel } from './threeStatement.ts';

/** Parse raw assumptions (applying defaults) and build the model. */
export function runModel(input: unknown): Model {
  return buildModel(parseAssumptions(input));
}
