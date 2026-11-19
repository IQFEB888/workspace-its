/**
 * Study & Productivity Pure Utilities (Workspace ITS v3.7.0)
 * - Drag & Drop Note Tab Reordering
 * - Instant Local Flashcard & Quiz Generator (from Note HTML)
 * - Hierarchical Mind Map Tree Extractor (from Note HTML)
 * - Lecture Voice Transcript Structurer
 * - Publication-Grade Dispensa Exporter (PDF Print HTML, Word .doc, Markdown .md with Auto-TOC)
 */

export interface StudyFlashcard {
  id: string;
  front: string;
  back: string;
  tag: string;
  status: 'unseen' | 'known' | 'review';
}

export interface StudyQuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  tag: string;
}

export interface StudyHistorySession {
  id: string;
  mode: 'flashcards' | 'quiz';
  subjectName: string;
  title: string;
  pageIds: string[];
  pageNames: string[];
  createdAt: string;
  modelLabel: string;
  cards: StudyFlashcard[];
  quizQuestions: StudyQuizQuestion[];
  selectedAnswers: Record<string, number>;
}

export interface MindMapNode {
  id: string;
  label: string;
  detail?: string;
  level: number;
  kind: 'root' | 'heading' | 'concept' | 'code' | 'formula';
  children: MindMapNode[];
}

export interface DispensaExportOptions {
  subjectName: string;
  authorName?: string;
  pages: Array<{ id: string; name: string; content: string }>;
  includeCover: boolean;
  includeToc: boolean;
  theme: 'academic-light' | 'modern-indigo' | 'dark-tech';
  generatedDate?: string;
}

// ============================================================================
// 1. DRAG & DROP NOTE TAB REORDERING
// ============================================================================

export function reorderPagesList<T extends { id: string; order?: number }>(
  pages: T[],
  fromIndex: number,
  toIndex: number
): T[] {
  if (!Array.isArray(pages) || pages.length <= 1) return [...pages];
  if (
    fromIndex < 0 ||
    fromIndex >= pages.length ||
    toIndex < 0 ||
    toIndex >= pages.length ||
    fromIndex === toIndex
  ) {
    return pages.map((p, idx) => ({ ...p, order: idx }));
  }

  const next = [...pages];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next.map((p, idx) => ({ ...p, order: idx }));
}

// ============================================================================
// SHARED HTML TEXT HELPERS (Works in both Browser & Node unit tests)
// ============================================================================

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

export function stripHtmlTags(html: string): string {
  if (!html) return '';
  return decodeHtmlEntities(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface ParsedNoteSection {
  title: string;
  level: number;
  bullets: string[];
  paragraphs: string[];
  boldTerms: Array<{ term: string; context: string }>;
  codeBlocks: Array<{ lang: string; code: string }>;
  formulas: string[];
}

function parseNoteHtmlToSections(html: string, fallbackTitle: string): ParsedNoteSection[] {
  const sections: ParsedNoteSection[] = [];
  let current: ParsedNoteSection = {
    title: fallbackTitle || 'Concetti Principali',
    level: 1,
    bullets: [],
    paragraphs: [],
    boldTerms: [],
    codeBlocks: [],
    formulas: []
  };
  sections.push(current);

  if (!html || !html.trim()) return sections;

  // Extract code blocks first (storing raw code from data-raw or inner pre)
  const codeBlockRegex = /<div[^>]*class="[^"]*note-code-block[^"]*"[^>]*>[\s\S]*?<\/div>\s*(?:<\/div>)?/gi;
  let codeMatch: RegExpExecArray | null;
  while ((codeMatch = codeBlockRegex.exec(html)) !== null) {
    const block = codeMatch[0];
    const langMatch = block.match(/data-lang="([^"]+)"/i);
    const rawMatch = block.match(/data-raw="([^"]+)"/i);
    const codeText = rawMatch
      ? decodeURIComponent(rawMatch[1])
      : stripHtmlTags(block.replace(/<div[^>]*class="[^"]*note-code-header[^"]*"[\s\S]*?<\/div>/gi, ''));
    if (codeText.trim()) {
      current.codeBlocks.push({
        lang: (langMatch?.[1] || 'code').toUpperCase(),
        code: codeText.trim()
      });
    }
  }

  // Extract formula boxes
  const formulaRegex = /<div[^>]*class="[^"]*note-formula-box[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
  let fMatch: RegExpExecArray | null;
  while ((fMatch = formulaRegex.exec(html)) !== null) {
    const exprMatch = fMatch[0].match(/data-expr="([^"]+)"/i);
    const fText = exprMatch ? decodeURIComponent(exprMatch[1]) : stripHtmlTags(fMatch[1]);
    if (fText.trim()) current.formulas.push(fText.trim());
  }

  // Tokenize headings, list items, paragraphs, and blockquotes in document order
  const blockTokenRegex =
    /<(h[1-4]|li|p|blockquote|div)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;

  while ((match = blockTokenRegex.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const inner = match[2];
    if (
      tag === 'div' &&
      (inner.includes('<h1') ||
        inner.includes('<h2') ||
        inner.includes('<p') ||
        inner.includes('<ul') ||
        match[0].includes('note-code-block') ||
        match[0].includes('note-formula-box'))
    ) {
      continue;
    }

    const plain = stripHtmlTags(inner).replace(/\s+/g, ' ').trim();
    if (!plain || plain.length < 3) continue;

    if (tag.startsWith('h')) {
      const level = parseInt(tag[1], 10) || 2;
      current = {
        title: plain,
        level,
        bullets: [],
        paragraphs: [],
        boldTerms: [],
        codeBlocks: [],
        formulas: []
      };
      sections.push(current);
    } else if (tag === 'li') {
      current.bullets.push(plain);
      const bMatch = inner.match(/<(?:b|strong)[^>]*>([\s\S]*?)<\/(?:b|strong)>/i);
      if (bMatch) {
        const term = stripHtmlTags(bMatch[1]).replace(/[:\-–]+$/, '').trim();
        if (term.length >= 2 && plain.length > term.length + 6) {
          current.boldTerms.push({ term, context: plain });
        }
      }
    } else {
      current.paragraphs.push(plain);
      const bMatch = inner.match(/<(?:b|strong)[^>]*>([\s\S]*?)<\/(?:b|strong)>/i);
      if (bMatch) {
        const term = stripHtmlTags(bMatch[1]).replace(/[:\-–]+$/, '').trim();
        if (term.length >= 2 && plain.length > term.length + 8) {
          current.boldTerms.push({ term, context: plain });
        }
      }
    }
  }

  // Also fallback to raw lines if user typed plain text without block tags
  const totalItems = sections.reduce(
    (acc, s) => acc + s.bullets.length + s.paragraphs.length + s.codeBlocks.length + s.formulas.length,
    0
  );
  if (totalItems === 0) {
    const plainLines = stripHtmlTags(html)
      .split(/\n+/)
      .map(l => l.trim())
      .filter(l => l.length >= 5);
    plainLines.forEach(line => current.paragraphs.push(line));
  }

  return sections.filter(
    (s, idx) =>
      idx === 0 ||
      s.title.length > 0 ||
      s.bullets.length > 0 ||
      s.paragraphs.length > 0 ||
      s.codeBlocks.length > 0 ||
      s.formulas.length > 0
  );
}

// ============================================================================
// 2. INSTANT LOCAL FLASHCARD & QUIZ GENERATOR (FEATURE #1)
// ============================================================================

export function generateFlashcardsFromHtml(
  html: string,
  subjectName: string,
  pageTitle?: string
): StudyFlashcard[] {
  const sections = parseNoteHtmlToSections(html, pageTitle || subjectName);
  const cards: StudyFlashcard[] = [];
  const seenFronts = new Set<string>();

  const pushCard = (front: string, back: string, tag: string) => {
    const cleanFront = front.trim();
    const cleanBack = back.trim();
    if (!cleanFront || !cleanBack || cleanBack.length < 4) return;
    const key = cleanFront.toLowerCase();
    if (seenFronts.has(key)) return;
    seenFronts.add(key);
    cards.push({
      id: `fc_${cards.length + 1}_${Math.abs(key.split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7))}`,
      front: cleanFront,
      back: cleanBack,
      tag: tag || subjectName,
      status: 'unseen'
    });
  };

  for (const sec of sections) {
    // 1. Colon-separated definitions in bullets or paragraphs ("Term: explanation")
    const allLines = [...sec.bullets, ...sec.paragraphs];
    for (const line of allLines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 2 && colonIdx < 68 && line.length - colonIdx > 10) {
        const term = line.slice(0, colonIdx).replace(/^[-•*]\s*/, '').trim();
        const def = line.slice(colonIdx + 1).trim();
        if (term.split(/\s+/).length <= 8) {
          pushCard(`Cos'è o cosa indica "${term}"?`, def, sec.title);
          continue;
        }
      }
    }

    // 2. Bold term definitions
    for (const bt of sec.boldTerms) {
      const def = bt.context.replace(bt.term, '').replace(/^[\s:\-–]+/, '').trim();
      if (def.length >= 8) {
        pushCard(`Spiega il concetto chiave: ${bt.term}`, def, sec.title);
      }
    }

    // 3. Section summary cards (Heading -> Bullets/Paragraphs)
    if (sec.title && (sec.bullets.length > 0 || sec.paragraphs.length > 0)) {
      const summaryBody =
        sec.bullets.length > 0
          ? sec.bullets.slice(0, 4).map(b => `• ${b}`).join('\n')
          : sec.paragraphs.slice(0, 2).join('\n');
      if (summaryBody.length >= 12) {
        pushCard(`Quali sono i punti chiave di "${sec.title}"?`, summaryBody, subjectName);
      }
    }

    // 4. Code block cards
    for (const cb of sec.codeBlocks) {
      const firstLine = cb.code.split('\n')[0].slice(0, 64);
      pushCard(
        `Analisi Codice (${cb.lang}): cosa fa questo snippet?\n${firstLine}`,
        cb.code.slice(0, 320),
        `Codice ${cb.lang}`
      );
    }

    // 5. Formula cards
    for (const fm of sec.formulas) {
      pushCard(`Formula chiave (${sec.title})`, fm, 'Formula');
    }
  }

  // 6. Sentence-level concept cards if structured rules yielded fewer than 2 cards
  if (cards.length < 2) {
    const rawLines = stripHtmlTags(html)
      .split(/\n+/)
      .map(l => l.trim())
      .filter(l => l.length >= 12);

    rawLines.slice(0, 8).forEach((line, idx) => {
      const words = line.split(/\s+/);
      if (words.length >= 4) {
        const cue = words.slice(0, Math.min(4, Math.max(2, Math.floor(words.length / 3)))).join(' ');
        pushCard(
          `Completa o spiega il concetto (#${idx + 1}): "${cue}..."`,
          line,
          pageTitle || subjectName
        );
      }
    });
  }

  // Fallback if the note is very short
  if (cards.length === 0) {
    const raw = stripHtmlTags(html);
    if (raw.length >= 4) {
      pushCard(
        `Riassumi il contenuto principale di "${pageTitle || subjectName}"`,
        raw.slice(0, 280),
        subjectName
      );
    }
  }

  return cards.slice(0, 24);
}

export function generateQuizFromHtml(
  html: string,
  subjectName: string,
  pageTitle?: string
): StudyQuizQuestion[] {
  const cards = generateFlashcardsFromHtml(html, subjectName, pageTitle);
  if (cards.length === 0) return [];

  const fallbackDistractors = [
    'È una direttiva di sistema utilizzata esclusivamente per la gestione hardware.',
    'Serve solo per la formattazione grafica statica e non influisce sulla logica.',
    'È una configurazione deprecata sostituita interamente dai file di log.',
    'Indica un protocollo di rete locale non collegato agli argomenti della lezione.'
  ];

  const questions: StudyQuizQuestion[] = [];

  cards.slice(0, 12).forEach((card, idx) => {
    const correctAnswer = card.back.replace(/\n+/g, ' — ').slice(0, 175);
    const otherAnswers = cards
      .filter((_, oIdx) => oIdx !== idx)
      .map(c => c.back.replace(/\n+/g, ' — ').slice(0, 175))
      .filter(ans => ans.toLowerCase() !== correctAnswer.toLowerCase());

    const distractors: string[] = [];
    for (const cand of otherAnswers) {
      if (distractors.length >= 3) break;
      if (!distractors.includes(cand)) distractors.push(cand);
    }
    let fbIdx = 0;
    while (distractors.length < 3 && fbIdx < fallbackDistractors.length) {
      const fb = fallbackDistractors[(idx + fbIdx) % fallbackDistractors.length];
      if (!distractors.includes(fb)) distractors.push(fb);
      fbIdx++;
    }

    // Deterministic rotation based on question index so answers aren't always option A
    const options = [...distractors];
    const correctIndex = (idx * 3 + 1) % (options.length + 1);
    options.splice(correctIndex, 0, correctAnswer);

    questions.push({
      id: `q_${idx + 1}`,
      question: card.front,
      options,
      correctIndex,
      explanation: `Risposta dagli appunti (${card.tag}): ${correctAnswer}`,
      tag: card.tag
    });
  });

  return questions;
}

// ============================================================================
// 3. INTERACTIVE MIND MAP TREE EXTRACTOR (FEATURE #2)
// ============================================================================

export function extractMindMapTreeFromHtml(html: string, rootTitle: string): MindMapNode {
  const root: MindMapNode = {
    id: 'mm_root',
    label: rootTitle || 'Mappa Concettuale',
    level: 0,
    kind: 'root',
    children: []
  };

  const sections = parseNoteHtmlToSections(html, rootTitle);
  let nodeCounter = 1;

  sections.forEach((sec, sIdx) => {
    const isImplicitRoot = sIdx === 0 && sec.title === rootTitle;
    const parentNode: MindMapNode = isImplicitRoot
      ? root
      : {
          id: `mm_sec_${nodeCounter++}`,
          label: sec.title.slice(0, 56),
          detail: sec.paragraphs[0] || sec.bullets[0] || sec.title,
          level: 1,
          kind: 'heading',
          children: []
        };

    if (!isImplicitRoot) {
      root.children.push(parentNode);
    }

    // Add bullets as child concept nodes
    sec.bullets.slice(0, 7).forEach(bullet => {
      const colonIdx = bullet.indexOf(':');
      const shortLabel =
        colonIdx > 2 && colonIdx < 42 ? bullet.slice(0, colonIdx).trim() : bullet.slice(0, 44);
      parentNode.children.push({
        id: `mm_b_${nodeCounter++}`,
        label: shortLabel + (shortLabel.length < bullet.length && colonIdx === -1 ? '…' : ''),
        detail: bullet,
        level: parentNode.level + 1,
        kind: 'concept',
        children: []
      });
    });

    // Add key paragraphs if few bullets
    if (sec.bullets.length < 2) {
      sec.paragraphs.slice(0, 3).forEach(para => {
        const sentence = para.split(/[.!?]/)[0]?.trim() || para;
        parentNode.children.push({
          id: `mm_p_${nodeCounter++}`,
          label: sentence.slice(0, 46) + (sentence.length > 46 ? '…' : ''),
          detail: para,
          level: parentNode.level + 1,
          kind: 'concept',
          children: []
        });
      });
    }

    // Add code blocks & formulas as special styled branches
    sec.codeBlocks.slice(0, 3).forEach(cb => {
      parentNode.children.push({
        id: `mm_c_${nodeCounter++}`,
        label: `💻 ${cb.lang}: ${cb.code.split('\n')[0].slice(0, 28)}`,
        detail: cb.code,
        level: parentNode.level + 1,
        kind: 'code',
        children: []
      });
    });

    sec.formulas.slice(0, 3).forEach(fm => {
      parentNode.children.push({
        id: `mm_f_${nodeCounter++}`,
        label: `∑ ${fm.slice(0, 36)}`,
        detail: fm,
        level: parentNode.level + 1,
        kind: 'formula',
        children: []
      });
    });
  });

  // Ensure non-empty visual demo state if note is blank
  if (root.children.length === 0) {
    root.children.push(
      {
        id: 'mm_hint_1',
        label: 'Aggiungi Titoli (H1/H2)',
        detail: 'I titoli creano automaticamente i rami principali della mappa concettuale.',
        level: 1,
        kind: 'heading',
        children: []
      },
      {
        id: 'mm_hint_2',
        label: 'Usa Elenchi Puntati',
        detail: 'Ogni punto elenco diventa una foglia collegata al suo argomento.',
        level: 1,
        kind: 'concept',
        children: []
      }
    );
  }

  return root;
}

// ============================================================================
// 4. LECTURE VOICE TRANSCRIPT LOCAL STRUCTURER (FEATURE #5)
// ============================================================================

export function formatTranscriptLocally(rawTranscript: string, title?: string): string {
  const cleaned = (rawTranscript || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';

  const sentences = cleaned
    .split(/(?<=[.!?])\s+|\s+(?=(?:inoltre|quindi|però|infine|primo|secondo|terzo|importante|ricordate)\b)/i)
    .map(s => s.trim())
    .filter(Boolean);

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const nowLabel = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const heading = title?.trim() || `🎙️ Appunti Dettati (${nowLabel})`;

  if (sentences.length <= 1) {
    return `<h3>${escapeHtml(heading)}</h3><p>${escapeHtml(capitalize(cleaned))}</p>`;
  }

  const bulletsHtml = sentences
    .map(sentence => {
      const cap = capitalize(sentence.replace(/[.,;]+$/, ''));
      const colonIdx = cap.indexOf(':');
      if (colonIdx > 2 && colonIdx < 45) {
        return `<li><b>${escapeHtml(cap.slice(0, colonIdx + 1))}</b>${escapeHtml(cap.slice(colonIdx + 1))}</li>`;
      }
      return `<li>${escapeHtml(cap)}.</li>`;
    })
    .join('');

  return `<h3>${escapeHtml(heading)}</h3><ul>${bulletsHtml}</ul>`;
}

// ============================================================================
// 5. PUBLICATION-GRADE DISPENSA EXPORTER (PDF / WORD / MARKDOWN) (FEATURE #7)
// ============================================================================

function singlePageHtmlToMarkdown(html: string): string {
  if (!html) return '';
  let md = html;

  // Convert interactive code blocks to fenced markdown blocks
  md = md.replace(
    /<div[^>]*class="[^"]*note-code-block[^"]*"[^>]*data-lang="([^"]*)"[^>]*>[\s\S]*?<\/div>\s*(?:<\/div>)?/gi,
    (fullMatch, lang) => {
      const rawMatch = fullMatch.match(/data-raw="([^"]+)"/i);
      const code = rawMatch
        ? decodeURIComponent(rawMatch[1])
        : stripHtmlTags(fullMatch.replace(/<div[^>]*class="[^"]*note-code-header[^"]*"[\s\S]*?<\/div>/gi, ''));
      return `\n\`\`\`${lang || 'text'}\n${code.trim()}\n\`\`\`\n`;
    }
  );

  // Convert formula boxes to $$ ... $$
  md = md.replace(
    /<div[^>]*class="[^"]*note-formula-box[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    (fullMatch, inner) => {
      const exprMatch = fullMatch.match(/data-expr="([^"]+)"/i);
      const expr = exprMatch ? decodeURIComponent(exprMatch[1]) : stripHtmlTags(inner);
      return `\n$$ ${expr.trim()} $$\n`;
    }
  );

  md = md
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, t) => `\n# ${stripHtmlTags(t)}\n`)
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, t) => `\n## ${stripHtmlTags(t)}\n`)
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, t) => `\n### ${stripHtmlTags(t)}\n`)
    .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, t) => `\n#### ${stripHtmlTags(t)}\n`)
    .replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, t) => `\n> ${stripHtmlTags(t).replace(/\n/g, '\n> ')}\n`)
    .replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, (_, t) => `**${stripHtmlTags(t)}**`)
    .replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, (_, t) => `*${stripHtmlTags(t)}*`)
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => `- ${stripHtmlTags(t)}\n`)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|ul|ol|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  return decodeHtmlEntities(md)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function convertNoteHtmlToMarkdown(
  pages: Array<{ name: string; content: string }>,
  subjectName: string,
  includeToc = true
): string {
  const parts: string[] = [];
  parts.push(`# ${subjectName} — Dispensa di Studio`);
  parts.push(`> Esportato da **Workspace ITS** • ${new Date().toLocaleDateString('it-IT')}\n`);

  if (includeToc && pages.length > 0) {
    parts.push('## Indice dei Contenuti');
    pages.forEach((p, idx) => {
      const slug = p.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
      parts.push(`${idx + 1}. [${p.name}](#${slug || `capitolo-${idx + 1}`})`);
    });
    parts.push('\n---\n');
  }

  pages.forEach((page, idx) => {
    parts.push(`## ${idx + 1}. ${page.name}\n`);
    const body = singlePageHtmlToMarkdown(page.content);
    parts.push(body || '_Nessun contenuto in questa scheda._');
    parts.push('\n');
  });

  return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

export function buildDispensaHtmlDocument(options: DispensaExportOptions): string {
  const { subjectName, authorName, pages, includeCover, includeToc, theme } = options;
  const dateLabel =
    options.generatedDate ||
    new Date().toLocaleDateString('it-IT', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });

  const palette =
    theme === 'dark-tech'
      ? {
          bg: '#0b0e14',
          surface: '#121826',
          text: '#e2e8f0',
          muted: '#94a3b8',
          accent: '#38bdf8',
          border: '#1e293b',
          codeBg: '#06080d'
        }
      : theme === 'modern-indigo'
        ? {
            bg: '#ffffff',
            surface: '#f8fafc',
            text: '#0f172a',
            muted: '#475569',
            accent: '#4f46e5',
            border: '#e2e8f0',
            codeBg: '#0f172a'
          }
        : {
            bg: '#ffffff',
            surface: '#fafaf9',
            text: '#1c1917',
            muted: '#57534e',
            accent: '#1d4ed8',
            border: '#e7e5e4',
            codeBg: '#1e293b'
          };

  const tocHtml = includeToc
    ? `
    <section class="toc-section">
      <h2>Indice / Sommario</h2>
      <ol class="toc-list">
        ${pages
          .map(
            (p, idx) =>
              `<li><a href="#chapter-${idx + 1}"><span class="toc-num">${String(idx + 1).padStart(2, '0')}</span> <span class="toc-name">${escapeHtml(p.name)}</span></a></li>`
          )
          .join('')}
      </ol>
    </section>
  `
    : '';

  const coverHtml = includeCover
    ? `
    <section class="cover-page">
      <div class="cover-kicker">DISPENSA UNIVERSITARIA • WORKSPACE ITS</div>
      <h1 class="cover-title">${escapeHtml(subjectName)}</h1>
      <p class="cover-subtitle">Raccolta strutturata di appunti, schemi, formule e blocchi di codice (${pages.length} ${pages.length === 1 ? 'capitolo' : 'capitoli'})</p>
      <div class="cover-meta">
        <div><strong>Autore:</strong> ${escapeHtml(authorName || 'Studente ITS')}</div>
        <div><strong>Data:</strong> ${escapeHtml(dateLabel)}</div>
      </div>
    </section>
  `
    : '';

  const chaptersHtml = pages
    .map((p, idx) => {
      // Strip editor-only interactive action buttons so printed output is crisp
      const cleanedContent = (p.content || '<p><em>Scheda vuota.</em></p>')
        .replace(/<div[^>]*class="[^"]*note-code-actions[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
        .replace(/<button[^>]*class="[^"]*note-formula-del[^"]*"[^>]*>[\s\S]*?<\/button>/gi, '');
      return `
      <article class="chapter" id="chapter-${idx + 1}">
        <div class="chapter-kicker">Capitolo ${idx + 1}</div>
        <h2 class="chapter-title">${escapeHtml(p.name)}</h2>
        <div class="chapter-body">${cleanedContent}</div>
      </article>
      `;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(subjectName)} — Dispensa Workspace ITS</title>
  <style>
    @page { margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px;
      font-family: 'Plus Jakarta Sans', 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: ${palette.bg};
      color: ${palette.text};
      line-height: 1.65;
      font-size: 14px;
    }
    .doc-shell { max-width: 820px; margin: 0 auto; }
    .cover-page {
      padding: 56px 40px;
      border-radius: 16px;
      background: ${palette.surface};
      border: 1px solid ${palette.border};
      border-top: 6px solid ${palette.accent};
      margin-bottom: 36px;
      page-break-after: always;
    }
    .cover-kicker {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.14em;
      color: ${palette.accent};
      margin-bottom: 14px;
    }
    .cover-title {
      font-size: 36px;
      line-height: 1.15;
      margin: 0 0 12px 0;
      letter-spacing: -0.02em;
    }
    .cover-subtitle {
      font-size: 15px;
      color: ${palette.muted};
      margin: 0 0 28px 0;
    }
    .cover-meta {
      display: flex;
      gap: 28px;
      flex-wrap: wrap;
      font-size: 13px;
      color: ${palette.muted};
      padding-top: 18px;
      border-top: 1px solid ${palette.border};
    }
    .toc-section {
      padding: 24px 28px;
      border-radius: 12px;
      background: ${palette.surface};
      border: 1px solid ${palette.border};
      margin-bottom: 32px;
    }
    .toc-section h2 {
      margin: 0 0 14px 0;
      font-size: 16px;
      color: ${palette.accent};
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .toc-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
    .toc-list a {
      text-decoration: none;
      color: ${palette.text};
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 8px;
      border-radius: 6px;
    }
    .toc-num {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-weight: 700;
      color: ${palette.accent};
      font-size: 12px;
    }
    .chapter {
      margin-bottom: 36px;
      padding-bottom: 24px;
      border-bottom: 1px solid ${palette.border};
    }
    .chapter-kicker {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: ${palette.accent};
    }
    .chapter-title {
      font-size: 24px;
      margin: 4px 0 16px 0;
      line-height: 1.25;
    }
    .chapter-body h1, .chapter-body h2, .chapter-body h3 { margin-top: 1.2em; margin-bottom: 0.5em; }
    .chapter-body ul, .chapter-body ol { padding-left: 22px; }
    .chapter-body blockquote, .note-quote-block {
      margin: 14px 0;
      padding: 12px 16px;
      border-left: 4px solid ${palette.accent};
      background: ${palette.surface};
      border-radius: 0 8px 8px 0;
      font-style: italic;
    }
    .note-code-block {
      background: ${palette.codeBg};
      color: #e2e8f0;
      border-radius: 10px;
      padding: 12px 14px;
      margin: 14px 0;
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 12.5px;
      overflow-x: auto;
    }
    .note-code-header {
      font-size: 11px;
      color: #94a3b8;
      margin-bottom: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      padding-bottom: 6px;
    }
    .note-formula-box {
      padding: 10px 14px;
      margin: 12px 0;
      border-radius: 8px;
      background: ${palette.surface};
      border: 1px solid ${palette.accent};
      font-family: 'Cambria Math', Georgia, serif;
      font-weight: 600;
    }
    table, .note-table {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0;
      font-size: 13px;
    }
    th, td {
      border: 1px solid ${palette.border};
      padding: 8px 10px;
      text-align: left;
    }
    th { background: ${palette.surface}; font-weight: 700; }
    img { max-width: 100%; border-radius: 8px; height: auto; }
    @media print {
      body { padding: 0; }
      .chapter { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="doc-shell">
    ${coverHtml}
    ${tocHtml}
    ${chaptersHtml}
  </div>
</body>
</html>`;
}
