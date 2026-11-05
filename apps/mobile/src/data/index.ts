// Mesa data layer: every read and write goes through these typed hooks.
export type {
  Category,
  CookedIngredient,
  GroceryItem,
  PantryLevel,
  Household,
  ImportJob,
  ImportPlatform,
  Recipe,
  RecipeIngredient,
  RecipeStep,
  Unit,
  Zone,
} from '@mesa/shared';
export { AISLE_ORDER, CATEGORY_LABEL } from '@mesa/shared';
export type { ResolvedGroceryItem } from '../lib/groceryInput';
export { formatOverlineDate, plural, hostOf } from '../lib/text';

export { env, isConfigured } from './env';
export { friendlyError, isNetworkError } from './errors';
export { DataProvider, useGate, type GateStatus } from './DataProvider';
export {
  useSession,
  useUserId,
  usePasswordAuth,
  type PasswordMode,
  useAppleAvailable,
  useAppleSignIn,
  isCancelled,
  signOut,
} from './auth';
export {
  useProfile,
  useHouseholdId,
  useHousehold,
  useMembers,
  useHouseholdPeople,
  useCreateHousehold,
  useJoinHousehold,
  useUpdateHousehold,
  useUpdateDisplayName,
  useCreateInvite,
  type Member,
} from './household';
export { useCatalog, useCatalogIndex } from './catalog';
export {
  useGroceries,
  useToBuyCount,
  useAddGroceries,
  useQuickAdd,
  useToggleItem,
  useMarkHave,
  useDeleteItem,
  useUpdateItem,
  useCompleteShopping,
  useUsualProducts,
  usualToInput,
  toAddInputs,
  lineQuantity,
  lineTags,
  type GroceryLine,
  type AisleGroup,
  type AddResult,
  type UsualPick,
} from './groceries';
export {
  useRecipes,
  useRecipeSearch,
  useRecipe,
  useToggleFavorite,
  useSaveRecipe,
  recipeImageUrl,
  recipeMeta,
  scaledIngredients,
  draftFromRecipe,
  sourceLine,
  sourceLabel,
  formatMinutes,
  type RecipeSummary,
  type RecipeDetail,
  type RecipeDraft,
  type IngredientView,
} from './recipes';
export { useUpNext, usePlanRecipe, useUnplan, upNextTileData, type UpNextEntry, type UpNextTileView } from './upNext';
export {
  usePantry,
  usePantryUpdated,
  pantrySummary,
  pantryAmount,
  pantryDateLine,
  PANTRY_LEVELS,
  type PantryEntry,
  type PantryState,
  type UseSoonView,
} from './pantry';
export {
  useAddToPantry,
  useSetPantryItem,
  usePantryOut,
  useStaples,
  useSetAlwaysHave,
  staplesLine,
  usePantryActions,
  type PantryItemChange,
  type StapleView,
} from './pantryWrites';
export {
  useStockOptions,
  usePantryStocking,
  usePantrySearch,
  useResolveGroceryText,
  toPantryInputs,
  type StockGroup,
  type StockOption,
} from './stocking';
export type { PantryAddInput } from './rpc';
export { useRecipeAvailability, availabilityLine, type RecipeAvailability, type IngredientAvailability } from './availability';
export { useIdeas, useRecipeCoverage, rankIdeas, ideaView, shoppingLine, type IdeaView } from './ideas';
export { useCookRecipe, useCookedResult, cookedRows, doneTitle, type CookedResult, type CookedRowView } from './cooking';
export { usePutAway, KEEPS_OPTIONS, keepsDaysFrom, type PutAwayLine } from './shopping';
export {
  useImportJobs,
  useCreateImport,
  useRetryImport,
  useRemoveImport,
  useImportsPanel,
  importSource,
  importInputFromText,
  importReading,
  type ImportView,
  type ImportInput,
} from './imports';
export { readClipboardUrl, pickImage, type LocalImage } from './media';
export { usePushRegistration } from './push';
export { useIncomingShare, useShareRedirect, shareAvailable, type IncomingShare } from './share';
export { useOpenUrl, useShareText, usePullToRefresh, useKeepScreenOn } from './system';
export { useHouseholdLiveSync } from './live';
export {
  useScanInbox,
  useStartScan,
  useRemoveScan,
  useProposalLines,
  useApplyProposal,
  useDismissProposal,
  useScanReview,
  proposalTitle,
  scanJobTitle,
  PROPOSAL_GROUPS,
  type ScanKind,
  type ProposalView,
  type ProposalLineView,
  type ScanJobView,
} from './scans';
