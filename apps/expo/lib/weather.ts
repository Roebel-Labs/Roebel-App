import type { ImageSourcePropType } from 'react-native';
import type { SvgProps } from 'react-native-svg';
import Constants from 'expo-constants';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

import SunIcon from '@/assets/icons/weather/sun-01.svg';
import SunCloudIcon from '@/assets/icons/weather/sun-cloud-02.svg';
import CloudIcon from '@/assets/icons/weather/blur.svg';
import RainIcon from '@/assets/icons/weather/cloud-mid-rain.svg';
import LightRainIcon from '@/assets/icons/weather/cloud-little-rain.svg';
import HeavyRainIcon from '@/assets/icons/weather/cloud-angled-rain.svg';
import ThunderIcon from '@/assets/icons/weather/sun-cloud-angled-rain-zap-02.svg';
import SnowIcon from '@/assets/icons/weather/sun-cloud-mid-snow-02.svg';
import WindyIcon from '@/assets/icons/weather/sun-cloud-fast-wind-02.svg';

export const ROEBEL_COORDS = {
  latitude: 53.3667,
  longitude: 12.6,
};

export type CurrentWeather = {
  tempC: number;
  feelsLikeC: number | null;
  conditionType: string;
  conditionText: string;
  precipitationProbability: number;
  precipitationMm: number;
  windSpeedKmh: number;
  windCardinal: string;
  humidity: number;
  pressureHpa: number | null;
};

export type DailyEntry = {
  date: Date;
  conditionType: string;
  conditionText: string;
  maxC: number;
  minC: number;
  precipitationProbability: number;
  precipitationMm: number;
  windSpeedKmh: number;
  windCardinal: string;
  sunriseTime: string | null;
  sunsetTime: string | null;
};

export type HourlyEntry = {
  date: Date;
  tempC: number;
  conditionType: string;
  precipitationProbability: number;
  windSpeedKmh: number;
};

export type WeatherSnapshot = {
  current: CurrentWeather;
  hourly: HourlyEntry[];
  daily: DailyEntry[];
};

const BASE_URL = 'https://weather.googleapis.com/v1';

function getApiKey(): string | null {
  const fromExtra = (Constants.expoConfig?.extra as Record<string, string> | undefined)
    ?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  return fromExtra || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || null;
}

function buildUrl(path: string, extra: Record<string, string | number> = {}): string {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Missing EXPO_PUBLIC_GOOGLE_MAPS_API_KEY');
  const params = new URLSearchParams({
    key: apiKey,
    'location.latitude': String(ROEBEL_COORDS.latitude),
    'location.longitude': String(ROEBEL_COORDS.longitude),
    languageCode: 'de',
    unitsSystem: 'METRIC',
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, String(v)])),
  });
  return `${BASE_URL}/${path}?${params.toString()}`;
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Weather API ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchCurrentConditions(): Promise<CurrentWeather> {
  const data = await getJson(buildUrl('currentConditions:lookup'));
  return {
    tempC: Number(data?.temperature?.degrees ?? 0),
    feelsLikeC:
      typeof data?.feelsLikeTemperature?.degrees === 'number'
        ? data.feelsLikeTemperature.degrees
        : null,
    conditionType: String(data?.weatherCondition?.type ?? 'UNKNOWN'),
    conditionText: String(data?.weatherCondition?.description?.text ?? ''),
    precipitationProbability: Number(data?.precipitation?.probability?.percent ?? 0),
    precipitationMm: Number(data?.precipitation?.qpf?.quantity ?? 0),
    windSpeedKmh: Number(data?.wind?.speed?.value ?? 0),
    windCardinal: String(data?.wind?.direction?.cardinal ?? ''),
    humidity: Number(data?.relativeHumidity ?? 0),
    pressureHpa:
      typeof data?.airPressure?.meanSeaLevelMillibars === 'number'
        ? data.airPressure.meanSeaLevelMillibars
        : null,
  };
}

export async function fetchHourlyForecast(hours: number): Promise<HourlyEntry[]> {
  const data = await getJson(buildUrl('forecast/hours:lookup', { hours, pageSize: hours }));
  const list = Array.isArray(data?.forecastHours) ? data.forecastHours : [];
  return list.map((entry: any): HourlyEntry => {
    const startTime = entry?.interval?.startTime;
    return {
      date: startTime ? new Date(startTime) : new Date(),
      tempC: Number(entry?.temperature?.degrees ?? 0),
      conditionType: String(entry?.weatherCondition?.type ?? 'UNKNOWN'),
      precipitationProbability: Number(entry?.precipitation?.probability?.percent ?? 0),
      windSpeedKmh: Number(entry?.wind?.speed?.value ?? 0),
    };
  });
}

export async function fetchDailyForecast(days: number): Promise<DailyEntry[]> {
  const data = await getJson(buildUrl('forecast/days:lookup', { days, pageSize: days }));
  const list = Array.isArray(data?.forecastDays) ? data.forecastDays : [];
  return list.map((day: any): DailyEntry => {
    const startTime = day?.interval?.startTime;
    const dt = day?.daytimeForecast ?? {};
    return {
      date: startTime ? new Date(startTime) : new Date(),
      conditionType: String(dt?.weatherCondition?.type ?? 'UNKNOWN'),
      conditionText: String(dt?.weatherCondition?.description?.text ?? ''),
      maxC: Number(day?.maxTemperature?.degrees ?? 0),
      minC: Number(day?.minTemperature?.degrees ?? 0),
      precipitationProbability: Number(dt?.precipitation?.probability?.percent ?? 0),
      precipitationMm: Number(dt?.precipitation?.qpf?.quantity ?? 0),
      windSpeedKmh: Number(dt?.wind?.speed?.value ?? 0),
      windCardinal: String(dt?.wind?.direction?.cardinal ?? ''),
      sunriseTime: day?.sunEvents?.sunriseTime ?? null,
      sunsetTime: day?.sunEvents?.sunsetTime ?? null,
    };
  });
}

export async function fetchAllWeather(): Promise<WeatherSnapshot> {
  const [current, hourly, daily] = await Promise.all([
    fetchCurrentConditions(),
    fetchHourlyForecast(12),
    fetchDailyForecast(7),
  ]);
  return { current, hourly, daily };
}

// Google's weatherCondition.type often returns rain-flavored labels
// (CHANCE_OF_SHOWERS, LIGHT_RAIN_SHOWERS, SCATTERED_SHOWERS, …) at
// low probabilities. We tier the visual fall-off so the icon next to
// the percentage doesn't claim more rain than the number suggests:
//   ≥ 60 %  → rain
//   30–60 % → cloudy
//   10–30 % → partly cloudy
//   < 10 %  → sun
const PRECIP_RAIN_MIN = 60;
const PRECIP_CLOUDY_MIN = 30;
const PRECIP_PARTLY_CLOUDY_MIN = 10;

function isRainyConditionType(upperType: string): boolean {
  return (
    upperType.includes('RAIN') ||
    upperType.includes('DRIZZLE') ||
    upperType.includes('SHOWER') ||
    upperType.includes('THUNDER') ||
    upperType.includes('STORM')
  );
}

export function getWeatherIcon(
  conditionType: string,
  precipitationProbability?: number,
): React.FC<SvgProps> {
  const type = (conditionType || '').toUpperCase();

  if (
    isRainyConditionType(type) &&
    precipitationProbability !== undefined &&
    precipitationProbability < PRECIP_RAIN_MIN
  ) {
    if (precipitationProbability < PRECIP_PARTLY_CLOUDY_MIN) return SunIcon;
    if (precipitationProbability < PRECIP_CLOUDY_MIN) return SunCloudIcon;
    return CloudIcon;
  }

  if (type.includes('CLEAR') || type.includes('SUNNY')) return SunIcon;
  if (type === 'PARTLY_CLOUDY' || type === 'MOSTLY_CLOUDY') return SunCloudIcon;
  if (type === 'CLOUDY' || type.includes('OVERCAST')) return CloudIcon;
  if (type === 'LIGHT_RAIN' || type === 'DRIZZLE') return LightRainIcon;
  if (type === 'RAIN' || type === 'SHOWERS') return RainIcon;
  if (type === 'HEAVY_RAIN') return HeavyRainIcon;
  if (type.includes('THUNDER') || type.includes('STORM')) return ThunderIcon;
  if (type.includes('SNOW') || type.includes('FLURRIES')) return SnowIcon;
  if (type.includes('SLEET') || type.includes('ICE')) return SnowIcon;
  if (type.includes('FOG') || type.includes('MIST') || type.includes('HAZE')) return CloudIcon;
  if (type.includes('WIND')) return WindyIcon;
  return SunCloudIcon;
}

const ILLUSTRATIONS = {
  sonnig: require('@/assets/illustration/weather/sonnig.png') as ImageSourcePropType,
  heiter: require('@/assets/illustration/weather/heiter.png') as ImageSourcePropType,
  leichtBewoelkt: require('@/assets/illustration/weather/leicht bewoelkt.png') as ImageSourcePropType,
  bewoelkt: require('@/assets/illustration/weather/bewoelkt.png') as ImageSourcePropType,
  neblig: require('@/assets/illustration/weather/neblig.png') as ImageSourcePropType,
  regenSchwach: require('@/assets/illustration/weather/regen schwach.png') as ImageSourcePropType,
  regenStark: require('@/assets/illustration/weather/regen stark.png') as ImageSourcePropType,
  hagel: require('@/assets/illustration/weather/hagel.png') as ImageSourcePropType,
};

export function getWeatherIllustration(
  conditionType: string,
  precipitationProbability?: number,
): ImageSourcePropType {
  const t = (conditionType || '').toUpperCase();

  if (
    isRainyConditionType(t) &&
    precipitationProbability !== undefined &&
    precipitationProbability < PRECIP_RAIN_MIN
  ) {
    if (precipitationProbability < PRECIP_PARTLY_CLOUDY_MIN) return ILLUSTRATIONS.sonnig;
    if (precipitationProbability < PRECIP_CLOUDY_MIN) return ILLUSTRATIONS.heiter;
    return ILLUSTRATIONS.bewoelkt;
  }

  if (t === 'CLEAR') return ILLUSTRATIONS.sonnig;
  if (t === 'MOSTLY_CLEAR') return ILLUSTRATIONS.heiter;
  if (t === 'PARTLY_CLOUDY') return ILLUSTRATIONS.leichtBewoelkt;
  if (t === 'MOSTLY_CLOUDY' || t === 'CLOUDY' || t.includes('OVERCAST')) {
    return ILLUSTRATIONS.bewoelkt;
  }
  if (t.includes('FOG') || t.includes('MIST') || t.includes('HAZE')) {
    return ILLUSTRATIONS.neblig;
  }
  if (
    t.includes('HAIL') ||
    t.includes('SNOW') ||
    t.includes('SLEET') ||
    t.includes('ICE') ||
    t === 'FREEZING_RAIN'
  ) {
    return ILLUSTRATIONS.hagel;
  }
  if (
    t === 'HEAVY_RAIN' ||
    t === 'HEAVY_RAIN_SHOWERS' ||
    t === 'MODERATE_TO_HEAVY_RAIN' ||
    t === 'RAIN' ||
    t === 'RAIN_SHOWERS' ||
    t.includes('THUNDER') ||
    t.includes('STORM')
  ) {
    return ILLUSTRATIONS.regenStark;
  }
  if (
    t === 'LIGHT_RAIN' ||
    t === 'DRIZZLE' ||
    t === 'LIGHT_RAIN_SHOWERS' ||
    t === 'CHANCE_OF_SHOWERS' ||
    t === 'SCATTERED_SHOWERS' ||
    t === 'LIGHT_TO_MODERATE_RAIN' ||
    t === 'SHOWERS'
  ) {
    return ILLUSTRATIONS.regenSchwach;
  }

  return ILLUSTRATIONS.bewoelkt;
}

const GERMAN_CONDITIONS: Record<string, string> = {
  clear: 'Klar',
  sunny: 'Sonnig',
  'clear sky': 'Klarer Himmel',
  'partly cloudy': 'Teilweise bewölkt',
  'partly sunny': 'Teilweise sonnig',
  'mostly cloudy': 'Überwiegend bewölkt',
  'mostly sunny': 'Überwiegend sonnig',
  cloudy: 'Bewölkt',
  overcast: 'Bedeckt',
  'light rain': 'Leichter Regen',
  rain: 'Regen',
  'heavy rain': 'Starker Regen',
  drizzle: 'Nieselregen',
  showers: 'Schauer',
  'scattered showers': 'Vereinzelte Schauer',
  thunderstorm: 'Gewitter',
  storm: 'Sturm',
  thunderstorms: 'Gewitter',
  snow: 'Schnee',
  'light snow': 'Leichter Schneefall',
  'heavy snow': 'Starker Schneefall',
  flurries: 'Schneeschauer',
  sleet: 'Schneeregen',
  fog: 'Nebel',
  mist: 'Nebel',
  haze: 'Dunst',
  windy: 'Windig',
};

export function translateWeatherCondition(condition: string): string {
  if (!condition) return '';
  return GERMAN_CONDITIONS[condition.toLowerCase()] || condition;
}

export function formatGermanWeekday(date: Date): string {
  return format(date, 'EEEE', { locale: de });
}

export function formatHourLabel(date: Date): string {
  return format(date, 'HH:mm');
}

const GERMAN_CARDINAL: Record<string, string> = {
  NORTH: 'N',
  NORTH_NORTHEAST: 'NNO',
  NORTHEAST: 'NO',
  EAST_NORTHEAST: 'ONO',
  EAST: 'O',
  EAST_SOUTHEAST: 'OSO',
  SOUTHEAST: 'SO',
  SOUTH_SOUTHEAST: 'SSO',
  SOUTH: 'S',
  SOUTH_SOUTHWEST: 'SSW',
  SOUTHWEST: 'SW',
  WEST_SOUTHWEST: 'WSW',
  WEST: 'W',
  WEST_NORTHWEST: 'WNW',
  NORTHWEST: 'NW',
  NORTH_NORTHWEST: 'NNW',
};

export function cardinalToGerman(cardinal: string): string {
  if (!cardinal) return '';
  return GERMAN_CARDINAL[cardinal.toUpperCase()] || cardinal;
}
