/**
 * Types for the Mecky AI chatbot
 */

export interface MeckyMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  richCards?: RichCardData;
  navigationLinks?: NavigationLink[];
  timestamp: number;
}

export type RichCardType =
  | 'events'
  | 'restaurants'
  | 'marketplace'
  | 'news'
  | 'movies'
  | 'businesses'
  | 'deals'
  | 'pois'
  | 'transit'
  | 'tours'
  | 'wildlife'
  | 'wildlife_calendar'
  | 'advisories';

export interface RichCardData {
  type: RichCardType;
  items: any[];
}

export interface NavigationLink {
  route: string;
  label: string;
}
