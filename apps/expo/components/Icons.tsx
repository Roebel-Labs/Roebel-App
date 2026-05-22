import React from 'react';
import { SvgProps, SvgXml } from 'react-native-svg';

// Import local SVG files
import SportSvg from '@/assets/icons/sport.svg';
import MusicSvg from '@/assets/icons/music.svg';
import CommunitySvg from '@/assets/icons/community.svg';
import MarketsSvg from '@/assets/icons/markets.svg';
import CanvasSvg from '@/assets/icons/canvas.svg';
import StarSvg from '@/assets/icons/star.svg';
import BookmarkSvg from '@/assets/icons/bookmark.svg';
import BookmarkActiveSvg from '@/assets/icons/bookmark-active.svg';
import LocationSvg from '@/assets/icons/location.svg';
import LocationSmallSvg from '@/assets/icons/location-small.svg';
import SearchSvg from '@/assets/icons/search.svg';
import HomeSvg from '@/assets/icons/home.svg';
import TicketSvg from '@/assets/icons/ticket.svg';
import TicketSmallSvg from '@/assets/icons/ticket-small.svg';
import CalendarSvg from '@/assets/icons/calendar.svg';
import ArrowLeftSvg from '@/assets/icons/arrow-left.svg';
import ArrowRightSvg from '@/assets/icons/arrow-right.svg';
import InformationCircleSvg from '@/assets/icons/information-circle.svg';
import CallSvg from '@/assets/icons/call.svg';
import UserSvg from '@/assets/icons/user.svg';
import MailSvg from '@/assets/icons/mail.svg';
import CultureSvg from '@/assets/icons/culture.svg';
import PartySvg from '@/assets/icons/party.svg';
import BookSvg from '@/assets/icons/book.svg';
import ClockSvg from '@/assets/icons/clock.svg';
import ShareSvg from '@/assets/icons/share.svg';
import ThumbsUpSvg from '@/assets/icons/thumbs-up.svg';
import ThumbsUpFilledSvg from '@/assets/icons/thumbs-up-filled.svg';
import ThumbsDownSvg from '@/assets/icons/thumbs-down.svg';
import MenuListSvg from '@/assets/icons/menu-01.svg';


// Icon mapping for categories
export const categoryIconMap: { [key: string]: React.FC<SvgProps> } = {
  'Sports': SportSvg,
  'Music': MusicSvg,
  'Community': CommunitySvg,
  'Markets': MarketsSvg,
  'Canvas': CanvasSvg,
  'Food': MarketsSvg, // Using markets icon for food
  'Arts & Culture': CultureSvg,
  'Business': CommunitySvg,
  'Technology': CommunitySvg,
  'Health': CommunitySvg,
  'Education': BookSvg,
  'Family': HomeSvg,
  'Entertainment': PartySvg,
  'Workshop': CommunitySvg,
  // German category mappings
  'Essen & Trinken': MarketsSvg,
  'Gemeinde': CommunitySvg,
  'Kunst': CultureSvg,
  'Musik': MusicSvg,
  'Sport': SportSvg,
};

// Utility component for custom icons
interface CustomIconProps extends SvgProps {
  name: keyof typeof categoryIconMap;
}

export const CustomIcon: React.FC<CustomIconProps> = ({
  name,
  width = 24,
  height = 24,
  color = '#374453',
  ...props
}) => {
  const IconComponent = categoryIconMap[name];

  if (!IconComponent) {
    return null;
  }

  return <IconComponent width={width} height={height} color={color} {...props} />;
};

// Extended props interface to support common patterns
interface IconProps extends SvgProps {
  size?: number;
  strokeWidth?: number;
}

// Wrapper components for easier use with size support
export const SportIcon = ({ size = 24, ...props }: IconProps) => <SportSvg width={size} height={size} {...props} />;
export const MusicIcon = ({ size = 24, ...props }: IconProps) => <MusicSvg width={size} height={size} {...props} />;
export const CommunityIconComponent = ({ size = 24, ...props }: IconProps) => <CommunitySvg width={size} height={size} {...props} />;
export const MarketsIcon = ({ size = 24, ...props }: IconProps) => <MarketsSvg width={size} height={size} {...props} />;
export const StarIconComponent = ({ size = 24, ...props }: IconProps) => <StarSvg width={size} height={size} {...props} />;
export const StarIcon = StarIconComponent;
export const ThumbsUpIcon = ({ size = 24, ...props }: IconProps) => <ThumbsUpSvg width={size} height={size} {...props} />;
export const ThumbsUpFilledIcon = ({ size = 24, ...props }: IconProps) => <ThumbsUpFilledSvg width={size} height={size} {...props} />;
export const ThumbsDownIcon = ({ size = 24, ...props }: IconProps) => <ThumbsDownSvg width={size} height={size} {...props} />;
export const MenuListIcon = ({ size = 24, ...props }: IconProps) => <MenuListSvg width={size} height={size} {...props} />;
export const BookmarkIcon = ({ size = 24, ...props }: IconProps) => <BookmarkSvg width={size} height={size} {...props} />;
export const BookmarkAddIcon = ({ size = 24, ...props }: IconProps) => <BookmarkActiveSvg width={size} height={size} {...props} />;
export const LocationIcon = ({ size = 24, ...props }: IconProps) => <LocationSvg width={size} height={size} {...props} />;
export const LocationSmallIcon = ({ size = 16, ...props }: IconProps) => <LocationSmallSvg width={size} height={size} {...props} />;
export const SearchIcon = ({ size = 24, ...props }: IconProps) => <SearchSvg width={size} height={size} {...props} />;
export const HomeIcon = ({ size = 24, ...props }: IconProps) => <HomeSvg width={size} height={size} {...props} />;
export const TicketIcon = ({ size = 24, ...props }: IconProps) => <TicketSvg width={size} height={size} {...props} />;
export const TicketSmallIcon = ({ size = 16, ...props }: IconProps) => <TicketSmallSvg width={size} height={size} {...props} />;
export const ArrowLeftIcon = ({ size = 24, ...props }: IconProps) => <ArrowLeftSvg width={size} height={size} {...props} />;
export const InformationCircleIcon = ({ size = 24, ...props }: IconProps) => <InformationCircleSvg width={size} height={size} {...props} />;
export const CallIcon = ({ size = 24, ...props }: IconProps) => <CallSvg width={size} height={size} {...props} />;
export const UserIcon = ({ size = 24, ...props }: IconProps) => <UserSvg width={size} height={size} {...props} />;
export const MailIcon = ({ size = 24, ...props }: IconProps) => <MailSvg width={size} height={size} {...props} />;
export const CalendarIcon = ({ size = 24, ...props }: IconProps) => <CalendarSvg width={size} height={size} {...props} />;
export const ChevronLeft = ({ size = 24, ...props }: IconProps) => <ArrowLeftSvg width={size} height={size} {...props} />;
export const ChevronRight = ({ size = 24, ...props }: IconProps) => <ArrowRightSvg width={size} height={size} {...props} />;
export const ClockIcon = ({ size = 24, ...props }: IconProps) => <ClockSvg width={size} height={size} {...props} />;
export const ShareIcon = ({ size = 24, ...props }: IconProps) => <ShareSvg width={size} height={size} {...props} />;
export const BookIcon = ({ size = 24, ...props }: IconProps) => <BookSvg width={size} height={size} {...props} />;

// Heart icons (inline SVG for dynamic color support)
export const HeartIcon: React.FC<{ size?: number; color?: string; strokeWidth?: number }> = ({
  size = 24,
  color = '#194383',
  strokeWidth = 1.8,
}) => {
  const xml = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return <SvgXml xml={xml} />;
};

export const HeartFilledIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 24,
  color = '#E53935',
}) => {
  const xml = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" xmlns="http://www.w3.org/2000/svg"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" fill="${color}" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return <SvgXml xml={xml} />;
};

// Eye icon for view counts
export const EyeIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 24,
  color = '#666',
}) => {
  const xml = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="${color}" stroke-width="1.5"/></svg>`;
  return <SvgXml xml={xml} />;
};

// List icon for "Meine Veranstaltungen"
export const ListIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 24,
  color = '#333',
}) => {
  const xml = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><line x1="8" y1="6" x2="21" y2="6" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/><line x1="8" y1="12" x2="21" y2="12" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/><line x1="8" y1="18" x2="21" y2="18" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/><circle cx="4" cy="6" r="1" fill="${color}"/><circle cx="4" cy="12" r="1" fill="${color}"/><circle cx="4" cy="18" r="1" fill="${color}"/></svg>`;
  return <SvgXml xml={xml} />;
};