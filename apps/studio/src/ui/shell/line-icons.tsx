// Workspace icons: Hugeicons (free stroke set) behind one wrapper, so size and stroke stay consistent.
// The export names are the app's own; swap an icon here and every screen follows.
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  AgreementIcon, ArrowDown01Icon, ArrowDown02Icon, ArrowLeft02Icon, ArrowRight02Icon, ArrowUp02Icon, AtIcon, AudioWave01Icon, BookOpen01Icon, Books01Icon, BubbleChatIcon,
  Calendar01Icon, Cancel01Icon, ChartHistogramIcon, CheckListIcon, Clock01Icon, Copy01Icon, CropIcon, DashboardSquareAddIcon, Delete02Icon, File01Icon,
  FilterHorizontalIcon, Folder01Icon, HelpCircleIcon, Home01Icon, Idea01Icon, Image01Icon, InboxIcon, Link01Icon, LiveStreaming01Icon, Logout01Icon,
  Mail01Icon, Mic01Icon, Moon02Icon, MoreHorizontalIcon, News01Icon, Notification01Icon, PanelRightIcon, PencilEdit02Icon, Plug01Icon, PlusSignIcon,
  Radar01Icon, RefreshIcon, RepeatIcon, Search01Icon, Settings01Icon, Share01Icon, SidebarLeftIcon, StopIcon, Sun01Icon, Task01Icon, Tick02Icon,
  ArrowExpand01Icon, ArrowShrink01Icon, GoBackward15SecIcon, GoForward15SecIcon, HeadphonesIcon, Message01Icon, PauseIcon, PlayIcon, Robot01Icon, SmileIcon, Upload01Icon, UserMultipleIcon, WhatsappIcon, ZapIcon,
} from '@hugeicons/core-free-icons';

/** Stroke weight of every workspace icon (matched to the reference at 16 to 20px). */
export const ICON_STROKE = 1.9;
type P = { size?: number };

const make = (icon: IconSvgElement, defaultSize = 18) =>
  function Icon({ size = defaultSize }: P) {
    return <HugeiconsIcon icon={icon} size={size} strokeWidth={ICON_STROKE} color="currentColor" aria-hidden="true" />;
  };

export const IconSearch = make(Search01Icon);
export const IconMic = make(Mic01Icon);
export const IconWave = make(AudioWave01Icon);
export const IconPlus = make(PlusSignIcon);
export const IconAt = make(AtIcon);
/** Screenshot: the free set has no dedicated glyph, the crop frame is the closest. */
export const IconCapture = make(CropIcon);
export const IconSidebar = make(SidebarLeftIcon);
export const IconPanelRight = make(PanelRightIcon);
export const IconChevronDown = make(ArrowDown01Icon);
export const IconFilter = make(FilterHorizontalIcon);
export const IconBell = make(Notification01Icon);
export const IconFile = make(File01Icon);
export const IconSend = make(ArrowUp02Icon);
export const IconArrowDown = make(ArrowDown02Icon);
export const IconStop = make(StopIcon);
export const IconLogout = make(Logout01Icon);
export const IconClose = make(Cancel01Icon);
export const IconHelp = make(HelpCircleIcon);
export const IconSettings = make(Settings01Icon);
export const IconCheck = make(Tick02Icon);
export const IconPencil = make(PencilEdit02Icon);
export const IconLoop = make(RepeatIcon);
export const IconLink = make(Link01Icon);
export const IconMore = make(MoreHorizontalIcon);
export const IconCopy = make(Copy01Icon);
export const IconUpload = make(Upload01Icon);
export const IconRefresh = make(RefreshIcon);
export const IconTrash = make(Delete02Icon);
export const IconChat = make(BubbleChatIcon);
export const IconFolder = make(Folder01Icon);
export const IconClock = make(Clock01Icon);
export const IconPlug = make(Plug01Icon);
export const IconScroll = make(Task01Icon);
export const IconInbox = make(InboxIcon);
export const IconMail = make(Mail01Icon);
export const IconCalendar = make(Calendar01Icon);
export const IconList = make(CheckListIcon);
export const IconMoon = make(Moon02Icon);
export const IconSun = make(Sun01Icon);
export const IconNews = make(News01Icon);
export const IconRadar = make(Radar01Icon);
export const IconPeople = make(UserMultipleIcon);
export const IconChart = make(ChartHistogramIcon);
export const IconHandshake = make(AgreementIcon);
export const IconImage = make(Image01Icon);
export const IconBack = make(ArrowLeft02Icon);
export const IconForward = make(ArrowRight02Icon);
export const IconShare = make(Share01Icon);
export const IconSms = make(Message01Icon);
export const IconWhatsapp = make(WhatsappIcon);
export const IconAgent = make(Robot01Icon);
export const IconSmile = make(SmileIcon);
export const IconPlay = make(PlayIcon);
export const IconPause = make(PauseIcon);
export const IconBack15 = make(GoBackward15SecIcon);
export const IconForward15 = make(GoForward15SecIcon);
export const IconHeadphones = make(HeadphonesIcon);
export const IconExpand = make(ArrowExpand01Icon);
export const IconShrink = make(ArrowShrink01Icon);

// Rail sections (18px).
export const IconHome = make(Home01Icon, 18);
export const IconForYou = make(Idea01Icon, 18);
export const IconSkills = make(ZapIcon, 18);
export const IconWiki = make(BookOpen01Icon, 18);
export const IconLibrary = make(Books01Icon, 18);
export const IconLive = make(LiveStreaming01Icon, 18);
export const IconApps = make(DashboardSquareAddIcon, 18);
