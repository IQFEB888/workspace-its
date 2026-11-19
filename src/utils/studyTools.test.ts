import test from 'node:test';
import assert from 'node:assert/strict';
import {
  reorderPagesList,
  generateFlashcardsFromHtml,
  generateQuizFromHtml,
  extractMindMapTreeFromHtml,
  formatTranscriptLocally,
  convertNoteHtmlToMarkdown,
  buildDispensaHtmlDocument
} from './studyTools';

test('reorderPagesList moves tabs forward/backward and normalizes sequential order values', () => {
  const initial = [
    { id: 'p1', name: 'Intro', order: 0 },
    { id: 'p2', name: 'SQL', order: 1 },
    { id: 'p3', name: 'JOIN', order: 2 },
    { id: 'p4', name: 'Indici', order: 3 }
  ];

  const movedForward = reorderPagesList(initial, 0, 2);
  assert.deepEqual(
    movedForward.map(p => [p.id, p.order]),
    [
      ['p2', 0],
      ['p3', 1],
      ['p1', 2],
      ['p4', 3]
    ]
  );

  const movedBackward = reorderPagesList(initial, 3, 1);
  assert.deepEqual(
    movedBackward.map(p => [p.id, p.order]),
    [
      ['p1', 0],
      ['p4', 1],
      ['p2', 2],
      ['p3', 3]
    ]
  );
});

test('generateFlashcardsFromHtml and generateQuizFromHtml extract cards and 4-choice questions', () => {
  const sampleHtml = `
    <h2>Architettura Database Relazionali</h2>
    <ul>
      <li><b>Primary Key:</b> Chiave univoca che identifica ogni riga in una tabella senza valori NULL.</li>
      <li><b>Foreign Key:</b> Vincolo referenziale che collega due tabelle tra loro.</li>
      <li>Normalizzazione: Processo per ridurre ridondanza e anomalie nei dati relazionali.</li>
    </ul>
    <h2>Query SQL</h2>
    <p>INNER JOIN: Restituisce solo le righe con corrispondenza in entrambe le tabelle.</p>
  `;

  const cards = generateFlashcardsFromHtml(sampleHtml, 'Database', 'Lezione 1');
  assert.ok(cards.length >= 4, `Expected at least 4 flashcards, got ${cards.length}`);
  assert.ok(cards.some(c => c.front.toLowerCase().includes('primary key')));
  assert.ok(cards.some(c => c.back.toLowerCase().includes('vincolo referenziale')));

  const quiz = generateQuizFromHtml(sampleHtml, 'Database', 'Lezione 1');
  assert.ok(quiz.length >= 4);
  quiz.forEach(q => {
    assert.equal(q.options.length, 4);
    assert.ok(q.correctIndex >= 0 && q.correctIndex < 4);
    assert.ok(q.options[q.correctIndex].length > 5);
  });
});

test('extractMindMapTreeFromHtml creates hierarchical branches from headings and bullet lists', () => {
  const html = `
    <h1>Reti & Cloud</h1>
    <h2>Protocollo TCP/IP</h2>
    <ul>
      <li>Livello Trasporto: Gestisce consegna affidabile e controllo congestione.</li>
      <li>Handshake a 3 vie: SYN, SYN-ACK, ACK.</li>
    </ul>
    <h2>Container Docker</h2>
    <ul>
      <li>Dockerfile: Ricetta per costruire immagini immutabili.</li>
    </ul>
  `;

  const tree = extractMindMapTreeFromHtml(html, 'Sistemi Cloud');
  assert.equal(tree.kind, 'root');
  assert.equal(tree.label, 'Sistemi Cloud');
  assert.ok(tree.children.length >= 2);
  const tcpBranch = tree.children.find(c => c.label.includes('TCP/IP'));
  assert.ok(tcpBranch);
  assert.equal(tcpBranch.children.length, 2);
});

test('formatTranscriptLocally structures spoken Italian lecture text into clean HTML heading and list', () => {
  const html = formatTranscriptLocally(
    'oggi vediamo gli indici b-tree. servono per velocizzare le query select. inoltre riducono le scansioni complete di tabella.',
    'Lezione Indici'
  );
  assert.ok(html.includes('<h3>Lezione Indici</h3>'));
  assert.ok(html.includes('<ul>'));
  assert.ok(html.includes('<li>'));
});

test('convertNoteHtmlToMarkdown and buildDispensaHtmlDocument produce TOC, cover, and clean content', () => {
  const pages = [
    { id: '1', name: 'Introduzione SQL', content: '<h2>Basi</h2><p>Usa <b>SELECT</b> per leggere i dati.</p>' },
    { id: '2', name: 'Esercizi JOIN', content: '<ul><li>INNER JOIN</li><li>LEFT JOIN</li></ul>' }
  ];

  const md = convertNoteHtmlToMarkdown(pages, 'Database', true);
  assert.ok(md.includes('# Database — Dispensa di Studio'));
  assert.ok(md.includes('## Indice dei Contenuti'));
  assert.ok(md.includes('**SELECT**'));
  assert.ok(md.includes('- INNER JOIN'));

  const docHtml = buildDispensaHtmlDocument({
    subjectName: 'Database',
    authorName: 'Fabio',
    pages,
    includeCover: true,
    includeToc: true,
    theme: 'modern-indigo',
    generatedDate: '19 Novembre 2026'
  });
  assert.ok(docHtml.includes('DISPENSA UNIVERSITARIA'));
  assert.ok(docHtml.includes('Indice / Sommario'));
  assert.ok(docHtml.includes('Introduzione SQL'));
  assert.ok(docHtml.includes('Esercizi JOIN'));
});
