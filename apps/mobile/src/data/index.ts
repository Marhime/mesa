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
export { undoNotice, type Notice, type Notify } from './notice';
export { DataProvider, useGate, type GateStatus } from './DataProvider';
export {
  useSession,
  useUserId,
  usePasswordAuth,
  type PasswordMode,
  useAppleSignIn,
  isCancelled,
  isConfirmEmailPending,
  signOut,
} from './auth';
export { useAppleAvailable } from './authSettings';
export {
  useProfile,
  useHouseholdId,
  useHousehold,
  useMembers,
  useHouseholdPeople,
  useCreateHousehold,
  useUpdateHousehold,
  useUpdateDisplayName,
  type Member,
} from './household';
export { useCreateInvite, useJoinHousehold, useInviteCodeInput, inviteMessage } from './invites';
export { useCatalog, useCatalogIndex, usePictoLookup } from './catalog';
export {
  useGroceries,
  useToBuyCount,
  useToggleItem,
  useAlreadyHave,
  useDeleteItem,
  useUpdateItem,
  useCompleteShopping,
  useUsualProducts,
  usualToInput,
  lineQuantity,
  type GroceryLine,
  type AisleGroup,
  type UsualPick,
} from './groceries';
export { useAddGroceries, toAddInputs, type AddResult } from './groceryAdd';
export { lineAmount, lineRecipes, type GroceryListRow } from './groceryRows';
export {
  useRecipes,
  useRecipeSearch,
  useRecipe,
  useToggleFavorite,
  favoritesFirst,
  recipeImageUrl,
  recipeMeta,
  sourceLine,
  sourceLabel,
  formatMinutes,
  type RecipeSummary,
  type RecipeDetail,
} from './recipes';
export { useSaveRecipe, draftFromRecipe, type RecipeDraft } from './recipeSave';
export { scaledIngredients, ingredientSections, type IngredientView, type IngredientSection } from './ingredientList';
export { useUpNext, useUnplan, upNextTileData, type UpNextEntry, type UpNextTileView } from './upNext';
export { usePlanWithUndo, type PlanOptions } from './planWithUndo';
export {
  usePantry,
  usePantryUpdated,
  pantrySummary,
  pantryAmount,
  pantryDateLine,
  pantryEditAmount,
  PANTRY_LEVELS,
  type PantryEntry,
  type PantryState,
  type UseSoonView,
} from './pantry';
export { pantrySections, type PantryRowView, type PantrySection } from './pantrySections';
export { useStaples, staplesLine, type StapleView } from './pantryWrites';
export { usePantryActions } from './pantryActions';
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
export { useFavoriteHeart, useCookAgain, cookAgain, type CookAgainView, type FavoriteNotice } from './favorites';
export { useItUpIdeaViews, ideaVideoUrl, type UseItUpFood, type UseItUpIdeaView } from './useItUp';
export { useRecipeSteps, type StepView } from './recipeSteps';
export { useRereadIngredients } from './recipeReread';
export { useRecipeTranslation, phoneLanguage, languageName, type TranslateControl, type Translated } from './translation';
export { stepVideoLink, youtubeVideoId, clockLabel, type StepVideoLink } from './stepVideo';
export { useCookRecipe, useCookedResult, cookedRows, doneTitle, type CookedResult, type CookedRowView } from './cooking';
export { usePutAway, KEEPS_OPTIONS, keepsDaysFrom, type PutAwayLine } from './shopping';
export {
  useImportJobs,
  useCreateImport,
  useImportVideos,
  type ImportBatchResult,
  useRetryImport,
  useRemoveImport,
  importInputFromText,
  type ImportView,
  type ImportInput,
} from './imports';
export {
  useImportsPanel,
  useImportJob,
  useImportRecovery,
  importItemView,
  importSource,
  markImportSeen,
  type ImportItemView,
  type ImportRowView,
  type ImportsPanelOptions,
} from './importPanel';
export { importProgress, importRoute, importWaitLine, screenshotCount, type ImportProgressView, type ImportRoute } from './importProgress';
export { importRecovery, type RecoveryAction, type RecoveryKind } from './importRecovery';
export { readClipboardUrl, pickImages, MAX_SCREENSHOTS, type LocalImage } from './media';
export { usePushRegistration, usePushPermission, askForPushOnce, type PushPermission } from './push';
export { useIncomingShare, useShareRedirect, shareAvailable, type IncomingShare } from './share';
export { useOpenUrl, useOpenInApp, useShareText, usePullToRefresh, useKeepScreenOn } from './system';
export {
  useCreatorVideos,
  creatorTargetFromText,
  recipeCreator,
  creatorVideoViews,
  type CreatorTarget,
  type CreatorRef,
  type CreatorVideoView,
  type RecipeCreatorView,
} from './creatorVideos';
export {
  useFollowedCreators,
  useFollowCreator,
  useMarkCreatorSeen,
  followedTarget,
  type FollowedCreator,
} from './creators';
export { useCreatorNews, creatorNews, type CreatorNews, type NewVideoView } from './creatorNews';
export { useCreatorRail, useNewFromCreators, type NewFromCreatorsOptions } from './creatorSections';
export { MAX_VIDEO_IMPORTS } from './creatorSheet';
export { AskSheetsProvider, useAskMesaScreen, useAskSheets, useAskSheetsOutlet, type AskMesaScreenView, type AskSheetsApi, type AskSheetsView } from './askSheets';
export { useBackgroundNews, useMesaWork, type NewsHost } from './backgroundNews';
export { useForYou, forYouViews, type ForYouOptions } from './forYou';
export { foundVideoView, videoByline, type FoundVideoView } from './foundVideo';
export { askAnswerView, askContext, type AskAnswerView, type AskAction, type AskActionKind } from './askAnswer';
export type { AskTurnView } from './askView';
export { useCanPlanWeek } from './weekPlan';
export { useHouseholdLiveSync } from './live';
export { useTip, dismissTip, TIP } from './tips';
export { useSyncStatus, useSyncLine, syncLine, type SyncStatus } from './sync';
export { usePartnerArrivals } from './arrivals';
export { reportCrash, useReportCrash, resetLocalData } from './crash';
export {
  useScanInbox,
  useStartScan,
  useRemoveScan,
  useProposalLines,
  useApplyProposal,
  useDismissProposal,
  proposalTitle,
  scanJobTitle,
  lineDetail,
  type ScanKind,
  type ProposalView,
  type ProposalLineView,
  type LineAmount,
  type ScanJobView,
} from './scans';
export { useScanReview, PROPOSAL_GROUPS } from './scanReview';
export { useIngredientEditor } from './recipeIngredients';
export { appVersionLine } from './appVersion';
