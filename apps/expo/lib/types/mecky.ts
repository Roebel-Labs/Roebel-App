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

export interface RichCardData {
  type: 'events' | 'restaurants' | 'marketplace' | 'news' | 'movies' | 'businesses' | 'deals';
  items: any[];
}

export interface NavigationLink {
  route: string;
  label: string;
}
