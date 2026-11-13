import type { DocumentProject, ReviewIssue } from './document';
export type GenerationStage='analyze'|'plan'|'compose'|'paginate'|'review'|'refine'|'complete';
export type GenerationProgress={stage:GenerationStage;message:string;current?:number;total?:number;visitedStages?:GenerationStage[]};
export type QualityReport={pages:number;passes:number;visualPages:number;issues:ReviewIssue[];
  status:'reviewed'|'needs-review';wordValidation:'available'|'unavailable'|'failed';reviewedAt:string};
export type GenerationResult={project:DocumentProject;report:QualityReport};
export type GenerateOptions={signal?:AbortSignal;onProgress?:(progress:GenerationProgress)=>void};
