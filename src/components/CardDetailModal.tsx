import React, { useEffect } from 'react';
import { ChevronLeft, ChevronRight, Layers, Sparkles, Swords, X } from 'lucide-react';
import { ALL_CARDS, getCardById, getCardImageUrl } from '../data/cards';
import { ARMOR_TO_PARTNER_ID, getEffectiveCardData } from '../data/digiParts';
import { ARMOR_LINEAGE } from '../engine';
import {
  MAX_COPIES,
  MAX_PARTNER_COPIES,
  type CardData,
  type PartnerConfigMap,
  type XEffect,
} from '../types/game';
import {
  AttackSymbolIcon,
  XEffectBadge,
  ensureDigiviceUiStyles,
  formatSupportTextWithIcons,
  getLevelDisplayLabel,
  getLevelFullName,
  getSpecialtyMeta,
} from './CardView';

function describeXEffectDetail(effect?: XEffect): string | null {
  if (!effect) return null;
  switch (effect.type) {
    case 'counter':
      return `Counterattack: When attacking second and hit by opponent's ${effect.target.toUpperCase()} attack (if surviving), reflects double the opponent's attack power plus own attack power.`;
    case 'zero':
      return `Nullify Attack: If the opponent selects ${effect.target.toUpperCase()} attack, reduces the opponent's attack power to 0 before combat damage.`;
    case 'firstAttack':
      return '1st Attack: Overrides normal turn priority so this Digimon strikes first during combat resolution.';
    case 'eatUpHp':
      return 'Eat-Up HP: Recovers own HP equal to the combat damage dealt by this attack (can exceed printed Max HP).';
    case 'crash':
      return 'Crash: Adds own current HP to this attack’s power and reduces own HP to 10 when striking.';
    case 'jamming':
      return "Jamming: Nullifies the opponent's printed X-attack special ability for this battle.";
    case 'foeX3':
      return `${effect.specialty} Foe ×3: Triples this attack's power (×3) if the opponent's active Digimon has ${effect.specialty} Specialty.`;
  }
}

export function getDigivolutionNotes(card: CardData): {
  summary: string;
  relatedCards: Array<{ label: string; card: CardData }>;
} {
  const relatedCards: Array<{ label: string; card: CardData }> = [];

  if (card.kind === 'Option') {
    if (card.id >= 293) {
      return {
        summary:
          'Digivolve-Phase Option Card (Cards #293–#300). Can only be played during your Preparation / Digivolve Phase while you have an Active Digimon (never as a Support card). If it does not trigger a Digivolution, it is simply discarded to Offline.',
        relatedCards,
      };
    }
    return {
      summary:
        'Battle Support Option Card. Played into the Support Slot during the Battle Phase to trigger its Option Effect.',
      relatedCards,
    };
  }

  if (card.level === 'R P') {
    const armorIds = ARMOR_LINEAGE[card.id] ?? [];
    for (const aid of armorIds) {
      const armorCard = getCardById(aid);
      if (armorCard) {
        relatedCards.push({ label: 'Armor Evolves To', card: armorCard });
      }
    }
    return {
      summary: `Partner Rookie (Max 1 copy per deck). When played in Rookie Placement, choose to evolve immediately for 0 DP into one of its Armor (A) forms (${armorIds.length} forms) or deploy as a Normal Rookie able to Digivolve into ${card.specialty} Champion (C) and Ultimate (U) cards.`,
      relatedCards,
    };
  }

  if (card.level === 'A') {
    const partnerId = ARMOR_TO_PARTNER_ID[card.id];
    if (partnerId !== undefined) {
      const partnerCard = getCardById(partnerId);
      if (partnerCard) {
        relatedCards.push({ label: 'Armor Evolves From', card: partnerCard });
      }
    }
    return {
      summary:
        'Armor Level Digimon (0 DP cost, +0 P). Cannot be added to a deck — evolves directly from its Partner Rookie (R P) when deployed, without consuming DP Slot cards. Can evolve further via Download (#293), ArmorCrush (#294), or revert via De-Armor (#298).',
      relatedCards,
    };
  }

  if (card.level === 'R') {
    return {
      summary: `Rookie Level Digimon. Can be placed directly into the Battle Area at the start of the match or after a KO (0 DP). Digivolves into any ${card.specialty} Champion (C) when sufficient DP is accumulated.`,
      relatedCards,
    };
  }

  if (card.level === 'C') {
    return {
      summary: `Champion Level Digimon. Digivolves from an active ${card.specialty} Rookie (R or R P) by consuming ${card.dp} DP from the DP Slot. Can digivolve further into a ${card.specialty} Ultimate (U).`,
      relatedCards,
    };
  }

  return {
    summary: `Ultimate Level Digimon. Digivolves from an active ${card.specialty} Champion (C) by consuming ${card.dp} DP from the DP Slot (or directly from Rookie via #297 Warp Digivolve).`,
    relatedCards,
  };
}

export interface CardDetailModalProps {
  card: CardData | null;
  isOpen?: boolean;
  mode?: 'modal' | 'panel';
  partnerConfig?: PartnerConfigMap;
  onClose?: () => void;
  onSelectCard?: (card: CardData) => void;
  deckCount?: number;
  onAddToDeck?: (card: CardData) => void;
  onRemoveFromDeck?: (card: CardData) => void;
  canAddToDeck?: boolean;
  addDisabledReason?: string | null;
}

export const CardDetailModal: React.FC<CardDetailModalProps> = ({
  card: rawCard,
  isOpen = true,
  mode = 'modal',
  partnerConfig,
  onClose,
  onSelectCard,
  deckCount,
  onAddToDeck,
  onRemoveFromDeck,
  canAddToDeck = true,
  addDisabledReason = null,
}) => {
  const card = rawCard ? (getEffectiveCardData(rawCard.id, partnerConfig) ?? rawCard) : null;

  useEffect(() => {
    ensureDigiviceUiStyles();
  }, []);

  useEffect(() => {
    if (mode !== 'modal' || !isOpen || !card) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.();
      } else if (e.key === 'ArrowLeft' && onSelectCard) {
        const prev = getCardById((card.id - 1 + ALL_CARDS.length) % ALL_CARDS.length);
        if (prev) onSelectCard(prev);
      } else if (e.key === 'ArrowRight' && onSelectCard) {
        const next = getCardById((card.id + 1) % ALL_CARDS.length);
        if (next) onSelectCard(next);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [mode, isOpen, card, onClose, onSelectCard]);

  if (!card || !isOpen) return null;

  const specMeta = getSpecialtyMeta(card);
  const maxAllowed =
    card.level === 'A' ? 0 : card.level === 'R P' ? MAX_PARTNER_COPIES : MAX_COPIES;
  const digivolveInfo = getDigivolutionNotes(card);
  const xEffectExplanation =
    card.attacks?.x.effect ? describeXEffectDetail(card.attacks.x.effect) : null;

  const handlePrev = () => {
    if (!onSelectCard) return;
    const prev = getCardById((card.id - 1 + ALL_CARDS.length) % ALL_CARDS.length);
    if (prev) onSelectCard(prev);
  };

  const handleNext = () => {
    if (!onSelectCard) return;
    const next = getCardById((card.id + 1) % ALL_CARDS.length);
    if (next) onSelectCard(next);
  };

  const content = (
    <div
      className={`ddcb-detail-card ${mode === 'panel' ? 'ddcb-detail-card--panel' : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          paddingBottom: '12px',
          borderBottom: '1px solid rgba(56, 189, 248, 0.25)',
          marginBottom: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.05rem',
              fontWeight: 700,
              color: 'var(--accent-cyan)',
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: '6px',
              padding: '2px 8px',
            }}
          >
            #{card.no}
          </span>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.35rem',
              fontWeight: 700,
              letterSpacing: '0.03em',
              color: 'var(--text-primary)',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {card.name}
          </h3>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {onSelectCard && (
            <>
              <button
                type="button"
                className="ddcb-btn ddcb-btn--sm"
                onClick={handlePrev}
                title="Previous Card"
                aria-label="Previous Card"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                className="ddcb-btn ddcb-btn--sm"
                onClick={handleNext}
                title="Next Card"
                aria-label="Next Card"
              >
                <ChevronRight size={15} />
              </button>
            </>
          )}
          {onClose && (
            <button
              type="button"
              className="ddcb-btn ddcb-btn--sm"
              onClick={onClose}
              title="Close Inspector"
              aria-label="Close Inspector"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Main Artwork + Primary Telemetry Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: mode === 'panel' ? '96px 1fr' : '128px 1fr',
          gap: '16px',
          alignItems: 'start',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            width: mode === 'panel' ? '96px' : '128px',
            height: mode === 'panel' ? '96px' : '128px',
            borderRadius: '10px',
            overflow: 'hidden',
            border: `2px solid ${specMeta.color}`,
            background: '#050a14',
            boxShadow: `0 0 18px ${specMeta.glowColor}`,
            position: 'relative',
          }}
        >
          <img
            src={getCardImageUrl(card)}
            alt={card.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Badges row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            <span className={`ddcb-badge ddcb-badge--spec spec-${specMeta.key}`}>
              <img src={specMeta.iconPath} alt="" className="ddcb-badge__icon" />
              <span>{specMeta.label}</span>
            </span>
            <span className="ddcb-badge ddcb-badge--level">
              {getLevelFullName(card.level)}
            </span>
            {card.isPartner && (
              <span className="ddcb-badge ddcb-badge--partner">
                Partner Category
              </span>
            )}
            <span
              className="ddcb-badge"
              style={{
                background: 'rgba(148, 163, 184, 0.14)',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                color: 'var(--text-secondary)',
              }}
            >
              {maxAllowed === 0
                ? 'Limit: Evolution Only (Cannot add to deck)'
                : `Limit: ${maxAllowed} ${maxAllowed === 1 ? 'Copy' : 'Copies'}`}
            </span>
          </div>

          {/* Numeric telemetry */}
          {card.kind === 'Digimon' ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: '8px',
              }}
            >
              <div className="ddcb-stat-box ddcb-stat-box--hp" style={{ padding: '7px' }}>
                <span className="ddcb-stat-label">HIT POINTS (HP)</span>
                <span className="ddcb-stat-val" style={{ fontSize: '1.15rem', color: '#34d399' }}>
                  {card.hp}
                </span>
              </div>
              <div className="ddcb-stat-box ddcb-stat-box--dp" style={{ padding: '7px' }}>
                <span className="ddcb-stat-label">DIGIVOLVE COST (DP)</span>
                <span className="ddcb-stat-val" style={{ fontSize: '1.15rem', color: '#38bdf8' }}>
                  {card.dp}
                </span>
              </div>
              <div className="ddcb-stat-box ddcb-stat-box--pp" style={{ padding: '7px' }}>
                <span className="ddcb-stat-label">DP SLOT VALUE (+P)</span>
                <span className="ddcb-stat-val" style={{ fontSize: '1.15rem', color: '#fbbf24' }}>
                  +{card.plusP}
                </span>
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'rgba(15, 23, 42, 0.7)',
                border: '1px solid rgba(100, 116, 139, 0.35)',
                fontSize: '0.84rem',
                color: 'var(--text-secondary)',
              }}
            >
              <strong style={{ color: 'var(--text-primary)' }}>
                {card.id >= 293 ? 'Digivolve Phase Option Card' : 'Battle Phase Support Option Card'}
              </strong>{' '}
              — Cannot be placed in the Battle Area or DP Slot.
            </div>
          )}

          {/* Optional Deck Add/Remove Controls */}
          {(onAddToDeck || onRemoveFromDeck) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {deckCount !== undefined && (
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    color: 'var(--accent-cyan)',
                  }}
                >
                  {maxAllowed === 0
                    ? 'Evolution Only (Cannot add to deck)'
                    : `In Active Deck: ${deckCount} / ${maxAllowed}`}
                </span>
              )}
              {onRemoveFromDeck && (
                <button
                  type="button"
                  className="ddcb-btn ddcb-btn--sm ddcb-btn--danger"
                  disabled={!deckCount || deckCount <= 0}
                  onClick={() => onRemoveFromDeck(card)}
                >
                  − Remove Copy
                </button>
              )}
              {onAddToDeck && (
                <button
                  type="button"
                  className="ddcb-btn ddcb-btn--sm ddcb-btn--primary"
                  disabled={!canAddToDeck}
                  title={addDisabledReason ?? 'Add copy to deck'}
                  onClick={() => onAddToDeck(card)}
                >
                  + Add to Deck
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Attacks Breakdown (Digimon Only) */}
      {card.kind === 'Digimon' && card.attacks && (
        <div
          style={{
            background: 'rgba(5, 10, 20, 0.75)',
            border: '1px solid rgba(56, 189, 248, 0.22)',
            borderRadius: '10px',
            padding: '12px',
            marginBottom: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'var(--font-display)',
              fontSize: '0.78rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
              marginBottom: '8px',
            }}
          >
            <Swords size={14} />
            <span>COMBAT ATTACKS (○ / △ / ✕)</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {(['circle', 'triangle', 'x'] as const).map((slot) => {
              const atk = card.attacks![slot];
              return (
                <div
                  key={slot}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    padding: '6px 10px',
                    borderRadius: '7px',
                    background: 'rgba(17, 28, 50, 0.7)',
                    border: '1px solid rgba(56, 189, 248, 0.14)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <AttackSymbolIcon slot={slot} size={18} />
                    <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                      {atk.name}
                    </strong>
                    {slot === 'x' && atk.effect && <XEffectBadge effect={atk.effect} />}
                  </div>
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.05rem',
                      fontWeight: 700,
                      color: 'var(--accent-cyan-bright)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {atk.power} PWR
                  </span>
                </div>
              );
            })}
          </div>

          {xEffectExplanation && (
            <div
              style={{
                marginTop: '8px',
                padding: '7px 10px',
                borderRadius: '6px',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                fontSize: '0.78rem',
                color: '#fde68a',
                lineHeight: 1.4,
              }}
            >
              <strong>✕ Special Ability:</strong> {xEffectExplanation}
            </div>
          )}
        </div>
      )}

      {/* Support / Option Effect */}
      <div
        style={{
          background: 'rgba(5, 10, 20, 0.75)',
          border: '1px solid rgba(56, 189, 248, 0.22)',
          borderRadius: '10px',
          padding: '12px',
          marginBottom: '12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontFamily: 'var(--font-display)',
            fontSize: '0.78rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            marginBottom: '6px',
          }}
        >
          <Sparkles size={14} />
          <span>{card.kind === 'Option' ? 'OPTION EFFECT' : 'SUPPORT EFFECT'}</span>
        </div>
        <div
          style={{
            fontSize: '0.9rem',
            color: 'var(--text-primary)',
            lineHeight: 1.5,
          }}
        >
          {formatSupportTextWithIcons(card.supportText, 16)}
        </div>
      </div>

      {/* Digivolution & Lineage Rules */}
      <div
        style={{
          background: 'rgba(5, 10, 20, 0.65)',
          border: '1px solid rgba(56, 189, 248, 0.18)',
          borderRadius: '10px',
          padding: '12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontFamily: 'var(--font-display)',
            fontSize: '0.78rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'var(--text-secondary)',
            textTransform: 'uppercase',
            marginBottom: '6px',
          }}
        >
          <Layers size={14} />
          <span>DIGIVOLUTION & BATTLE ROLE</span>
        </div>
        <p
          style={{
            fontSize: '0.82rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.45,
            margin: 0,
          }}
        >
          {digivolveInfo.summary}
        </p>

        {digivolveInfo.relatedCards.length > 0 && (
          <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {digivolveInfo.relatedCards.map(({ label, card: rel }) => {
              const relSpec = getSpecialtyMeta(rel);
              return (
                <button
                  key={rel.id}
                  type="button"
                  className="ddcb-btn ddcb-btn--sm"
                  onClick={() => onSelectCard?.(rel)}
                  style={{
                    borderColor: relSpec.borderColor,
                    textTransform: 'none',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{label}:</span>
                  <strong>
                    #{rel.no} {rel.name}
                  </strong>
                  <span className="ddcb-badge ddcb-badge--level">{getLevelDisplayLabel(rel)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  if (mode === 'panel') {
    return content;
  }

  return (
    <div
      className="ddcb-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Card Details: #${card.no} ${card.name}`}
      onClick={onClose}
    >
      <div className="ddcb-modal-dialog">{content}</div>
    </div>
  );
};
