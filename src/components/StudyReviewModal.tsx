import React, { useState, useEffect, useMemo } from 'react';
import { PageItem } from '../types';
import {
  StudyFlashcard,
  StudyQuizQuestion,
  generateFlashcardsFromHtml,
  generateQuizFromHtml,
  stripHtmlTags
} from '../utils/studyTools';
import { callGeminiWithRotation } from '../services/geminiService';

interface StudyReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjectName: string;
  activePage: PageItem | null;
  allSubjectPages: PageItem[];
  apiKeys: string[];
  selectedKeyIndex: number;
  selectedModel: string;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const StudyReviewModal: React.FC<StudyReviewModalProps> = ({
  isOpen,
  onClose,
  subjectName,
  activePage,
  allSubjectPages,
  apiKeys,
  selectedKeyIndex,
  selectedModel,
  onNotify
}) => {
  const [mode, setMode] = useState<'flashcards' | 'quiz'>('flashcards');
  const [scope, setScope] = useState<'page' | 'subject'>('page');
  const [cards, setCards] = useState<StudyFlashcard[]>([]);
  const [cardIndex, setCardIndex] = useState<number>(0);
  const [isFlipped, setIsFlipped] = useState<boolean>(false);
  const [onlyReviewMode, setOnlyReviewMode] = useState<boolean>(false);

  const [quizQuestions, setQuizQuestions] = useState<StudyQuizQuestion[]>([]);
  const [quizIndex, setQuizIndex] = useState<number>(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [isAiGenerating, setIsAiGenerating] = useState<boolean>(false);

  const combinedHtml = useMemo(() => {
    if (scope === 'page' && activePage) return activePage.content || '';
    return allSubjectPages
      .map(p => `<h1>${p.name}</h1>\n${p.content || ''}`)
      .join('\n<hr />\n');
  }, [scope, activePage, allSubjectPages]);

  useEffect(() => {
    if (!isOpen) return;
    const activePlainLen = stripHtmlTags(activePage?.content || '').length;
    const subjectPlainLen = allSubjectPages.reduce(
      (acc, p) => acc + stripHtmlTags(p.content || '').length,
      0
    );
    if (scope === 'page' && activePlainLen < 20 && subjectPlainLen >= 20) {
      setScope('subject');
      return;
    }
    const generatedCards = generateFlashcardsFromHtml(
      combinedHtml,
      subjectName,
      scope === 'page' ? activePage?.name : subjectName
    );
    const generatedQuiz = generateQuizFromHtml(
      combinedHtml,
      subjectName,
      scope === 'page' ? activePage?.name : subjectName
    );
    setCards(generatedCards);
    setQuizQuestions(generatedQuiz);
    setCardIndex(0);
    setIsFlipped(false);
    setOnlyReviewMode(false);
    setQuizIndex(0);
    setSelectedAnswers({});
  }, [isOpen, combinedHtml, subjectName, scope, activePage?.name, activePage?.content, allSubjectPages]);

  const visibleCards = useMemo(() => {
    if (!onlyReviewMode) return cards;
    const filtered = cards.filter(c => c.status !== 'known');
    return filtered.length > 0 ? filtered : cards;
  }, [cards, onlyReviewMode]);

  const currentCard = visibleCards[Math.min(cardIndex, Math.max(0, visibleCards.length - 1))] || null;

  const knownCount = cards.filter(c => c.status === 'known').length;
  const reviewCount = cards.filter(c => c.status === 'review').length;
  const readinessPct = cards.length > 0 ? Math.round((knownCount / cards.length) * 100) : 0;

  // Keyboard shortcuts inside Flashcard mode
  useEffect(() => {
    if (!isOpen || mode !== 'flashcards') return;
    const onKey = (e: KeyboardEvent) => {
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
  }, [isOpen, mode, visibleCards.length, onClose]);

  const handleMarkCard = (status: 'known' | 'review') => {
    if (!currentCard) return;
    setCards(prev => prev.map(c => (c.id === currentCard.id ? { ...c, status } : c)));
    setIsFlipped(false);
    setTimeout(() => {
      setCardIndex(i => (visibleCards.length > 1 ? (i + 1) % visibleCards.length : 0));
    }, 140);
  };

  const handleAiBoost = async () => {
    const validKeys = apiKeys.filter(k => k && k.trim().length > 5);
    if (validKeys.length === 0) {
      onNotify('Inserisci una chiave API Gemini in "🔑 Keys" per generare domande AI personalizzate (le flashcard locali sono già pronte!).', 'info');
      return;
    }
    const plain = stripHtmlTags(combinedHtml).slice(0, 7500);
    if (plain.length < 30) {
      onNotify('Scrivi prima qualche appunto nella scheda per generare domande AI.', 'error');
      return;
    }

    setIsAiGenerating(true);
    try {
      const prompt = `Sei un docente ITS di ${subjectName}. Dai seguenti appunti genera ESCLUSIVAMENTE un JSON valido senza markdown fence nel formato:
{
  "flashcards": [{"front": "domanda breve e chiara", "back": "risposta precisa", "tag": "argomento"}],
  "quiz": [{"question": "domanda verifica", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "breve spiegazione", "tag": "argomento"}]
}
Genera 8 flashcard e 6 domande quiz con esattamente 4 opzioni ciascuna.
APPUNTI:
${plain}`;

      const orderedKeys = [
        ...validKeys.slice(selectedKeyIndex % validKeys.length),
        ...validKeys.slice(0, selectedKeyIndex % validKeys.length)
      ];
      const rawText = await callGeminiWithRotation(
        orderedKeys,
        selectedModel || 'gemini-3.8-flash',
        [{ role: 'user', parts: [{ text: prompt }] }]
      );

      const jsonMatch = (rawText || '').match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Risposta AI non in formato JSON');
      const parsed = JSON.parse(jsonMatch[0]);

      if (Array.isArray(parsed.flashcards) && parsed.flashcards.length > 0) {
        setCards(
          parsed.flashcards.map((c: any, idx: number) => ({
            id: `ai_fc_${Date.now()}_${idx}`,
            front: String(c.front || ''),
            back: String(c.back || ''),
            tag: String(c.tag || subjectName),
            status: 'unseen'
          }))
        );
        setCardIndex(0);
        setIsFlipped(false);
      }

      if (Array.isArray(parsed.quiz) && parsed.quiz.length > 0) {
        setQuizQuestions(
          parsed.quiz
            .filter((q: any) => Array.isArray(q.options) && q.options.length >= 2)
            .map((q: any, idx: number) => ({
              id: `ai_q_${Date.now()}_${idx}`,
              question: String(q.question || ''),
              options: q.options.slice(0, 4).map(String),
              correctIndex: Math.max(0, Math.min(3, Number(q.correctIndex) || 0)),
              explanation: String(q.explanation || ''),
              tag: String(q.tag || subjectName)
            }))
        );
        setQuizIndex(0);
        setSelectedAnswers({});
      }

      onNotify('✨ Flashcard & Quiz potenziati con Gemini AI!');
    } catch (err: any) {
      onNotify(`Impossibile generare con AI (${err?.message || 'errore'}), mantenute le carte locali.`, 'error');
    } finally {
      setIsAiGenerating(false);
    }
  };

  if (!isOpen) return null;

  const answeredCount = Object.keys(selectedAnswers).length;
  const correctCount = quizQuestions.filter(q => selectedAnswers[q.id] === q.correctIndex).length;
  const currentQ = quizQuestions[quizIndex] || null;
  const quizFinished = quizQuestions.length > 0 && answeredCount === quizQuestions.length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box study-review-modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '780px', width: '94%' }}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span className="modal-title">🧠 Modalità Ripasso Esame — {subjectName}</span>
            <span className="study-pill-badge">{readinessPct}% Preparazione</span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Chiudi ripasso">
            ✕
          </button>
        </div>

        {/* Mode + Scope Bar */}
        <div className="study-review-toolbar">
          <div className="study-seg-group">
            <button
              type="button"
              className={`study-seg-btn ${mode === 'flashcards' ? 'active' : ''}`}
              onClick={() => setMode('flashcards')}
            >
              🃏 Flashcard 3D ({cards.length})
            </button>
            <button
              type="button"
              className={`study-seg-btn ${mode === 'quiz' ? 'active' : ''}`}
              onClick={() => setMode('quiz')}
            >
              📝 Quiz Verifica ({quizQuestions.length})
            </button>
          </div>

          <div className="study-seg-group">
            <button
              type="button"
              className={`study-seg-btn ${scope === 'page' ? 'active' : ''}`}
              onClick={() => setScope('page')}
              title="Usa solo gli appunti della scheda attiva"
            >
              Scheda Attuale
            </button>
            <button
              type="button"
              className={`study-seg-btn ${scope === 'subject' ? 'active' : ''}`}
              onClick={() => setScope('subject')}
              title="Usa tutte le schede della materia"
            >
              Tutta la Materia ({allSubjectPages.length})
            </button>
          </div>

          <button
            type="button"
            className="study-ai-boost-btn"
            onClick={handleAiBoost}
            disabled={isAiGenerating}
          >
            {isAiGenerating ? '⏳ Generazione AI...' : '✨ Potenzia con Gemini AI'}
          </button>
        </div>

        {/* Readiness Progress Bar */}
        <div className="study-readiness-bar-wrap">
          <div className="study-readiness-meta">
            <span>
              ✅ So bene: <strong>{knownCount}</strong> • 🔁 Da ripassare: <strong>{reviewCount}</strong> • Totale:{' '}
              <strong>{cards.length}</strong>
            </span>
            {reviewCount > 0 && mode === 'flashcards' && (
              <button
                type="button"
                className={`study-filter-toggle ${onlyReviewMode ? 'active' : ''}`}
                onClick={() => {
                  setOnlyReviewMode(v => !v);
                  setCardIndex(0);
                  setIsFlipped(false);
                }}
              >
                {onlyReviewMode ? 'Mostra Tutte' : `Ripassa solo da rivedere (${cards.length - knownCount})`}
              </button>
            )}
          </div>
          <div className="study-progress-track">
            <div className="study-progress-fill" style={{ width: `${readinessPct}%` }} />
          </div>
        </div>

        {/* CONTENT: FLASHCARDS 3D */}
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
                    <div className="flashcard-hint">Clicca sulla carta o premi Spazio per girare ↻</div>
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
              <p>Nessun contenuto sufficiente in questa scheda per generare flashcard.</p>
              <span>Scrivi qualche titolo, definizione (es. &quot;Chiave Primaria: ...&quot;) o elenco puntato negli appunti!</span>
            </div>
          )
        ) : /* CONTENT: QUIZ */ currentQ ? (
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
                    onClick={() => setSelectedAnswers(prev => ({ ...prev, [currentQ.id]: idx }))}
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
                  onClick={() => {
                    setSelectedAnswers({});
                    setQuizIndex(0);
                  }}
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
            <p>Aggiungi qualche concetto o elenco puntato negli appunti per generare un Quiz ITS!</p>
          </div>
        )}
      </div>
    </div>
  );
};
