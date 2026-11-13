// The icon set Mesa uses: one glyph per meaning, and one meaning per glyph (the comment says which).
// One import per icon keeps the bundle small (no barrel import).
import type { Icon as PhosphorIcon } from 'phosphor-react-native';
import { ArrowClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowClockwise';
import { ArrowCounterClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowCounterClockwise';
import { ArrowUpIcon } from 'phosphor-react-native/src/icons/ArrowUp';
import { ArrowUpRightIcon } from 'phosphor-react-native/src/icons/ArrowUpRight';
import { BellIcon } from 'phosphor-react-native/src/icons/Bell';
import { BookOpenTextIcon } from 'phosphor-react-native/src/icons/BookOpenText';
import { BowlFoodIcon } from 'phosphor-react-native/src/icons/BowlFood';
import { CalendarBlankIcon } from 'phosphor-react-native/src/icons/CalendarBlank';
import { CalendarPlusIcon } from 'phosphor-react-native/src/icons/CalendarPlus';
import { CameraIcon } from 'phosphor-react-native/src/icons/Camera';
import { CaretLeftIcon } from 'phosphor-react-native/src/icons/CaretLeft';
import { CaretRightIcon } from 'phosphor-react-native/src/icons/CaretRight';
import { CheckIcon } from 'phosphor-react-native/src/icons/Check';
import { ClipboardTextIcon } from 'phosphor-react-native/src/icons/ClipboardText';
import { CheckCircleIcon } from 'phosphor-react-native/src/icons/CheckCircle';
import { CircleIcon } from 'phosphor-react-native/src/icons/Circle';
import { DotsThreeIcon } from 'phosphor-react-native/src/icons/DotsThree';
import { ClockIcon } from 'phosphor-react-native/src/icons/Clock';
import { CloudSlashIcon } from 'phosphor-react-native/src/icons/CloudSlash';
import { CookingPotIcon } from 'phosphor-react-native/src/icons/CookingPot';
import { EnvelopeIcon } from 'phosphor-react-native/src/icons/Envelope';
import { ExportIcon } from 'phosphor-react-native/src/icons/Export';
import { ForkKnifeIcon } from 'phosphor-react-native/src/icons/ForkKnife';
import { HeartIcon } from 'phosphor-react-native/src/icons/Heart';
import { HouseIcon } from 'phosphor-react-native/src/icons/House';
import { ImageIcon } from 'phosphor-react-native/src/icons/Image';
import { InfoIcon } from 'phosphor-react-native/src/icons/Info';
import { LinkIcon } from 'phosphor-react-native/src/icons/Link';
import { ListIcon } from 'phosphor-react-native/src/icons/List';
import { LockIcon } from 'phosphor-react-native/src/icons/Lock';
import { MagnifyingGlassIcon } from 'phosphor-react-native/src/icons/MagnifyingGlass';
import { MinusIcon } from 'phosphor-react-native/src/icons/Minus';
import { NotePencilIcon } from 'phosphor-react-native/src/icons/NotePencil';
import { PencilSimpleIcon } from 'phosphor-react-native/src/icons/PencilSimple';
import { PlayIcon } from 'phosphor-react-native/src/icons/Play';
import { PlugIcon } from 'phosphor-react-native/src/icons/Plug';
import { PlusIcon } from 'phosphor-react-native/src/icons/Plus';
import { ReceiptIcon } from 'phosphor-react-native/src/icons/Receipt';
import { SignOutIcon } from 'phosphor-react-native/src/icons/SignOut';
import { SparkleIcon } from 'phosphor-react-native/src/icons/Sparkle';
import { StorefrontIcon } from 'phosphor-react-native/src/icons/Storefront';
import { TrashIcon } from 'phosphor-react-native/src/icons/Trash';
import { UserPlusIcon } from 'phosphor-react-native/src/icons/UserPlus';
import { UsersIcon } from 'phosphor-react-native/src/icons/Users';
import { WarningIcon } from 'phosphor-react-native/src/icons/Warning';
import { XIcon } from 'phosphor-react-native/src/icons/X';

export const icons = {
  /** Add something (the ink + of each tab, add chips, the quick-add field). */
  add: PlusIcon,
  /** Another idea (Tonight's idea). */
  another: ArrowCounterClockwiseIcon,
  /** Back (a pushed screen's chevron). */
  back: CaretLeftIcon,
  bell: BellIcon,
  /** A dish (the dish a video is about). */
  bowl: BowlFoodIcon,
  /** A date (how long a food keeps). */
  calendar: CalendarBlankIcon,
  camera: CameraIcon,
  /** Done, added, saved, selected ("Saved", "Following", "Added milk to Dairy"). */
  check: CheckIcon,
  /** At home (an ingredient's ✓, "All at home", "Uses cream", Already have). */
  checkCircle: CheckCircleIcon,
  /** Not at home yet (an ingredient's empty mark: tap when you have it). */
  circle: CircleIcon,
  /** More actions (a menu). */
  more: DotsThreeIcon,
  chevron: CaretRightIcon,
  clipboard: ClipboardTextIcon,
  /** Close, hide, clear (the × of sheets, modal screens, cards, filters). */
  close: XIcon,
  /** Time (minutes to cook). */
  clock: ClockIcon,
  /** Cooking (Cooked!). */
  cook: CookingPotIcon,
  delete: TrashIcon,
  edit: PencilSimpleIcon,
  email: EnvelopeIcon,
  external: ArrowUpRightIcon,
  favorite: HeartIcon,
  forkKnife: ForkKnifeIcon,
  /** The Home tab. */
  home: HouseIcon,
  /** The pantry (its tab, "Stock your pantry"). */
  list: ListIcon,
  image: ImageIcon,
  info: InfoIcon,
  invite: UserPlusIcon,
  link: LinkIcon,
  lock: LockIcon,
  minus: MinusIcon,
  offline: CloudSlashIcon,
  /** On the menu: plan it, Plan my week, nothing planned. */
  plan: CalendarPlusIcon,
  play: PlayIcon,
  plug: PlugIcon,
  /** A receipt (scan a receipt). */
  receipt: ReceiptIcon,
  /** Recipes (their tab, the recipe box, open a recipe). */
  recipes: BookOpenTextIcon,
  retry: ArrowClockwiseIcon,
  search: MagnifyingGlassIcon,
  send: ArrowUpIcon,
  share: ExportIcon,
  signOut: SignOutIcon,
  /** Groceries, to buy (their tab, "2 to buy", on your list, add to the list). */
  store: StorefrontIcon,
  /** Mesa (Ask Mesa, what Mesa picked or suggests). */
  sparkle: SparkleIcon,
  users: UsersIcon,
  warning: WarningIcon,
  write: NotePencilIcon,
} as const satisfies Record<string, PhosphorIcon>;

export type IconName = keyof typeof icons;
