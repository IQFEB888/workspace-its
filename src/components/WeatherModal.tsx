import React from 'react';
import { FullWeatherData, CityLocation, PRESET_CITIES } from '../services/weatherService';

interface WeatherModalProps {
  isOpen: boolean;
  onClose: () => void;
  weatherData: FullWeatherData | null;
  selectedCity: CityLocation;
  onSelectCity: (city: CityLocation) => void;
  onRefresh: () => void;
  onDetectLocation: () => void;
  isLoading: boolean;
}

export const WeatherModal: React.FC<WeatherModalProps> = ({
  isOpen,
  onClose,
  weatherData,
  selectedCity,
  onSelectCity,
  onRefresh,
  onDetectLocation,
  isLoading
}) => {
  if (!isOpen) return null;

  const current = weatherData?.current;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="weather-modal-dialog"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '680px',
          width: '95%',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'rgba(15, 17, 23, 0.95)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          padding: '24px',
          color: '#f8fafc'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.6rem' }}>🌤️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc' }}>
                ITS Meteo & Previsioni
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                {selectedCity.name} ({selectedCity.region}) • Aggiornato: {current?.lastUpdated || 'Adesso'}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={onRefresh}
              disabled={isLoading}
              title="Aggiorna dati meteo"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#e2e8f0',
                borderRadius: '8px',
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              🔄 {isLoading ? 'Aggiorno...' : 'Aggiorna'}
            </button>
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
        </div>

        {/* City Switcher Pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px' }}>
          {PRESET_CITIES.map(c => (
            <button
              key={c.name}
              onClick={() => onSelectCity(c)}
              style={{
                background: selectedCity.name === c.name ? '#6366f1' : 'rgba(255, 255, 255, 0.06)',
                color: selectedCity.name === c.name ? '#ffffff' : '#cbd5e1',
                border: selectedCity.name === c.name ? '1px solid #818cf8' : '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '999px',
                padding: '4px 12px',
                fontSize: '0.78rem',
                fontWeight: selectedCity.name === c.name ? 600 : 400,
                cursor: 'pointer',
                transition: 'all 0.18s'
              }}
            >
              {c.name}
            </button>
          ))}
          <button
            onClick={onDetectLocation}
            title="Usa la posizione GPS corrente del dispositivo"
            style={{
              background: 'rgba(56, 189, 248, 0.12)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '999px',
              padding: '4px 12px',
              fontSize: '0.78rem',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            📍 Mia Posizione
          </button>
        </div>

        {/* Hero Current Weather */}
        {current ? (
          <>
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.18), rgba(56, 189, 248, 0.12))',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                borderRadius: '16px',
                padding: '20px',
                marginBottom: '18px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                <span style={{ fontSize: '3.6rem', lineHeight: 1 }}>{current.icon}</span>
                <div>
                  <div style={{ fontSize: '2.8rem', fontWeight: 800, lineHeight: 1, color: '#ffffff' }}>
                    {current.temp}°C
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#e2e8f0', marginTop: '4px' }}>
                    {current.conditionText}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                    Percepita: {current.apparentTemp}°C
                  </div>
                </div>
              </div>

              {/* Student Advice */}
              <div
                style={{
                  flex: '1',
                  minWidth: '220px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '12px',
                  padding: '12px 14px'
                }}
              >
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#818cf8', fontWeight: 700, marginBottom: '4px' }}>
                  💡 Consiglio per l'ITS
                </div>
                <div style={{ fontSize: '0.83rem', color: '#f1f5f9', lineHeight: 1.45 }}>
                  {current.advice}
                </div>
              </div>
            </div>

            {/* Metrics Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                gap: '10px',
                marginBottom: '20px'
              }}
            >
              <div style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', marginBottom: '2px' }}>💧</div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Umidità</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>{current.humidity}%</div>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', marginBottom: '2px' }}>💨</div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Vento</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>{current.windSpeed} km/h</div>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', marginBottom: '2px' }}>🌧️</div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Pioggia</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>{current.precipitation} mm</div>
              </div>
              <div style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '1.2rem', marginBottom: '2px' }}>🧭</div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Pressione</div>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>{current.pressure} hPa</div>
              </div>
            </div>

            {/* Hourly Forecast */}
            {weatherData.hourly && weatherData.hourly.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '10px' }}>
                  🕒 Previsioni Orarie (Prossime Ore)
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    overflowX: 'auto',
                    paddingBottom: '8px',
                    scrollbarWidth: 'thin'
                  }}
                >
                  {weatherData.hourly.map((h, idx) => (
                    <div
                      key={idx}
                      style={{
                        flex: '0 0 68px',
                        background: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.07)',
                        borderRadius: '10px',
                        padding: '10px 4px',
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{h.time}</span>
                      <span style={{ fontSize: '1.3rem' }}>{h.icon}</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ffffff' }}>{h.temp}°</span>
                      <span style={{ fontSize: '0.68rem', color: h.rainProb > 30 ? '#60a5fa' : '#64748b' }}>
                        {h.rainProb}% 💧
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Daily 5-Day Forecast */}
            {weatherData.daily && weatherData.daily.length > 0 && (
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '10px' }}>
                  📅 Previsioni Prossimi Giorni
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {weatherData.daily.map((d, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        borderRadius: '10px',
                        padding: '8px 14px',
                        fontSize: '0.82rem'
                      }}
                    >
                      <div style={{ width: '85px', fontWeight: 600, color: '#e2e8f0' }}>{d.dayName}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, justifyContent: 'center' }}>
                        <span style={{ fontSize: '1.2rem' }}>{d.icon}</span>
                        <span style={{ color: '#cbd5e1' }}>{d.conditionText}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '130px', justifyContent: 'flex-end' }}>
                        <span style={{ color: '#60a5fa', fontSize: '0.74rem' }}>{d.rainProb}% 💧</span>
                        <span style={{ color: '#94a3b8' }}>{d.tempMin}°</span>
                        <span style={{ color: '#64748b' }}>/</span>
                        <span style={{ color: '#f8fafc', fontWeight: 700 }}>{d.tempMax}°</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '36px', color: '#94a3b8' }}>
            {isLoading ? 'Caricamento dati meteo Open-Meteo in corso...' : 'Dati meteo non disponibili al momento.'}
          </div>
        )}
      </div>
    </div>
  );
};
