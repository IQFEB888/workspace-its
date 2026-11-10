export interface CityLocation {
  name: string;
  lat: number;
  lon: number;
  region: string;
}

export interface CurrentWeather {
  temp: number;
  apparentTemp: number;
  humidity: number;
  windSpeed: number;
  precipitation: number;
  weatherCode: number;
  conditionText: string;
  icon: string;
  pressure: number;
  advice: string;
  lastUpdated: string;
}

export interface HourlyForecast {
  time: string;
  temp: number;
  weatherCode: number;
  icon: string;
  rainProb: number;
}

export interface DailyForecast {
  date: string;
  dayName: string;
  weatherCode: number;
  icon: string;
  conditionText: string;
  tempMin: number;
  tempMax: number;
  rainProb: number;
  uvMax: number;
}

export interface FullWeatherData {
  city: CityLocation;
  current: CurrentWeather;
  hourly: HourlyForecast[];
  daily: DailyForecast[];
}

export const PRESET_CITIES: CityLocation[] = [
  { name: 'Seregno', lat: 45.65, lon: 9.20, region: 'MB • Sede ITS' },
  { name: 'Monza', lat: 45.58, lon: 9.27, region: 'MB' },
  { name: 'Milano', lat: 45.46, lon: 9.19, region: 'MI' },
  { name: 'Bergamo', lat: 45.69, lon: 9.67, region: 'BG' },
  { name: 'Brescia', lat: 45.54, lon: 10.22, region: 'BS' },
  { name: 'Como', lat: 45.81, lon: 9.08, region: 'CO' },
  { name: 'Lecco', lat: 45.85, lon: 9.39, region: 'LC' },
  { name: 'Varese', lat: 45.82, lon: 8.82, region: 'VA' },
  { name: 'Roma', lat: 41.90, lon: 12.50, region: 'RM' }
];

export function getWeatherCondition(code: number): { text: string; icon: string } {
  switch (code) {
    case 0:
      return { text: 'Sereno', icon: '☀️' };
    case 1:
      return { text: 'Prevalentemente sereno', icon: '🌤️' };
    case 2:
      return { text: 'Parzialmente nuvoloso', icon: '⛅' };
    case 3:
      return { text: 'Nuvoloso', icon: '☁️' };
    case 45:
    case 48:
      return { text: 'Nebbia', icon: '🌫️' };
    case 51:
    case 53:
    case 55:
      return { text: 'Pioviggine', icon: '🌦️' };
    case 61:
    case 63:
    case 65:
      return { text: 'Pioggia', icon: '🌧️' };
    case 66:
    case 67:
      return { text: 'Pioggia gelata', icon: '🌨️' };
    case 71:
    case 73:
    case 75:
      return { text: 'Neve', icon: '❄️' };
    case 77:
      return { text: 'Granelli di neve', icon: '❄️' };
    case 80:
    case 81:
    case 82:
      return { text: 'Rovesci di pioggia', icon: '🌧️' };
    case 85:
    case 86:
      return { text: 'Rovesci di neve', icon: '🌨️' };
    case 95:
      return { text: 'Temporale', icon: '⛈️' };
    case 96:
    case 99:
      return { text: 'Temporale con grandine', icon: '⛈️' };
    default:
      return { text: 'Variabile', icon: '🌤️' };
  }
}

export function generateStudentAdvice(temp: number, weatherCode: number, precipitation: number): string {
  if (weatherCode >= 95) {
    return '⚡ Attenzione: previsti temporali! Se sei all\'ITS o devi viaggiare, prudenza negli spostamenti.';
  }
  if (precipitation > 0 || [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(weatherCode)) {
    return '🌧️ Prevista pioggia: ricorda di portare l\'ombrello per raggiungere l\'ITS o rientrare a casa!';
  }
  if (temp < 5) {
    return '🧣 Fa freddo: copriti bene prima di uscire per le lezioni o il laboratorio.';
  }
  if (temp >= 28) {
    return '🥤 Caldo intenso: ricordati di bere acqua e fare brevi pause durante lo studio.';
  }
  if ([0, 1].includes(weatherCode) && temp >= 16 && temp <= 25) {
    return '☀️ Giornata ideale: clima piacevole e limpido, ottimo per studiare e fare una pausa all\'aperto.';
  }
  return '📚 Clima regolare per la giornata di studio. Buon lavoro sui tuoi appunti ITS!';
}

export async function fetchFullWeather(city: CityLocation): Promise<FullWeatherData | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,surface_pressure&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max&timezone=Europe%2FRome`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Open-Meteo HTTP ${res.status}`);
    }
    const data = await res.json();

    const currentCode = data.current?.weather_code ?? 0;
    const cond = getWeatherCondition(currentCode);
    const temp = Math.round(data.current?.temperature_2m ?? 18);
    const apparent = Math.round(data.current?.apparent_temperature ?? temp);
    const precip = data.current?.precipitation ?? 0;

    const current: CurrentWeather = {
      temp,
      apparentTemp: apparent,
      humidity: Math.round(data.current?.relative_humidity_2m ?? 60),
      windSpeed: Math.round(data.current?.wind_speed_10m ?? 8),
      precipitation: precip,
      weatherCode: currentCode,
      conditionText: cond.text,
      icon: cond.icon,
      pressure: Math.round(data.current?.surface_pressure ?? 1013),
      advice: generateStudentAdvice(temp, currentCode, precip),
      lastUpdated: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
    };

    // Parse Hourly (take next 12 hours starting from now)
    const hourly: HourlyForecast[] = [];
    if (data.hourly && Array.isArray(data.hourly.time)) {
      const nowIso = new Date().toISOString();
      let startIdx = data.hourly.time.findIndex((t: string) => t >= nowIso.substring(0, 13));
      if (startIdx < 0) startIdx = 0;

      for (let i = startIdx; i < Math.min(startIdx + 12, data.hourly.time.length); i++) {
        const timeStr = data.hourly.time[i];
        const dateObj = new Date(timeStr);
        const hourLabel = dateObj.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        const hCode = data.hourly.weather_code?.[i] ?? 0;
        const hCond = getWeatherCondition(hCode);
        hourly.push({
          time: hourLabel,
          temp: Math.round(data.hourly.temperature_2m?.[i] ?? 0),
          weatherCode: hCode,
          icon: hCond.icon,
          rainProb: Math.round(data.hourly.precipitation_probability?.[i] ?? 0)
        });
      }
    }

    // Parse Daily (next 5 days)
    const daily: DailyForecast[] = [];
    if (data.daily && Array.isArray(data.daily.time)) {
      const daysCount = Math.min(5, data.daily.time.length);
      for (let i = 0; i < daysCount; i++) {
        const dateStr = data.daily.time[i];
        const dateObj = new Date(dateStr);
        let dayName = dateObj.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'numeric' });
        if (i === 0) dayName = 'Oggi';
        else if (i === 1) dayName = 'Domani';

        const dCode = data.daily.weather_code?.[i] ?? 0;
        const dCond = getWeatherCondition(dCode);

        daily.push({
          date: dateStr,
          dayName,
          weatherCode: dCode,
          icon: dCond.icon,
          conditionText: dCond.text,
          tempMin: Math.round(data.daily.temperature_2m_min?.[i] ?? 0),
          tempMax: Math.round(data.daily.temperature_2m_max?.[i] ?? 0),
          rainProb: Math.round(data.daily.precipitation_probability_max?.[i] ?? 0),
          uvMax: Math.round(data.daily.uv_index_max?.[i] ?? 0)
        });
      }
    }

    return {
      city,
      current,
      hourly,
      daily
    };
  } catch (err) {
    console.warn('Weather fetch failed, using fallback:', err);
    return null;
  }
}
