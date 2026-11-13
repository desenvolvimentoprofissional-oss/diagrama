export const documentCss = String.raw`
@font-face{font-family:Libre Franklin;src:url('/fonts/LibreFranklin-Regular.ttf') format('truetype');font-weight:400;font-display:swap}
@font-face{font-family:Libre Franklin;src:url('/fonts/LibreFranklin-Bold.ttf') format('truetype');font-weight:700;font-display:swap}
.dg-document{--dg-primary:#183364;--dg-accent:#d9ad4c;font-family:'Libre Franklin',Arial,sans-serif;color:#293444;text-align:left;line-height:1.55;--dg-body-size:11pt}
.dg-document *{box-sizing:border-box}
.dg-document .document-page{position:relative;width:210mm;height:297mm;min-height:297mm;flex-shrink:0;background:#fff;margin:0 auto 26px;box-shadow:0 6px 30px #12234116;padding:31mm 20mm 24mm;isolation:isolate;color:#293444;overflow:visible;break-after:page}
.dg-document .document-page:before{content:'';position:absolute;inset:0;background:url('/document/pattern.png') center/210mm 297mm no-repeat;opacity:.16;z-index:-1;pointer-events:none}
.dg-document .dg-header{position:absolute;top:12mm;left:20mm;right:20mm;height:10mm;display:flex;gap:4mm;align-items:center;color:#68748a;font-size:7pt;line-height:1.3;text-transform:uppercase;letter-spacing:.02em}
.dg-document .dg-header span:first-child{max-width:120mm;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dg-document .dg-header-rule{height:0;flex:1;border-top:1px dotted #bcc5d3}
.dg-document .dg-header img{width:14mm;height:11mm;object-fit:contain}
.dg-document .dg-organization{font-weight:700;color:var(--dg-primary);font-size:9pt;white-space:nowrap}
.dg-document .dg-footer{position:absolute;bottom:12mm;left:0;right:20mm;height:9mm;display:flex;align-items:center;justify-content:space-between;color:#68748a;font-size:7pt;line-height:1.3}
.dg-document .dg-page-number{background:var(--dg-primary);color:#fff;font-weight:700;padding:2mm 5mm 2mm 5mm;min-width:20mm;clip-path:polygon(0 0,83% 0,100% 50%,83% 100%,0 100%)}
.dg-document .dg-footer-label{max-width:125mm;text-align:right;overflow-wrap:anywhere;max-height:10mm;overflow:hidden;white-space:pre-line}
.dg-document .dg-body{height:242mm;width:170mm;display:flow-root;position:relative;font-size:var(--dg-body-size);line-height:1.55;overflow:visible}
.dg-document .dg-block{margin:0 0 3.5mm;padding:0;overflow-wrap:anywhere;white-space:pre-wrap;max-width:100%;cursor:inherit;border:0;font-size:inherit;line-height:inherit;letter-spacing:normal;box-shadow:none;background:none;color:inherit}
.dg-document .dg-heading{font-weight:700;line-height:1.25;break-after:avoid;color:var(--dg-primary);margin:4mm 0 3mm}
.dg-document .dg-heading-l1{font-size:22pt;text-transform:none;margin-top:0;border-left:3px solid var(--dg-accent);padding-left:3mm}
.dg-document .dg-heading-l2{font-size:14pt;color:var(--dg-accent)}
.dg-document .dg-heading-l3,.dg-document .dg-heading-l4,.dg-document .dg-heading-l5,.dg-document .dg-heading-l6{font-size:12pt}
.dg-document .dg-paragraph{text-align:justify;text-justify:inter-word}
.dg-document .dg-list{padding-left:5mm;border-left:2px solid #e4e8ef;text-align:left}
.dg-document .dg-callout{padding:4mm 5mm;background:#f2f5f9;border-left:3px solid var(--dg-accent);font-size:10.5pt;line-height:1.55;border-radius:0 3mm 3mm 0}
.dg-document .dg-component-title{font-weight:700;color:var(--dg-primary);font-size:14pt;line-height:1.3;margin:0 0 3mm;white-space:pre-wrap;overflow-wrap:anywhere}
.dg-document .dg-cards-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4mm;margin:0 0 4mm}
.dg-document .dg-cards-row .dg-card{margin-bottom:0}
.dg-document .dg-card{background:#f3f6fa;border:1px solid #e0e6ef;border-top:3px solid var(--dg-accent);padding:4mm 5mm;border-radius:2mm;white-space:pre-wrap;overflow-wrap:anywhere;margin:0 0 4mm}
.dg-document .dg-card-title{font-weight:700;color:var(--dg-primary);font-size:11pt;line-height:1.35;margin-bottom:2mm;white-space:pre-wrap}
.dg-document .dg-card-text{font-size:10.5pt;line-height:1.55;white-space:pre-wrap}
.dg-document .dg-step{position:relative;display:grid;grid-template-columns:9mm 1fr;gap:4mm;margin:0 0 4mm;padding:4mm;border:1px solid #dde5ef;border-radius:2mm;background:#fff}
.dg-document .dg-step:not(.dg-step-last):after{content:'↓';position:absolute;bottom:-4.5mm;left:7mm;font-size:11pt;line-height:4mm;color:var(--dg-accent)}
.dg-document .dg-step-number{width:8mm;height:8mm;border-radius:50%;background:var(--dg-primary);color:#fff;text-align:center;line-height:8mm;font-size:10pt;font-weight:700}
.dg-document .dg-step-content{min-width:0}
.dg-document .dg-table{width:100%;border-collapse:collapse;table-layout:fixed;margin:0 0 4mm;color:#293444;background:#fff;font-size:9pt;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere}
.dg-document .dg-table th,.dg-document .dg-table td{vertical-align:top;border:1px solid #d6dfea;padding:2.5mm;white-space:pre-wrap;overflow-wrap:anywhere;font-weight:400;text-align:left;font-size:inherit;line-height:inherit}
.dg-document .dg-table th{background:var(--dg-primary);color:#fff;font-weight:700}
.dg-document .dg-table tr:nth-child(even) td{background:#f5f7fa}
.dg-document .dg-figure{margin:0 0 4mm;break-inside:avoid}
.dg-document .dg-figure img{display:block;max-width:100%;width:auto;max-height:174mm;height:auto;object-fit:contain;margin:auto}
.dg-document .dg-caption{font-size:9pt;line-height:1.45;color:#68748a;white-space:pre-wrap;overflow-wrap:anywhere;margin-top:2mm}
.dg-document .dg-cover{background-color:var(--dg-primary);color:#fff;padding:26mm 22mm;display:flex;flex-direction:column;justify-content:space-between}
.dg-document .dg-cover:before{content:'';position:absolute;inset:0;background:var(--dg-primary);opacity:.92;z-index:-1}
.dg-document .dg-cover-brand{display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:14pt;letter-spacing:.02em}
.dg-document .dg-cover-logo{width:45mm;height:28mm;object-fit:contain;background:#fff;border-radius:1mm;padding:3mm}
.dg-document .dg-cover-main{border-left:2mm solid var(--dg-accent);padding-left:7mm;margin:12mm 0;max-height:none;overflow:visible}
.dg-document .dg-cover-title{font-size:32pt;font-weight:700;line-height:1.14;letter-spacing:-.025em;margin:0 0 8mm;color:#fff;overflow-wrap:anywhere;white-space:pre-wrap}
.dg-document .dg-cover-subtitle{font-size:14pt;line-height:1.5;color:#e9eef6;overflow-wrap:anywhere;white-space:pre-wrap;margin:0}
.dg-document .dg-cover-author{font-size:10pt;line-height:1.5;color:#e9eef6;overflow-wrap:anywhere;white-space:pre-wrap}
.dg-document .dg-toc-title{color:var(--dg-primary);font-size:24pt;line-height:1.25;font-weight:700;border-left:3px solid var(--dg-accent);padding-left:3mm;margin:0 0 8mm}
.dg-document .dg-toc-row{display:flex;align-items:baseline;gap:3mm;padding:2mm 0;border-bottom:1px dotted #c5cfdd;text-decoration:none;color:#35465e;font-size:10pt;line-height:1.45;break-inside:avoid}
.dg-document .dg-toc-level-2{padding-left:4mm;font-size:9.5pt}
.dg-document .dg-toc-row span:first-child{flex:1;white-space:pre-wrap;overflow-wrap:anywhere}
.dg-document .dg-toc-row span:last-child{font-variant-numeric:tabular-nums;font-weight:700;color:var(--dg-primary)}
.dg-document .dg-selected{outline:2px solid #1fa5b5;outline-offset:3px;cursor:text}
.dg-document[data-interactive] [data-block-id]:hover{outline:1px dashed #1fa5b5;outline-offset:2px}
.dg-document .dg-empty{color:#7c889a;text-align:center;padding:30mm 0;font-size:11pt;line-height:1.6}
@page{size:A4;margin:0}
@media print{html,body{margin:0!important;padding:0!important;background:#fff!important}.dg-document .document-page{margin:0;box-shadow:none;break-after:page}.dg-document .document-page:last-child{break-after:auto}.dg-document .dg-selected{outline:none}.dg-document{print-color-adjust:exact;-webkit-print-color-adjust:exact}}
`;

/** Infographics share the institutional palette and remain selectable native elements. */
export const diagramCss=String.raw`
.dg-document{counter-reset:dg-infographic}
.dg-document .dg-component-heading{font-size:20pt!important;color:var(--dg-primary)!important;border:0!important;padding-left:0!important;margin-top:5mm!important;margin-bottom:4mm!important;line-height:1.22}
.dg-document .dg-component-heading:before{counter-increment:dg-infographic;content:'INFOGRÁFICO ' counter(dg-infographic);display:block;font-size:8pt;letter-spacing:.04em;border-left:2px solid var(--dg-accent);padding-left:2mm;margin-bottom:3mm;line-height:1.2}
.dg-document .dg-diagram{position:relative;margin:0 0 5mm;padding:4.5mm;background:#f1f4fa;border:1px solid #d6dfec;border-radius:4mm;break-inside:avoid;overflow:visible}
.dg-document .dg-diagram-canvas{position:relative;margin:0 auto}
.dg-document .dg-diagram-node{position:absolute;display:flex;gap:3mm;align-items:flex-start;padding:4mm;background:#fff;border:1px solid #d4dce8;border-radius:2.5mm;box-shadow:0 1px 1px #18336408;z-index:2;min-height:14mm}
.dg-document .dg-diagram-number{display:block;flex-shrink:0;width:6.5mm;height:6.5mm;background:var(--dg-primary);color:#fff;border-radius:50%;text-align:center;line-height:6.5mm;font-size:9pt;font-weight:700}
.dg-document .dg-diagram-node-content{min-width:0;flex:1}
.dg-document .dg-diagram-label{font-size:11pt;font-weight:700;color:var(--dg-primary);line-height:1.3;white-space:pre-wrap;overflow-wrap:anywhere}
.dg-document .dg-diagram-detail{font-size:10.3pt;line-height:1.45;margin-top:1.8mm;white-space:pre-wrap;overflow-wrap:anywhere;color:#4d5b71}
.dg-document .dg-diagram-connections{position:absolute;inset:0;color:var(--dg-primary);z-index:1;overflow:visible}
.dg-document .dg-edge-label{position:absolute;z-index:3;max-width:32mm;padding:.5mm 1mm;background:#f1f4fa;color:var(--dg-primary);font-weight:700;font-size:8.5pt;line-height:1.2;text-align:center;transform:translate(-50%,-50%);white-space:pre-wrap;overflow-wrap:anywhere}
.dg-document .dg-diagram-node:last-child{border-bottom:2px solid var(--dg-accent)}
.dg-document .dg-diagram[data-layout="timeline"] .dg-diagram-node{border-left:3px solid var(--dg-accent)}
.dg-document .dg-diagram[data-layout="hierarchy"] .dg-diagram-node{border-top:3px solid var(--dg-accent)}
.dg-document .dg-cover-eyebrow{font-size:8pt;letter-spacing:.15em;font-weight:700;color:var(--dg-accent);margin-bottom:7mm}
.dg-document .dg-cover-brand{font-size:13pt}
.dg-document .dg-cover-standard{background-size:210mm 297mm;background-position:center;background-repeat:no-repeat}
.dg-document .dg-cover-standard:before{display:none}
.dg-document .dg-cover-standard .dg-cover-brand,.dg-document .dg-cover-standard .dg-cover-eyebrow{display:none}
.dg-document .dg-cover-standard .dg-cover-main{position:absolute;left:20mm;right:20mm;top:48mm;height:72mm;max-height:72mm;margin:0!important;padding:0;border:0;display:flex;flex-direction:column;justify-content:center;text-align:center}
.dg-document .dg-cover-standard .dg-cover-title{font-size:38pt;line-height:1.12;margin-bottom:5mm;letter-spacing:-.025em}
.dg-document .dg-cover-standard .dg-cover-subtitle{font-size:12pt;line-height:1.4;max-width:none}
.dg-document .dg-cover-standard .dg-cover-author{position:absolute;left:20mm;right:20mm;bottom:7mm;font-size:8pt;text-align:center;color:#fff;text-shadow:0 1px 3px #000}

.dg-document .dg-cover-main{margin:18mm 0}
.dg-document .dg-cover-title{font-size:34pt;line-height:1.13;letter-spacing:-.03em}
.dg-document .dg-cover-subtitle{max-width:148mm}
.dg-document .dg-heading-l1{font-size:22pt;letter-spacing:-.025em}
.dg-document .dg-heading-l2{font-size:14pt;line-height:1.35}
.dg-document .dg-paragraph{line-height:1.58}
.dg-document .dg-callout{border-radius:2.5mm;border:1px solid #d5dfec;border-left:3px solid var(--dg-accent);background:#f2f5fa;padding:4.5mm 5mm}
.dg-document .dg-card{border-top:0;border-left:3px solid var(--dg-accent);border-radius:2.5mm;background:#f3f6fb}
.dg-document .dg-table{font-size:9.3pt;line-height:1.5}
.dg-document .dg-table th{padding:3mm;font-size:9.4pt}
.dg-document .dg-table td{padding:3mm}
`;
