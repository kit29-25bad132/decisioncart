// ============================================================
// DecisionCart — Merchant Repository Abstraction
// Provides a typed persistence layer for merchant offers.
// The in-memory implementation wraps demo data and adds
// live mutable offer state.
//
// All methods are async to support database-backed
// implementations (Supabase) in the future.
// ============================================================

import type { Merchant, MerchantOffer } from "@/types";
import { MERCHANTS } from "./merchants";
import { generateSeededOffers } from "./demo-offers";

// --- Repository Interface ---

/**
 * Typed abstraction for merchant offer persistence.
 * All methods are async to support database-backed implementations.
 */
export interface MerchantRepository {
  /** Get a merchant by ID. Returns null if not found. */
  getMerchant(merchantId: string): Promise<Merchant | null>;

  /** Get all merchants. */
  getAllMerchants(): Promise<Merchant[]>;

  /** Get all offers for a specific product. */
  getOffersByProduct(productId: string): Promise<MerchantOffer[]>;

  /** Get a specific offer by ID. Returns null if not found. */
  getOffer(offerId: string): Promise<MerchantOffer | null>;

  /** Get all available offers for a specific product. */
  getAvailableOffersByProduct(productId: string): Promise<MerchantOffer[]>;

  /** Update the price of an offer. Returns the updated offer. */
  updateOfferPrice(offerId: string, newPrice: number): Promise<MerchantOffer>;

  /** Update the stock of an offer. Returns the updated offer. */
  updateOfferStock(offerId: string, newStock: number): Promise<MerchantOffer>;

  /** Get all offers (for debugging). */
  listAllOffers(): Promise<MerchantOffer[]>;

  /** Clear all data (for testing). */
  clear(): Promise<void>;

  /** Reset to seeded demo state (for testing). */
  reset(): Promise<void>;
}

// --- In-Memory Implementation ---

/**
 * In-memory implementation of MerchantRepository.
 *
 * LIMITATION: Not production-persistent. Lost on server restart.
 * Use a database-backed implementation for production use.
 *
 * The in-memory store is initialized from seeded demo data
 * and supports live mutable updates to prices and stock.
 */
class InMemoryMerchantRepository implements MerchantRepository {
  private merchants: Map<string, Merchant>;
  private offers: Map<string, MerchantOffer>;

  constructor() {
    this.merchants = new Map(MERCHANTS.map((m) => [m.id, m]));
    this.offers = new Map();
    this.seedOffers();
  }

  private seedOffers(): void {
    const seeded = generateSeededOffers();
    for (const offer of seeded) {
      this.offers.set(offer.id, offer);
    }
  }

  async getMerchant(merchantId: string): Promise<Merchant | null> {
    return this.merchants.get(merchantId) ?? null;
  }

  async getAllMerchants(): Promise<Merchant[]> {
    return Array.from(this.merchants.values());
  }

  async getOffersByProduct(productId: string): Promise<MerchantOffer[]> {
    const offers: MerchantOffer[] = [];
    for (const offer of this.offers.values()) {
      if (offer.productId === productId) {
        offers.push(offer);
      }
    }
    return offers;
  }

  async getOffer(offerId: string): Promise<MerchantOffer | null> {
    return this.offers.get(offerId) ?? null;
  }

  async getAvailableOffersByProduct(productId: string): Promise<MerchantOffer[]> {
    const offers: MerchantOffer[] = [];
    for (const offer of this.offers.values()) {
      if (offer.productId === productId && offer.isAvailable) {
        offers.push(offer);
      }
    }
    return offers;
  }

  async updateOfferPrice(offerId: string, newPrice: number): Promise<MerchantOffer> {
    const offer = this.offers.get(offerId);
    if (!offer) {
      throw new Error(`Offer ${offerId} not found.`);
    }
    if (typeof newPrice !== "number" || newPrice <= 0) {
      throw new Error(`Invalid price: ${newPrice}. Price must be a positive number.`);
    }

    const updated: MerchantOffer = {
      ...offer,
      price: newPrice,
      updatedAt: new Date().toISOString(),
    };
    this.offers.set(offerId, updated);
    return updated;
  }

  async updateOfferStock(offerId: string, newStock: number): Promise<MerchantOffer> {
    const offer = this.offers.get(offerId);
    if (!offer) {
      throw new Error(`Offer ${offerId} not found.`);
    }
    if (typeof newStock !== "number" || newStock < 0) {
      throw new Error(`Invalid stock: ${newStock}. Stock must be a non-negative number.`);
    }

    const updated: MerchantOffer = {
      ...offer,
      stock: newStock,
      isAvailable: newStock > 0,
      updatedAt: new Date().toISOString(),
    };
    this.offers.set(offerId, updated);
    return updated;
  }

  async listAllOffers(): Promise<MerchantOffer[]> {
    return Array.from(this.offers.values());
  }

  async clear(): Promise<void> {
    this.merchants.clear();
    this.offers.clear();
  }

  async reset(): Promise<void> {
    this.merchants = new Map(MERCHANTS.map((m) => [m.id, m]));
    this.offers = new Map();
    this.seedOffers();
  }
}

// --- Singleton ---

let repositoryInstance: MerchantRepository | null = null;

/**
 * Get the singleton MerchantRepository instance.
 * Returns the in-memory implementation by default.
 */
export async function getMerchantRepository(): Promise<MerchantRepository> {
  if (!repositoryInstance) {
    repositoryInstance = new InMemoryMerchantRepository();
  }
  return repositoryInstance;
}

/**
 * Replace the repository instance (for testing).
 */
export function setMerchantRepository(repo: MerchantRepository): void {
  repositoryInstance = repo;
}

/**
 * Reset the repository to the default in-memory implementation.
 * Primarily for testing.
 */
export function resetMerchantRepository(): void {
  repositoryInstance = null;
}
