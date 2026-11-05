// The icon set Mesa uses. One import per icon keeps the bundle small (no barrel import).
import type { Icon as PhosphorIcon } from 'phosphor-react-native';
import { ArrowClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowClockwise';
import { ArrowCounterClockwiseIcon } from 'phosphor-react-native/src/icons/ArrowCounterClockwise';
import { ArrowUpRightIcon } from 'phosphor-react-native/src/icons/ArrowUpRight';
import { BasketIcon } from 'phosphor-react-native/src/icons/Basket';
import { BookOpenTextIcon } from 'phosphor-react-native/src/icons/BookOpenText';
import { BowlFoodIcon } from 'phosphor-react-native/src/icons/BowlFood';
import { CalendarBlankIcon } from 'phosphor-react-native/src/icons/CalendarBlank';
import { CaretLeftIcon } from 'phosphor-react-native/src/icons/CaretLeft';
import { CaretRightIcon } from 'phosphor-react-native/src/icons/CaretRight';
import { CheckIcon } from 'phosphor-react-native/src/icons/Check';
import { CheckCircleIcon } from 'phosphor-react-native/src/icons/CheckCircle';
import { ClockIcon } from 'phosphor-react-native/src/icons/Clock';
import { CloudSlashIcon } from 'phosphor-react-native/src/icons/CloudSlash';
import { CookingPotIcon } from 'phosphor-react-native/src/icons/CookingPot';
import { EnvelopeIcon } from 'phosphor-react-native/src/icons/Envelope';
import { ExportIcon } from 'phosphor-react-native/src/icons/Export';
import { FileTextIcon } from 'phosphor-react-native/src/icons/FileText';
import { ForkKnifeIcon } from 'phosphor-react-native/src/icons/ForkKnife';
import { HeartIcon } from 'phosphor-react-native/src/icons/Heart';
import { HouseIcon } from 'phosphor-react-native/src/icons/House';
import { HouseSimpleIcon } from 'phosphor-react-native/src/icons/HouseSimple';
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
import { SignOutIcon } from 'phosphor-react-native/src/icons/SignOut';
import { SparkleIcon } from 'phosphor-react-native/src/icons/Sparkle';
import { StorefrontIcon } from 'phosphor-react-native/src/icons/Storefront';
import { TrashIcon } from 'phosphor-react-native/src/icons/Trash';
import { UserPlusIcon } from 'phosphor-react-native/src/icons/UserPlus';
import { UsersIcon } from 'phosphor-react-native/src/icons/Users';
import { WarningIcon } from 'phosphor-react-native/src/icons/Warning';
import { XIcon } from 'phosphor-react-native/src/icons/X';

export const icons = {
  add: PlusIcon,
  another: ArrowCounterClockwiseIcon,
  back: CaretLeftIcon,
  basket: BasketIcon,
  bowl: BowlFoodIcon,
  calendar: CalendarBlankIcon,
  check: CheckIcon,
  checkCircle: CheckCircleIcon,
  chevron: CaretRightIcon,
  close: XIcon,
  clock: ClockIcon,
  cook: CookingPotIcon,
  delete: TrashIcon,
  edit: PencilSimpleIcon,
  email: EnvelopeIcon,
  external: ArrowUpRightIcon,
  favorite: HeartIcon,
  forkKnife: ForkKnifeIcon,
  have: HouseSimpleIcon,
  home: HouseIcon,
  file: FileTextIcon,
  list: ListIcon,
  image: ImageIcon,
  info: InfoIcon,
  invite: UserPlusIcon,
  link: LinkIcon,
  lock: LockIcon,
  minus: MinusIcon,
  offline: CloudSlashIcon,
  play: PlayIcon,
  plug: PlugIcon,
  recipes: BookOpenTextIcon,
  retry: ArrowClockwiseIcon,
  search: MagnifyingGlassIcon,
  share: ExportIcon,
  signOut: SignOutIcon,
  store: StorefrontIcon,
  sparkle: SparkleIcon,
  users: UsersIcon,
  warning: WarningIcon,
  write: NotePencilIcon,
} as const satisfies Record<string, PhosphorIcon>;

export type IconName = keyof typeof icons;
