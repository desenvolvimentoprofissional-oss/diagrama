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
      kind: { type: 'string', enum: ['heading','paragraph','list','callout','cards','steps','table','image','diagram'] },
      sourceIds, text: { type: 'string' }, level: { type: 'integer' },
      rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
      items: { type: 'array', items: item }, caption: { type: 'string' }, breakBefore: { type: 'boolean' },
      layout: { type:'string',enum:['auto','grid','comparison','process','timeline','decision','hierarchy'] },
      nodes: { type:'array',items:{type:'object',additionalProperties:false,properties:{
        id:{type:'string'},label:{type:'string'},detail:{type:'string'},sourceIds,
      },required:['id','label','detail','sourceIds']} },
      edges: { type:'array',items:{type:'object',additionalProperties:false,properties:{
        from:{type:'string'},to:{type:'string'},label:{type:'string'},
      },required:['from','to','label']} },
    }, required: ['kind','sourceIds','text','level','rows','items','caption','breakBefore','layout','nodes','edges'],
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

const text={type:'string'};
export const editorialSchema={type:'object',additionalProperties:false,properties:{
  title:text,subtitle:text,documentType:{type:'string',enum:['regulation','report','guide','proposal','general']},
  purpose:text,audience:text,synopsis:text,organization:text,
  sections:{type:'array',items:{type:'object',additionalProperties:false,properties:{
    id:text,title:text,summary:text,sourceIds,visual:{type:'string',enum:['none','process','decision','comparison','timeline','hierarchy','cards']},
    visualPurpose:text,visualSourceIds:sourceIds,headingLevel:{type:'integer'},
  },required:['id','title','summary','sourceIds','visual','visualPurpose','visualSourceIds','headingLevel']}},
  style:{type:'object',additionalProperties:false,properties:{customized:{type:'boolean'},primary:text,accent:text,
    fontSize:{type:'number'},organization:text,cover:{type:'boolean'},toc:{type:'boolean'},reason:text,
  },required:['customized','primary','accent','fontSize','organization','cover','toc','reason']},
  cautions:{type:'array',items:text},
},required:['title','subtitle','documentType','purpose','audience','synopsis','organization','sections','style','cautions']};
export const digestSchema={type:'object',additionalProperties:false,properties:{
  titleCandidate:text,summary:text,groups:{type:'array',items:{type:'object',additionalProperties:false,properties:{
    sourceIds,title:text,meaning:text,conditions:{type:'array',items:text},relationship:text,
  },required:['sourceIds','title','meaning','conditions','relationship']}},
},required:['titleCandidate','summary','groups']};
export const meaningSchema={type:'object',additionalProperties:false,properties:{
  issues:{type:'array',items:{type:'object',additionalProperties:false,properties:{
    severity:{type:'string',enum:['error','warning']},blockId:text,message:text,
  },required:['severity','blockId','message']}},
},required:['issues']};
export const repairsSchema={type:'object',additionalProperties:false,properties:{
  removeIds:{type:'array',items:text},
  replacements:{type:'array',items:{type:'object',additionalProperties:false,properties:{
    targetId:text,blocks:explanatorySchema.properties.blocks,
  },required:['targetId','blocks']}},
},required:['removeIds','replacements']};
