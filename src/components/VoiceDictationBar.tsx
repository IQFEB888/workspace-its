import React, { useState, useEffect, useRef } from 'react';
import { formatTranscriptLocally } from '../utils/studyTools';
import { convertAiMarkdownToNoteHtml } from '../utils/editorTools';
import { callGeminiWithRotation, STUDY_GENERATION_MODEL } from '../services/geminiService';

interface VoiceDictationBarProps {
  isOpen: boolean;
  onClose: () => void;
  subjectName: string;
  apiKeys: string[];
  selectedKeyIndex: number;
  selectedModel: string;
  onInsertHtml: (html: string) => void;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const VoiceDictationBar: React.FC<VoiceDictationBarProps> = ({
  isOpen,
  onClose,
  subjectName,
  apiKeys,
  selectedKeyIndex,
  selectedModel,
  onInsertHtml,
  onNotify
}) => {
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [interimText, setInterimText] = useState<string>('');
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [isCleaningAi, setIsCleaningAi] = useState<boolean>(false);
  const [speechError, setSpeechError] = useState<string>('');
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<number | null>(null);

  const SpeechRecognitionCtor =
    typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;

  useEffect(() => {
    if (!isOpen && isRecording) {
      stopRecording();
    }
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const startRecording = () => {
    setSpeechError('');
    if (!SpeechRecognitionCtor) {
      setSpeechError(
        'Il browser attuale non supporta il microfono Web Speech API: puoi comunque incollare o scrivere qui la trascrizione e cliccare "Riordina con AI".'
      );
      return;
    }

    try {
      const rec = new SpeechRecognitionCtor();
      rec.lang = 'it-IT';
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (event: any) => {
        let finalChunk = '';
        let interimChunk = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) {
            finalChunk += piece + ' ';
          } else {
            interimChunk += piece;
          }
        }
        if (finalChunk.trim()) {
          setTranscript(prev => (prev ? `${prev.trim()} ${finalChunk.trim()}` : finalChunk.trim()));
        }
        setInterimText(interimChunk);
      };

      rec.onerror = (ev: any) => {
        if (ev?.error === 'not-allowed') {
          setSpeechError('Permesso microfono negato dal browser. Abilitalo nella barra indirizzi o incolla il testo qui sotto.');
        } else if (ev?.error !== 'aborted') {
          setSpeechError(`Microfono in pausa (${ev?.error || 'errore'}).`);
        }
        setIsRecording(false);
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };

      rec.onend = () => {
        setIsRecording(false);
        setInterimText('');
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };

      recognitionRef.current = rec;
      rec.start();
      setIsRecording(true);
      setElapsedSec(0);
      timerRef.current = window.setInterval(() => {
        setElapsedSec(s => s + 1);
      }, 1000);
    } catch (e: any) {
      setSpeechError(`Impossibile avviare la dettatura: ${e?.message || 'errore sconosciuto'}`);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    setInterimText('');
  };

  const handleDirectInsert = () => {
    const combined = `${transcript} ${interimText}`.trim();
    if (!combined) {
      onNotify('Nessun testo dettato da inserire.', 'error');
      return;
    }
    const html = formatTranscriptLocally(combined);
    onInsertHtml(html);
    setTranscript('');
    setInterimText('');
    onNotify('🎙️ Trascrizione inserita negli appunti!');
  };

  const handleAiCleanAndInsert = async () => {
    const combined = `${transcript} ${interimText}`.trim();
    if (!combined) {
      onNotify('Registra o incolla prima una trascrizione di lezione.', 'error');
      return;
    }

    const validKeys = apiKeys.filter(k => k && k.trim().length > 5);
    if (validKeys.length === 0) {
      const localStructured = formatTranscriptLocally(combined, `Appunti Lezione — ${subjectName}`);
      onInsertHtml(localStructured);
      setTranscript('');
      setInterimText('');
      onNotify('✨ Trascrizione strutturata in punti elenco e inserita negli appunti!');
      return;
    }

    setIsCleaningAi(true);
    try {
      const prompt = `Trasforma questa trascrizione vocale di una lezione di "${subjectName}" in appunti universitari ordinati in Markdown pulito (usa ### titoli, elenchi puntati con **termini chiave in grassetto**, citazioni o blocchi codice se menzionati). Non aggiungere chiacchiere introduttive:\n\n${combined}`;
      const orderedKeys = [
        ...validKeys.slice(selectedKeyIndex % validKeys.length),
        ...validKeys.slice(0, selectedKeyIndex % validKeys.length)
      ];
      const aiText = await callGeminiWithRotation(
        orderedKeys,
        STUDY_GENERATION_MODEL,
        [{ role: 'user', parts: [{ text: prompt }] }]
      );
      const structuredHtml = convertAiMarkdownToNoteHtml(aiText || combined);
      onInsertHtml(structuredHtml);
      setTranscript('');
      setInterimText('');
      onNotify('✨ Lezione trascritta, riordinata da Gemini AI e aggiunta agli appunti!');
    } catch {
      const fallbackHtml = formatTranscriptLocally(combined, `Appunti Lezione — ${subjectName}`);
      onInsertHtml(fallbackHtml);
      setTranscript('');
      setInterimText('');
      onNotify('✨ Trascrizione strutturata localmente e inserita negli appunti!');
    } finally {
      setIsCleaningAi(false);
    }
  };

  if (!isOpen) return null;

  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const ss = String(elapsedSec % 60).padStart(2, '0');

  return (
    <div className="voice-dictation-bar">
      <div className="voice-dictation-top">
        <div className="voice-dictation-left">
          <button
            type="button"
            className={`voice-rec-btn ${isRecording ? 'is-recording' : ''}`}
            onClick={isRecording ? stopRecording : startRecording}
          >
            <span className="voice-rec-dot" />
            {isRecording ? `⏹ Ferma (${mm}:${ss})` : '🎙️ Avvia Dettatura (IT)'}
          </button>

          {isRecording && (
            <div className="voice-wave-bars" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          )}

          <span className="voice-dictation-hint">
            {isRecording
              ? 'Sto ascoltando la lezione in tempo reale...'
              : 'Parla al microfono o incolla una trascrizione, poi inseriscila ordinata negli appunti.'}
          </span>
        </div>

        <div className="voice-dictation-actions">
          <button
            type="button"
            className="widget-mini-btn"
            onClick={handleDirectInsert}
            disabled={!transcript.trim() && !interimText.trim()}
          >
            📝 Inserisci
          </button>
          <button
            type="button"
            className="widget-mini-btn accent"
            onClick={handleAiCleanAndInsert}
            disabled={isCleaningAi || (!transcript.trim() && !interimText.trim())}
          >
            {isCleaningAi ? '⏳ Riordino...' : '✨ Riordina AI & Inserisci'}
          </button>
          <button
            type="button"
            className="widget-ctrl-btn danger"
            onClick={() => {
              stopRecording();
              onClose();
            }}
            title="Chiudi barra dettatura"
          >
            ✕
          </button>
        </div>
      </div>

      {speechError && <div className="voice-error-banner">⚠️ {speechError}</div>}

      <textarea
        className="voice-transcript-box"
        rows={2}
        placeholder="Il testo dettato comparirà qui in diretta (puoi anche correggerlo a mano o incollare appunti grezzi)..."
        value={interimText ? `${transcript} ${interimText}`.trim() : transcript}
        onChange={e => {
          setInterimText('');
          setTranscript(e.target.value);
        }}
      />
    </div>
  );
};
