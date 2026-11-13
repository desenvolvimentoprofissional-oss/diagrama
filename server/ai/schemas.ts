const sourceIds = { type: 'array', items: { type: 'string' } };
const item = {
  type: 'object', additionalProperties: false,
  properties: { title: { type: 'string' }, text: { type: 'string' } }, required: ['title', 'text'],
};
export const integralPlanSchema = {
  type: 'object', additionalProperties: false,
  properties: { groups: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    properties: { sourceIds, kind: { type: 'string', enum: ['source', 'callout', 'cards', 'steps'] },
      breakBefore: { type: 'boolean' } }, required: ['sourceIds','kind','breakBefore'],
  } } }, required: ['groups'],
};
export const explanatorySchema = {
  type: 'object', additionalProperties: false,
  properties: { blocks: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    properties: {
      kind: { type: 'string', enum: ['heading','paragraph','list','callout','cards','steps','table','image'] },
      sourceIds, text: { type: 'string' }, level: { type: 'integer' },
      rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
      items: { type: 'array', items: item }, caption: { type: 'string' }, breakBefore: { type: 'boolean' },
    }, required: ['kind','sourceIds','text','level','rows','items','caption','breakBefore'],
  } } }, required: ['blocks'],
};
export const visualReviewSchema = {
  type: 'object', additionalProperties: false,
  properties: { issues: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    properties: { severity: { type: 'string', enum: ['error','warning','info'] },
      page: { type: 'integer' }, message: { type: 'string' } }, required: ['severity','page','message'],
  } } }, required: ['issues'],
};
export const ocrSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    pages: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: { page: { type: 'integer' }, blocks: { type: 'array', items: {
        type: 'object', additionalProperties: false,
        properties: { kind: { type: 'string', enum: ['heading','paragraph','list','table'] },
          level: { type: 'integer' }, text: { type: 'string' },
          rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
        }, required: ['kind','level','text','rows'],
      } } }, required: ['page','blocks'],
    } }, warnings: { type: 'array', items: { type: 'string' } },
  }, required: ['pages','warnings'],
};
