import type { DocumentProject, ReviewIssue } from '../../shared/document';
import type { GenerateOptions } from '../../shared/generation';
import { reviewPageImages } from '../ai';
import { throwIfAborted } from './quality';
export type PageImage={page:number;image:string};
export async function reviewAllPages(project:DocumentProject,images:PageImage[],options:GenerateOptions={},label='PDF') {
  const issues:ReviewIssue[]=[];
  const controller=new AbortController();
  const signal=options.signal?AbortSignal.any([options.signal,controller.signal]):controller.signal;
  const batches=Array.from({length:Math.ceil(images.length/6)},(_,index)=>images.slice(index*6,index*6+6));
  let cursor=0,completed=0;
  async function worker() {
    while(cursor<batches.length) {
      throwIfAborted(signal);
      const batch=batches[cursor++];
      const found=await reviewPageImages(project,batch.map(page=>page.image),signal);
      issues.push(...found.map(issue=>({...issue,page:issue.page?batch[issue.page-1]?.page:undefined,
        message:label==='Word'?`Word: ${issue.message}`:issue.message})));
      completed+=batch.length;
      options.onProgress?.({stage:'review',message:`Conferência visual do ${label}: ${completed} de ${images.length} páginas.`,
        current:completed,total:images.length});
    }
  }
  try {await Promise.all(Array.from({length:Math.min(2,batches.length)},()=>worker()));}
  catch(error){controller.abort();throw error;}
  return issues;
}
