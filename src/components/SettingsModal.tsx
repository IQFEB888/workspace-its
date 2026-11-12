import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { CityLocation } from '../services/weatherService';

export interface BackgroundTheme {
  id: number;
  name: string;
  category: 'Monocolore' | 'Fotografico';
  cssUrl: string;
  previewUrl?: string;
  solidColor?: string;
}

export const BACKGROUND_THEMES: BackgroundTheme[] = [
  // Sfondi Fotografici (0..7 preserved for existing indices)
  {
    id: 0,
    name: 'Cyberpunk Neon',
    category: 'Fotografico',
    cssUrl: 'url("https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2564")',
    previewUrl: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=400'
  },
  {
    id: 1,
    name: 'Hardware Circuit',
    category: 'Fotografico',
    cssUrl: 'url("https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=2564")',
    previewUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=400'
  },
  {
    id: 2,
    name: 'Dark Liquid Flow',
    category: 'Fotografico',
    cssUrl: 'url("https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564")',
    previewUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400'
  },
  {
    id: 3,
    name: 'Deep Space Nebula',
    category: 'Fotografico',
    cssUrl: 'url("https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=2564")',
    previewUrl: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=400'
  },
  {
    id: 4,
    name: 'Tokyo Night Cyber',
    category: 'Fotografico',
    cssUrl: 'url("https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=2564")',
    previewUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=400'
  },
  {
    id: 5,
    name: 'Aurora Borealis',
    category: 'Fotografico',
    cssUrl: 'url("https://images.unsplash.com/photo-1531366936337-7c912a4589a7?q=80&w=2564")',
    previewUrl: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?q=80&w=400'
  },
  {
    id: 6,
    name: 'Retro Synthwave Tech',
    category: 'Fotografico',
    cssUrl: 'url("https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=2564")',
    previewUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=400'
  },
  {
    id: 7,
    name: 'Mountain Sunset Mist',
    category: 'Fotografico',
    cssUrl: 'url("https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=2564")',
    previewUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=400'
  },
  // Sfondi Monocolore Minimal (8..15)
  {
    id: 8,
    name: 'Nero Assoluto OLED',
    category: 'Monocolore',
    cssUrl: 'linear-gradient(180deg, #000000 0%, #000000 100%)',
    solidColor: '#000000'
  },
  {
    id: 9,
    name: 'Carbone Minimal',
    category: 'Monocolore',
    cssUrl: 'linear-gradient(180deg, #090a0f 0%, #090a0f 100%)',
    solidColor: '#090a0f'
  },
  {
    id: 10,
    name: 'Grigio Grafite',
    category: 'Monocolore',
    cssUrl: 'linear-gradient(180deg, #121318 0%, #16181f 100%)',
    solidColor: '#14161d'
  },
  {
    id: 11,
    name: 'Blu Notte Profondo',
    category: 'Monocolore',
    cssUrl: 'linear-gradient(180deg, #060b16 0%, #0a1224 100%)',
    solidColor: '#080f1e'
  },
  {
    id: 12,
    name: 'Verde Foresta Scuro',
    category: 'Monocolore',
    cssUrl: 'linear-gradient(180deg, #05110d 0%, #081a14 100%)',
    solidColor: '#071611'
  },
  {
    id: 13,
    name: 'Bordeaux Notturno',
    category: 'Monocolore',
    cssUrl: 'linear-gradient(180deg, #14060a 0%, #1f0a10 100%)',
    solidColor: '#19080d'
  },
  {
    id: 14,
    name: 'Indaco Abisso',
    category: 'Monocolore',
    cssUrl: 'linear-gradient(180deg, #090718 0%, #110e29 100%)',
    solidColor: '#0d0b20'
  },
  {
    id: 15,
    name: 'Ardesia Tecnico',
    category: 'Monocolore',
    cssUrl: 'linear-gradient(180deg, #0f172a 0%, #0b1120 100%)',
    solidColor: '#0f172a'
  }
];

export const ACCENT_THEMES = [
  {
    id: 'indigo',
    name: 'Indaco & Ciano',
    primary: '#6366f1',
    secondary: '#38bdf8',
    surface: 'rgba(99, 102, 241, 0.16)',
    border: 'rgba(99, 102, 241, 0.42)'
  },
  {
    id: 'blue',
    name: 'Blu Elettrico',
    primary: '#3b82f6',
    secondary: '#60a5fa',
    surface: 'rgba(59, 130, 246, 0.16)',
    border: 'rgba(59, 130, 246, 0.42)'
  },
  {
    id: 'emerald',
    name: 'Verde Smeraldo',
    primary: '#10b981',
    secondary: '#34d399',
    surface: 'rgba(16, 185, 129, 0.16)',
    border: 'rgba(16, 185, 129, 0.42)'
  },
  {
    id: 'violet',
    name: 'Viola Neon',
    primary: '#8b5cf6',
    secondary: '#c084fc',
    surface: 'rgba(139, 92, 246, 0.16)',
    border: 'rgba(139, 92, 246, 0.42)'
  },
  {
    id: 'amber',
    name: 'Ambra & Oro',
    primary: '#f59e0b',
    secondary: '#fbbf24',
    surface: 'rgba(245, 158, 11, 0.16)',
    border: 'rgba(245, 158, 11, 0.42)'
  },
  {
    id: 'rose',
    name: 'Rosso Corallo',
    primary: '#f43f5e',
    secondary: '#fb7185',
    surface: 'rgba(244, 63, 94, 0.16)',
    border: 'rgba(244, 63, 94, 0.42)'
  },
  {
    id: 'cyan',
    name: 'Ciano Artico',
    primary: '#06b6d4',
    secondary: '#22d3ee',
    surface: 'rgba(6, 182, 212, 0.16)',
    border: 'rgba(6, 182, 212, 0.42)'
  },
  {
    id: 'mono',
    name: 'Monocromatico Minimal',
    primary: '#e2e8f0',
    secondary: '#94a3b8',
    surface: 'rgba(226, 232, 240, 0.14)',
    border: 'rgba(226, 232, 240, 0.38)'
  }
];

export const PANEL_THEMES = [
  { id: 'default', name: 'Ardesia Scuro', rgb: '18, 18, 23', topbarRgb: '12, 13, 18', preview: '#121217' },
  { id: 'oled', name: 'Nero Puro OLED', rgb: '4, 4, 6', topbarRgb: '0, 0, 0', preview: '#040406' },
  { id: 'navy', name: 'Blu Navy Tecnico', rgb: '10, 17, 32', topbarRgb: '7, 12, 24', preview: '#0a1120' },
  { id: 'graphite', name: 'Grigio Grafite', rgb: '26, 27, 33', topbarRgb: '19, 20, 25', preview: '#1a1b21' },
  { id: 'forest', name: 'Verde Notturno', rgb: '8, 21, 16', topbarRgb: '5, 14, 11', preview: '#081510' },
  { id: 'amethyst', name: 'Viola Imperiale', rgb: '19, 13, 30', topbarRgb: '13, 9, 22', preview: '#130d1e' },
  { id: 'coffee', name: 'Espresso Caldo', rgb: '24, 17, 15', topbarRgb: '17, 12, 10', preview: '#18110f' }
];

export const FONT_OPTIONS = [
  { id: 'plus-jakarta', name: 'Plus Jakarta Sans', fontClass: 'font-plus-jakarta', sample: 'Aa Bb Gg 123 • Chiara e moderna' },
  { id: 'inter', name: 'Inter Display', fontClass: 'font-inter', sample: 'Aa Bb Gg 123 • Neutra ed essenziale' },
  { id: 'outfit', name: 'Outfit Geometric', fontClass: 'font-outfit', sample: 'Aa Bb Gg 123 • Morbida e pulita' },
  { id: 'mono', name: 'JetBrains Code Mono', fontClass: 'font-mono', sample: 'const note = 123; // Monospace' },
  { id: 'serif', name: 'Playfair Editorial Serif', fontClass: 'font-serif', sample: 'Aa Bb Gg 123 • Elegante accademica' }
];

export const FONT_SIZES = [
  { size: 12, label: '12px' },
  { size: 14, label: '14px' },
  { size: 15, label: '15px' },
  { size: 16, label: '16px' },
  { size: 18, label: '18px' },
  { size: 20, label: '20px' },
  { size: 24, label: '24px' }
];

export const GEMINI_MODELS = [
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Istantaneo & Consigliato)' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Veloce)' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Ragionamento avanzato)' }
];

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  bgIndex: number;
  onSelectBackground: (index: number) => void;
  compactMode: boolean;
  onToggleCompactMode: (compact: boolean) => void;
  accentColor: string;
  onSelectAccentColor: (accent: string) => void;
  panelTheme: string;
  onSelectPanelTheme: (theme: string) => void;
  panelOpacity: number;
  onChangePanelOpacity: (opacity: number) => void;
  showDriveBar: boolean;
  onToggleShowDriveBar: (show: boolean) => void;
  fontFamily: string;
  onSelectFontFamily: (font: string) => void;
  fontSize: number;
  onSelectFontSize: (size: number) => void;
  showWeatherWidget: boolean;
  onToggleShowWeatherWidget: (show: boolean) => void;
  isSidebarCollapsed: boolean;
  onToggleSidebarCollapsed: () => void;
  isChatCollapsed: boolean;
  onToggleChatCollapsed: () => void;
  selectedWeatherCity: CityLocation;
  onSelectCity: (city: CityLocation) => void;
  presetCities: CityLocation[];
  apiKeys: string[];
  selectedKeyIndex: number;
  onSaveApiKeys: (keys: string[], selectedIdx: number) => void;
  selectedModel: string;
  onSelectModel: (model: string) => void;
  currentUser: User | null;
  cloudSyncActive: boolean;
  onExportBackup: () => void;
  onOpenRestoreBackup: () => void;
  showToast: (msg: string, type?: 'info' | 'error') => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  bgIndex,
  onSelectBackground,
  compactMode,
  onToggleCompactMode,
  accentColor,
  onSelectAccentColor,
  panelTheme,
  onSelectPanelTheme,
  panelOpacity,
  onChangePanelOpacity,
  showDriveBar,
  onToggleShowDriveBar,
  fontFamily,
  onSelectFontFamily,
  fontSize,
  onSelectFontSize,
  showWeatherWidget,
  onToggleShowWeatherWidget,
  isSidebarCollapsed,
  onToggleSidebarCollapsed,
  isChatCollapsed,
  onToggleChatCollapsed,
  selectedWeatherCity,
  onSelectCity,
  presetCities,
  apiKeys,
  selectedKeyIndex,
  onSaveApiKeys,
  selectedModel,
  onSelectModel,
  currentUser,
  cloudSyncActive,
  onExportBackup,
  onOpenRestoreBackup,
  showToast
}) => {
  const [activeTab, setActiveTab] = useState<'appearance' | 'theme_bars' | 'widgets' | 'keys' | 'account'>('appearance');

  // Keys draft state
  const [keysDraft, setKeysDraft] = useState<string[]>(apiKeys || []);
  const [selectedKeyDraft, setSelectedKeyDraft] = useState<number>(selectedKeyIndex || 0);
  const [newKeyInput, setNewKeyInput] = useState('');

  if (!isOpen) return null;

  const solidThemes = BACKGROUND_THEMES.filter(t => t.category === 'Monocolore');
  const photoThemes = BACKGROUND_THEMES.filter(t => t.category === 'Fotografico');

  const handleAddKey = () => {
    const trimmed = newKeyInput.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith('AIzaSy')) {
      showToast('Attenzione: una Google Gemini API key inizia solitamente per "AIzaSy..."', 'info');
    }
    const updated = [...keysDraft, trimmed];
    setKeysDraft(updated);
    setNewKeyInput('');
    onSaveApiKeys(updated, selectedKeyDraft);
    showToast('Nuova chiave API Gemini aggiunta!');
  };

  const handleRemoveKey = (indexToRemove: number) => {
    const updated = keysDraft.filter((_, i) => i !== indexToRemove);
    let nextIdx = selectedKeyDraft;
    if (nextIdx >= updated.length) {
      nextIdx = Math.max(0, updated.length - 1);
    }
    setKeysDraft(updated);
    setSelectedKeyDraft(nextIdx);
    onSaveApiKeys(updated, nextIdx);
    showToast('Chiave rimossa.');
  };

  const handleSelectActiveKey = (idx: number) => {
    setSelectedKeyDraft(idx);
    onSaveApiKeys(keysDraft, idx);
    showToast(`Chiave #${idx + 1} impostata come attiva!`);
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1200 }}>
      <div
        className="modal-box"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '760px',
          width: '96%',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'rgba(13, 15, 20, 0.97)',
          backdropFilter: 'blur(28px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '18px',
          padding: '22px',
          color: '#f8fafc',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.85)'
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.5rem' }}>⚙️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.18rem', fontWeight: 700, color: '#f8fafc' }}>
                Personalizzazione & Impostazioni
              </h3>
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#94a3b8' }}>
                Sfondi monocolore, modalità minimal compatta, colore barre, font in pixel e AI
              </p>
            </div>
          </div>
          <button
            className="modal-close"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.25rem',
              cursor: 'pointer',
              padding: '4px 8px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: 'flex',
            gap: '5px',
            background: 'rgba(255, 255, 255, 0.04)',
            padding: '4px',
            borderRadius: '11px',
            marginBottom: '18px',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            flexWrap: 'wrap'
          }}
        >
          {[
            { id: 'appearance', label: '🎨 Sfondi & Font' },
            { id: 'theme_bars', label: '🖌️ Tema & Barre' },
            { id: 'widgets', label: '📐 Spazio & Layout' },
            { id: 'keys', label: '🔑 Gemini AI' },
            { id: 'account', label: '👤 Account & Backup' }
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                flex: 1,
                minWidth: '120px',
                padding: '7px 10px',
                borderRadius: '8px',
                border: 'none',
                background: activeTab === tab.id ? 'var(--accent-primary, #6366f1)' : 'transparent',
                color: activeTab === tab.id ? '#ffffff' : '#94a3b8',
                fontWeight: 600,
                fontSize: '0.79rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
                transition: 'all 0.18s'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: SFONDI & TIPOGRAFIA */}
        {activeTab === 'appearance' && (
          <div>
            {/* Quick Toggle: Modalità Minimal Senza Sfondo & Spazi Compatti */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '13px 15px',
                background: compactMode ? 'rgba(99, 102, 241, 0.14)' : 'rgba(255, 255, 255, 0.03)',
                border: compactMode ? '1px solid var(--accent-primary, #6366f1)' : '1px solid rgba(255, 255, 255, 0.09)',
                borderRadius: '12px',
                marginBottom: '18px'
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>⚡ Modalità Minimal Senza Sfondo & Ultra-Compatta</span>
                  {compactMode && (
                    <span style={{ fontSize: '0.68rem', background: 'var(--accent-primary, #6366f1)', color: '#fff', padding: '1px 7px', borderRadius: '999px' }}>
                      ATTIVA
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '3px' }}>
                  Rimuove qualsiasi immagine di sfondo e compatta bordi e spaziature per massimizzare l&apos;area di lavoro
                </div>
              </div>
              <button
                type="button"
                onClick={() => onToggleCompactMode(!compactMode)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  background: compactMode ? 'var(--accent-primary, #6366f1)' : 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#fff',
                  fontSize: '0.76rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  flexShrink: 0,
                  marginLeft: '12px'
                }}
              >
                {compactMode ? 'Disattiva' : 'Attiva Ora'}
              </button>
            </div>

            {/* Sfondi Monocolore Minimal */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ fontSize: '0.86rem', fontWeight: 700, color: '#f8fafc' }}>
                  ⬛ Sfondi Monocolore Minimal (Consigliati per la concentrazione)
                </label>
                <span style={{ fontSize: '0.73rem', color: '#94a3b8' }}>
                  Attivo: <b>{BACKGROUND_THEMES.find(t => t.id === bgIndex)?.name || 'Predefinito'}</b>
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                  gap: '8px'
                }}
              >
                {solidThemes.map(theme => {
                  const isSelected = bgIndex === theme.id;
                  return (
                    <div
                      key={theme.id}
                      onClick={() => onSelectBackground(theme.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '9px 11px',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(99, 102, 241, 0.16)' : 'rgba(255, 255, 255, 0.03)',
                        border: isSelected ? '1.5px solid var(--accent-primary, #6366f1)' : '1px solid rgba(255, 255, 255, 0.09)',
                        transition: 'all 0.15s'
                      }}
                    >
                      <span
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '6px',
                          background: theme.solidColor || '#000',
                          border: '1px solid rgba(255, 255, 255, 0.22)',
                          flexShrink: 0,
                          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.5)'
                        }}
                      />
                      <span
                        style={{
                          fontSize: '0.76rem',
                          fontWeight: 600,
                          color: isSelected ? '#fff' : '#cbd5e1',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          flex: 1
                        }}
                      >
                        {theme.name}
                      </span>
                      {isSelected && <span style={{ color: '#38bdf8', fontSize: '0.8rem', fontWeight: 700 }}>✓</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sfondi Fotografici */}
            <div style={{ marginBottom: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ fontSize: '0.86rem', fontWeight: 700, color: '#f8fafc' }}>
                  🖼️ Sfondi Fotografici Ambientali
                </label>
                {compactMode && (
                  <span style={{ fontSize: '0.72rem', color: '#fbbf24' }}>
                    Nota: disattiva la Modalità Senza Sfondo per vedere le foto
                  </span>
                )}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
                  gap: '8px'
                }}
              >
                {photoThemes.map(theme => {
                  const isSelected = bgIndex === theme.id;
                  return (
                    <div
                      key={theme.id}
                      onClick={() => {
                        onSelectBackground(theme.id);
                        if (compactMode) onToggleCompactMode(false);
                      }}
                      style={{
                        position: 'relative',
                        borderRadius: '9px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        border: isSelected && !compactMode ? '2px solid var(--accent-primary, #6366f1)' : '1px solid rgba(255, 255, 255, 0.1)',
                        aspectRatio: '16/9',
                        opacity: compactMode ? 0.6 : 1,
                        transition: 'all 0.15s'
                      }}
                    >
                      <img
                        src={theme.previewUrl}
                        alt={theme.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 0,
                          left: 0,
                          right: 0,
                          background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 100%)',
                          padding: '10px 6px 4px 6px',
                          fontSize: '0.67rem',
                          fontWeight: 600,
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                      >
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {theme.name}
                        </span>
                        {isSelected && !compactMode && <span style={{ color: '#38bdf8' }}>✓</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Tipografia e Dimensione Esatta in Pixel */}
            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                  <label style={{ fontSize: '0.86rem', fontWeight: 700, color: '#f8fafc', display: 'block' }}>
                    📏 Dimensione Predefinita Testo Appunti (in Pixel)
                  </label>
                  <span style={{ fontSize: '0.73rem', color: '#94a3b8' }}>
                    Puoi anche cambiare la dimensione in px di singole parole direttamente dalla barra degli appunti
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <input
                    type="number"
                    min={10}
                    max={48}
                    value={fontSize}
                    onChange={e => {
                      const v = Math.max(10, Math.min(48, parseInt(e.target.value || '15', 10)));
                      onSelectFontSize(v);
                    }}
                    style={{
                      width: '64px',
                      background: 'rgba(0,0,0,0.45)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '7px',
                      color: '#fff',
                      padding: '5px 8px',
                      fontSize: '0.84rem',
                      fontWeight: 700,
                      textAlign: 'center'
                    }}
                  />
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600 }}>px</span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>10px</span>
                <input
                  type="range"
                  min={10}
                  max={32}
                  value={Math.min(32, Math.max(10, fontSize))}
                  onChange={e => onSelectFontSize(parseInt(e.target.value, 10))}
                  style={{ flex: 1, accentColor: 'var(--accent-primary, #6366f1)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>32px</span>
              </div>

              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {FONT_SIZES.map(s => {
                  const isSelected = fontSize === s.size;
                  return (
                    <button
                      key={s.size}
                      type="button"
                      onClick={() => onSelectFontSize(s.size)}
                      style={{
                        flex: 1,
                        minWidth: '58px',
                        padding: '6px 10px',
                        borderRadius: '7px',
                        border: isSelected ? '1px solid var(--accent-primary, #6366f1)' : '1px solid rgba(255, 255, 255, 0.1)',
                        background: isSelected ? 'var(--accent-primary, #6366f1)' : 'rgba(255, 255, 255, 0.04)',
                        color: isSelected ? '#fff' : '#cbd5e1',
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>

              {/* Font Family */}
              <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#f8fafc', display: 'block', marginBottom: '8px' }}>
                ✍️ Carattere Tipografico (Font)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))', gap: '8px' }}>
                {FONT_OPTIONS.map(f => {
                  const isSelected = fontFamily === f.id;
                  return (
                    <div
                      key={f.id}
                      onClick={() => onSelectFontFamily(f.id)}
                      style={{
                        padding: '9px 11px',
                        borderRadius: '9px',
                        background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                        border: isSelected ? '1px solid var(--accent-primary, #6366f1)' : '1px solid rgba(255, 255, 255, 0.08)',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff' }}>{f.name}</span>
                        {isSelected && <span style={{ color: '#38bdf8', fontSize: '0.78rem', fontWeight: 700 }}>✓</span>}
                      </div>
                      <div className={f.fontClass} style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        {f.sample}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: TEMA & COLORE BARRE */}
        {activeTab === 'theme_bars' && (
          <div>
            {/* Colore Barre Laterali, Barra Superiore e Pannelli */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc', display: 'block', marginBottom: '4px' }}>
                🎛️ Colore Barra Superiore, Barre Laterali e Pannelli
              </label>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 12px 0' }}>
                Cambia la tonalità cromatica di tutte le barre e i contenitori del workspace:
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: '9px' }}>
                {PANEL_THEMES.map(pt => {
                  const isSelected = panelTheme === pt.id;
                  return (
                    <div
                      key={pt.id}
                      onClick={() => onSelectPanelTheme(pt.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        background: isSelected ? 'rgba(99, 102, 241, 0.16)' : 'rgba(255, 255, 255, 0.03)',
                        border: isSelected ? '1.5px solid var(--accent-primary, #6366f1)' : '1px solid rgba(255, 255, 255, 0.09)',
                        transition: 'all 0.15s'
                      }}
                    >
                      <span
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '7px',
                          background: pt.preview,
                          border: '1px solid rgba(255, 255, 255, 0.25)',
                          flexShrink: 0
                        }}
                      />
                      <span style={{ fontSize: '0.79rem', fontWeight: 600, color: isSelected ? '#fff' : '#cbd5e1', flex: 1 }}>
                        {pt.name}
                      </span>
                      {isSelected && <span style={{ color: '#38bdf8', fontWeight: 700 }}>✓</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Opacità / Solidità delle Barre e dei Pannelli */}
            <div style={{ marginBottom: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ fontSize: '0.86rem', fontWeight: 700, color: '#f8fafc' }}>
                  🪟 Opacità Pannelli e Barre ({panelOpacity}%)
                </label>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  {panelOpacity >= 96 ? 'Solido Opaco (Zero trasparenza)' : panelOpacity <= 70 ? 'Effetto Vetro Traslucido' : 'Bilanciato'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>60% (Vetro)</span>
                <input
                  type="range"
                  min={60}
                  max={100}
                  step={2}
                  value={panelOpacity}
                  onChange={e => onChangePanelOpacity(parseInt(e.target.value, 10))}
                  style={{ flex: 1, accentColor: 'var(--accent-primary, #6366f1)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>100% (Solido)</span>
              </div>
            </div>

            {/* Colore Tema & Accento Principale */}
            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px' }}>
              <label style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc', display: 'block', marginBottom: '4px' }}>
                ✨ Colore Tema e Pulsanti (Accento)
              </label>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 12px 0' }}>
                Personalizza il colore dei pulsanti attivi, delle schede appunti, dei bordi luminosi e delle icone:
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: '9px' }}>
                {ACCENT_THEMES.map(ac => {
                  const isSelected = accentColor === ac.id;
                  return (
                    <div
                      key={ac.id}
                      onClick={() => onSelectAccentColor(ac.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        cursor: 'pointer',
                        background: isSelected ? ac.surface : 'rgba(255, 255, 255, 0.03)',
                        border: isSelected ? `1.5px solid ${ac.primary}` : '1px solid rgba(255, 255, 255, 0.09)',
                        transition: 'all 0.15s'
                      }}
                    >
                      <span
                        style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          background: `linear-gradient(135deg, ${ac.primary}, ${ac.secondary})`,
                          flexShrink: 0,
                          boxShadow: isSelected ? `0 0 10px ${ac.primary}` : 'none'
                        }}
                      />
                      <span style={{ fontSize: '0.79rem', fontWeight: 600, color: isSelected ? '#fff' : '#cbd5e1', flex: 1 }}>
                        {ac.name}
                      </span>
                      {isSelected && <span style={{ color: ac.primary, fontWeight: 700 }}>✓</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SPAZIO, WIDGET & LAYOUT */}
        {activeTab === 'widgets' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Ottimizzazione Spazio & Pannelli */}
            <div
              style={{
                padding: '14px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px'
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '0.86rem', color: '#fff', marginBottom: '10px' }}>
                📐 Ottimizzazione Spazio & Barre del Workspace
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '0.81rem', color: '#e2e8f0', fontWeight: 600 }}>Modalità Ultra-Compatta & Senza Sfondo</div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Riduce i margini tra i pannelli ed elimina lo sfondo fotografico</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleCompactMode(!compactMode)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '7px',
                      background: compactMode ? 'var(--accent-primary, #6366f1)' : 'rgba(255,255,255,0.07)',
                      border: 'none',
                      color: '#fff',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {compactMode ? 'Attiva' : 'Standard'}
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
                  <div>
                    <div style={{ fontSize: '0.81rem', color: '#e2e8f0', fontWeight: 600 }}>Mostra Barra Link Google Drive sopra gli Appunti</div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Nascondila se vuoi ancora più spazio verticale per scrivere</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onToggleShowDriveBar(!showDriveBar)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '7px',
                      background: showDriveBar ? 'var(--accent-primary, #6366f1)' : 'rgba(255,255,255,0.07)',
                      border: 'none',
                      color: '#fff',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {showDriveBar ? 'Visibile' : 'Nascosta'}
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
                  <div>
                    <div style={{ fontSize: '0.81rem', color: '#e2e8f0', fontWeight: 600 }}>Barra Laterale Sinistra (Strumenti)</div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Comprimi in sole icone per allargare la colonna degli appunti</div>
                  </div>
                  <button
                    type="button"
                    onClick={onToggleSidebarCollapsed}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '7px',
                      background: isSidebarCollapsed ? 'var(--accent-primary, #6366f1)' : 'rgba(255,255,255,0.07)',
                      border: 'none',
                      color: '#fff',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {isSidebarCollapsed ? 'Compressa (Icone)' : 'Estesa'}
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '10px' }}>
                  <div>
                    <div style={{ fontSize: '0.81rem', color: '#e2e8f0', fontWeight: 600 }}>Pannello Destro (Gemini AI Copilot)</div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Riduci la barra laterale AI quando prendi appunti a tutto schermo</div>
                  </div>
                  <button
                    type="button"
                    onClick={onToggleChatCollapsed}
                    style={{
                      padding: '5px 12px',
                      borderRadius: '7px',
                      background: isChatCollapsed ? 'var(--accent-primary, #6366f1)' : 'rgba(255,255,255,0.07)',
                      border: 'none',
                      color: '#fff',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {isChatCollapsed ? 'Compresso' : 'Aperto'}
                  </button>
                </div>
              </div>
            </div>

            {/* Weather Widget Toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px'
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#fff' }}>
                  🌤️ Mostra Widget Meteo nella Colonna Strumenti
                </div>
                <div style={{ fontSize: '0.73rem', color: '#94a3b8', marginTop: '2px' }}>
                  Disattivalo per avere una colonna sinistra ancora più minimale
                </div>
              </div>
              <button
                type="button"
                onClick={() => onToggleShowWeatherWidget(!showWeatherWidget)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '7px',
                  background: showWeatherWidget ? 'var(--accent-primary, #6366f1)' : 'rgba(255,255,255,0.07)',
                  border: 'none',
                  color: '#fff',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {showWeatherWidget ? 'Visibile' : 'Nascosto'}
              </button>
            </div>

            {/* Weather Default City Selector */}
            <div
              style={{
                padding: '14px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px'
              }}
            >
              <label style={{ fontSize: '0.84rem', fontWeight: 600, color: '#fff', display: 'block', marginBottom: '8px' }}>
                📍 Sede / Città Meteo Predefinita
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(125px, 1fr))', gap: '7px' }}>
                {presetCities.map(city => {
                  const isSelected = selectedWeatherCity.name === city.name;
                  return (
                    <button
                      key={city.name}
                      type="button"
                      onClick={() => onSelectCity(city)}
                      style={{
                        padding: '7px 10px',
                        borderRadius: '8px',
                        border: isSelected ? '1px solid var(--accent-primary, #6366f1)' : '1px solid rgba(255, 255, 255, 0.08)',
                        background: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.02)',
                        color: isSelected ? '#fff' : '#cbd5e1',
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      <div>{city.name}</div>
                      <div style={{ fontSize: '0.67rem', color: '#94a3b8', fontWeight: 400 }}>{city.region}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CHIAVI GEMINI AI */}
        {activeTab === 'keys' && (
          <div>
            {/* Model Selection */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', display: 'block', marginBottom: '6px' }}>
                🧠 Modello Gemini AI Predefinito
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {GEMINI_MODELS.map(m => {
                  const isSelected = selectedModel === m.id;
                  return (
                    <div
                      key={m.id}
                      onClick={() => onSelectModel(m.id)}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                        border: isSelected ? '1px solid var(--accent-primary, #6366f1)' : '1px solid rgba(255, 255, 255, 0.08)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff' }}>{m.name}</span>
                      {isSelected && <span style={{ color: '#38bdf8', fontWeight: 700 }}>✓</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* API Keys List */}
            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', display: 'block', marginBottom: '6px' }}>
                🔑 Chiavi API Google Gemini Salvate ({keysDraft.length})
              </label>
              <p style={{ fontSize: '0.74rem', color: '#94a3b8', margin: '0 0 10px 0' }}>
                Le chiavi vengono utilizzate per le spiegazioni AI, l&apos;analisi appunti e l&apos;assistente allo studio.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '150px', overflowY: 'auto', marginBottom: '12px' }}>
                {keysDraft.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8', padding: '10px', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                    Nessuna chiave salvata. Aggiungi la tua prima chiave API qui sotto.
                  </div>
                ) : (
                  keysDraft.map((key, idx) => {
                    const isSelected = selectedKeyDraft === idx;
                    const masked = key.substring(0, 7) + '••••••••••••' + key.slice(-4);
                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: isSelected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.03)',
                          border: `1px solid ${isSelected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
                          padding: '8px 12px',
                          borderRadius: '8px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.74rem', color: isSelected ? '#34d399' : '#94a3b8', fontWeight: 600 }}>
                            #{idx + 1}
                          </span>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: '#e2e8f0' }}>
                            {masked}
                          </span>
                          {isSelected && (
                            <span style={{ fontSize: '0.68rem', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                              Attiva
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {!isSelected && (
                            <button
                              type="button"
                              onClick={() => handleSelectActiveKey(idx)}
                              style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#cbd5e1', padding: '3px 8px', borderRadius: '5px', fontSize: '0.7rem', cursor: 'pointer' }}
                            >
                              Usa
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveKey(idx)}
                            style={{ background: 'transparent', border: 'none', color: '#f43f5e', padding: '3px 6px', fontSize: '0.8rem', cursor: 'pointer' }}
                            title="Elimina chiave"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Add Key input */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="password"
                  placeholder="Incolla nuova API Key (AIzaSy...)"
                  value={newKeyInput}
                  onChange={e => setNewKeyInput(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    color: '#f8fafc',
                    padding: '8px 12px',
                    fontSize: '0.82rem'
                  }}
                />
                <button
                  type="button"
                  onClick={handleAddKey}
                  disabled={!newKeyInput.trim()}
                  style={{
                    background: 'var(--accent-primary, #6366f1)',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: newKeyInput.trim() ? 'pointer' : 'not-allowed',
                    opacity: newKeyInput.trim() ? 1 : 0.6
                  }}
                >
                  + Aggiungi
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: ACCOUNT & BACKUP */}
        {activeTab === 'account' && (
          <div>
            <div
              style={{
                padding: '16px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                marginBottom: '16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                {currentUser?.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt="Avatar"
                    style={{ width: '42px', height: '42px', borderRadius: '50%', border: '2px solid var(--accent-primary, #6366f1)' }}
                  />
                ) : (
                  <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'var(--accent-primary, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                    👤
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff' }}>
                    {currentUser?.displayName || 'Utente Workspace'}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                    {currentUser?.email || 'Nessun account connesso'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', color: cloudSyncActive ? '#34d399' : '#f59e0b', marginTop: '6px' }}>
                <span>{cloudSyncActive ? '🟢 Sincronizzazione Cloud Firestore attiva' : '🟡 Modalità offline'}</span>
              </div>
            </div>

            {/* Offline backup export / import */}
            <div
              style={{
                padding: '16px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px'
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#fff', marginBottom: '4px' }}>
                💾 Backup e Salvataggio Dati Offline
              </div>
              <p style={{ fontSize: '0.74rem', color: '#94a3b8', margin: '0 0 12px 0' }}>
                Esporta una copia completa in formato JSON di tutti i tuoi appunti, materie e impostazioni:
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={onExportBackup}
                  style={{
                    flex: 1,
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    border: 'none',
                    color: '#fff',
                    padding: '9px 14px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  📥 Scarica Backup JSON
                </button>
                <button
                  type="button"
                  onClick={onOpenRestoreBackup}
                  style={{
                    flex: 1,
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#e2e8f0',
                    padding: '9px 14px',
                    borderRadius: '8px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  📂 Ripristina Backup
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '12px' }}>
          <button
            type="button"
            className="dialog-btn"
            onClick={onClose}
            style={{
              background: 'var(--accent-primary, #6366f1)',
              border: 'none',
              color: '#fff',
              borderRadius: '8px',
              padding: '8px 22px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Salva e Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};
