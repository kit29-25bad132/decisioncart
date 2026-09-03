// ============================================================
// DecisionCart — Merchant Intelligence Module
// Barrel export for merchant domain types, data, and repository.
// ============================================================

export { MERCHANTS, getMerchantById, getAllMerchants } from "./merchants";
export { generateSeededOffers, getSeededOffersForProduct } from "./demo-offers";
export {
  getMerchantRepository,
  setMerchantRepository,
  resetMerchantRepository,
} from "./merchant-repository";
export type { MerchantRepository } from "./merchant-repository";
