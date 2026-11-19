import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { PageItem, SubjectItem } from '../types';
import {
  StudyFlashcard,
  StudyQuizQuestion,
  StudyHistorySession,
  generateFlashcardsFromHtml,
  generateQuizFromHtml,
  stripHtmlTags
} from '../utils/studyTools';
import { callGeminiWithRotation, STUDY_GENERATION_MODEL } from '../services/geminiService';

const HISTORY_STORAGE_KEY = 'ws_study_review_history_v1';
const MAX_HISTORY_ITEMS = 40;

interface StudyReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjectName: string;
  activePage: PageItem | null;
  allSubjectPages: PageItem[];
  subjects?: SubjectItem[];
  pagesBySubject?: Record<string, PageItem[]>;
  isSharedMode?: boolean;
  apiKeys: string[];
  selectedKeyIndex: number;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

function loadSavedHistory(): StudyHistorySession[] {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveHistory(items: StudyHistorySession[]) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items.slice(0, MAX_HISTORY_ITEMS)));
  } catch {
    // ignore quota errors
  }
}

function formatSessionTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const isSameDay =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
    const hhmm = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    if (isSameDay) return `Oggi ${hhmm}`;
    return `${d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })} ${hhmm}`;
  } catch {
    return '';
  }
}

function buildSessionTitle(pages: PageItem[]): string {
  if (pages.length === 0) return 'Sessione vuota';
  if (pages.length === 1) return pages[0].name;
  if (pages.length === 2) return `${pages[0].name} + ${pages[1].name}`;
  return `${pages[0].name} + ${pages.length - 1} schede`;
}

export const StudyReviewModal: React.FC<StudyReviewModalProps> = ({
  isOpen,
  onClose,
  subjectName,
  activePage,
  allSubjectPages,
  subjects = [],
  pagesBySubject,
  isSharedMode = false,
  apiKeys,
  selectedKeyIndex,
  onNotify
}) => {
  const [mode, setMode] = useState<'flashcards' | 'quiz'>('flashcards');
  const [pickerSubject, setPickerSubject] = useState<string>(subjectName);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [history, setHistory] = useState<StudyHistorySession[]>(() => loadSavedHistory());
  const [activeSessionIdByMode, setActiveSessionIdByMode] = useState<{
    flashcards: string | null;
    quiz: string | null;
  }>({ flashcards: null, quiz: null });

  const [cardIndex, setCardIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [onlyReviewMode, setOnlyReviewMode] = useState<boolean>(false);
  const [quizIndex, setQuizIndex] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatingLabel, setGeneratingLabel] = useState<string>('');

  // Sync subject picker when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setPickerSubject(subjectName);
  }, [isOpen, subjectName]);

  // Pages available in the left sidebar page picker
  const availablePages = useMemo<PageItem[]>(() => {
    if (isSharedMode || !pagesBySubject) return allSubjectPages;
    return pagesBySubject[pickerSubject] || allSubjectPages;
  }, [isSharedMode, pagesBySubject, pickerSubject, allSubjectPages]);

  // Default checked page selection when opening or switching subject in picker
  useEffect(() => {
    if (!isOpen) return;
    if (availablePages.length === 0) {
      setSelectedPageIds([]);
      return;
    }
    const defaultId =
      activePage && availablePages.some(p => p.id === activePage.id)
        ? activePage.id
        : availablePages[0].id;
    setSelectedPageIds([defaultId]);
  }, [isOpen, pickerSubject, availablePages, activePage]);

  // Persist history changes
  useEffect(() => {
    saveHistory(history);
  }, [history]);

  const modeHistory = useMemo(
    () => history.filter(item => item.mode === mode),
    [history, mode]
  );

  const activeSessionId = activeSessionIdByMode[mode];
  const activeSession = useMemo(() => {
    if (activeSessionId) {
      const exact = modeHistory.find(h => h.id === activeSessionId);
      if (exact) return exact;
    }
    return modeHistory[0] || null;
  }, [modeHistory, activeSessionId]);

  // Reset card/quiz cursor when switching active session or mode
  useEffect(() => {
    setCardIndex(0);
    setIsFlipped(false);
    setOnlyReviewMode(false);
    setQuizIndex(0);
  }, [activeSession?.id, mode]);

  const generateSessionForPages = useCallback(
    async (targetPages: PageItem[], targetMode: 'flashcards' | 'quiz', forceSubjectLabel?: string) => {
      if (targetPages.length === 0) {
        onNotify('Seleziona almeno una pagina di appunti dalla barra a sinistra.', 'error');
        return;
      }

      const combinedHtml = targetPages
        .map(p => `<h1>${p.name}</h1>\n${p.content || ''}`)
        .join('\n<hr />\n');
      const plainText = stripHtmlTags(combinedHtml).trim();
      const subjLabel = forceSubjectLabel || pickerSubject || subjectName;

      if (plainText.length < 4) {
        onNotify(
          `Le schede selezionate (${buildSessionTitle(targetPages)}) sono vuote: scrivi prima qualche appunto o seleziona un'altra pagina!`,
          'error'
        );
        return;
      }

      setIsGenerating(true);
      setGeneratingLabel(buildSessionTitle(targetPages));

      let cards: StudyFlashcard[] = [];
      let quizQuestions: StudyQuizQuestion[] = [];
      let usedModelLabel = 'Estrazione Locale';

      const validKeys = apiKeys.filter(k => k && k.trim().length > 5);

      if (validKeys.length > 0) {
        try {
          const orderedKeys = [
            ...validKeys.slice(selectedKeyIndex % validKeys.length),
            ...validKeys.slice(0, selectedKeyIndex % validKeys.length)
          ];

          const prompt =
            targetMode === 'flashcards'
              ? `Sei un docente ITS di "${subjLabel}". Crea un mazzo NUOVO e vario di 8 flashcard chiare e precise basate ESCLUSIVAMENTE sugli appunti seguenti (in italiano).
Restituisci SOLO un JSON valido (nessun testo extra, nessun markdown):
{"flashcards":[{"front":"domanda concisa","back":"risposta chiara e completa","tag":"argomento"}]}

APPUNTI:
${plainText.slice(0, 8000)}`
              : `Sei un docente ITS di "${subjLabel}". Crea un quiz verifica NUOVO e vario di 6 domande a scelta multipla (esattamente 4 opzioni ciascuna) basate ESCLUSIVAMENTE sugli appunti seguenti (in italiano).
Restituisci SOLO un JSON valido (nessun testo extra, nessun markdown):
{"quiz":[{"question":"domanda verifica","options":["A","B","C","D"],"correctIndex":0,"explanation":"breve spiegazione della risposta corretta","tag":"argomento"}]}

APPUNTI:
${plainText.slice(0, 8000)}`;

          const rawText = await callGeminiWithRotation(
            orderedKeys,
            STUDY_GENERATION_MODEL,
            [{ role: 'user', parts: [{ text: prompt }] }]
          );

          const cleanedJson = (rawText || '')
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/```\s*$/i, '')
            .trim();
          const jsonMatch = cleanedJson.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (targetMode === 'flashcards' && Array.isArray(parsed.flashcards) && parsed.flashcards.length > 0) {
              cards = parsed.flashcards
                .filter((c: any) => c && String(c.front || '').trim() && String(c.back || '').trim())
                .map((c: any, idx: number) => ({
                  id: `ai_fc_${Date.now()}_${idx}`,
                  front: String(c.front).trim(),
                  back: String(c.back).trim(),
                  tag: String(c.tag || targetPages[0].name).trim(),
                  status: 'unseen' as const
                }));
              usedModelLabel = 'Gemini 3.6 Flash';
            } else if (targetMode === 'quiz' && Array.isArray(parsed.quiz) && parsed.quiz.length > 0) {
              quizQuestions = parsed.quiz
                .filter((q: any) => q && String(q.question || '').trim() && Array.isArray(q.options) && q.options.length >= 2)
                .map((q: any, idx: number) => {
                  const opts = q.options.slice(0, 4).map((o: any) => String(o).trim());
                  return {
                    id: `ai_q_${Date.now()}_${idx}`,
                    question: String(q.question).trim(),
                    options: opts,
                    correctIndex: Math.max(0, Math.min(opts.length - 1, Number(q.correctIndex) || 0)),
                    explanation: String(q.explanation || 'Verifica dagli appunti selezionati.').trim(),
                    tag: String(q.tag || targetPages[0].name).trim()
                  };
                });
              usedModelLabel = 'Gemini 3.6 Flash';
            }
          }
        } catch {
          // Graceful fallback to instant local generation
          usedModelLabel = 'Estrazione Locale';
        }
      }

      if (targetMode === 'flashcards' && cards.length === 0) {
        cards = generateFlashcardsFromHtml(combinedHtml, subjLabel, buildSessionTitle(targetPages)).map(
          (c, idx) => ({ ...c, id: `loc_fc_${Date.now()}_${idx}` })
        );
      }
      if (targetMode === 'quiz' && quizQuestions.length === 0) {
        quizQuestions = generateQuizFromHtml(combinedHtml, subjLabel, buildSessionTitle(targetPages)).map(
          (q, idx) => ({ ...q, id: `loc_q_${Date.now()}_${idx}` })
        );
      }

      const createdCount = targetMode === 'flashcards' ? cards.length : quizQuestions.length;
      if (createdCount === 0) {
        setIsGenerating(false);
        setGeneratingLabel('');
        onNotify('Impossibile estrarre concetti da queste pagine. Aggiungi più testo negli appunti.', 'error');
        return;
      }

      const newSession: StudyHistorySession = {
        id: `sess_${targetMode}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        mode: targetMode,
        subjectName: subjLabel,
        title: buildSessionTitle(targetPages),
        pageIds: targetPages.map(p => p.id),
        pageNames: targetPages.map(p => p.name),
        createdAt: new Date().toISOString(),
        modelLabel: usedModelLabel,
        cards,
        quizQuestions,
        selectedAnswers: {}
      };

      setHistory(prev => [newSession, ...prev].slice(0, MAX_HISTORY_ITEMS));
      setActiveSessionIdByMode(prev => ({ ...prev, [targetMode]: newSession.id }));
      setCardIndex(0);
      setIsFlipped(false);
      setOnlyReviewMode(false);
      setQuizIndex(0);
      setIsGenerating(false);
      setGeneratingLabel('');

      onNotify(
        targetMode === 'flashcards'
          ? `🃏 Generate ${cards.length} nuove flashcard (${usedModelLabel}) e salvate nello storico!`
          : `📝 Generato nuovo quiz con ${quizQuestions.length} domande (${usedModelLabel}) e salvato nello storico!`
      );
    },
    [apiKeys, selectedKeyIndex, pickerSubject, subjectName, onNotify]
  );

  // Auto-generate an initial session if the current mode has no history yet when opened
  useEffect(() => {
    if (!isOpen || isGenerating) return;
    if (modeHistory.length > 0) return;
    const candidate =
      (activePage && stripHtmlTags(activePage.content || '').trim().length >= 4 ? activePage : null) ||
      availablePages.find(p => stripHtmlTags(p.content || '').trim().length >= 4) ||
      null;
    if (candidate) {
      setSelectedPageIds([candidate.id]);
      generateSessionForPages([candidate], mode, pickerSubject);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode]);

  const cards = activeSession?.cards || [];
  const quizQuestions = activeSession?.quizQuestions || [];
  const selectedAnswers = activeSession?.selectedAnswers || {};

  const visibleCards = useMemo(() => {
    if (!onlyReviewMode) return cards;
    const filtered = cards.filter(c => c.status !== 'known');
    return filtered.length > 0 ? filtered : cards;
  }, [cards, onlyReviewMode]);

  const currentCard =
    visibleCards[Math.min(cardIndex, Math.max(0, visibleCards.length - 1))] || null;

  const knownCount = cards.filter(c => c.status === 'known').length;
  const reviewCount = cards.filter(c => c.status === 'review').length;
  const readinessPct = cards.length > 0 ? Math.round((knownCount / cards.length) * 100) : 0;

  // Keyboard shortcuts inside Flashcard mode (guarded against buttons/inputs)
  useEffect(() => {
    if (!isOpen || mode !== 'flashcards' || !currentCard) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') {
        if (e.key === 'Escape') onClose();
        return;
      }
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setIsFlipped(prev => !prev);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIsFlipped(false);
        setCardIndex(i => (visibleCards.length ? (i + 1) % visibleCards.length : 0));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIsFlipped(false);
        setCardIndex(i => (visibleCards.length ? (i - 1 + visibleCards.length) % visibleCards.length : 0));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, mode, currentCard, visibleCards.length, onClose]);

  const updateActiveSession = (updater: (s: StudyHistorySession) => StudyHistorySession) => {
    if (!activeSession) return;
    setHistory(prev => prev.map(item => (item.id === activeSession.id ? updater(item) : item)));
  };

  const handleMarkCard = (status: 'known' | 'review') => {
    if (!currentCard || !activeSession) return;
    updateActiveSession(s => ({
      ...s,
      cards: s.cards.map(c => (c.id === currentCard.id ? { ...c, status } : c))
    }));
    setIsFlipped(false);
    setTimeout(() => {
      setCardIndex(i => (visibleCards.length > 1 ? (i + 1) % visibleCards.length : 0));
    }, 140);
  };

  const handleSelectQuizAnswer = (questionId: string, optionIdx: number) => {
    if (!activeSession) return;
    updateActiveSession(s => ({
      ...s,
      selectedAnswers: { ...s.selectedAnswers, [questionId]: optionIdx }
    }));
  };

  const handleResetQuizAttempt = () => {
    if (!activeSession) return;
    updateActiveSession(s => ({ ...s, selectedAnswers: {} }));
    setQuizIndex(0);
  };

  const handleDeleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
    setActiveSessionIdByMode(prev => ({
      flashcards: prev.flashcards === id ? null : prev.flashcards,
      quiz: prev.quiz === id ? null : prev.quiz
    }));
  };

  const togglePageCheckbox = (pageId: string) => {
    setSelectedPageIds(prev =>
      prev.includes(pageId) ? prev.filter(id => id !== pageId) : [...prev, pageId]
    );
  };

  const handleGenerateFromChecked = () => {
    const chosen = availablePages.filter(p => selectedPageIds.includes(p.id));
    generateSessionForPages(chosen, mode, pickerSubject);
  };

  const handleRegenerateCurrentSession = () => {
    if (!activeSession) {
      handleGenerateFromChecked();
      return;
    }
    const sourcePages =
      !isSharedMode && pagesBySubject && pagesBySubject[activeSession.subjectName]
        ? pagesBySubject[activeSession.subjectName].filter(p => activeSession.pageIds.includes(p.id))
        : availablePages.filter(p => activeSession.pageIds.includes(p.id));
    if (sourcePages.length > 0) {
      generateSessionForPages(sourcePages, mode, activeSession.subjectName);
    } else {
      handleGenerateFromChecked();
    }
  };

  if (!isOpen) return null;

  const answeredCount = Object.keys(selectedAnswers).length;
  const correctCount = quizQuestions.filter(q => selectedAnswers[q.id] === q.correctIndex).length;
  const currentQ = quizQuestions[Math.min(quizIndex, Math.max(0, quizQuestions.length - 1))] || null;
  const quizFinished = quizQuestions.length > 0 && answeredCount === quizQuestions.length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box study-review-modal study-studio-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Studio Flashcard e Quiz"
      >
        {/* Top Studio Header */}
        <div className="modal-header study-studio-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span className="modal-title">🧠 Studio Flashcard &amp; Quiz</span>
            <div className="study-seg-group">
              <button
                type="button"
                className={`study-seg-btn ${mode === 'flashcards' ? 'active' : ''}`}
                onClick={() => setMode('flashcards')}
              >
                🃏 Flashcard 3D ({history.filter(h => h.mode === 'flashcards').length})
              </button>
              <button
                type="button"
                className={`study-seg-btn ${mode === 'quiz' ? 'active' : ''}`}
                onClick={() => setMode('quiz')}
              >
                📝 Quiz Verifica ({history.filter(h => h.mode === 'quiz').length})
              </button>
            </div>
            <span className="study-model-chip" title="Modello AI dedicato alla generazione di flashcard e quiz">
              ⚡ Gemini 3.6 Flash
            </span>
          </div>

          <button type="button" className="modal-close" onClick={onClose} aria-label="Chiudi studio flashcard e quiz">
            ✕
          </button>
        </div>

        {/* 2-Column Body: Left Sidebar (Page Selector + History) + Right Interactive Stage */}
        <div className="study-studio-layout">
          {/* LEFT SIDEBAR */}
          <aside className="study-history-sidebar" aria-label="Selezione pagine e storico sessioni">
            {/* Multi-Page Picker */}
            <div className="study-sidebar-section">
              <div className="study-sidebar-heading-row">
                <span className="study-sidebar-heading">📄 Pagine Appunti</span>
                <div className="study-sidebar-mini-actions">
                  <button
                    type="button"
                    className="study-mini-link"
                    onClick={() => setSelectedPageIds(availablePages.map(p => p.id))}
                  >
                    Tutte
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    className="study-mini-link"
                    onClick={() => setSelectedPageIds([])}
                  >
                    Nessuna
                  </button>
                </div>
              </div>

              {!isSharedMode && subjects.length > 1 && pagesBySubject && (
                <select
                  className="study-subject-select"
                  value={pickerSubject}
                  onChange={e => setPickerSubject(e.target.value)}
                  aria-label="Seleziona materia"
                >
                  {subjects.map(sub => (
                    <option key={sub.id} value={sub.id}>
                      📚 {sub.name} ({(pagesBySubject[sub.id] || []).length})
                    </option>
                  ))}
                </select>
              )}

              <div className="study-sidebar-tip">
                Spunta più pagine e genera, oppure <strong>clicca sul nome di una scheda</strong> per creare subito un nuovo mazzo!
              </div>

              <div className="study-page-picker-list">
                {availablePages.length === 0 ? (
                  <div className="study-sidebar-empty">Nessuna scheda in questa materia.</div>
                ) : (
                  availablePages.map(page => {
                    const checked = selectedPageIds.includes(page.id);
                    const plainLen = stripHtmlTags(page.content || '').trim().length;
                    const wordCount = plainLen
                      ? stripHtmlTags(page.content || '').trim().split(/\s+/).length
                      : 0;
                    return (
                      <div
                        key={page.id}
                        className={`study-page-picker-row ${checked ? 'is-checked' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="study-page-checkbox"
                          checked={checked}
                          onChange={() => togglePageCheckbox(page.id)}
                          aria-label={`Seleziona ${page.name}`}
                        />
                        <button
                          type="button"
                          className="study-page-quick-btn"
                          disabled={isGenerating}
                          onClick={() => {
                            setSelectedPageIds([page.id]);
                            generateSessionForPages([page], mode, pickerSubject);
                          }}
                          title={`Clicca per generare subito nuove ${mode === 'flashcards' ? 'flashcard' : 'domande quiz'} da "${page.name}"`}
                        >
                          <span className="study-page-name">{page.name}</span>
                          <span className="study-page-words">
                            {wordCount > 0 ? `${wordCount} par.` : 'vuota'}
                          </span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <button
                type="button"
                className="study-ai-boost-btn study-generate-full-btn"
                onClick={handleGenerateFromChecked}
                disabled={isGenerating || selectedPageIds.length === 0}
              >
                {isGenerating
                  ? `⏳ Generazione (${generatingLabel})...`
                  : mode === 'flashcards'
                    ? `✨ Genera Flashcard (${selectedPageIds.length} ${selectedPageIds.length === 1 ? 'pagina' : 'pagine'})`
                    : `✨ Genera Quiz (${selectedPageIds.length} ${selectedPageIds.length === 1 ? 'pagina' : 'pagine'})`}
              </button>
            </div>

            {/* Persistent Session History */}
            <div className="study-sidebar-section study-history-section">
              <div className="study-sidebar-heading-row">
                <span className="study-sidebar-heading">
                  🕘 Storico {mode === 'flashcards' ? 'Flashcard' : 'Quiz'} ({modeHistory.length})
                </span>
              </div>

              <div className="study-history-list">
                {modeHistory.length === 0 ? (
                  <div className="study-sidebar-empty">
                    Nessuna sessione salvata ancora. Clicca una pagina qui sopra per creare la prima!
                  </div>
                ) : (
                  modeHistory.map(sess => {
                    const isSelected = activeSession?.id === sess.id;
                    const sessKnown = sess.cards.filter(c => c.status === 'known').length;
                    const sessCorrect = sess.quizQuestions.filter(
                      q => sess.selectedAnswers[q.id] === q.correctIndex
                    ).length;
                    const sessAnswered = Object.keys(sess.selectedAnswers || {}).length;
                    return (
                      <div
                        key={sess.id}
                        role="button"
                        tabIndex={0}
                        className={`study-history-item ${isSelected ? 'active' : ''}`}
                        onClick={() =>
                          setActiveSessionIdByMode(prev => ({ ...prev, [mode]: sess.id }))
                        }
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setActiveSessionIdByMode(prev => ({ ...prev, [mode]: sess.id }));
                          }
                        }}
                      >
                        <div className="study-history-item-top">
                          <span className="study-history-title" title={sess.pageNames.join(', ')}>
                            {mode === 'flashcards' ? '🃏' : '📝'} {sess.title}
                          </span>
                          <button
                            type="button"
                            className="study-history-del-btn"
                            onClick={e => handleDeleteHistoryItem(sess.id, e)}
                            title="Rimuovi dallo storico"
                            aria-label={`Elimina sessione ${sess.title}`}
                          >
                            ✕
                          </button>
                        </div>
                        <div className="study-history-meta">
                          <span>{formatSessionTimestamp(sess.createdAt)}</span>
                          <span className="study-history-dot">•</span>
                          <span>
                            {mode === 'flashcards'
                              ? `${sessKnown}/${sess.cards.length} ✅`
                              : `${sessCorrect}/${sess.quizQuestions.length} 🎯${sessAnswered > 0 ? '' : ' (nuovo)'}`}
                          </span>
                        </div>
                        <div className="study-history-submeta">
                          <span>{sess.subjectName}</span>
                          <span className="study-history-model-tag">{sess.modelLabel}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </aside>

          {/* RIGHT MAIN STAGE */}
          <main className="study-main-stage">
            {isGenerating ? (
              <div className="study-generating-state">
                <div className="study-spinner-ring" />
                <h4>Generazione in corso con Gemini 3.6 Flash...</h4>
                <p>Sto preparando {mode === 'flashcards' ? 'nuove flashcard 3D' : 'un nuovo quiz verifica'} da: <strong>{generatingLabel}</strong></p>
              </div>
            ) : !activeSession ? (
              <div className="study-empty-state">
                <div style={{ fontSize: '2.2rem', marginBottom: '10px' }}>
                  {mode === 'flashcards' ? '🃏' : '📝'}
                </div>
                <p style={{ fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>
                  Nessuna sessione {mode === 'flashcards' ? 'Flashcard' : 'Quiz'} selezionata
                </p>
                <span>
                  Clicca su una pagina di appunti nella barra a sinistra (oppure spuntane più di una e premi &quot;Genera&quot;) per iniziare subito!
                </span>
              </div>
            ) : (
              <>
                {/* Active Session Top Info Bar */}
                <div className="study-session-banner">
                  <div className="study-session-banner-left">
                    <div className="study-session-banner-title">{activeSession.title}</div>
                    <div className="study-session-banner-sub">
                      <span>📚 {activeSession.subjectName}</span>
                      <span>•</span>
                      <span>{formatSessionTimestamp(activeSession.createdAt)}</span>
                      <span>•</span>
                      <span className="study-history-model-tag">{activeSession.modelLabel}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="study-nav-btn"
                    onClick={handleRegenerateCurrentSession}
                    title="Genera un nuovo set da queste stesse pagine mantenendo il precedente nello storico"
                  >
                    🔄 Genera Nuovo Set
                  </button>
                </div>

                {/* Progress Bar */}
                {mode === 'flashcards' ? (
                  <div className="study-readiness-bar-wrap">
                    <div className="study-readiness-meta">
                      <span>
                        ✅ So bene: <strong>{knownCount}</strong> • 🔁 Da ripassare:{' '}
                        <strong>{reviewCount}</strong> • Totale: <strong>{cards.length}</strong> ({readinessPct}%)
                      </span>
                      {reviewCount > 0 && (
                        <button
                          type="button"
                          className={`study-filter-toggle ${onlyReviewMode ? 'active' : ''}`}
                          onClick={() => {
                            setOnlyReviewMode(v => !v);
                            setCardIndex(0);
                            setIsFlipped(false);
                          }}
                        >
                          {onlyReviewMode
                            ? 'Mostra Tutte'
                            : `Ripassa solo da rivedere (${cards.length - knownCount})`}
                        </button>
                      )}
                    </div>
                    <div className="study-progress-track">
                      <div className="study-progress-fill" style={{ width: `${readinessPct}%` }} />
                    </div>
                  </div>
                ) : (
                  <div className="study-readiness-bar-wrap">
                    <div className="study-readiness-meta">
                      <span>
                        🎯 Risposte esatte: <strong>{correctCount}</strong> / {quizQuestions.length} • Completate:{' '}
                        <strong>{answeredCount}</strong> / {quizQuestions.length}
                      </span>
                      {answeredCount > 0 && (
                        <button
                          type="button"
                          className="study-filter-toggle"
                          onClick={handleResetQuizAttempt}
                        >
                          🔄 Azzera Risposte
                        </button>
                      )}
                    </div>
                    <div className="study-progress-track">
                      <div
                        className="study-progress-fill"
                        style={{
                          width: `${
                            quizQuestions.length > 0
                              ? Math.round((answeredCount / quizQuestions.length) * 100)
                              : 0
                          }%`
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* FLASHCARDS 3D VIEWER */}
                {mode === 'flashcards' ? (
                  currentCard ? (
                    <div className="flashcard-stage">
                      <div
                        className={`flashcard-3d-scene ${isFlipped ? 'is-flipped' : ''}`}
                        onClick={() => setIsFlipped(f => !f)}
                        role="button"
                        tabIndex={0}
                        aria-label="Gira flashcard"
                      >
                        <div className="flashcard-3d-inner">
                          <div className="flashcard-face flashcard-front">
                            <div className="flashcard-face-head">
                              <span className="flashcard-tag">{currentCard.tag}</span>
                              <span className="flashcard-counter">
                                {Math.min(cardIndex + 1, visibleCards.length)} / {visibleCards.length}
                              </span>
                            </div>
                            <div className="flashcard-body-text">{currentCard.front}</div>
                            <div className="flashcard-hint">
                              Clicca sulla carta o premi Spazio per girare ↻
                            </div>
                          </div>

                          <div className="flashcard-face flashcard-back">
                            <div className="flashcard-face-head">
                              <span className="flashcard-tag back">RISPOSTA • {currentCard.tag}</span>
                              <span className="flashcard-counter">
                                {currentCard.status === 'known'
                                  ? '✅ Padroneggiata'
                                  : currentCard.status === 'review'
                                    ? '🔁 Da ripassare'
                                    : '🆕 Nuova'}
                              </span>
                            </div>
                            <div className="flashcard-body-text answer">{currentCard.back}</div>
                            <div className="flashcard-hint">Valuta quanto la sapevi qui sotto ↓</div>
                          </div>
                        </div>
                      </div>

                      <div className="flashcard-controls-row">
                        <button
                          type="button"
                          className="study-nav-btn"
                          onClick={() => {
                            setIsFlipped(false);
                            setCardIndex(i => (i - 1 + visibleCards.length) % visibleCards.length);
                          }}
                        >
                          ← Precedente
                        </button>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            className="study-rate-btn review"
                            onClick={() => handleMarkCard('review')}
                          >
                            🔁 Da ripassare
                          </button>
                          <button
                            type="button"
                            className="study-rate-btn known"
                            onClick={() => handleMarkCard('known')}
                          >
                            ✅ So bene
                          </button>
                        </div>

                        <button
                          type="button"
                          className="study-nav-btn"
                          onClick={() => {
                            setIsFlipped(false);
                            setCardIndex(i => (i + 1) % visibleCards.length);
                          }}
                        >
                          Successiva →
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="study-empty-state">
                      <p>Nessuna carta in questa sessione.</p>
                    </div>
                  )
                ) : /* QUIZ VIEWER */ currentQ ? (
                  <div className="quiz-stage">
                    <div className="quiz-header-row">
                      <span className="flashcard-tag">
                        Domanda {quizIndex + 1} di {quizQuestions.length} • {currentQ.tag}
                      </span>
                      <span className="quiz-score-pill">
                        Punteggio: {correctCount} / {answeredCount || 0}
                      </span>
                    </div>

                    <div className="quiz-question-card">{currentQ.question}</div>

                    <div className="quiz-options-grid">
                      {currentQ.options.map((opt, idx) => {
                        const chosen = selectedAnswers[currentQ.id];
                        const hasAnswered = chosen !== undefined;
                        const isSelected = chosen === idx;
                        const isCorrect = idx === currentQ.correctIndex;
                        let stateClass = '';
                        if (hasAnswered) {
                          if (isCorrect) stateClass = 'is-correct';
                          else if (isSelected) stateClass = 'is-wrong';
                        }
                        return (
                          <button
                            key={idx}
                            type="button"
                            className={`quiz-option-btn ${stateClass}`}
                            disabled={hasAnswered}
                            onClick={() => handleSelectQuizAnswer(currentQ.id, idx)}
                          >
                            <span className="quiz-opt-letter">{String.fromCharCode(65 + idx)}</span>
                            <span className="quiz-opt-text">{opt}</span>
                          </button>
                        );
                      })}
                    </div>

                    {selectedAnswers[currentQ.id] !== undefined && (
                      <div
                        className={`quiz-feedback-box ${
                          selectedAnswers[currentQ.id] === currentQ.correctIndex ? 'ok' : 'err'
                        }`}
                      >
                        <strong>
                          {selectedAnswers[currentQ.id] === currentQ.correctIndex
                            ? '✅ Risposta esatta!'
                            : '❌ Risposta errata'}
                        </strong>
                        <p>{currentQ.explanation}</p>
                      </div>
                    )}

                    <div className="flashcard-controls-row">
                      <button
                        type="button"
                        className="study-nav-btn"
                        disabled={quizIndex === 0}
                        onClick={() => setQuizIndex(i => Math.max(0, i - 1))}
                      >
                        ← Domanda Prec.
                      </button>

                      {quizFinished && (
                        <button
                          type="button"
                          className="study-ai-boost-btn"
                          onClick={handleResetQuizAttempt}
                        >
                          🔄 Rifai Quiz ({Math.round((correctCount / quizQuestions.length) * 100)}%)
                        </button>
                      )}

                      <button
                        type="button"
                        className="study-nav-btn"
                        disabled={quizIndex >= quizQuestions.length - 1}
                        onClick={() => setQuizIndex(i => Math.min(quizQuestions.length - 1, i + 1))}
                      >
                        Prossima →
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="study-empty-state">
                    <p>Nessuna domanda quiz in questa sessione.</p>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};
