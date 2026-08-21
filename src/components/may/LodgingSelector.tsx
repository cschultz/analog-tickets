import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { type ReactNode } from "react";
import { Check, ChevronDown, House, Map, Tent, Users, BedDouble, Info } from "lucide-react";
import { COLORS, typography } from "@/styles/may-theme";
import { type AccommodationUnit, type AccommodationZone, zoneHelperText } from "@/lib/lodging";

type ProductAsset = {
  id: string;
  image_url: string;
  alt_text: string | null;
  image_type: "interior" | "exterior";
};

interface LodgingSelectorProps {
  zones: AccommodationZone[];
  familyUnits: AccommodationUnit[];
  selectedZone: string | null;
  selectedFamilyUnit: string | null;
  lodgingQty: number;
  maxLodgingQty: number;
  canBookLodging: boolean;
  hasQualifyingTickets: boolean;
  ticketName?: string | null;
  ticketQuantity?: number;
  onSelectZone: (zoneKey: string) => void;
  onSelectFamilyUnit: (unitId: string) => void;
  onChangeQuantity: (qty: number) => void;
  onBlockedSelection?: () => void;
  onContinueWithoutLodging?: () => void;
  assetsByType?: { tent: ProductAsset[]; cabin: ProductAsset[] };
  emptyStateAction?: ReactNode;
  showRequirementWarning?: boolean;
  requirementCta?: ReactNode;
}

export function LodgingSelector({
  zones,
  familyUnits,
  selectedZone,
  selectedFamilyUnit,
  lodgingQty,
  maxLodgingQty,
  canBookLodging,
  hasQualifyingTickets,
  ticketName,
  ticketQuantity,
  onSelectZone,
  onSelectFamilyUnit,
  onChangeQuantity,
  onBlockedSelection,
  onContinueWithoutLodging,
  assetsByType,
  emptyStateAction,
  showRequirementWarning = true,
  requirementCta,
}: LodgingSelectorProps) {
  if (zones.length === 0) {
    return (
      <div className="text-center py-12">
        <House className="w-12 h-12 mx-auto mb-4" style={{ color: COLORS.boulder, opacity: 0.5 }} />
        <p style={{ ...typography.body, color: COLORS.boulder }}>No accommodations currently available.</p>
        {emptyStateAction ?? (onContinueWithoutLodging ? (
          <Button
            onClick={onContinueWithoutLodging}
            className="mt-4 px-6 py-3"
            style={{
              ...typography.button,
              backgroundColor: COLORS.clay,
              color: COLORS.charcoal,
              borderRadius: '0',
            }}
          >
            Continue Without Lodging
          </Button>
        ) : null)}
      </div>
    );
  }

  return (
    <>
      {showRequirementWarning && !canBookLodging && ticketName && (
        <div
          className="p-4 rounded-xl border flex items-start gap-3"
          style={{
            backgroundColor: `${COLORS.mustard}15`,
            borderColor: `${COLORS.mustard}30`,
          }}
        >
          <Info className="w-5 h-5 shrink-0 mt-0.5" style={{ color: COLORS.mustard }} />
          <div>
            <p style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '14px' }}>
              Lodging requires VIP or Crew 3-day tickets
            </p>
            <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '4px' }}>
              Your {ticketName} tickets don&apos;t include lodging eligibility. Only VIP and Crew 3-day passes qualify for on-site accommodations.
            </p>
            {requirementCta}
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {zones.map((zone) => {
          const helper = zoneHelperText[zone.zone_key];
          const isSoldOut = zone.inventory_available === 0;
          const isLowInventory = zone.inventory_available <= 3 && !isSoldOut;
          const isSelected = selectedZone === zone.zone_key && !selectedFamilyUnit;
          const isDisabled = !canBookLodging || isSoldOut;
          const isCabinZone = zone.zone_key.includes("cabin");
          const zoneImages = isCabinZone ? assetsByType?.cabin ?? [] : assetsByType?.tent ?? [];
          const thumbnailImage = isCabinZone
            ? zoneImages.find((img) => img.image_url.includes("riverside-exterior")) || zoneImages.find((img) => img.image_type === "exterior") || zoneImages[0]
            : zoneImages.find((img) => img.image_type === "exterior") || zoneImages[0];

          return (
            <button
              key={zone.zone_key}
              onClick={() => {
                if (isDisabled) {
                  onBlockedSelection?.();
                  return;
                }
                onSelectZone(zone.zone_key);
              }}
              disabled={isDisabled}
              className="w-full text-left p-5 rounded-xl border-2 transition-all duration-300"
              style={{
                backgroundColor: isSelected ? `${COLORS.clay}08` : isSoldOut ? `${COLORS.boulder}05` : COLORS.white,
                borderColor: isSelected ? COLORS.clay : isDisabled ? `${COLORS.boulder}30` : `${COLORS.charcoal}15`,
                opacity: isDisabled ? 0.6 : 1,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
              }}
            >
              <div className="flex gap-4">
                {thumbnailImage && (
                  <div className="hidden sm:block w-24 h-24 md:w-28 md:h-28 shrink-0 rounded-lg overflow-hidden" style={{ backgroundColor: `${COLORS.dustySky}` }}>
                    <img src={thumbnailImage.image_url} alt={thumbnailImage.alt_text || zone.zone_name} className="w-full h-full object-cover" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1.5">
                        {isCabinZone ? (
                          <House className="w-5 h-5" style={{ color: COLORS.mustard }} />
                        ) : (
                          <Tent className="w-5 h-5" style={{ color: COLORS.clay }} />
                        )}
                        <h3 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '17px' }}>{zone.zone_name}</h3>
                        {isSelected && (
                          <div className="p-1 rounded-full" style={{ backgroundColor: COLORS.clay }}>
                            <Check className="w-3.5 h-3.5" style={{ color: COLORS.white }} />
                          </div>
                        )}
                      </div>
                      {helper && (
                        <div style={{ marginBottom: '8px' }}>
                          <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '13px' }}>{helper.tagline}</p>
                          {helper.siteNumbers && (
                            <p className="flex items-center gap-1 mt-1" style={{ ...typography.body, color: COLORS.charcoal, fontSize: '12px' }}>
                              <Map className="w-3 h-3" style={{ color: COLORS.clay }} />
                              {helper.siteNumbers}
                            </p>
                          )}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1" style={{ color: COLORS.boulder }}>
                          <BedDouble className="w-3.5 h-3.5" />
                          Sleeps {zone.sleeps_min === zone.sleeps_max ? zone.sleeps_max : `${zone.sleeps_min}–${zone.sleeps_max}`} · {zone.sleeps_max > 2 ? 'Two queen beds' : 'One queen bed'}
                        </span>
                        <span
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-full font-medium border"
                          style={{
                            backgroundColor: isSoldOut ? `${COLORS.boulder}15` : isLowInventory ? `${COLORS.mustard}15` : `${COLORS.dustySky}`,
                            color: isSoldOut ? COLORS.boulder : isLowInventory ? COLORS.mustard : COLORS.boulder,
                            borderColor: isSoldOut ? `${COLORS.boulder}30` : isLowInventory ? `${COLORS.mustard}20` : `${COLORS.charcoal}15`,
                          }}
                        >
                          {isLowInventory && !isSoldOut && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: COLORS.mustard }} />}
                          <Tent className="w-3.5 h-3.5" />
                          {isSoldOut ? "Sold Out" : `${zone.inventory_available} left`}
                        </span>
                      </div>
                    </div>
                    <div className="hidden md:block text-right shrink-0">
                      <p style={{ ...typography.headline, color: COLORS.charcoal, fontSize: '22px' }}>${(zone.night_price / 100).toLocaleString()}</p>
                      <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '11px' }}>per night</p>
                    </div>
                  </div>
                  <div className="md:hidden mt-3 pt-3 flex items-center justify-between" style={{ borderTop: `1px solid ${COLORS.charcoal}15` }}>
                    <span style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>per night</span>
                    <p style={{ ...typography.headline, color: COLORS.charcoal, fontSize: '18px' }}>${(zone.night_price / 100).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {familyUnits.length > 0 && (
        <Collapsible className="mt-8 pt-8" style={{ borderTop: `1px solid ${COLORS.charcoal}15` }}>
          <CollapsibleTrigger className="flex items-center justify-between w-full text-left group">
            <div>
              <h3 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '20px', marginBottom: '4px' }}>Family-Style Lodging</h3>
              <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}>
                Traveling with kids? A limited number of tents and cabins are specially configured for families.
              </p>
            </div>
            <ChevronDown className="w-5 h-5 transition-transform duration-200 group-data-[state=open]:rotate-180" style={{ color: COLORS.boulder }} />
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-6 p-4 -mx-4 rounded-xl" style={{ backgroundColor: `${COLORS.dustySky}80` }}>
            <div className="grid gap-4">
              {familyUnits.map((unit) => {
                const zoneName = zones.find((zone) => zone.zone_key === unit.zone_key)?.zone_name || unit.zone_key;
                const isCabin = unit.product_type === "cabin";
                const isSelected = selectedFamilyUnit === unit.id;
                const isDisabled = !canBookLodging;

                return (
                  <button
                    key={unit.id}
                    onClick={() => {
                      if (isDisabled) {
                        onBlockedSelection?.();
                        return;
                      }
                      onSelectFamilyUnit(unit.id);
                    }}
                    disabled={isDisabled}
                    className="w-full text-left p-6 rounded-xl border-2 transition-all duration-300"
                    style={{
                      backgroundColor: isSelected ? `${COLORS.clay}08` : COLORS.white,
                      borderColor: isSelected ? COLORS.clay : isDisabled ? `${COLORS.boulder}30` : `${COLORS.charcoal}15`,
                      opacity: isDisabled ? 0.6 : 1,
                      cursor: isDisabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {isCabin ? <House className="w-5 h-5" style={{ color: COLORS.mustard }} /> : <Tent className="w-5 h-5" style={{ color: COLORS.clay }} />}
                          <h3 style={{ ...typography.subhead, color: COLORS.charcoal, fontSize: '18px' }}>{isCabin ? `Cabin ${unit.unit_name}` : `Tent ${unit.unit_name}`}</h3>
                          {isSelected && (
                            <div className="p-1 rounded-full" style={{ backgroundColor: COLORS.clay }}>
                              <Check className="w-4 h-4" style={{ color: COLORS.white }} />
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                          <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px' }}>{zoneName}</p>
                          <span className="flex items-center gap-1" style={{ ...typography.body, color: COLORS.charcoal, fontSize: '12px' }}>
                            <Map className="w-3 h-3" style={{ color: COLORS.clay }} />
                            Site {unit.unit_name}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-xs">
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full" style={{ backgroundColor: `${COLORS.electricLavender}15`, color: COLORS.electricLavender }}>
                            <BedDouble className="w-3.5 h-3.5" />
                            {unit.bed_configuration}
                          </span>
                          <span className="inline-flex items-center gap-1.5" style={{ color: COLORS.boulder }}>
                            <Users className="w-3.5 h-3.5" />
                            Sleeps {unit.sleeps_max}
                          </span>
                          {unit.has_loft && (
                            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full" style={{ backgroundColor: `${COLORS.mustard}15`, color: COLORS.mustard }}>
                              Loft
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p style={{ ...typography.headline, color: COLORS.charcoal, fontSize: '24px' }}>${(unit.night_price / 100).toLocaleString()}</p>
                        <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px' }}>per night</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {selectedZone && maxLodgingQty > 1 && (
        <div className="p-6 rounded-xl border" style={{ backgroundColor: COLORS.white, borderColor: `${COLORS.charcoal}15` }}>
          <Label style={{ ...typography.body, color: COLORS.boulder, fontSize: '14px', marginBottom: '8px', display: 'block' }}>
            Number of Accommodations
          </Label>
          <select
            value={lodgingQty}
            onChange={(event) => onChangeQuantity(Number(event.target.value))}
            className="w-full h-10 px-3 rounded-md border"
            style={{ backgroundColor: COLORS.dustySky, borderColor: `${COLORS.charcoal}15`, color: COLORS.charcoal }}
          >
            {Array.from({ length: maxLodgingQty }, (_, index) => index + 1).map((count) => (
              <option key={count} value={count}>
                {count} {count === 1 ? "accommodation" : "accommodations"}
              </option>
            ))}
          </select>
          {typeof ticketQuantity === "number" && (
            <p style={{ ...typography.body, color: COLORS.boulder, fontSize: '12px', marginTop: '8px' }}>
              Based on {ticketQuantity} tickets, you can book up to {maxLodgingQty} accommodations
            </p>
          )}
        </div>
      )}
    </>
  );
}