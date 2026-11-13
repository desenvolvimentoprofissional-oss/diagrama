import type { DocumentProject, ReviewIssue } from '../../shared/document';
import {renderDiagram} from './diagrams';

export type LayoutResult = { pageCount:number; issues:ReviewIssue[] };

/** Browser function kept self-contained: the identical code paginates preview and PDF. */
export function paginateDocument(root: HTMLElement, project: DocumentProject, defaultLogo = '/document/logo.png', renderGraph?: (parent:HTMLElement,block:DocumentProject['blocks'][number])=>HTMLElement, defaultCover='/design-reference/cover-art.jpg'): LayoutResult {
  if(!renderGraph&&typeof renderDiagram!=='undefined')renderGraph=renderDiagram;
  type Block = DocumentProject['blocks'][number];
  const doc = root.ownerDocument;
  const issues: ReviewIssue[] = [];
  const pages: HTMLElement[] = [];
  const headingPages: {id:string;text:string;level:number;page:number}[] = [];

  let body!: HTMLElement;
  root.replaceChildren();
  root.classList.add('dg-document');
  root.style.setProperty('--dg-primary', project.theme.primary);
  root.style.setProperty('--dg-accent', project.theme.accent);
  root.style.setProperty('--dg-body-size', `${project.theme.fontSize}pt`);
  const safeImage = (value:string) => /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(value);
  const logo=safeImage(project.theme.logo)?project.theme.logo:(project.theme.organization.trim().toUpperCase()==='CRA-SP'?defaultLogo:'');
  function node(tag:string, className:string, text?:string): HTMLElement {
    const el = doc.createElement(tag); el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function brand(header:HTMLElement): void {
    if (logo) {
      const img = doc.createElement('img'); img.src = logo; img.alt = project.theme.organization;
      header.append(img);
    } else header.append(node('span','dg-organization',project.theme.organization));
  }
  function page(): HTMLElement {
    const el = node('section','document-page');
    const header = node('header','dg-header');
    header.append(node('span','',project.title), node('span','dg-header-rule')); brand(header);
    const inner = node('div','dg-body');
    const footer = node('footer','dg-footer');
    footer.append(node('span','dg-page-number'),node('span','dg-footer-label',project.theme.organization.trim().toUpperCase()==='CRA-SP'?'Rua Estados Unidos, 889 · Jardim América · São Paulo/SP\nwww.crasp.gov.br · (11) 3087-3200':project.theme.organization));
    el.append(header,inner,footer); root.append(el); pages.push(el);
    return inner;
  }
  function next(): void {
    const carry:HTMLElement[]=[];let height=0;
    let previous=body?.lastElementChild as HTMLElement|undefined;
    while(previous?.classList.contains('dg-heading')&&height+previous.offsetHeight<240){
      height+=previous.offsetHeight;carry.unshift(previous);previous.remove();previous=body?.lastElementChild as HTMLElement|undefined;
    }
    body=page();for(const heading of carry)body.append(heading);
  }
  function fits(): boolean {
    const boundary = body.getBoundingClientRect().bottom;
    const last = body.lastElementChild;
    return !last || last.getBoundingClientRect().bottom <= boundary + .25;
  }
  function remaining(): number {
    const last = body.lastElementChild;
    const scale=body.getBoundingClientRect().width/body.offsetWidth || 1;
    return (body.getBoundingClientRect().bottom - (last ? last.getBoundingClientRect().bottom : body.getBoundingClientRect().top))/scale;
  }
  function mark(el:HTMLElement,b:Block): void {
    el.dataset.blockId = b.id;
    el.dataset.fragmentKind = b.kind;
    el.dataset.level = String(b.level);
    if (!doc.getElementById(`dg-block-${b.id}`)) el.id = `dg-block-${b.id}`;
  }
  function warning(message:string,b?:Block): void {
    issues.push({severity:'warning',message,blockId:b?.id,page:pages.length});
  }
  function ensureSpace(minimum:number): void {
    if (body.childElementCount && remaining() < minimum) next();
  }
  /** Split without changing or dropping a character, preferring whitespace boundaries. */
  function prefixForFit(text:string, update:(prefix:string)=>void): number {
    let low = 0; let high = text.length;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2); update(text.slice(0,mid));
      if (fits()) low = mid; else high = mid - 1;
    }
    if (low < text.length && low > 1) {
      const before = text.slice(0,low);
      const matches = [...before.matchAll(/\s+/g)];
      const match = matches[matches.length - 1];
      if (match && match.index! + match[0].length > low * .7) low = match.index! + match[0].length;
    }
    if (low && /[\uD800-\uDBFF]/.test(text[low - 1])) low--;
    update(text.slice(0,low));
    return low;
  }
  function text(b:Block,value:string,kind:Block['kind']|'caption' = b.kind): void {
    let rest = value; let first = true;
    do {
      const el = node(kind === 'heading' ? `h${Math.min(6,b.level+1)}` : 'div', `dg-block dg-${kind}${kind === 'heading' ? ` dg-heading-l${b.level}` : ''}`);
      if (kind === 'heading') ensureSpace(95);
      else ensureSpace(44);
      mark(el,b); el.dataset.fragmentKind=kind;
      if(kind==='heading'&&b.kind==='diagram'){el.classList.add('dg-component-heading');el.dataset.role='component-title';el.dataset.level='2';} body.append(el); el.textContent = rest;
      if (fits()) break;
      if (body.childElementCount > 1 && kind === 'heading') {
        el.remove(); next(); body.append(el);
        if (fits()) break;
      }
      const count = prefixForFit(rest,part => {el.textContent = part;});
      if (!count) {
        el.remove();
        if (body.childElementCount) {next(); continue;}
        // A single line must fit at the supported font sizes; report rather than discard it.
        el.textContent = rest; body.append(el); warning('Um trecho excede a área útil da página. Revise sua composição.',b); break;
      }
      rest = rest.slice(count); first = false;
      if (rest) next();
    } while (rest || first);
  }
  function cards(b:Block): void {
    if (b.text) text({...b,kind:'heading',level:2},b.text,'heading');
    if(b.kind==='cards' && b.items.length>1 && b.items.every(item=>item.title.length<=140 && item.text.length<=800)){
      for(let index=0;index<b.items.length;index+=2){
        const row=node('div','dg-cards-row');mark(row,b);row.dataset.itemStart=String(index);
        for(const item of b.items.slice(index,index+2)){
          const card=node('div','dg-card');card.append(node('div','dg-card-title',item.title),node('div','dg-card-text',item.text));row.append(card);
        }
        ensureSpace(100);body.append(row);
        if(!fits() && body.childElementCount>1){row.remove();next();body.append(row);}
        if(!fits())warning('Um grupo de cartões excede a área útil. Divida os textos em mais itens.',b);
      }
      return;
    }
    b.items.forEach((item,index) => {
      let rest = item.text; let title = item.title; let again = true;
      while (again) {
        ensureSpace(100);
        const card = node('div',b.kind === 'steps' ? `dg-step${index===b.items.length-1?' dg-step-last':''}` : 'dg-card'); mark(card,b);
        card.dataset.itemStart=String(index);
        const inner = node('div',b.kind === 'steps' ? 'dg-step-content' : '');
        const heading = node('div','dg-card-title',title);
        const para = node('div','dg-card-text',rest);
        inner.append(heading,para);
        if (b.kind === 'steps') card.append(node('span','dg-step-number',String(index+1)));
        card.append(inner); body.append(card);
        if (fits()) break;
        if (body.childElementCount > 1) {card.remove(); next(); body.append(card); if (fits()) break;}
        const count = prefixForFit(rest,part => {para.textContent = part;});
        if (!count) {
          if (title.length > 100) {card.remove(); text({...b,kind:'callout'},`${title}\n${rest}`,'callout'); break;}
          warning('Um cartão excede a área útil. Divida o conteúdo em mais itens.',b); break;
        }
        rest = rest.slice(count); title = ''; again = Boolean(rest);
        if (again) next();
      }
    });
  }
  function table(b:Block): void {
    if (b.text) text({...b,kind:'heading',level:2},b.text,'heading');
    if (!b.rows.length) return;
    if (Math.max(...b.rows.map(row=>row.length)) > 8) warning('Tabela com muitas colunas: confira a legibilidade na exportação.',b);
    const headers = b.rows[0]; let holder!:HTMLElement; let tbody!:HTMLTableSectionElement;
    function begin(): void {
      ensureSpace(100); holder = doc.createElement('table'); holder.className = 'dg-table'; mark(holder,b);
      const thead = doc.createElement('thead'); const tr = doc.createElement('tr');
      headers.forEach(cell=>{const th=doc.createElement('th');th.textContent=cell;tr.append(th);});
      thead.append(tr); tbody = doc.createElement('tbody'); holder.append(thead,tbody); body.append(holder);
    }
    begin();
    if (!fits()) { holder.remove(); next(); begin(); }
    if (!fits()) {
      holder.remove(); warning('Tabela com cabeçalho extenso foi apresentada em blocos de texto para preservar sua legibilidade.',b);
      b.rows.forEach(row=>row.forEach(cell=>text({...b,kind:'paragraph'},cell,'paragraph'))); return;
    }
    for (const row of b.rows.slice(1)) {
      let rest = [...row]; let pending = true;
      while (pending) {
        const tr = doc.createElement('tr');
        rest.forEach(cell=>{const td=doc.createElement('td');td.textContent=cell;tr.append(td);}); tbody.append(tr);
        if (fits()) break;
        if (tbody.childElementCount > 1) {tr.remove(); next(); begin(); tbody.append(tr); if (fits()) break;}
        if (body.childElementCount > 1) {holder.remove(); next(); body.append(holder); if (fits()) break;}
        const max = Math.max(...rest.map(cell=>cell.length));
        let low=0,high=max;
        while(low<high) {const mid=Math.ceil((low+high)/2); [...tr.cells].forEach((cell,i)=>{cell.textContent=rest[i].slice(0,mid);}); if(fits())low=mid;else high=mid-1;}
        if (!low) {warning('Uma linha de tabela não cabe na área útil. Revise o cabeçalho e as colunas.',b); break;}
        const counts=rest.map(value=>{
          const prefix=value.slice(0,low);const matches=[...prefix.matchAll(/\s+/g)];const last=matches[matches.length-1];
          let count=last&&last.index!+last[0].length>low*.7?last.index!+last[0].length:Math.min(low,value.length);
          if(count && /[\uD800-\uDBFF]/.test(value[count-1]))count--;
          return count;
        });
        [...tr.cells].forEach((cell,i)=>{cell.textContent=rest[i].slice(0,counts[i]);}); rest=rest.map((cell,i)=>cell.slice(counts[i]));
        pending=rest.some(Boolean); if (pending) {next(); begin();}
      }
    }
  }
  if (project.cover) {
    const cover = node('section','document-page dg-cover');
    const institutional=project.theme.organization.trim().toUpperCase()==='CRA-SP'&&!project.theme.logo&&project.theme.primary.toLowerCase()==='#183364'&&project.subtitle.length<=280;
    if(institutional){cover.classList.add('dg-cover-standard');cover.style.backgroundImage=`url("${defaultCover}")`;}

    const top = node('div','dg-cover-brand',project.theme.organization);
    if (logo) {const logoImage=doc.createElement('img');logoImage.className='dg-cover-logo';logoImage.src=logo;logoImage.alt=project.theme.organization;top.append(logoImage);}
    const main = node('div','dg-cover-main');
    main.append(node('div','dg-cover-eyebrow','DOCUMENTO INSTITUCIONAL'));
    const title = node('h1','dg-cover-title',project.title);
    if (project.title.length > 140) title.style.fontSize='26pt';
    if(institutional&&project.title.length>90)title.style.fontSize='30pt';
    main.append(title,node('p','dg-cover-subtitle',project.subtitle));
    const author=node('div','dg-cover-author',project.author);
    cover.append(top,main,author);root.append(cover); pages.push(cover);
    const subtitle=main.querySelector<HTMLElement>('.dg-cover-subtitle')!;
    for(let size=30;size>=20;size-=2){
      if(cover.scrollHeight<=cover.clientHeight+1&&main.scrollHeight<=main.clientHeight+1&&main.getBoundingClientRect().bottom<=author.getBoundingClientRect().top)break;
      title.style.fontSize=`${size}pt`;subtitle.style.fontSize=`${Math.max(11,size/2-1)}pt`;main.style.margin='5mm 0';
    }
    if(cover.scrollHeight>cover.clientHeight+1||main.scrollHeight>main.clientHeight+1||main.getBoundingClientRect().bottom>author.getBoundingClientRect().top+.5)issues.push({severity:'error',message:'O título e os dados de capa excedem a página. Encurte os dados de apresentação.',page:1});
  }
  next();
  if (!project.blocks.length) body.append(node('div','dg-empty','Importe um documento ou adicione o primeiro componente para começar.'));
  for (const b of project.blocks) {
    if (b.breakBefore && body.childElementCount) next();
    if (b.kind === 'heading') {
      text(b,b.text);
      const anchor=doc.getElementById(`dg-block-${b.id}`);
      if (b.level <= 2) headingPages.push({id:b.id,text:b.text,level:b.level,page:pages.findIndex(page=>Boolean(anchor&&page.contains(anchor)))+1});
    } else if (b.kind === 'table') table(b);
    else if (b.kind === 'cards' || b.kind === 'steps') cards(b);
    else if (b.kind === 'diagram') {
      const graphIds=new Set((b.nodes||[]).map(node=>node.id));
      if(!graphIds.size||graphIds.size!==(b.nodes||[]).length||(b.edges||[]).some(edge=>!graphIds.has(edge.from)||!graphIds.has(edge.to)))
        issues.push({severity:'error',blockId:b.id,page:pages.length,message:'O infográfico contém elementos ausentes, repetidos ou conexões sem destino válido.'});
      if(b.text)text(b,b.text,'heading');
      if(!renderGraph){issues.push({severity:'error',blockId:b.id,message:'O mecanismo de infográficos não está disponível.'});continue;}
      ensureSpace(160);
      const figure=renderGraph(body,b);mark(figure,b);
      if(!fits()&&body.childElementCount>1){figure.remove();next();body.append(figure);}
      if(!fits())issues.push({severity:'error',blockId:b.id,page:pages.length,
        message:'O infográfico é extenso para uma página. Divida etapas ou apresente os detalhes no texto de apoio.'});
      if((b.nodes||[]).some(node=>node.label.length>100||node.detail.length>350))
        warning('Há textos longos nos elementos do infográfico. Confira a leitura e transfira detalhes ao texto de apoio quando necessário.',b);
    }
    else if (b.kind === 'image') {
      if(b.text)text({...b,kind:'paragraph'},b.text,'paragraph');
      if (!safeImage(b.image)) {warning('Imagem ausente ou em formato não suportado para exportação.',b); if(b.caption)text(b,b.caption,'paragraph');continue;}
      const figure=node('figure','dg-figure');mark(figure,b);
      const image=doc.createElement('img');image.src=b.image;image.alt=b.caption;figure.append(image);
      body.append(figure);
      if(!fits() && body.childElementCount>1){figure.remove();next();body.append(figure);}
      if(!fits())warning('A imagem excede a área útil. Revise sua composição.',b);
      if(b.caption)text(b,b.caption,'caption');
    } else text(b,b.text);
    if(b.caption && b.kind!=='image')text(b,b.caption,'caption');
  }
  // Carrying a heading to the next page must not leave an empty physical sheet.
  for(let index=pages.length-1;index>=0;index--){
    const area=pages[index].querySelector('.dg-body');
    if(area&&!area.childElementCount){
      pages[index].remove();pages.splice(index,1);
      for(const issue of issues)if(issue.page&&issue.page>index+1)issue.page--;
    }
  }
  for(const heading of headingPages){
    const anchor=doc.getElementById(`dg-block-${heading.id}`);
    heading.page=pages.findIndex(page=>Boolean(anchor&&page.contains(anchor)))+1;
  }
  // Images are decoded by the caller before measurement. TOC is inserted after content pagination.
  if (project.toc && headingPages.length) {
    const contentPages=[...pages]; const tocPages:HTMLElement[]=[];
    const originalRootLast=root.lastElementChild;
    let tocBody=page();tocPages.push(tocBody.parentElement!);
    tocBody.append(node('h2','dg-toc-title','Sumário'));
    for(const heading of headingPages) {
      const row=node('a',`dg-toc-row dg-toc-level-${heading.level}`) as HTMLAnchorElement;
      row.href=`#dg-block-${heading.id}`;
      row.append(node('span','',heading.text),node('span','',String(heading.page)));
      tocBody.append(row);
      if(row.getBoundingClientRect().bottom>tocBody.getBoundingClientRect().bottom+.25) {row.remove();tocBody=page();tocPages.push(tocBody.parentElement!);tocBody.append(node('h2','dg-toc-title','Sumário'));tocBody.append(row);}
    }
    const before=contentPages[project.cover?1:0];
    tocPages.forEach(el=>root.insertBefore(el,before));
    const firstTocIndex=project.cover?1:0;
    for(const issue of issues)if(issue.page&&issue.page>firstTocIndex)issue.page+=tocPages.length;
    headingPages.forEach((heading,i)=>{
      const anchor=tocPages.flatMap(p=>[...p.querySelectorAll('.dg-toc-row')])[i];
      if(anchor?.lastElementChild)anchor.lastElementChild.textContent=String(heading.page+tocPages.length);
    });
    pages.splice(firstTocIndex,0,...tocPages); pages.splice(pages.length-tocPages.length,tocPages.length);
    void originalRootLast;
  }
  [...root.children].forEach((el,index)=>{
    (el as HTMLElement).dataset.page=String(index+1);
    const number=el.querySelector('.dg-page-number');if(number)number.textContent=String(index+1);
    const area=el.querySelector('.dg-body');
    if(area){
      const boundary=area.getBoundingClientRect();
      const scale=boundary.width/(area as HTMLElement).offsetWidth || 1;
      const invalid=[...area.children].some(child=>{
        const bounds=child.getBoundingClientRect();
        return bounds.bottom>boundary.bottom+.5*scale || bounds.right>boundary.right+.5*scale || bounds.left<boundary.left-.5*scale;
      });
      if(invalid)issues.push({severity:'error',message:'Conteúdo ultrapassa a área útil da página.',page:index+1});
    }
  });
  const orderedPages=[...root.children] as HTMLElement[];
  orderedPages.forEach((page,index)=>{
    const area=page.querySelector<HTMLElement>('.dg-body');if(!area)return;
    const children=[...area.children] as HTMLElement[];
    const last=children.at(-1);
    if(last?.classList.contains('dg-heading'))issues.push({severity:'error',page:index+1,blockId:last.dataset.blockId,
      message:'Um título ficou isolado no final da página.'});
    const areaBounds=area.getBoundingClientRect();
    for(let childIndex=0;childIndex<children.length;childIndex++){
      const child=children[childIndex],bounds=child.getBoundingClientRect();
      if(childIndex&&bounds.top<children[childIndex-1].getBoundingClientRect().bottom-.5)
        issues.push({severity:'error',page:index+1,blockId:child.dataset.blockId,message:'Há componentes sobrepostos na página.'});
      if(child.classList.contains('dg-diagram')){
        const diagramBounds=child.getBoundingClientRect();
        const nodes=[...child.querySelectorAll<HTMLElement>('.dg-diagram-node')];
        for(let nodeIndex=0;nodeIndex<nodes.length;nodeIndex++){
          const rectangle=nodes[nodeIndex].getBoundingClientRect();
          if(rectangle.left<diagramBounds.left-.5||rectangle.right>diagramBounds.right+.5||rectangle.bottom>diagramBounds.bottom+.5)
            issues.push({severity:'error',page:index+1,blockId:child.dataset.blockId,message:'Uma etapa ultrapassa os limites do infográfico.'});
          if(nodes.slice(nodeIndex+1).some(other=>{const candidate=other.getBoundingClientRect();
            return Math.min(rectangle.right,candidate.right)-Math.max(rectangle.left,candidate.left)>1&&
              Math.min(rectangle.bottom,candidate.bottom)-Math.max(rectangle.top,candidate.top)>1;}))
            issues.push({severity:'error',page:index+1,blockId:child.dataset.blockId,message:'Há etapas sobrepostas no infográfico.'});
        }
        for(const label of child.querySelectorAll<HTMLElement>('.dg-edge-label')){
          const rectangle=label.getBoundingClientRect();
          if(nodes.some(other=>{const candidate=other.getBoundingClientRect();
            return Math.min(rectangle.right,candidate.right)-Math.max(rectangle.left,candidate.left)>2&&
              Math.min(rectangle.bottom,candidate.bottom)-Math.max(rectangle.top,candidate.top)>2;}))
            issues.push({severity:'warning',page:index+1,blockId:child.dataset.blockId,message:'O rótulo de uma conexão se sobrepõe a uma etapa do infográfico.'});
        }
      }
      for(const textElement of child.querySelectorAll<HTMLElement>('.dg-card-text,.dg-diagram-label,.dg-diagram-detail,.dg-edge-label')){
        if(textElement.scrollHeight>textElement.clientHeight+1||textElement.scrollWidth>textElement.clientWidth+1)
          issues.push({severity:'error',page:index+1,blockId:child.dataset.blockId,message:'Há texto cortado dentro de um componente.'});
      }
    }
    if(children.length&&index<orderedPages.length-1&&!page.querySelector('.dg-toc-title')){
      const used=(last!.getBoundingClientRect().bottom-areaBounds.top)/areaBounds.height;
      const nextArea=orderedPages[index+1].querySelector('.dg-body');
      const nextFirst=nextArea?.firstElementChild;
      if(used<.23&&nextFirst&&(nextFirst as HTMLElement).dataset.blockId===last!.dataset.blockId&&last!.classList.contains('dg-paragraph'))
        issues.push({severity:'warning',page:index+1,message:'A página está pouco ocupada. Confira se a quebra é necessária à apresentação.'});
    }
  });
  return {pageCount:root.childElementCount,issues};
}
