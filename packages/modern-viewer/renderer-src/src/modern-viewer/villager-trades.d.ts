export type VillagerTradeStatus = "ready" | "unseen" | "needs_proximity" | "loading" | "error";

export interface VillagerTradeItemView {
  readonly name: string;
  readonly displayName: string;
  readonly count: number;
}

export interface VillagerTradeOfferView {
  readonly input: VillagerTradeItemView;
  readonly secondaryInput: VillagerTradeItemView | null;
  readonly output: VillagerTradeItemView;
  readonly uses: number;
  readonly maxUses: number;
  readonly disabled: boolean;
}

export interface NormalizedVillagerTradeOffers {
  readonly status: VillagerTradeStatus;
  readonly observedAt: number | null;
  readonly offers: readonly VillagerTradeOfferView[];
}

export interface VillagerTradePanelModel {
  readonly tradeCapable: boolean;
  readonly status: VillagerTradeStatus | "not_applicable";
  readonly statusLabel: string;
  readonly observedLabel: string;
  readonly offers: readonly VillagerTradeOfferView[];
}

export const VILLAGER_TRADE_LIMIT: 16;
export function normalizeVillagerTradeOffers(value: unknown): NormalizedVillagerTradeOffers;
export function createVillagerTradePanelModel(entity: unknown, now?: number): VillagerTradePanelModel;
export function renderVillagerTradePanel(root: unknown, entity: unknown, now?: number): VillagerTradePanelModel | null;
