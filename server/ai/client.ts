export class AIError extends Error {
  constructor(message: string, public status = 502, public code = 'ai_error') {
    super(message);
    this.name = 'AIError';
  }
}

export function aiStatus() {
  return {
    configured: Boolean(process.env.OPENAI_API_KEY?.trim()),
    model: process.env.OPENAI_MODEL?.trim() || 'gpt-5',
  };
}

type ResponseContent = { type?: string; text?: string; refusal?: string };
type ResponseBody = {
  status?: string;
  output_text?: string;
  incomplete_details?: { reason?: string };
  output?: { type?: string; content?: ResponseContent[] }[];
};

export function parseResponse(body: ResponseBody): unknown {
  if (body.status === 'incomplete') {
    throw new AIError('A resposta da OpenAI ficou incompleta. Nenhum conteúdo parcial foi aplicado.', 502, 'incomplete');
  }
  if (body.status && body.status !== 'completed') {
    throw new AIError('O processamento da OpenAI não foi concluído. Nenhuma alteração foi aplicada.', 502, 'not_completed');
  }
  const content = body.output?.flatMap(item => item.content || []) || [];
  if (content.some(item => item.type === 'refusal')) {
    throw new AIError('A OpenAI não pôde processar este pedido. Nenhuma alteração foi aplicada.', 422, 'refusal');
  }
  const text = body.output_text || content.filter(item => item.type === 'output_text').map(item => item.text || '').join('');
  if (!text.trim()) throw new AIError('A OpenAI não retornou conteúdo utilizável.', 502, 'empty_response');
  try { return JSON.parse(text); }
  catch { throw new AIError('A OpenAI retornou uma estrutura inválida. Nenhuma alteração foi aplicada.', 502, 'invalid_json'); }
}

export type AIInput = { role: 'system'|'user'; content: string | Record<string, unknown>[] }[];

export async function requestStructured(
  name: string, schema: Record<string, unknown>, input: AIInput,
  signal?: AbortSignal, maxTokens = 16000, effort:'low'|'medium'|'high'='medium',
): Promise<unknown> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new AIError('Configure OPENAI_API_KEY nos Secrets do Diagrama para usar a inteligência artificial.', 503, 'not_configured');
  const { model } = aiStatus();
  const deadline = AbortSignal.timeout(180000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let response:Response|undefined;
  for(let attempt=0;attempt<3;attempt++){
    try {
      response=await fetch('https://api.openai.com/v1/responses',{
        method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
        body:JSON.stringify({model,store:false,input,max_output_tokens:maxTokens,
          ...(model.startsWith('gpt-5')?{reasoning:{effort}}:{}),
          text:{format:{type:'json_schema',name,strict:true,schema}}}),signal:combined,
      });
    }catch{
      if(signal?.aborted)throw new AIError('A operação foi cancelada.',499,'cancelled');
      throw new AIError('Não foi possível concluir a comunicação com a OpenAI. Tente novamente.',504,'connection');
    }
    if(response.ok)break;
    const failure=await response.json().catch(()=>null);
    const code=typeof failure?.error?.code==='string'?failure.error.code:'';
    if(response.status===429&&code==='rate_limit_exceeded'&&attempt<2){
      const delay=retryDelay(response.headers.get('retry-after'),attempt);
      try{await waitForRetry(delay,combined);}catch{
        if(signal?.aborted)throw new AIError('A operação foi cancelada.',499,'cancelled');
        throw new AIError('A OpenAI excedeu o tempo de resposta. Tente novamente.',504,'connection');
      }
      continue;
    }
    const messages:Record<number,string>={
      400:'O modelo configurado não aceitou este pedido. Confira OPENAI_MODEL e o acesso do projeto à API.',
      401:'A chave da OpenAI não foi aceita. Confira OPENAI_API_KEY nos Secrets.',
      403:'O projeto da OpenAI não tem acesso ao modelo configurado.',
      413:'O documento excede o limite de entrada do modelo configurado.',
      429:code==='insufficient_quota'?'A OpenAI informou saldo ou cota insuficiente. Confira a cobrança da API.':
        'A OpenAI informou limite temporário de uso. Aguarde e tente novamente.',
    };
    throw new AIError(messages[response.status]||'A OpenAI está indisponível. Tente novamente.',
      response.status===429?429:502,`provider_${response.status}`);
  }
  if(!response?.ok)throw new AIError('A OpenAI não concluiu a solicitação.',502,'provider_unavailable');
  try { return parseResponse(await response.json()); }
  catch (error) {
    if (error instanceof AIError) throw error;
    throw new AIError('A OpenAI retornou uma resposta ilegível.', 502, 'invalid_response');
  }
}

export function retryDelay(header:string|null,attempt:number):number {
  const seconds=header===null?NaN:Number(header);
  const requested=Number.isFinite(seconds)?seconds*1000:header?Date.parse(header)-Date.now():NaN;
  return Math.max(250,Math.min(30000,Number.isFinite(requested)?requested:1000*2**attempt));
}
function waitForRetry(milliseconds:number,signal:AbortSignal):Promise<void> {
  if(signal.aborted)return Promise.reject(new AIError('A operação foi cancelada.',499,'cancelled'));
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},milliseconds);
    function abort(){clearTimeout(timer);reject(new AIError('A operação foi cancelada.',499,'cancelled'));}
    signal.addEventListener('abort',abort,{once:true});
  });
}
