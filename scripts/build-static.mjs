// Builds the figures that only change when you edit them: the hero and the stack diagram.
// Run: node scripts/build-static.mjs
// Edit the CONTENT block, rerun, commit assets/*.svg.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, THEMES, svgDoc, esc, measure, wrap, r1 } from './lib/design.mjs';

const CONTENT = {
  first: 'David',
  last: 'Beltrán',
  role: 'AI product engineer and technical founder.',
  pitch: 'I build products where AI chooses the next action, running on serverless systems that scale.',
  loopCenter: ['AI design', 'for action'],
  loop: ['listen', 'reason', 'decide', 'act', 'learn'],
};

// ------------------------------------------------------------------ hero
function hero(t) {
  const W = 1000, H = 404;
  const cx = 772, cy = 200, R = 124;
  const C = 2 * Math.PI * R;
  const T = 10; // seconds per lap
  const loopPath = `M${cx} ${cy - R}a${R} ${R} 0 1 1 0 ${2 * R}a${R} ${R} 0 1 1 0 ${-2 * R}`;

  const nodes = CONTENT.loop.map((label, i) => {
    const a = ((-90 + (360 / CONTENT.loop.length) * i) * Math.PI) / 180;
    const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
    const lx = cx + (R + 22) * Math.cos(a), ly = cy + (R + 22) * Math.sin(a);
    const anchor = Math.abs(lx - cx) < 8 ? 'middle' : lx > cx ? 'start' : 'end';
    const dy = Math.abs(lx - cx) < 8 ? (ly < cy ? -2 : 14) : 6;
    const p = i / CONTENT.loop.length;
    // flash when the spark arrives
    const kt = i === 0 ? '0;0.14;0.97;1' : `0;${r1((p - 0.02) * 1000) / 1000};${p};${r1((p + 0.14) * 1000) / 1000};1`;
    const halo = i === 0 ? '1;0;0;1' : '0;0;1;0;0';
    const lab = i === 0 ? '1;0.62;0.62;1' : '0.62;0.62;1;0.62;0.62';
    return `
  <g>
    <circle cx="${r1(x)}" cy="${r1(y)}" r="15" fill="${t.spark}" opacity="0">
      <animate attributeName="opacity" values="${halo.replace(/1/g, '0.32')}" keyTimes="${kt}" dur="${T}s" repeatCount="indefinite"/>
    </circle>
    <circle cx="${r1(x)}" cy="${r1(y)}" r="5" fill="${t.fieldSoft}"/>
    <text x="${r1(lx)}" y="${r1(ly + dy)}" text-anchor="${anchor}" font-size="17" fill="${t.fieldInk}" opacity="0.62">${esc(label)}
      <animate attributeName="opacity" values="${lab}" keyTimes="${kt}" dur="${T}s" repeatCount="indefinite"/>
    </text>
  </g>`;
  });

  const nameSize = 112;
  const nameW = Math.max(measure(CONTENT.first, nameSize, 800, -0.04), measure(CONTENT.last, nameSize, 800, -0.04));
  if (nameW > 520) console.warn(`hero: name is ${Math.round(nameW)}px wide, may crowd the loop`);

  const pitch = wrap(CONTENT.pitch, 18, 400, 470);
  const pitchSvg = pitch
    .map((l, i) => `<text x="56" y="${334 + i * 27}" font-size="18" fill="${t.fieldSoft}">${esc(l)}</text>`)
    .join('\n  ');

  const body = `
<defs>
  <clipPath id="field"><rect width="${W}" height="${H}" rx="22"/></clipPath>
  <radialGradient id="glow" cx="${cx}" cy="${cy}" r="420" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.12"/>
    <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
  </radialGradient>
  <filter id="bloom" x="-200%" y="-200%" width="500%" height="500%">
    <feGaussianBlur stdDeviation="5" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <path id="loop" d="${loopPath}"/>
</defs>
<g clip-path="url(#field)">
  <rect width="${W}" height="${H}" fill="${t.field}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${[176, 232, 292, 356, 424]
    .map((r, i) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${t.fieldInk}" stroke-opacity="${(0.09 - i * 0.015).toFixed(3)}"/>`)
    .join('\n  ')}
</g>

<text x="52" y="146" font-size="${nameSize}" font-weight="800" letter-spacing="-0.04em" fill="${t.fieldInk}">${esc(CONTENT.first)}</text>
<text x="52" y="250" font-size="${nameSize}" font-weight="800" letter-spacing="-0.04em" fill="${t.fieldInk}">${esc(CONTENT.last)}</text>
<text x="56" y="304" font-size="20" font-weight="700" fill="${t.fieldInk}">${esc(CONTENT.role)}</text>
  ${pitchSvg}

<use href="#loop" fill="none" stroke="${t.fieldInk}" stroke-opacity="0.24" stroke-width="1.5"/>
<use href="#loop" fill="none" stroke="${t.spark}" stroke-opacity="0.55" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="70 ${r1(C - 70)}">
  <animate attributeName="stroke-dashoffset" values="70;${r1(70 - C)}" dur="${T}s" repeatCount="indefinite"/>
</use>
${nodes.join('')}
<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="25" font-weight="700" fill="${t.fieldInk}">${esc(CONTENT.loopCenter[0])}</text>
<text x="${cx}" y="${cy + 26}" text-anchor="middle" font-size="25" font-weight="700" fill="${t.fieldInk}">${esc(CONTENT.loopCenter[1])}</text>
<circle r="6" fill="${t.spark}" filter="url(#bloom)">
  <animateMotion dur="${T}s" repeatCount="indefinite" rotate="0"><mpath href="#loop"/></animateMotion>
</circle>`;

  return svgDoc({
    width: W,
    height: H,
    weights: [400, 700, 800],
    title: `${CONTENT.first} ${CONTENT.last}: ${CONTENT.role}`,
    desc: `${CONTENT.pitch} A spark travels a loop: ${CONTENT.loop.join(', ')}.`,
    body,
  });
}

// ------------------------------------------------------------------ stack
function stack(t) {
  const W = 1000, H = 568;
  const box = (x, y, w, h, name, sub, focus = false) => `
  <g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${t.page}" stroke="${focus ? t.accent : t.hair}" stroke-width="${focus ? 1.75 : 1.25}"/>
    <text x="${x + 14}" y="${y + (sub ? h / 2 - 2 : h / 2 + 5)}" font-size="16" font-weight="700" fill="${focus ? t.accent : t.ink}">${esc(name)}</text>
    ${sub ? `<text x="${x + 14}" y="${y + h / 2 + 16}" font-size="13.5" fill="${t.slate}">${esc(sub)}</text>` : ''}
  </g>`;

  // overflow guard: warn if a label won't fit its box
  const nodes = [
    [40, 152, 150, 46, 'Next.js, React', 'web'],
    [40, 204, 150, 46, 'Flutter', 'mobile'],
    [250, 172, 180, 56, 'API Gateway', 'Route 53, REST, GraphQL'],
    [490, 172, 210, 56, 'AWS Lambda', 'Node.js, TypeScript, Python'],
    [760, 152, 200, 46, 'DynamoDB', 'NoSQL'],
    [760, 204, 200, 46, 'RDS', 'relational'],
    [250, 362, 180, 56, 'Amazon SQS', 'event queue'],
    [490, 362, 210, 56, 'Agent workers', 'LangGraph, LangChain', true],
    [760, 342, 200, 46, 'OpenAI APIs', 'hosted models'],
    [760, 394, 200, 46, 'Fine-tuned models', 'LoRA SFT, DPO'],
    [490, 452, 210, 46, 'MCP servers, RAG', 'tools and context'],
  ];
  for (const [, , w, , n, s] of nodes) {
    if (measure(n, 16, 700) > w - 24 || measure(s, 13.5, 400) > w - 24) console.warn(`stack: "${n}" overflows`);
  }

  const edges = [
    'M190 175 C220 175 220 200 247 200',
    'M190 227 C220 227 220 200 247 200',
    'M430 200 L487 200',
    'M700 200 C730 200 730 175 757 175',
    'M700 200 C730 200 730 227 757 227',
    'M595 228 C595 300 340 290 340 359',
    'M430 390 L487 390',
    'M700 390 C730 390 730 365 757 365',
    'M700 390 C730 390 730 417 757 417',
  ];
  const lane = (y, label) => {
    const w = measure(label, 14.5, 700);
    return `<text x="40" y="${y}" font-size="14.5" font-weight="700" fill="${t.slate}">${esc(label)}</text>
  <line x1="${r1(40 + w + 14)}" y1="${y - 4.5}" x2="960" y2="${y - 4.5}" stroke="${t.hair}"/>`;
  };
  const caption = wrap('Long or slow work leaves the request and runs on agents in the background.', 14.5, 400, 194)
    .map((l, i) => `<text x="40" y="${370 + i * 21}" font-size="14.5" fill="${t.slate}">${esc(l)}</text>`)
    .join('\n  ');

  const req = 'M115 175 C200 175 220 200 340 200 L595 200 C730 200 730 175 860 175';
  const evt = 'M595 200 L595 228 C595 300 340 290 340 362 L340 390 L595 390 C730 390 730 365 860 365';

  const body = `
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M1 1.5 L7 5 L1 8.5" fill="none" stroke="${t.faint}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
  </marker>
  <path id="req" d="${req}"/><path id="evt" d="${evt}"/>
</defs>
<text x="40" y="44" font-size="27" font-weight="800" letter-spacing="-0.02em" fill="${t.ink}">My stack, wired the way I ship it</text>
<text x="40" y="74" font-size="17" fill="${t.slate}">A serverless, event-driven baseline I reuse from one product to the next.</text>

${lane(126, 'Request path')}
${lane(318, 'Event path')}
  ${caption}

<g fill="none" stroke="${t.faint}" stroke-width="1.25" marker-end="url(#arrow)">
  ${edges.map((d) => `<path d="${d}"/>`).join('\n  ')}
  <path d="M595 421 L595 449" marker-start="url(#arrow)"/>
</g>

<circle r="5" fill="${t.accent}" stroke="${t.page}" stroke-width="2">
  <animateMotion dur="6s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;0.5;1" calcMode="linear"><mpath href="#req"/></animateMotion>
</circle>
<circle r="5" fill="${t.accent}" stroke="${t.page}" stroke-width="2" opacity="0">
  <set attributeName="opacity" to="1" begin="1.9s"/>
  <animateMotion dur="6s" begin="1.9s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;0.6;1" calcMode="linear"><mpath href="#evt"/></animateMotion>
</circle>
${nodes.map((n) => box(...n)).join('')}

<text x="40" y="548" font-size="15.5" fill="${t.slate}">Packaged with Docker, shipped through CI/CD pipelines, running on Linux and Kubernetes.</text>`;

  return svgDoc({
    width: W,
    height: H,
    weights: [400, 700, 800],
    title: 'My stack, wired the way I ship it',
    desc:
      'Request path: Next.js, React and Flutter clients call API Gateway (Route 53, REST, GraphQL), which runs AWS Lambda functions in Node.js, TypeScript and Python that read and write DynamoDB and RDS. ' +
      'Event path: Lambda pushes slow work to Amazon SQS, consumed by agent workers built with LangGraph and LangChain, using MCP servers and RAG for tools and context, and calling OpenAI APIs and fine-tuned models (LoRA SFT, DPO). ' +
      'Packaged with Docker, shipped through CI/CD, running on Linux and Kubernetes.',
    body,
  });
}

for (const t of Object.values(THEMES)) {
  writeFileSync(join(ROOT, 'assets', `hero-${t.name}.svg`), hero(t));
  writeFileSync(join(ROOT, 'assets', `stack-${t.name}.svg`), stack(t));
}
console.log('built hero + stack (light, dark)');
