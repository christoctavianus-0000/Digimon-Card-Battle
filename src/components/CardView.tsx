import React, { useEffect, useState } from 'react';
import { getCardById, getCardImageUrl } from '../data/cards';
import type { AttackSlot, CardData, Level, Specialty, XEffect } from '../types/game';

export type CardViewSize = 'mini' | 'compact' | 'full';

export interface SpecialtyMeta {
  key: string;
  label: string;
  color: string;
  bgGradient: string;
  borderColor: string;
  glowColor: string;
  iconPath: string;
}

/**
 * Resolves a UI SVG asset path under `public/assets/ui/` respecting Vite's `BASE_URL`.
 */
export function getUiAssetUrl(fileName: string): string {
  const clean = fileName.replace(/^\/+/, '').replace(/^assets\/ui\//, '');
  const baseUrl =
    typeof import.meta !== 'undefined' && import.meta.env && typeof import.meta.env.BASE_URL === 'string'
      ? import.meta.env.BASE_URL
      : './';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}assets/ui/${clean}`;
}

const SPECIALTY_META_MAP: Record<string, SpecialtyMeta> = {
  Fire: {
    key: 'fire',
    label: 'Fire',
    color: '#ef4444',
    bgGradient: 'linear-gradient(135deg, #ef4444, #b91c1c)',
    borderColor: 'rgba(239, 68, 68, 0.55)',
    glowColor: 'rgba(239, 68, 68, 0.25)',
    iconPath: getUiAssetUrl('spec-fire.svg'),
  },
  Ice: {
    key: 'ice',
    label: 'Ice',
    color: '#3b82f6',
    bgGradient: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
    borderColor: 'rgba(59, 130, 246, 0.55)',
    glowColor: 'rgba(59, 130, 246, 0.25)',
    iconPath: getUiAssetUrl('spec-ice.svg'),
  },
  Nature: {
    key: 'nature',
    label: 'Nature',
    color: '#10b981',
    bgGradient: 'linear-gradient(135deg, #10b981, #047857)',
    borderColor: 'rgba(16, 185, 129, 0.55)',
    glowColor: 'rgba(16, 185, 129, 0.25)',
    iconPath: getUiAssetUrl('spec-nature.svg'),
  },
  Darkness: {
    key: 'darkness',
    label: 'Darkness',
    color: '#a855f7',
    bgGradient: 'linear-gradient(135deg, #a855f7, #6b21a8)',
    borderColor: 'rgba(168, 85, 247, 0.55)',
    glowColor: 'rgba(168, 85, 247, 0.25)',
    iconPath: getUiAssetUrl('spec-darkness.svg'),
  },
  Rare: {
    key: 'rare',
    label: 'Rare',
    color: '#eab308',
    bgGradient: 'linear-gradient(135deg, #facc15, #ca8a04)',
    borderColor: 'rgba(234, 179, 8, 0.6)',
    glowColor: 'rgba(234, 179, 8, 0.25)',
    iconPath: getUiAssetUrl('spec-rare.svg'),
  },
  Partner: {
    key: 'partner',
    label: 'Partner',
    color: '#ec4899',
    bgGradient: 'linear-gradient(135deg, #ec4899, #be185d)',
    borderColor: 'rgba(236, 72, 153, 0.55)',
    glowColor: 'rgba(236, 72, 153, 0.25)',
    iconPath: getUiAssetUrl('spec-partner.svg'),
  },
  Option: {
    key: 'option',
    label: 'Option',
    color: '#64748b',
    bgGradient: 'linear-gradient(135deg, #64748b, #334155)',
    borderColor: 'rgba(100, 116, 139, 0.55)',
    glowColor: 'rgba(100, 116, 139, 0.25)',
    iconPath: getUiAssetUrl('spec-option.svg'),
  },
  All: {
    key: 'all',
    label: 'All',
    color: '#38bdf8',
    bgGradient: 'linear-gradient(135deg, #38bdf8, #0284c7)',
    borderColor: 'rgba(56, 189, 248, 0.55)',
    glowColor: 'rgba(56, 189, 248, 0.25)',
    iconPath: getUiAssetUrl('spec-all.svg'),
  },
};

export function getSpecialtyMeta(
  cardOrSpec: CardData | Specialty | 'Option' | 'Partner' | 'All' | null | undefined
): SpecialtyMeta {
  if (!cardOrSpec) return SPECIALTY_META_MAP.Option;
  if (typeof cardOrSpec === 'string') {
    return SPECIALTY_META_MAP[cardOrSpec] ?? SPECIALTY_META_MAP.Option;
  }
  if (cardOrSpec.kind === 'Option' || !cardOrSpec.specialty) {
    return SPECIALTY_META_MAP.Option;
  }
  return SPECIALTY_META_MAP[cardOrSpec.specialty] ?? SPECIALTY_META_MAP.Option;
}

export function getLevelDisplayLabel(card: CardData): string {
  if (card.kind === 'Option' || !card.level) return 'Option';
  return card.level;
}

export function getLevelFullName(level: Level | 'Option' | null): string {
  switch (level) {
    case 'R':
      return 'Rookie (R)';
    case 'C':
      return 'Champion (C)';
    case 'U':
      return 'Ultimate (U)';
    case 'A':
      return 'Armor (A)';
    case 'R P':
      return 'Rookie Partner (R P)';
    default:
      return 'Option Card';
  }
}

/**
 * Renders an inline attack symbol SVG (`circle`, `triangle`, or `x`).
 */
export const AttackSymbolIcon: React.FC<{
  slot: AttackSlot;
  size?: number;
  className?: string;
}> = ({ slot, size = 15, className = '' }) => {
  const labels: Record<AttackSlot, string> = {
    circle: '○ Circle Attack',
    triangle: '△ Triangle Attack',
    x: '✕ Cross Attack',
  };
  return (
    <img
      src={getUiAssetUrl(`${slot}.svg`)}
      alt={labels[slot]}
      title={labels[slot]}
      width={size}
      height={size}
      className={`ddcb-attack-icon ${className}`.trim()}
      draggable={false}
    />
  );
};

/**
 * Formats an `XEffect` as plain searchable text (with `[[circle]]` etc. or symbols).
 */
export function formatXEffectText(effect?: XEffect): string {
  if (!effect) return '';
  switch (effect.type) {
    case 'counter':
      return `[[${effect.target}]] Counter`;
    case 'zero':
      return `[[${effect.target}]] to 0`;
    case 'firstAttack':
      return '1st Attack';
    case 'eatUpHp':
      return 'Eat-up HP';
    case 'crash':
      return 'Crash';
    case 'jamming':
      return 'Jamming';
    case 'foeX3':
      return `${effect.specialty} Foe x3`;
  }
}

/**
 * Renders a formatted X-attack special effect badge with inline SVG attack symbols.
 */
export const XEffectBadge: React.FC<{ effect?: XEffect; compact?: boolean }> = ({
  effect,
  compact = false,
}) => {
  if (!effect) return null;
  const iconSize = compact ? 12 : 14;

  switch (effect.type) {
    case 'counter':
      return (
        <span className="ddcb-xeffect-badge ddcb-xeffect--counter" title="Counterattack against matching symbol">
          <AttackSymbolIcon slot={effect.target} size={iconSize} />
          <span>Counter</span>
        </span>
      );
    case 'zero':
      return (
        <span className="ddcb-xeffect-badge ddcb-xeffect--zero" title="Reduces target attack power to 0">
          <AttackSymbolIcon slot={effect.target} size={iconSize} />
          <span>to 0</span>
        </span>
      );
    case 'firstAttack':
      return (
        <span className="ddcb-xeffect-badge ddcb-xeffect--first" title="Attacks first in battle">
          1st Attack
        </span>
      );
    case 'eatUpHp':
      return (
        <span className="ddcb-xeffect-badge ddcb-xeffect--eat" title="Recovers HP equal to damage dealt">
          Eat-up HP
        </span>
      );
    case 'crash':
      return (
        <span className="ddcb-xeffect-badge ddcb-xeffect--crash" title="Converts own HP to attack power, leaves 10 HP">
          Crash
        </span>
      );
    case 'jamming':
      return (
        <span className="ddcb-xeffect-badge ddcb-xeffect--jamming" title="Nullifies opponent X-attack effect">
          Jamming
        </span>
      );
    case 'foeX3':
      return (
        <span
          className={`ddcb-xeffect-badge ddcb-xeffect--foex3 ddcb-xeffect--${effect.specialty.toLowerCase()}`}
          title={`Triples X attack power vs ${effect.specialty} specialty`}
        >
          {effect.specialty} Foe ×3
        </span>
      );
  }
};

/**
 * Replaces `[[circle]]`, `[[triangle]]`, and `[[x]]` tokens in Support/Option text
 * with inline vector SVG icons (`./assets/ui/circle.svg`, `triangle.svg`, `x.svg`).
 */
export function formatSupportTextWithIcons(
  text: string | null | undefined,
  iconSize = 14
): React.ReactNode {
  if (!text || text.trim() === '' || text.trim().toLowerCase() === 'none') {
    return <span className="ddcb-support-none">None</span>;
  }

  const parts = text.split(/(\[\[(?:circle|triangle|x)\]\])/gi);
  return parts.map((part, idx) => {
    const match = part.match(/^\[\[(circle|triangle|x)\]\]$/i);
    if (match) {
      const slot = match[1].toLowerCase() as AttackSlot;
      return (
        <span key={idx} className="ddcb-inline-token">
          <AttackSymbolIcon slot={slot} size={iconSize} />
        </span>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export interface CardViewProps {
  card: CardData;
  size?: CardViewSize;
  /** Shorthand alias for `size="compact"`. */
  compact?: boolean;
  /** Shorthand alias for `size="mini"`. */
  mini?: boolean;
  selected?: boolean;
  disabled?: boolean;
  lockedReason?: string | null;
  /** Badge showing copy count in deck or binder (e.g. `2` -> `×2` or `2/4`). */
  countBadge?: number | string;
  /** Alias for countBadge used by binder views. */
  ownedCount?: number;
  maxCopies?: number;
  /** Optional override for live HP in battle. */
  currentHp?: number;
  /** Optional override for live Specialty in battle. */
  effectiveSpecialty?: Specialty;
  /** Optional highlighted attack slot (`circle` | `triangle` | `x`). */
  highlightAttack?: AttackSlot | null;
  /** Whether to show support text on compact cards. */
  showSupport?: boolean;
  onClick?: (card: CardData, event: React.MouseEvent<HTMLElement>) => void;
  onInspect?: (card: CardData, event: React.MouseEvent<HTMLElement>) => void;
  onAdd?: (card: CardData, event: React.MouseEvent<HTMLElement>) => void;
  onRemove?: (card: CardData, event: React.MouseEvent<HTMLElement>) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const CardView: React.FC<CardViewProps> = ({
  card,
  size: sizeProp,
  compact = false,
  mini = false,
  selected = false,
  disabled = false,
  lockedReason = null,
  countBadge,
  ownedCount,
  maxCopies,
  currentHp,
  effectiveSpecialty,
  highlightAttack = null,
  showSupport,
  onClick,
  onInspect,
  onAdd,
  onRemove,
  className = '',
  style,
}) => {
  useEffect(() => {
    ensureDigiviceUiStyles();
  }, []);

  const [imgError, setImgError] = useState(false);

  const resolvedSize: CardViewSize =
    sizeProp ?? (mini ? 'mini' : compact ? 'compact' : 'full');

  const specMeta = getSpecialtyMeta(effectiveSpecialty ?? card);
  const partnerMeta = card.isPartner ? SPECIALTY_META_MAP.Partner : null;
  const levelLabel = getLevelDisplayLabel(card);
  const displayHp = currentHp !== undefined ? currentHp : card.hp;

  const badgeValue =
    countBadge !== undefined
      ? countBadge
      : ownedCount !== undefined
      ? maxCopies !== undefined
        ? `${ownedCount}/${maxCopies}`
        : `×${ownedCount}`
      : undefined;

  const shouldShowSupport =
    showSupport !== undefined ? showSupport : resolvedSize === 'full';

  const handleRootClick = (e: React.MouseEvent<HTMLElement>) => {
    if (disabled) return;
    onClick?.(card, e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (disabled) return;
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick(card, e as unknown as React.MouseEvent<HTMLElement>);
    }
  };

  return (
    <div
      role={onClick ? 'button' : 'article'}
      tabIndex={onClick && !disabled ? 0 : undefined}
      aria-pressed={onClick ? selected : undefined}
      aria-disabled={disabled || undefined}
      onClick={handleRootClick}
      onKeyDown={handleKeyDown}
      className={[
        'ddcb-card',
        `ddcb-card--${resolvedSize}`,
        `ddcb-card--spec-${specMeta.key}`,
        card.isPartner ? 'ddcb-card--partner' : '',
        selected ? 'is-selected' : '',
        disabled || lockedReason ? 'is-disabled' : '',
        onClick ? 'is-interactive' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        {
          '--card-spec-color': specMeta.color,
          '--card-spec-border': specMeta.borderColor,
          '--card-spec-glow': specMeta.glowColor,
          '--card-spec-grad': specMeta.bgGradient,
          ...style,
        } as React.CSSProperties
      }
      title={lockedReason ?? `#${card.no} ${card.name}`}
    >
      {/* Top Header Strip: #No, Name, Level & Specialty Badge */}
      <div className="ddcb-card__header">
        <div className="ddcb-card__id-group">
          <span className="ddcb-card__no">#{card.no}</span>
          <span className="ddcb-card__name" title={card.name}>
            {card.name}
          </span>
        </div>
        <div className="ddcb-card__badges">
          {card.isPartner && partnerMeta && (
            <span
              className="ddcb-badge ddcb-badge--partner"
              title="Partner / Armor Card"
            >
              <img
                src={partnerMeta.iconPath}
                alt="Partner"
                className="ddcb-badge__icon"
              />
              {resolvedSize === 'full' && <span>P</span>}
            </span>
          )}
          <span
            className={`ddcb-badge ddcb-badge--level ${
              card.level === 'R P'
                ? 'is-rp'
                : card.level === 'A'
                ? 'is-armor'
                : card.kind === 'Option'
                ? 'is-option'
                : ''
            }`}
            title={getLevelFullName(card.level)}
          >
            {levelLabel}
          </span>
          <span
            className={`ddcb-badge ddcb-badge--spec spec-${specMeta.key}`}
            title={`Specialty: ${specMeta.label}`}
          >
            <img
              src={specMeta.iconPath}
              alt={specMeta.label}
              className="ddcb-badge__icon"
            />
            {resolvedSize !== 'mini' && <span>{specMeta.label}</span>}
          </span>
        </div>
      </div>

      {/* Main Visual & Telemetry Row */}
      <div className="ddcb-card__body">
        <div className="ddcb-card__art-wrap">
          {!imgError ? (
            <img
              src={getCardImageUrl(card)}
              alt={`#${card.no} ${card.name}`}
              className="ddcb-card__art"
              loading="lazy"
              draggable={false}
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="ddcb-card__no-art">
              <img
                src={specMeta.iconPath}
                alt=""
                className="ddcb-card__no-art-icon"
              />
              <span>#{card.no}</span>
            </div>
          )}

          {badgeValue !== undefined && (
            <span
              className={`ddcb-card__count-pill ${
                badgeValue === 0 ||
                badgeValue === '×0' ||
                badgeValue === '0/4' ||
                badgeValue === '0/0' ||
                badgeValue === 'Evo Only'
                  ? 'is-zero'
                  : ''
              }`}
            >
              {typeof badgeValue === 'number' ? `×${badgeValue}` : badgeValue}
            </span>
          )}

          {onInspect && (
            <button
              type="button"
              className="ddcb-card__inspect-btn"
              title={`Inspect #${card.no} ${card.name}`}
              onClick={(e) => {
                e.stopPropagation();
                onInspect(card, e);
              }}
              aria-label={`Inspect ${card.name}`}
            >
              🔍
            </button>
          )}
        </div>

        {/* Stat Strip for Digimon or Option Type Label */}
        {card.kind === 'Digimon' ? (
          <div className="ddcb-card__stats">
            <div className="ddcb-stat-box ddcb-stat-box--hp" title="Hit Points">
              <span className="ddcb-stat-label">HP</span>
              <span className="ddcb-stat-val">{displayHp}</span>
            </div>
            <div className="ddcb-stat-box ddcb-stat-box--dp" title="Digivolve Point Cost">
              <span className="ddcb-stat-label">DP</span>
              <span className="ddcb-stat-val">{card.dp}</span>
            </div>
            <div className="ddcb-stat-box ddcb-stat-box--pp" title="DP Slot Points (+P)">
              <span className="ddcb-stat-label">+P</span>
              <span className="ddcb-stat-val">+{card.plusP}</span>
            </div>
          </div>
        ) : (
          <div className="ddcb-card__option-banner">
            <span className="ddcb-option-tag">
              {card.id >= 293 ? 'DIGIVOLVE OPTION' : 'BATTLE OPTION'}
            </span>
          </div>
        )}
      </div>

      {/* Attacks Table (Digimon Only, non-mini or compact/full) */}
      {card.kind === 'Digimon' && card.attacks && resolvedSize !== 'mini' && (
        <div className="ddcb-card__attacks">
          {(['circle', 'triangle', 'x'] as const).map((slot) => {
            const atk = card.attacks![slot];
            const isHighlighted = highlightAttack === slot;
            return (
              <div
                key={slot}
                className={`ddcb-atk-row ${isHighlighted ? 'is-highlighted' : ''}`}
              >
                <span className="ddcb-atk-symbol">
                  <AttackSymbolIcon
                    slot={slot}
                    size={resolvedSize === 'compact' ? 13 : 15}
                  />
                </span>
                <span className="ddcb-atk-name" title={atk.name}>
                  {atk.name}
                </span>
                {slot === 'x' && atk.effect && (
                  <XEffectBadge
                    effect={atk.effect}
                    compact={resolvedSize === 'compact'}
                  />
                )}
                <span className="ddcb-atk-power">{atk.power}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Mini Attack Summary for Mini Size */}
      {card.kind === 'Digimon' && card.attacks && resolvedSize === 'mini' && (
        <div className="ddcb-card__mini-attacks">
          <span>
            <AttackSymbolIcon slot="circle" size={11} /> {card.attacks.circle.power}
          </span>
          <span>
            <AttackSymbolIcon slot="triangle" size={11} /> {card.attacks.triangle.power}
          </span>
          <span>
            <AttackSymbolIcon slot="x" size={11} /> {card.attacks.x.power}
          </span>
        </div>
      )}

      {/* Support / Option Effect Box */}
      {(shouldShowSupport || card.kind === 'Option') && resolvedSize !== 'mini' && (
        <div className="ddcb-card__support">
          <div className="ddcb-card__support-label">
            {card.kind === 'Option' ? 'OPTION EFFECT' : 'SUPPORT EFFECT'}
          </div>
          <div className="ddcb-card__support-text">
            {formatSupportTextWithIcons(
              card.supportText,
              resolvedSize === 'compact' ? 12 : 14
            )}
          </div>
        </div>
      )}

      {/* Optional Quick +/- Action Controls (used in DeckBuilder) */}
      {(onAdd || onRemove) && (
        <div
          className="ddcb-card__actions"
          onClick={(e) => e.stopPropagation()}
        >
          {onRemove && (
            <button
              type="button"
              className="ddcb-card__act-btn ddcb-card__act-btn--remove"
              onClick={(e) => onRemove(card, e)}
              title={`Remove 1 copy of ${card.name}`}
              aria-label={`Remove ${card.name}`}
            >
              −
            </button>
          )}
          {onAdd && (
            <button
              type="button"
              className="ddcb-card__act-btn ddcb-card__act-btn--add"
              onClick={(e) => onAdd(card, e)}
              disabled={disabled || Boolean(lockedReason)}
              title={lockedReason ?? `Add 1 copy of ${card.name}`}
              aria-label={`Add ${card.name}`}
            >
              +
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Helper component that renders a card by numeric ID.
 */
export const CardViewById: React.FC<Omit<CardViewProps, 'card'> & { cardId: number }> = ({
  cardId,
  ...rest
}) => {
  const card = getCardById(cardId);
  if (!card) return null;
  return <CardView card={card} {...rest} />;
};

// ============================================================================
// Shared Digivice HUD Styles for CardView, Binder, DeckBuilder & OpponentSelect
// ============================================================================

const DIGIVICE_UI_STYLE_ID = 'ddcb-digivice-ui-styles';

export function ensureDigiviceUiStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(DIGIVICE_UI_STYLE_ID)) return;

  const styleEl = document.createElement('style');
  styleEl.id = DIGIVICE_UI_STYLE_ID;
  styleEl.textContent = DIGIVICE_UI_CSS;
  document.head.appendChild(styleEl);
}

const DIGIVICE_UI_CSS = `
/* ==========================================================================
   DIGIMON DIGITAL CARD BATTLE — CardView, Binder, DeckBuilder, OpponentSelect
   ========================================================================== */

.ddcb-attack-icon {
  display: inline-block;
  vertical-align: -2px;
  flex-shrink: 0;
}

.ddcb-inline-token {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
  margin: 0 2px;
}

.ddcb-support-none {
  color: var(--text-muted, #6482a3);
  font-style: italic;
}

/* Card Component */
.ddcb-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: linear-gradient(180deg, #111d35 0%, #091224 100%);
  border: 1px solid var(--card-spec-border, rgba(56, 189, 248, 0.3));
  border-radius: 10px;
  padding: 10px;
  color: var(--text-primary, #f0f7ff);
  box-shadow: 0 6px 20px rgba(2, 6, 16, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.07);
  transition: transform 0.16s cubic-bezier(0.23, 1, 0.32, 1),
              border-color 0.16s ease,
              box-shadow 0.16s ease;
  text-align: left;
  user-select: none;
  overflow: hidden;
}

.ddcb-card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--card-spec-grad, linear-gradient(90deg, #38bdf8, #0284c7));
  opacity: 0.9;
  pointer-events: none;
}

.ddcb-card.is-interactive {
  cursor: pointer;
}

.ddcb-card.is-interactive:hover:not(.is-disabled) {
  transform: translateY(-2px);
  border-color: var(--accent-cyan, #38bdf8);
  box-shadow: 0 10px 26px rgba(2, 6, 16, 0.7), 0 0 16px var(--card-spec-glow, rgba(56, 189, 248, 0.28));
}

.ddcb-card.is-selected {
  border-color: var(--accent-amber-bright, #fbbf24);
  box-shadow: 0 0 0 2px var(--accent-amber-bright, #fbbf24), 0 0 20px rgba(251, 191, 36, 0.35);
}

.ddcb-card.is-disabled {
  opacity: 0.55;
  filter: saturate(0.65);
}

.ddcb-card--compact {
  padding: 8px;
  gap: 6px;
}

.ddcb-card--mini {
  padding: 6px;
  gap: 5px;
  border-radius: 8px;
}

/* Header */
.ddcb-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding-top: 2px;
}

.ddcb-card__id-group {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
  flex: 1;
}

.ddcb-card__no {
  font-family: var(--font-display, 'Rajdhani', sans-serif);
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--text-secondary, #94b3d4);
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.ddcb-card__name {
  font-family: var(--font-display, 'Rajdhani', sans-serif);
  font-size: 0.96rem;
  font-weight: 700;
  color: var(--text-primary, #f0f7ff);
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ddcb-card--compact .ddcb-card__name {
  font-size: 0.86rem;
}

.ddcb-card--mini .ddcb-card__name {
  font-size: 0.78rem;
}

.ddcb-card__badges {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.ddcb-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-display, 'Rajdhani', sans-serif);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  line-height: 1.1;
}

.ddcb-badge__icon {
  width: 12px;
  height: 12px;
  display: block;
}

.ddcb-badge--level {
  background: rgba(56, 189, 248, 0.14);
  border: 1px solid rgba(56, 189, 248, 0.35);
  color: var(--accent-cyan, #38bdf8);
}

.ddcb-badge--level.is-rp {
  background: rgba(236, 72, 153, 0.18);
  border-color: rgba(236, 72, 153, 0.45);
  color: #f472b6;
}

.ddcb-badge--level.is-armor {
  background: rgba(245, 158, 11, 0.18);
  border-color: rgba(245, 158, 11, 0.45);
  color: #fbbf24;
}

.ddcb-badge--level.is-option {
  background: rgba(100, 116, 139, 0.2);
  border-color: rgba(148, 163, 184, 0.35);
  color: #cbd5e1;
}

.ddcb-badge--partner {
  background: linear-gradient(135deg, #ec4899, #be185d);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.25);
}

.ddcb-badge--spec {
  background: var(--card-spec-grad);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.22);
}

.ddcb-badge--spec.spec-rare {
  color: #090d16;
}

/* Body: Art + Stats */
.ddcb-card__body {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.ddcb-card__art-wrap {
  position: relative;
  width: 64px;
  height: 64px;
  border-radius: 7px;
  overflow: hidden;
  background: #050a14;
  border: 1px solid rgba(56, 189, 248, 0.28);
  flex-shrink: 0;
  box-shadow: inset 0 0 8px rgba(0, 0, 0, 0.6);
}

.ddcb-card--compact .ddcb-card__art-wrap {
  width: 52px;
  height: 52px;
}

.ddcb-card--mini .ddcb-card__art-wrap {
  width: 40px;
  height: 40px;
}

.ddcb-card__art {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ddcb-card__no-art {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--text-muted, #6482a3);
  font-size: 0.65rem;
  font-family: var(--font-display, 'Rajdhani', sans-serif);
}

.ddcb-card__no-art-icon {
  width: 20px;
  height: 20px;
  opacity: 0.55;
}

.ddcb-card__count-pill {
  position: absolute;
  bottom: 3px;
  right: 3px;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(7, 11, 20, 0.9);
  border: 1px solid var(--accent-cyan, #38bdf8);
  color: var(--accent-cyan-bright, #00e5ff);
  font-family: var(--font-display, 'Rajdhani', sans-serif);
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1.1;
}

.ddcb-card__count-pill.is-zero {
  border-color: rgba(148, 163, 184, 0.35);
  color: var(--text-muted, #6482a3);
}

.ddcb-card__inspect-btn {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid rgba(56, 189, 248, 0.35);
  background: rgba(7, 11, 20, 0.82);
  color: #f0f7ff;
  font-size: 0.65rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease;
}

.ddcb-card:hover .ddcb-card__inspect-btn,
.ddcb-card__inspect-btn:focus-visible {
  opacity: 1;
}

.ddcb-card__inspect-btn:hover {
  background: rgba(56, 189, 248, 0.25);
}

/* Telemetry Stat Boxes */
.ddcb-card__stats {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
  align-items: center;
}

.ddcb-stat-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(7, 11, 20, 0.72);
  border: 1px solid rgba(56, 189, 248, 0.18);
  border-radius: 6px;
  padding: 4px 4px;
  min-width: 0;
}

.ddcb-stat-box--hp {
  border-top: 2px solid #10b981;
}

.ddcb-stat-box--dp {
  border-top: 2px solid #38bdf8;
}

.ddcb-stat-box--pp {
  border-top: 2px solid #f59e0b;
}

.ddcb-stat-label {
  font-family: var(--font-display, 'Rajdhani', sans-serif);
  font-size: 0.64rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--text-secondary, #94b3d4);
  text-transform: uppercase;
  line-height: 1;
}

.ddcb-stat-val {
  font-family: var(--font-display, 'Rajdhani', sans-serif);
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--text-primary, #f0f7ff);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.ddcb-card--compact .ddcb-stat-val {
  font-size: 0.82rem;
}

.ddcb-card--mini .ddcb-stat-val {
  font-size: 0.75rem;
}

.ddcb-card__option-banner {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.65);
  border: 1px dashed rgba(148, 163, 184, 0.3);
  border-radius: 6px;
  padding: 6px;
}

.ddcb-option-tag {
  font-family: var(--font-display, 'Rajdhani', sans-serif);
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--text-secondary, #94b3d4);
  text-transform: uppercase;
}

/* Attacks Section */
.ddcb-card__attacks {
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: rgba(5, 10, 20, 0.65);
  border: 1px solid rgba(56, 189, 248, 0.16);
  border-radius: 6px;
  padding: 5px 7px;
}

.ddcb-atk-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  line-height: 1.25;
  padding: 2px 3px;
  border-radius: 4px;
}

.ddcb-atk-row.is-highlighted {
  background: rgba(56, 189, 248, 0.18);
  box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.4);
}

.ddcb-card--compact .ddcb-atk-row {
  font-size: 0.72rem;
  gap: 4px;
}

.ddcb-atk-symbol {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  flex-shrink: 0;
}

.ddcb-atk-name {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary, #f0f7ff);
  font-weight: 500;
}

.ddcb-atk-power {
  font-family: var(--font-display, 'Rajdhani', sans-serif);
  font-weight: 700;
  font-size: 0.86rem;
  color: var(--accent-cyan, #38bdf8);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.ddcb-card__mini-attacks {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 3px 6px;
  background: rgba(5, 10, 20, 0.65);
  border-radius: 5px;
  font-family: var(--font-display, 'Rajdhani', sans-serif);
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--accent-cyan, #38bdf8);
}

/* X-Effect Badges */
.ddcb-xeffect-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 5px;
  border-radius: 4px;
  font-family: var(--font-display, 'Rajdhani', sans-serif);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  background: rgba(245, 158, 11, 0.16);
  border: 1px solid rgba(245, 158, 11, 0.42);
  color: #fbbf24;
  white-space: nowrap;
  flex-shrink: 0;
}

.ddcb-xeffect--counter {
  background: rgba(239, 68, 68, 0.16);
  border-color: rgba(239, 68, 68, 0.45);
  color: #fca5a5;
}

.ddcb-xeffect--zero {
  background: rgba(56, 189, 248, 0.16);
  border-color: rgba(56, 189, 248, 0.45);
  color: #7dd3fc;
}

.ddcb-xeffect--eat {
  background: rgba(16, 185, 129, 0.16);
  border-color: rgba(16, 185, 129, 0.45);
  color: #6ee7b7;
}

.ddcb-xeffect--jamming {
  background: rgba(168, 85, 247, 0.18);
  border-color: rgba(168, 85, 247, 0.45);
  color: #d8b4fe;
}

/* Support Effect Section */
.ddcb-card__support {
  background: rgba(7, 11, 20, 0.55);
  border-top: 1px solid rgba(56, 189, 248, 0.16);
  padding-top: 5px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ddcb-card__support-label {
  font-family: var(--font-display, 'Rajdhani', sans-serif);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--text-muted, #6482a3);
  text-transform: uppercase;
}

.ddcb-card__support-text {
  font-size: 0.74rem;
  color: var(--text-secondary, #94b3d4);
  line-height: 1.38;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Quick +/- Action Controls */
.ddcb-card__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  margin-top: auto;
  padding-top: 4px;
}

.ddcb-card__act-btn {
  width: 26px;
  height: 26px;
  border-radius: 5px;
  border: 1px solid rgba(56, 189, 248, 0.35);
  background: rgba(14, 23, 41, 0.9);
  color: #f0f7ff;
  font-family: var(--font-display, 'Rajdhani', sans-serif);
  font-size: 1rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.14s ease, border-color 0.14s ease;
}

.ddcb-card__act-btn--add:hover:not(:disabled) {
  background: rgba(16, 185, 129, 0.25);
  border-color: #10b981;
}

.ddcb-card__act-btn--remove:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.25);
  border-color: #ef4444;
}

.ddcb-card__act-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ==========================================================================
   Shared Layout & Controls for Binder, DeckBuilder, OpponentSelect & Modals
   ========================================================================== */

.ddcb-panel {
  background: linear-gradient(180deg, rgba(14, 23, 41, 0.95) 0%, rgba(9, 16, 29, 0.98) 100%);
  border: 1px solid var(--border-card, rgba(56, 189, 248, 0.28));
  border-radius: 12px;
  padding: 16px;
  box-shadow: var(--shadow-card, 0 8px 28px rgba(2, 6, 16, 0.6));
}

.ddcb-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid rgba(56, 189, 248, 0.35);
  background: linear-gradient(180deg, #14223d 0%, #0b1528 100%);
  color: var(--text-primary, #f0f7ff);
  font-family: var(--font-display, 'Rajdhani', sans-serif);
  font-size: 0.88rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.ddcb-btn:hover:not(:disabled) {
  background: #192d50;
  border-color: var(--accent-cyan, #38bdf8);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.28);
}

.ddcb-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.ddcb-btn--primary {
  background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
  border-color: #38bdf8;
  color: #ffffff;
  box-shadow: 0 0 16px rgba(56, 189, 248, 0.3);
}

.ddcb-btn--primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  box-shadow: 0 0 22px rgba(56, 189, 248, 0.5);
}

.ddcb-btn--amber {
  background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
  border-color: #fbbf24;
  color: #ffffff;
}

.ddcb-btn--amber:hover:not(:disabled) {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  border-color: #fde047;
  box-shadow: 0 0 18px rgba(245, 158, 11, 0.4);
}

.ddcb-btn--danger {
  background: rgba(127, 29, 29, 0.5);
  border-color: rgba(239, 68, 68, 0.5);
  color: #fca5a5;
}

.ddcb-btn--danger:hover:not(:disabled) {
  background: rgba(185, 28, 28, 0.7);
  border-color: #ef4444;
}

.ddcb-btn--sm {
  padding: 5px 10px;
  font-size: 0.78rem;
  border-radius: 6px;
}

.ddcb-tab-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  padding: 6px;
  background: rgba(7, 11, 20, 0.8);
  border: 1px solid rgba(56, 189, 248, 0.24);
  border-radius: 10px;
}

.ddcb-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: 7px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-secondary, #94b3d4);
  font-family: var(--font-display, 'Rajdhani', sans-serif);
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.14s ease;
}

.ddcb-tab-btn:hover {
  color: var(--text-primary, #f0f7ff);
  background: rgba(25, 41, 71, 0.65);
}

.ddcb-tab-btn.is-active {
  color: var(--text-primary, #f0f7ff);
  background: linear-gradient(180deg, #162847 0%, #091326 100%);
  border-color: var(--accent-cyan, #38bdf8);
  box-shadow: 0 0 12px rgba(56, 189, 248, 0.24);
}

.ddcb-input,
.ddcb-select {
  background: rgba(7, 11, 20, 0.85);
  border: 1px solid rgba(56, 189, 248, 0.28);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--text-primary, #f0f7ff);
  font-size: 0.88rem;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.ddcb-input:focus,
.ddcb-select:focus {
  outline: none;
  border-color: var(--accent-cyan, #38bdf8);
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.22);
}

/* Modal Backdrop */
.ddcb-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(3, 7, 15, 0.82);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.ddcb-modal-dialog {
  width: 100%;
  max-width: 760px;
  max-height: 90vh;
  overflow-y: auto;
  background: linear-gradient(180deg, #101d35 0%, #070d19 100%);
  border: 1px solid rgba(56, 189, 248, 0.45);
  border-radius: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.85), 0 0 28px rgba(56, 189, 248, 0.22);
  padding: 20px;
  color: var(--text-primary, #f0f7ff);
}

/* Matrix Table (matching Game Guide Card Codex) */
.ddcb-table-wrap {
  background: rgba(14, 23, 41, 0.92);
  border: 1px solid rgba(56, 189, 248, 0.26);
  border-radius: 12px;
  overflow-x: auto;
  box-shadow: var(--shadow-card);
}

.ddcb-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
}

.ddcb-table th {
  background: #060b16;
  color: var(--text-secondary, #94b3d4);
  text-align: left;
  padding: 10px 12px;
  font-family: var(--font-display, 'Rajdhani', sans-serif);
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  font-size: 0.78rem;
  border-bottom: 2px solid rgba(56, 189, 248, 0.26);
  white-space: nowrap;
}

.ddcb-table td {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(56, 189, 248, 0.12);
  vertical-align: middle;
  font-variant-numeric: tabular-nums;
}

.ddcb-table tbody tr {
  cursor: pointer;
  transition: background-color 0.12s ease;
}

.ddcb-table tbody tr:hover {
  background: rgba(25, 41, 71, 0.75);
}

.ddcb-table tbody tr.is-selected {
  background: rgba(56, 189, 248, 0.16);
}
`;
