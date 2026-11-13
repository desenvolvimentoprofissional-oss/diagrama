import type {DocumentProject} from '../../shared/document';
import {planDocument} from './plan';
import {composeDocument} from './compose';
export {applyExplanation,applyIntegralPlan,validateGraph} from './composition-contracts';
export {sourceBatches} from './source';
/** Compatibility entry point; the public pipeline also renders, reviews and refines. */
export async function generateDocument(project:DocumentProject,instructions='',signal?:AbortSignal):Promise<DocumentProject> {
  const options={signal};
  const plan=await planDocument(project,instructions,options);
  return composeDocument(project,plan,instructions,options);
}
