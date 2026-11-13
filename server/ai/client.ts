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
  signal?: AbortSignal, maxTokens = 16000,
): Promise<unknown> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new AIError('Configure OPENAI_API_KEY nos Secrets do Diagrama para usar a inteligência artificial.', 503, 'not_configured');
  const { model } = aiStatus();
  const deadline = AbortSignal.timeout(180000);
  const combined = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, store: false, input, max_output_tokens: maxTokens,
        ...(model.startsWith('gpt-5') ? { reasoning: { effort: 'low' } } : {}),
        text: { format: { type: 'json_schema', name, strict: true, schema } },
      }),
      signal: combined,
    });
  } catch {
    if (signal?.aborted) throw new AIError('A operação foi cancelada.', 499, 'cancelled');
    throw new AIError('Não foi possível concluir a comunicação com a OpenAI. Tente novamente.', 504, 'connection');
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    const messages: Record<number, string> = {
      400: 'O modelo configurado não aceitou este pedido. Confira OPENAI_MODEL e o acesso do projeto à API.',
      401: 'A chave da OpenAI não foi aceita. Confira OPENAI_API_KEY nos Secrets.',
      403: 'O projeto da OpenAI não tem acesso ao modelo configurado.',
      413: 'O documento excede o limite de entrada do modelo configurado.',
      429: 'A OpenAI informou limite de uso ou saldo insuficiente. Confira a cota e a cobrança da API.',
    };
    throw new AIError(messages[response.status] || 'A OpenAI está indisponível. Tente novamente.',
      response.status === 429 ? 429 : 502, `provider_${response.status}`);
  }
  try { return parseResponse(await response.json()); }
  catch (error) {
    if (error instanceof AIError) throw error;
    throw new AIError('A OpenAI retornou uma resposta ilegível.', 502, 'invalid_response');
  }
}
