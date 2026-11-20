// URLs of the card-design package's fonts and built-in art, bundled by Vite. The package's own
// loaders read files through import.meta.url paths, which only work in Node.
import monaRegular from '../../../../../packages/card-design/fonts/MonaSans-Regular.ttf?url';
import monaBold from '../../../../../packages/card-design/fonts/MonaSans-Bold.ttf?url';
import monaCondensed from '../../../../../packages/card-design/fonts/MonaSansSemiCondensed-Bold.ttf?url';
import barlow from '../../../../../packages/card-design/fonts/BarlowCondensed-SemiBold.ttf?url';
import barlowBlack from '../../../../../packages/card-design/fonts/BarlowCondensed-ExtraBold.ttf?url';
import playfair from '../../../../../packages/card-design/fonts/PlayfairDisplay-Bold.ttf?url';
import grotesk from '../../../../../packages/card-design/fonts/SpaceGrotesk-Bold.ttf?url';
import roebelMark from '../../../../../packages/card-design/assets/builtin/roebel-mark.png?url';
import roebelMarkDark from '../../../../../packages/card-design/assets/builtin/roebel-mark-dark.png?url';
import roebelMarkGold from '../../../../../packages/card-design/assets/builtin/roebel-mark-gold.png?url';
import personLaurel from '../../../../../packages/card-design/assets/builtin/person-laurel.png?url';
import personLaurelDark from '../../../../../packages/card-design/assets/builtin/person-laurel-dark.png?url';
import personLaurelGold from '../../../../../packages/card-design/assets/builtin/person-laurel-gold.png?url';

/** Keyed by the file names of FONT_FILES. */
export const FONT_URLS: Record<string, string> = {
  'MonaSans-Regular.ttf': monaRegular,
  'MonaSans-Bold.ttf': monaBold,
  'MonaSansSemiCondensed-Bold.ttf': monaCondensed,
  'BarlowCondensed-SemiBold.ttf': barlow,
  'BarlowCondensed-ExtraBold.ttf': barlowBlack,
  'PlayfairDisplay-Bold.ttf': playfair,
  'SpaceGrotesk-Bold.ttf': grotesk,
};

/** Keyed by built-in asset id (BUILTIN_ASSETS). */
export const BUILTIN_URLS: Record<string, string> = {
  'builtin:roebel-mark': roebelMark,
  'builtin:roebel-mark-dark': roebelMarkDark,
  'builtin:roebel-mark-gold': roebelMarkGold,
  'builtin:person-laurel': personLaurel,
  'builtin:person-laurel-dark': personLaurelDark,
  'builtin:person-laurel-gold': personLaurelGold,
};

