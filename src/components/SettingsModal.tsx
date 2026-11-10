import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { CityLocation } from '../services/weatherService';

export interface BackgroundTheme {
  id: number;
  name: string;
  category: string;
  cssUrl: string;
  previewUrl: string;
}

export const BACKGROUND_THEMES: BackgroundTheme[] = [
  {
    id: 0,
    name: 'Cyberpunk Neon',
    category: 'Futuristico',
    cssUrl: 'url("https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=2564")',
    previewUrl: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=400'
  },
  {
    id: 1,
    name: 'Hardware Circuit',
    category: 'Tecnologia',
    cssUrl: 'url("https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=2564")',
    previewUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=400'
  },
  {
    id: 2,
    name: 'Dark Liquid Flow',
    category: 'Astratto',
    cssUrl: 'url("https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=2564")',
    previewUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=400'
  },
  {
    id: 3,
    name: 'Deep Space Nebula',
    category: 'Spazio',
    cssUrl: 'url("https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=2564")',
    previewUrl: 'https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?q=80&w=400'
  },
  {
    id: 4,
    name: 'Tokyo Night Cyber',
    category: 'Città',
    cssUrl: 'url("https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=2564")',
    previewUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?q=80&w=400'
  },
  {
    id: 5,
    name: 'Aurora Borealis',
    category: 'Natura',
    cssUrl: 'url("https://images.unsplash.com/photo-1531366936337-7c912a4589a7?q=80&w=2564")',
    previewUrl: 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?q=80&w=400'
  },
  {
    id: 6,
    name: 'Retro Synthwave Tech',
    category: 'Retrò',
    cssUrl: 'url("https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=2564")',
    previewUrl: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?q=80&w=400'
  },
  {
    id: 7,
    name: 'Mountain Sunset Mist',
    category: 'Paesaggio',
    cssUrl: 'url("https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=2564")',
    previewUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?q=80&w=400'
  }
];

export const FONT_OPTIONS = [
  { id: 'plus-jakarta', name: 'Plus Jakarta Sans', fontClass: 'font-plus-jakarta', sample: 'Aa Bb Gg 123 • Chiara e moderna' },
  { id: 'inter', name: 'Inter Display', fontClass: 'font-inter', sample: 'Aa Bb Gg 123 • Neutra ed essenziale' },
  { id: 'outfit', name: 'Outfit Geometric', fontClass: 'font-outfit', sample: 'Aa Bb Gg 123 • Morbida e pulita' },
  { id: 'mono', name: 'JetBrains Code Mono', fontClass: 'font-mono', sample: 'const note = 123; // Monospace' },
  { id: 'serif', name: 'Playfair Editorial Serif', fontClass: 'font-serif', sample: 'Aa Bb Gg 123 • Elegante accademica' }
];

export const FONT_SIZES = [
  { size: 13, label: 'Compatto (13px)' },
  { size: 15, label: 'Standard (15px)' },
  { size: 17, label: 'Medio (17px)' },
  { size: 19, label: 'Grande (19px)' }
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
  fontFamily: string;
  onSelectFontFamily: (font: string) => void;
  fontSize: number;
  onSelectFontSize: (size: number) => void;
  showWeatherWidget: boolean;
  onToggleShowWeatherWidget: (show: boolean) => void;
  isImmersion: boolean;
  onToggleImmersion: () => void;
  isSidebarCollapsed: boolean;
  onToggleSidebarCollapsed: () => void;
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
  fontFamily,
  onSelectFontFamily,
  fontSize,
  onSelectFontSize,
  showWeatherWidget,
  onToggleShowWeatherWidget,
  isImmersion,
  onToggleImmersion,
  isSidebarCollapsed,
  onToggleSidebarCollapsed,
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
  const [activeTab, setActiveTab] = useState<'appearance' | 'widgets' | 'keys' | 'account'>('appearance');

  // Keys draft state
  const [keysDraft, setKeysDraft] = useState<string[]>(apiKeys || []);
  const [selectedKeyDraft, setSelectedKeyDraft] = useState<number>(selectedKeyIndex || 0);
  const [newKeyInput, setNewKeyInput] = useState('');

  if (!isOpen) return null;

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
          maxWidth: '720px',
          width: '95%',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'rgba(15, 17, 23, 0.96)',
          backdropFilter: 'blur(28px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '20px',
          padding: '24px',
          color: '#f8fafc',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.8)'
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.6rem' }}>⚙️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>
                Impostazioni Workspace ITS
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                Personalizza aspetto, tipografia, widget e chiavi AI
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
              fontSize: '1.3rem',
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
            gap: '6px',
            background: 'rgba(255, 255, 255, 0.04)',
            padding: '5px',
            borderRadius: '12px',
            marginBottom: '20px',
            border: '1px solid rgba(255, 255, 255, 0.06)'
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('appearance')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'appearance' ? '#6366f1' : 'transparent',
              color: activeTab === 'appearance' ? '#ffffff' : '#94a3b8',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            🎨 Aspetto & Sfondi
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('widgets')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'widgets' ? '#6366f1' : 'transparent',
              color: activeTab === 'widgets' ? '#ffffff' : '#94a3b8',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            🧩 Widget & Layout
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('keys')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'keys' ? '#6366f1' : 'transparent',
              color: activeTab === 'keys' ? '#ffffff' : '#94a3b8',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            🔑 Chiavi Gemini AI
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('account')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'account' ? '#6366f1' : 'transparent',
              color: activeTab === 'account' ? '#ffffff' : '#94a3b8',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            👤 Account & Backup
          </button>
        </div>

        {/* TAB 1: ASPETTO & SFONDI */}
        {activeTab === 'appearance' && (
          <div>
            {/* Wallpapers section */}
            <div style={{ marginBottom: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <label style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc' }}>
                  🖼️ Sfondo del Workspace ({BACKGROUND_THEMES.length} temi disponibili)
                </label>
                <span style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                  Attivo: <b>{BACKGROUND_THEMES[bgIndex]?.name || 'Predefinito'}</b>
                </span>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
                  gap: '10px'
                }}
              >
                {BACKGROUND_THEMES.map(theme => {
                  const isSelected = bgIndex === theme.id;
                  return (
                    <div
                      key={theme.id}
                      onClick={() => onSelectBackground(theme.id)}
                      style={{
                        position: 'relative',
                        borderRadius: '10px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        border: isSelected ? '2px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.1)',
                        aspectRatio: '16/9',
                        transition: 'transform 0.15s, border-color 0.15s',
                        boxShadow: isSelected ? '0 0 14px rgba(99, 102, 241, 0.45)' : 'none'
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
                          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
                          padding: '12px 6px 4px 6px',
                          fontSize: '0.68rem',
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
                        {isSelected && <span style={{ color: '#38bdf8' }}>✓</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Typography section */}
            <div style={{ marginBottom: '22px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px' }}>
              <label style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc', display: 'block', marginBottom: '6px' }}>
                ✍️ Tipografia e Font per gli Appunti
              </label>
              <p style={{ fontSize: '0.74rem', color: '#94a3b8', margin: '0 0 12px 0' }}>
                Scegli il font con cui visualizzare e redigere i tuoi appunti:
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px' }}>
                {FONT_OPTIONS.map(f => {
                  const isSelected = fontFamily === f.id;
                  return (
                    <div
                      key={f.id}
                      onClick={() => onSelectFontFamily(f.id)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        background: isSelected ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                        border: isSelected ? '1px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.08)',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff' }}>{f.name}</span>
                        {isSelected && <span style={{ color: '#6366f1', fontSize: '0.8rem', fontWeight: 700 }}>✓</span>}
                      </div>
                      <div className={f.fontClass} style={{ fontSize: '0.74rem', color: '#94a3b8' }}>
                        {f.sample}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Font Size section */}
            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label style={{ fontSize: '0.88rem', fontWeight: 700, color: '#f8fafc' }}>
                  📏 Dimensione Testo Note
                </label>
                <span style={{ fontSize: '0.78rem', color: '#818cf8', fontWeight: 600 }}>{fontSize}px</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {FONT_SIZES.map(s => {
                  const isSelected = fontSize === s.size;
                  return (
                    <button
                      key={s.size}
                      type="button"
                      onClick={() => onSelectFontSize(s.size)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: isSelected ? '1px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.1)',
                        background: isSelected ? '#6366f1' : 'rgba(255, 255, 255, 0.04)',
                        color: isSelected ? '#fff' : '#cbd5e1',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: WIDGET & LAYOUT */}
        {activeTab === 'widgets' && (
          <div>
            {/* Weather Widget Toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                marginBottom: '14px'
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#fff' }}>
                  🌤️ Mostra Widget Meteo nella Barra Laterale
                </div>
                <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '2px' }}>
                  Visualizza temperatura e condizioni meteo in tempo reale nella colonna strumenti
                </div>
              </div>
              <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showWeatherWidget}
                  onChange={e => onToggleShowWeatherWidget(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span
                  style={{
                    position: 'absolute',
                    cursor: 'pointer',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: showWeatherWidget ? '#6366f1' : 'rgba(255, 255, 255, 0.15)',
                    borderRadius: '24px',
                    transition: '0.2s'
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      content: '""',
                      height: '18px',
                      width: '18px',
                      left: showWeatherWidget ? '23px' : '3px',
                      bottom: '3px',
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      transition: '0.2s'
                    }}
                  />
                </span>
              </label>
            </div>

            {/* Weather Default City Selector */}
            <div
              style={{
                padding: '14px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px',
                marginBottom: '14px'
              }}
            >
              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', display: 'block', marginBottom: '4px' }}>
                📍 Sede / Città Meteo Predefinita
              </label>
              <p style={{ fontSize: '0.74rem', color: '#94a3b8', margin: '0 0 10px 0' }}>
                Seleziona la sede o città principale per gli aggiornamenti meteo e orari:
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
                {presetCities.map(city => {
                  const isSelected = selectedWeatherCity.name === city.name;
                  return (
                    <button
                      key={city.name}
                      type="button"
                      onClick={() => onSelectCity(city)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: isSelected ? '1px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.08)',
                        background: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.02)',
                        color: isSelected ? '#fff' : '#cbd5e1',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      <div>{city.name}</div>
                      <div style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 400 }}>{city.region}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Layout Toggles (Focus Mode & Sidebar) */}
            <div
              style={{
                padding: '14px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '12px'
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#fff', marginBottom: '10px' }}>
                🖥️ Preferenze di Visualizzazione
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>Modalità Concentrazione (Full Immersion)</span>
                  <button
                    type="button"
                    onClick={onToggleImmersion}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: isImmersion ? '#6366f1' : 'rgba(255,255,255,0.06)',
                      border: 'none',
                      color: '#fff',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {isImmersion ? 'Attiva' : 'Disattivata'}
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>Barra laterale strumenti compressa</span>
                  <button
                    type="button"
                    onClick={onToggleSidebarCollapsed}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: isSidebarCollapsed ? '#6366f1' : 'rgba(255,255,255,0.06)',
                      border: 'none',
                      color: '#fff',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {isSidebarCollapsed ? 'Compressa (Icone)' : 'Estesa'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: CHIAVI GEMINI AI */}
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
                        border: isSelected ? '1px solid #6366f1' : '1px solid rgba(255, 255, 255, 0.08)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#fff' }}>{m.name}</span>
                      {isSelected && <span style={{ color: '#6366f1', fontWeight: 700 }}>✓</span>}
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
                    background: '#6366f1',
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

        {/* TAB 4: ACCOUNT & BACKUP */}
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
                    style={{ width: '42px', height: '42px', borderRadius: '50%', border: '2px solid #6366f1' }}
                  />
                ) : (
                  <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '14px' }}>
          <button
            type="button"
            className="dialog-btn"
            onClick={onClose}
            style={{
              background: '#6366f1',
              border: 'none',
              color: '#fff',
              borderRadius: '8px',
              padding: '8px 20px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Fatto
          </button>
        </div>
      </div>
    </div>
  );
};
