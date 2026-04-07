import React from 'react';
import { SvgProps } from 'react-native-svg';

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
import CallSvg from '@/assets/icons/call.svg';
import UserSvg from '@/assets/icons/user.svg';
import MailSvg from '@/assets/icons/mail.svg';
import CultureSvg from '@/assets/icons/culture.svg';
import PartySvg from '@/assets/icons/party.svg';
import BookSvg from '@/assets/icons/book.svg';
import ClockSvg from '@/assets/icons/clock.svg';
import ShareSvg from '@/assets/icons/share.svg';


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
export const BookmarkIcon = ({ size = 24, ...props }: IconProps) => <BookmarkSvg width={size} height={size} {...props} />;
export const BookmarkAddIcon = ({ size = 24, ...props }: IconProps) => <BookmarkActiveSvg width={size} height={size} {...props} />;
export const LocationIcon = ({ size = 24, ...props }: IconProps) => <LocationSvg width={size} height={size} {...props} />;
export const LocationSmallIcon = ({ size = 16, ...props }: IconProps) => <LocationSmallSvg width={size} height={size} {...props} />;
export const SearchIcon = ({ size = 24, ...props }: IconProps) => <SearchSvg width={size} height={size} {...props} />;
export const HomeIcon = ({ size = 24, ...props }: IconProps) => <HomeSvg width={size} height={size} {...props} />;
export const TicketIcon = ({ size = 24, ...props }: IconProps) => <TicketSvg width={size} height={size} {...props} />;
export const TicketSmallIcon = ({ size = 16, ...props }: IconProps) => <TicketSmallSvg width={size} height={size} {...props} />;
export const ArrowLeftIcon = ({ size = 24, ...props }: IconProps) => <ArrowLeftSvg width={size} height={size} {...props} />;
export const CallIcon = ({ size = 24, ...props }: IconProps) => <CallSvg width={size} height={size} {...props} />;
export const UserIcon = ({ size = 24, ...props }: IconProps) => <UserSvg width={size} height={size} {...props} />;
export const MailIcon = ({ size = 24, ...props }: IconProps) => <MailSvg width={size} height={size} {...props} />;
export const CalendarIcon = ({ size = 24, ...props }: IconProps) => <CalendarSvg width={size} height={size} {...props} />;
export const ChevronLeft = ({ size = 24, ...props }: IconProps) => <ArrowLeftSvg width={size} height={size} {...props} />;
export const ChevronRight = ({ size = 24, ...props }: IconProps) => <ArrowRightSvg width={size} height={size} {...props} />;
export const ClockIcon = ({ size = 24, ...props }: IconProps) => <ClockSvg width={size} height={size} {...props} />;
export const ShareIcon = ({ size = 24, ...props }: IconProps) => <ShareSvg width={size} height={size} {...props} />;
export const BookIcon = ({ size = 24, ...props }: IconProps) => <BookSvg width={size} height={size} {...props} />;