"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import type { Merchant, MerchantOffer, MerchantSelection } from "@/types";
import { getMerchantRepository } from "@/merchant/merchant-repository";

// --- Types ---

interface MerchantOfferSelectorProps {
  /** The merchant selection result from the merchant decision engine. */
  selection: MerchantSelection;
  /** Called when the user confirms their offer selection. */
  onOfferSelected: (offerId: string) => void;
  /** Called when the user wants to change their selection (return to selection mode). */
  onChange: () => void;
  /** Called when the user wants to go back. */
  onBack: () => void;
  /** Currently selected offer ID from the parent (if already confirmed). */
  selectedOfferId?: string;
  /** Whether the offer selection has been confirmed. */
  isConfirmed?: boolean;
}

// --- Helpers ---

/** Format fulfillment speed to a human-readable label. */
function formatFulfillmentSpeed(speed: Merchant["fulfillmentSpeed"]): string {
  switch (speed) {
    case "priority":
      return "Priority";
    case "fast":
      return "Fast";
    case "standard":
      return "Standard";
  }
}

/** Format delivery days as human-readable text. */
function formatDeliveryDays(days: number): string {
  if (days === 1) return "1 day";
  return `${days} days`;
}

/** Build a combined offer for display (selected + alternatives). */
interface DisplayOffer {
  offer: MerchantOffer;
  merchant: Merchant;
  isRecommended: boolean;
  isAvailable: boolean;
}

// --- Component ---

export function MerchantOfferSelector({
  selection,
  onOfferSelected,
  onChange,
  onBack,
  selectedOfferId: confirmedOfferId,
  isConfirmed = false,
}: MerchantOfferSelectorProps) {
  const { selectedOffer, merchant: recommendedMerchant, explanation, alternativeOffers } =
    selection;

  // Track which offer the user has selected (defaults to recommended)
  // Use confirmedOfferId when provided (parent state), otherwise local state
  const [localSelectedId, setLocalSelectedId] = useState<string>(
    confirmedOfferId ?? selectedOffer.id
  );
  const selectedOfferId = confirmedOfferId ?? localSelectedId;

  // Resolve full Merchant objects for alternative offers
  const [allMerchants, setAllMerchants] = useState<Merchant[]>([]);

  useEffect(() => {
    let cancelled = false;
    getMerchantRepository()
      .then((repo) => repo.getAllMerchants())
      .then((merchants) => {
        if (!cancelled) {
          setAllMerchants(merchants);
        }
      })
      .catch(() => {
        // Non-fatal: merchant names will fall back to ID-based display
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Build combined list: recommended first, then alternatives
  const displayOffers: DisplayOffer[] = useMemo(() => {
    const offers: DisplayOffer[] = [
      {
        offer: selectedOffer,
        merchant: recommendedMerchant,
        isRecommended: true,
        isAvailable: selectedOffer.isAvailable && selectedOffer.stock > 0,
      },
    ];

    for (const alt of alternativeOffers) {
      const merchant =
        allMerchants.find((m) => m.id === alt.merchantId) ?? recommendedMerchant;
      offers.push({
        offer: alt,
        merchant,
        isRecommended: false,
        isAvailable: alt.isAvailable && alt.stock > 0,
      });
    }

    return offers;
  }, [selectedOffer, recommendedMerchant, alternativeOffers, allMerchants]);

  // Build merchant name lookup from resolved data
  const merchantNameMap = useMemo(() => {
    const map = new Map<string, string>();
    map.set(recommendedMerchant.id, recommendedMerchant.name);
    for (const offer of displayOffers) {
      if (!map.has(offer.merchant.id)) {
        map.set(offer.merchant.id, offer.merchant.name);
      }
    }
    return map;
  }, [recommendedMerchant, displayOffers]);

  const handleContinue = useCallback(() => {
    onOfferSelected(selectedOfferId);
  }, [selectedOfferId, onOfferSelected]);

  const handleChange = useCallback(() => {
    setLocalSelectedId(selectedOffer.id);
    onChange();
  }, [selectedOffer, onChange]);

  const selectedDisplayOffer = displayOffers.find(
    (d) => d.offer.id === selectedOfferId
  );

  return (
    <div className="bg-white rounded-2xl border-2 border-zinc-900 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-zinc-900 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
            Merchant Offers
          </p>
          <h3 className="text-lg font-semibold text-white mt-0.5">
            Choose Your Seller
          </h3>
        </div>
        <button
          onClick={onBack}
          className="text-xs text-zinc-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500"
        >
          Back
        </button>
      </div>

      <div className="p-6 space-y-5">
        {/* Explanation */}
        {explanation && (
          <div className="bg-zinc-50 rounded-xl p-4">
            <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-1.5">
              Recommendation
            </p>
            <p className="text-sm text-zinc-700 leading-relaxed">
              {explanation}
            </p>
          </div>
        )}

        {/* Offer Cards */}
        <div className="space-y-3">
          {displayOffers.map((display) => {
            const isSelected = display.offer.id === selectedOfferId;
            const isDisabled = !display.isAvailable;
            const merchantName =
              merchantNameMap.get(display.offer.merchantId) ?? "Merchant";

            return (
              <button
                key={display.offer.id}
                onClick={() => {
                  if (!isDisabled && !isConfirmed) {
                    setLocalSelectedId(display.offer.id);
                  }
                }}
                disabled={isDisabled}
                className={`
                  w-full text-left rounded-xl border-2 p-4 transition-all
                  ${
                    isDisabled
                      ? "border-zinc-100 bg-zinc-50 opacity-60 cursor-not-allowed"
                      : isSelected
                      ? "border-zinc-900 bg-zinc-50 shadow-md"
                      : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm"
                  }
                `}
                aria-label={`${merchantName} offer — ₹${display.offer.price.toLocaleString()}${
                  isDisabled ? " (unavailable)" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Merchant Name + Badges */}
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="text-sm font-semibold text-zinc-900">
                        {merchantName}
                      </span>
                      {display.isRecommended && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-[10px] font-semibold text-emerald-700 border border-emerald-100">
                          Recommended
                        </span>
                      )}
                      {isDisabled && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-50 text-[10px] font-semibold text-red-600 border border-red-100">
                          {display.offer.stock <= 0
                            ? "Out of Stock"
                            : "Unavailable"}
                        </span>
                      )}
                    </div>

                    {/* Price */}
                    <div className="flex items-baseline gap-1 mb-2">
                      <span className="text-lg font-bold text-zinc-900">
                        ₹{display.offer.price.toLocaleString()}
                      </span>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <p className="text-[10px] text-zinc-400 uppercase tracking-wider">
                          Stock
                        </p>
                        <p
                          className={`text-xs font-medium ${
                            display.offer.stock <= 3 && display.offer.stock > 0
                              ? "text-amber-600"
                              : display.offer.stock <= 0
                              ? "text-red-600"
                              : "text-zinc-700"
                          }`}
                        >
                          {display.offer.stock > 0
                            ? `${display.offer.stock} units`
                            : "None"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-400 uppercase tracking-wider">
                          Warranty
                        </p>
                        <p className="text-xs font-medium text-zinc-700">
                          {display.offer.warrantyMonths} months
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-400 uppercase tracking-wider">
                          Delivery
                        </p>
                        <p className="text-xs font-medium text-zinc-700">
                          {formatDeliveryDays(display.offer.deliveryDays)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-zinc-400 uppercase tracking-wider">
                          Returns
                        </p>
                        <p className="text-xs font-medium text-zinc-700">
                          {display.merchant.returnPolicyDays} days
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Selection Indicator */}
                  <div className="shrink-0 mt-1">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isSelected
                          ? "border-zinc-900 bg-zinc-900"
                          : "border-zinc-300 bg-white"
                      }`}
                    >
                      {isSelected && (
                        <svg
                          className="w-3 h-3 text-white"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Trust & Merchant Info (for selected offer) */}
        {selectedDisplayOffer && (
          <div className="bg-zinc-50 rounded-xl p-4">
            <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider mb-2">
              Seller Details
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-[10px] text-zinc-400 uppercase tracking-wider">
                  Trust Score
                </p>
                <p className="text-sm font-semibold text-zinc-900">
                  {selectedDisplayOffer.merchant.trustScore}/100
                </p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-400 uppercase tracking-wider">
                  Verified
                </p>
                <p
                  className={`text-sm font-semibold ${
                    selectedDisplayOffer.merchant.verified
                      ? "text-emerald-600"
                      : "text-zinc-500"
                  }`}
                >
                  {selectedDisplayOffer.merchant.verified ? "Yes" : "No"}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-400 uppercase tracking-wider">
                  Fulfillment
                </p>
                <p className="text-sm font-semibold text-zinc-900">
                  {formatFulfillmentSpeed(
                    selectedDisplayOffer.merchant.fulfillmentSpeed
                  )}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-400 uppercase tracking-wider">
                  Ratings
                </p>
                <p className="text-sm font-semibold text-zinc-900">
                  {selectedDisplayOffer.merchant.ratingCount.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        {isConfirmed ? (
          <button
            onClick={handleChange}
            className="w-full px-6 py-3 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 active:bg-zinc-100 transition-all"
          >
            Change Seller Selection
          </button>
        ) : (
          <button
            onClick={handleContinue}
            className="w-full px-6 py-3 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 active:bg-zinc-950 transition-all shadow-sm"
          >
            Continue with{" "}
            {selectedDisplayOffer
              ? merchantNameMap.get(selectedDisplayOffer.offer.merchantId) ??
                "Selected Offer"
              : "Selected Offer"}
          </button>
        )}

        {/* Security Note */}
        <p className="text-[10px] text-zinc-400 text-center">
          Price and availability are verified server-side before payment.
        </p>
      </div>
    </div>
  );
}
