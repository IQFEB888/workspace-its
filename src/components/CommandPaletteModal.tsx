import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MaterialItem, PageItem, SubjectItem } from '../types';

export interface CommandPaletteAction {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  group: 'Azioni Rapide' | 'Schede Appunti' | 'Materie' | 'Materiali & PDF';
  shortcut?: string;
  onExecute: () => void;
}

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjects: SubjectItem[];
  pagesBySubject: Record<string, PageItem[]>;
  materialsBySubject: Record<string, MaterialItem[]>;
  quickActions: CommandPaletteAction[];
  onJumpToSubject: (subjectId: string) => void;
  onJumpToPage: (subjectId: string, pageId: string) => void;
  onOpenMaterial: (subjectId: string, material: MaterialItem) => void;
  onCreateCalendarReminderFromCommand?: (rawText: string) => boolean;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  subjects,
  pagesBySubject,
  materialsBySubject,
  quickActions,
  onJumpToSubject,
  onJumpToPage,
  onOpenMaterial,
  onCreateCalendarReminderFromCommand
}) => {
  const [query, setQuery] = useState<string>('');
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setHoveredIndex(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const allItems = useMemo<CommandPaletteAction[]>(() => {
    const list: CommandPaletteAction[] = [...quickActions];

    // Add all note tabs across every subject
    Object.entries(pagesBySubject).forEach(([subId, subPages]) => {
      (subPages || []).forEach(p => {
        list.push({
          id: `page_${subId}_${p.id}`,
          title: p.name,
          subtitle: `Scheda appunti in ${subId}`,
          icon: '📝',
          group: 'Schede Appunti',
          onExecute: () => onJumpToPage(subId, p.id)
        });
      });
    });

    // Add subjects
    subjects.forEach(sub => {
      list.push({
        id: `sub_${sub.id}`,
        title: sub.name,
        subtitle: 'Passa a questa materia',
        icon: '📚',
        group: 'Materie',
        onExecute: () => onJumpToSubject(sub.id)
      });
    });

    // Add materials
    Object.entries(materialsBySubject).forEach(([subId, mats]) => {
      (mats || []).forEach(m => {
        list.push({
          id: `mat_${subId}_${m.id}`,
          title: m.name,
          subtitle: `${m.category || 'Dispensa'} • ${subId}`,
          icon: m.fileType === 'pdf' ? '📕' : '📎',
          group: 'Materiali & PDF',
          onExecute: () => onOpenMaterial(subId, m)
        });
      });
    });

    return list;
  }, [quickActions, pagesBySubject, subjects, materialsBySubject, onJumpToPage, onJumpToSubject, onOpenMaterial]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = !q
      ? allItems.slice(0, 18)
      : allItems
          .filter(
            item =>
              item.title.toLowerCase().includes(q) ||
              item.subtitle.toLowerCase().includes(q) ||
              item.group.toLowerCase().includes(q)
          )
          .slice(0, 20);

    // If user types something starting with "promemoria" or "ricordami", offer instant calendar creation
    if (
      q.length >= 6 &&
      onCreateCalendarReminderFromCommand &&
      /\b(promemoria|ricordami|aggiungi|esame|lezione|compito)\b/i.test(q)
    ) {
      base.unshift({
        id: 'instant_cal_reminder',
        title: `Crea promemoria: "${query.trim()}"`,
        subtitle: 'Salva subito nel Calendario Studi & Google Calendar',
        icon: '📅',
        group: 'Azioni Rapide',
        shortcut: 'Invio',
        onExecute: () => {
          onCreateCalendarReminderFromCommand(query.trim());
        }
      });
    }

    return base;
  }, [allItems, query, onCreateCalendarReminderFromCommand]);

  useEffect(() => {
    setActiveIndex(0);
    setHoveredIndex(null);
  }, [query]);

  // Global keyboard handler while modal is open so arrows work immediately
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(i => (filteredItems.length ? (i + 1) % filteredItems.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(i =>
          filteredItems.length ? (i - 1 + filteredItems.length) % filteredItems.length : 0
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const chosen = filteredItems[activeIndex];
        if (chosen) {
          onClose();
          chosen.onExecute();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, activeIndex, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    itemRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen]);

  if (!isOpen) return null;

  const runItem = (item: CommandPaletteAction | undefined) => {
    if (!item) return;
    onClose();
    item.onExecute();
  };

  return (
    <div className="modal-overlay cmd-palette-overlay" onClick={onClose}>
      <div
        className="cmd-palette-box"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Command Palette"
      >
        <div className="cmd-palette-input-row">
          <span className="cmd-palette-search-icon">⚡</span>
          <input
            ref={inputRef}
            type="text"
            className="cmd-palette-input"
            placeholder="Cerca schede, materie, PDF, azioni o scrivi 'promemoria domani alle 16...' "
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <kbd className="cmd-palette-kbd">ESC</kbd>
        </div>

        <div className="cmd-palette-results" onMouseLeave={() => setHoveredIndex(null)}>
          {filteredItems.length === 0 ? (
            <div className="cmd-palette-empty">
              Nessun risultato per &quot;{query}&quot;. Prova a cercare una scheda, un PDF o scrivi un promemoria.
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === activeIndex;
              const isHovered = idx === hoveredIndex && !isSelected;
              return (
                <button
                  key={item.id}
                  ref={el => {
                    itemRefs.current[idx] = el;
                  }}
                  type="button"
                  className={`cmd-palette-item ${isSelected ? 'is-active' : ''} ${
                    isHovered ? 'is-hovered' : ''
                  }`}
                  aria-selected={isSelected}
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onClick={() => runItem(item)}
                >
                  <span className="cmd-palette-item-icon">{item.icon}</span>
                  <div className="cmd-palette-item-text">
                    <span className="cmd-palette-item-title">{item.title}</span>
                    <span className="cmd-palette-item-sub">{item.subtitle}</span>
                  </div>
                  {isSelected && <kbd className="cmd-palette-enter-badge">↵ Invio</kbd>}
                  <span className="cmd-palette-item-group">{item.shortcut || item.group}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="cmd-palette-footer">
          <span>↑↓ Selezione (Indaco)</span>
          <span>🖱️ Hover Mouse (Turchese)</span>
          <span>↵ Esegui</span>
          <span>Ctrl+K Chiudi</span>
        </div>
      </div>
    </div>
  );
};
