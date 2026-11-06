import React, { useState } from 'react';
import {
  Shield,
  Zap,
  Flame,
  Snowflake,
  Leaf,
  Moon,
  Sparkles,
  Layers,
  X,
  HelpCircle,
  Swords,
  FastForward,
  AlertTriangle,
} from 'lucide-react';
import type {
  ActiveDigimon,
  AttackSlot,
  CardData,
  CardId,
  DigivolveModifier,
  GameEvent,
  GrantedAbility,
  MatchPhase,
  PlayerSide,
  Specialty,
  SupportSlotCard,
  VisibleBattleContext,
  XEffect,
} from '../../types/game';
import { getCardById, getCardImageUrl } from '../../data/cards';

// ---------------------------------------------------------------------------
// Attack Symbol SVG Renderer (○ / △ / ✕)
// ---------------------------------------------------------------------------

export interface AttackSymbolSvgProps {
  slot: AttackSlot | 'hidden' | null;
  size?: number;
  className?: string;
}

export const AttackSymbolSvg: React.FC<AttackSymbolSvgProps> = ({
  slot,
  size = 18,
  className = '',
}) => {
  if (slot === 'circle') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className={`ddcb-inline-symbol ${className}`}
        aria-label="Circle Attack"
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="rgba(244, 63, 94, 0.2)"
          stroke="#fb7185"
          strokeWidth="2.6"
        />
      </svg>
    );
  }

  if (slot === 'triangle') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className={`ddcb-inline-symbol ${className}`}
        aria-label="Triangle Attack"
      >
        <polygon
          points="12,3.5 21,19.5 3,19.5"
          fill="rgba(16, 185, 129, 0.2)"
          stroke="#34d399"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (slot === 'x') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className={`ddcb-inline-symbol ${className}`}
        aria-label="Cross Attack"
      >
        <path
          d="M5 5L19 19M19 5L5 19"
          stroke="#38bdf8"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (slot === 'hidden') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'rgba(245, 158, 11, 0.22)',
          border: '1.5px solid #fbbf24',
          color: '#fde68a',
          fontSize: Math.max(10, size - 6),
          fontWeight: 900,
        }}
        title="Attack Locked (Hidden)"
      >
        ?
      </span>
    );
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        border: '1px dashed #475569',
        color: '#64748b',
        fontSize: Math.max(10, size - 7),
      }}
    >
      -
    </span>
  );
};

// ---------------------------------------------------------------------------
// Support / Option Effect Text Token Renderer ([[circle]], [[triangle]], [[x]])
// ---------------------------------------------------------------------------

export const SupportTextWithTokens: React.FC<{
  text: string;
  iconSize?: number;
}> = ({ text, iconSize = 15 }) => {
  if (!text || text.trim() === '' || text.trim().toLowerCase() === 'none') {
    return <span style={{ color: '#64748b', fontStyle: 'italic' }}>No Support Effect.</span>;
  }

  const parts = text.split(/(\[\[(?:circle|triangle|x)\]\])/gi);
  return (
    <span>
      {parts.map((part, idx) => {
        const lower = part.toLowerCase();
        if (lower === '[[circle]]') {
          return <AttackSymbolSvg key={idx} slot="circle" size={iconSize} />;
        }
        if (lower === '[[triangle]]') {
          return <AttackSymbolSvg key={idx} slot="triangle" size={iconSize} />;
        }
        if (lower === '[[x]]') {
          return <AttackSymbolSvg key={idx} slot="x" size={iconSize} />;
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      })}
    </span>
  );
};

// ---------------------------------------------------------------------------
// X-Effect Badge Formatter
// ---------------------------------------------------------------------------

export const XEffectBadge: React.FC<{
  effect?: XEffect;
  jammed?: boolean;
}> = ({ effect, jammed }) => {
  if (!effect) return null;

  let content: React.ReactNode = null;
  switch (effect.type) {
    case 'zero':
      content = (
        <>
          <AttackSymbolSvg slot={effect.target} size={13} /> to 0
        </>
      );
      break;
    case 'counter':
      content = (
        <>
          <AttackSymbolSvg slot={effect.target} size={13} /> Counter
        </>
      );
      break;
    case 'firstAttack':
      content = '1st Attack';
      break;
    case 'eatUpHp':
      content = 'Eat-Up HP';
      break;
    case 'crash':
      content = 'Crash';
      break;
    case 'jamming':
      content = 'Jamming';
      break;
    case 'foeX3':
      content = `${effect.specialty} Foe x3`;
      break;
  }

  return (
    <span
      className={`ddcb-attack-effect-tag ${jammed ? 'jammed' : ''}`}
      title={jammed ? 'Effect Jammed / Disabled this battle' : 'X-Attack Special Effect'}
    >
      {content}
    </span>
  );
};

export function formatGrantedAbility(ability: GrantedAbility): React.ReactNode {
  switch (ability.kind) {
    case 'eatUpHp':
      return 'Eat-Up HP';
    case 'firstAttack':
      return '1st Attack';
    case 'crash':
      return 'Crash';
    case 'jamming':
      return 'Jamming';
    case 'foeX3':
      return `${ability.specialty} Foe x3`;
    case 'toZero':
      return (
        <>
          <AttackSymbolSvg slot={ability.slot} size={12} /> to 0
        </>
      );
    case 'counter':
      return ability.slot === 'any' ? (
        'All Counter'
      ) : (
        <>
          <AttackSymbolSvg slot={ability.slot} size={12} /> Counter
        </>
      );
  }
}

// ---------------------------------------------------------------------------
// Specialty Badge
// ---------------------------------------------------------------------------

export const SpecialtyIcon: React.FC<{ specialty: Specialty; size?: number }> = ({
  specialty,
  size = 13,
}) => {
  switch (specialty) {
    case 'Fire':
      return <Flame size={size} />;
    case 'Ice':
      return <Snowflake size={size} />;
    case 'Nature':
      return <Leaf size={size} />;
    case 'Darkness':
      return <Moon size={size} />;
    case 'Rare':
      return <Sparkles size={size} />;
  }
};

export const SpecialtyBadge: React.FC<{
  specialty: Specialty | null;
  printedSpecialty?: Specialty | null;
}> = ({ specialty, printedSpecialty }) => {
  if (!specialty) {
    return (
      <span className="ddcb-mini-badge" style={{ color: '#93c5fd', borderColor: '#3b82f6' }}>
        OPTION
      </span>
    );
  }

  const changed = printedSpecialty && printedSpecialty !== specialty;

  return (
    <span
      className={`ddcb-specialty-badge ${specialty}`}
      title={
        changed
          ? `Effective Specialty: ${specialty} (Changed from ${printedSpecialty})`
          : `Specialty: ${specialty}`
      }
    >
      <SpecialtyIcon specialty={specialty} size={12} />
      <span>{specialty}</span>
      {changed && (
        <span style={{ fontSize: '0.62rem', opacity: 0.9 }}>
          (was {printedSpecialty})
        </span>
      )}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Safe Card Image Component
// ---------------------------------------------------------------------------

export const CardArtwork: React.FC<{
  card: CardData | undefined;
  alt?: string;
  className?: string;
}> = ({ card, alt, className }) => {
  const [imgError, setImgError] = useState(false);

  if (!card || imgError) {
    return (
      <div
        className={className}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
          color: '#94a3b8',
          padding: '0.35rem',
          textAlign: 'center',
          fontSize: '0.7rem',
          fontWeight: 700,
        }}
      >
        <span style={{ color: '#38bdf8', fontFamily: 'monospace' }}>
          #{card ? card.no : '???'}
        </span>
        <span style={{ marginTop: 2 }}>{card ? card.name : 'Unknown Card'}</span>
      </div>
    );
  }

  return (
    <img
      src={getCardImageUrl(card)}
      alt={alt ?? card.name}
      className={className}
      onError={() => setImgError(true)}
      loading="lazy"
    />
  );
};

// ---------------------------------------------------------------------------
// Active Digimon Battle Slot Component
// ---------------------------------------------------------------------------

export interface ActiveDigimonBattleSlotProps {
  side: PlayerSide;
  activeDigimon: ActiveDigimon | null;
  battle: VisibleBattleContext | null;
  phase: MatchPhase;
  canSelectAttack: boolean;
  activeDigivolveModifier?: DigivolveModifier | null;
  onSelectAttack?: (slot: AttackSlot) => void;
  onInspectCard: (cardId: CardId) => void;
  onInspectStack: (side: PlayerSide) => void;
}

export const ActiveDigimonBattleSlot: React.FC<ActiveDigimonBattleSlotProps> = ({
  side,
  activeDigimon,
  battle,
  phase,
  canSelectAttack,
  activeDigivolveModifier,
  onSelectAttack,
  onInspectCard,
  onInspectStack,
}) => {
  if (!activeDigimon) {
    return (
      <div className={`ddcb-battle-slot ${side}-slot empty-slot`}>
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <Shield size={32} style={{ opacity: 0.45, marginBottom: 6 }} />
          <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#cbd5e1' }}>
            {side === 'player' ? 'YOUR BATTLE ARENA SLOT EMPTY' : 'OPPONENT BATTLE SLOT EMPTY'}
          </div>
          <div style={{ fontSize: '0.75rem', marginTop: 3 }}>
            {phase === 'rookiePlacement'
              ? side === 'player'
                ? 'Select a Level R / R P Digimon from your Hand below to deploy!'
                : 'Opponent is deploying a Rookie Digimon...'
              : 'Awaiting Rookie deployment on next Entry step.'}
          </div>
        </div>
      </div>
    );
  }

  const card = getCardById(activeDigimon.cardId);
  const currentHp = activeDigimon.currentHp;
  const maxHp = activeDigimon.maxHp || (card?.hp ?? 500);
  const hpRatio = maxHp > 0 ? Math.max(0, Math.min(100, (currentHp / maxHp) * 100)) : 0;
  const hpColorClass = hpRatio > 55 ? 'high' : hpRatio > 25 ? 'mid' : 'low';

  const chosenOrEffectiveAttack =
    battle?.effectiveAttacks?.[side] ?? battle?.chosenAttacks?.[side] ?? null;

  const computeSlotDisplayPower = (slot: AttackSlot, basePower: number): number => {
    if (
      battle &&
      (chosenOrEffectiveAttack === slot) &&
      battle.computedPowers[side] > 0
    ) {
      return battle.computedPowers[side];
    }
    const addMod = activeDigimon.tempModifiers?.attackPowerAdd;
    if (!addMod) return basePower;
    let delta = (addMod.all ?? 0) + (addMod[slot] ?? 0);
    if (chosenOrEffectiveAttack === slot) {
      delta += addMod.chosen ?? 0;
    }
    return Math.max(0, basePower + delta);
  };

  const isJammed = Boolean(
    activeDigimon.tempModifiers?.jammed || activeDigimon.tempModifiers?.abilityRemoved
  );

  const slots: Array<{ slot: AttackSlot; label: string }> = [
    { slot: 'circle', label: 'Circle' },
    { slot: 'triangle', label: 'Triangle' },
    { slot: 'x', label: 'Cross' },
  ];

  return (
    <div className={`ddcb-battle-slot ${side}-slot`}>
      {/* Portrait & Stack Info */}
      <div className="ddcb-digimon-portrait-wrap">
        <div
          className="ddcb-digimon-card-frame"
          onClick={() => onInspectCard(activeDigimon.cardId)}
          title="Click to inspect Digimon card details"
        >
          <CardArtwork card={card} />
          {card?.level && <span className="ddcb-level-pill">Lv. {card.level}</span>}
          {activeDigimon.stack.length > 0 && (
            <button
              type="button"
              className="ddcb-stack-pill"
              onClick={(e) => {
                e.stopPropagation();
                onInspectStack(side);
              }}
              title="Click to inspect Digivolution Stack"
            >
              <Layers size={11} style={{ marginRight: 3, verticalAlign: 'middle' }} />
              Stack ({activeDigimon.stack.length})
            </button>
          )}
        </div>
        <SpecialtyBadge
          specialty={activeDigimon.effectiveSpecialty}
          printedSpecialty={card?.specialty}
        />
      </div>

      {/* Stats, HP Bar & 3 Attacks */}
      <div className="ddcb-digimon-details">
        <div className="ddcb-digimon-title-row">
          <div
            className="ddcb-digimon-name"
            style={{ cursor: 'pointer' }}
            onClick={() => onInspectCard(activeDigimon.cardId)}
          >
            <span className="ddcb-card-no">#{card?.no ?? '000'}</span>
            <span>{card?.name ?? `Digimon #${activeDigimon.cardId}`}</span>
            {card?.isPartner && (
              <span
                className="ddcb-mini-badge"
                style={{ borderColor: '#fbbf24', color: '#fde68a', fontSize: '0.64rem' }}
              >
                PARTNER
              </span>
            )}
          </div>
          {battle && battle.firstAttacker === side && (
            <span className="ddcb-first-atk-tag">1ST ATTACK</span>
          )}
        </div>

        {/* Animated HP Bar */}
        <div className="ddcb-hp-container">
          <div className="ddcb-hp-header">
            <span className="ddcb-hp-label">HP INTEGRITY</span>
            <span
              className={`ddcb-hp-numbers ${
                currentHp > maxHp ? 'overheal' : hpRatio <= 25 ? 'critical' : ''
              }`}
            >
              {currentHp} / {maxHp}
            </span>
          </div>
          <div className="ddcb-hp-track">
            <div
              className={`ddcb-hp-fill ${hpColorClass}`}
              style={{ width: `${hpRatio}%` }}
            />
          </div>
        </div>

        {/* Active Modifiers / Buffs */}
        {(activeDigivolveModifier ||
          (activeDigimon.tempModifiers?.grantedAbilities &&
            activeDigimon.tempModifiers.grantedAbilities.length > 0) ||
          activeDigimon.tempModifiers?.reviveOnKoHp) && (
          <div className="ddcb-modifiers-bar">
            {activeDigivolveModifier && (
              <span className="ddcb-mod-chip digivolve-mod">
                ⚡ Digivolve Mod Active
                {activeDigivolveModifier.ignoreDp ? ' (0 DP)' : ''}
                {activeDigivolveModifier.extraDp ? ` (+${activeDigivolveModifier.extraDp} DP)` : ''}
                {activeDigivolveModifier.ignoreSpecialty ? ' (Any Spec)' : ''}
                {activeDigivolveModifier.allowSkipLevel ? ' (Warp R→U)' : ''}
              </span>
            )}
            {activeDigimon.tempModifiers?.grantedAbilities?.map((g, i) => (
              <span key={i} className="ddcb-mod-chip">
                + {formatGrantedAbility(g)}
              </span>
            ))}
            {activeDigimon.tempModifiers?.reviveOnKoHp && (
              <span className="ddcb-mod-chip">
                Revive on KO ({activeDigimon.tempModifiers.reviveOnKoHp} HP)
              </span>
            )}
          </div>
        )}

        {/* Circle / Triangle / Cross Attack List */}
        {card?.attacks && (
          <div className="ddcb-attacks-list">
            {slots.map(({ slot, label }) => {
              const atk = card.attacks![slot];
              const dispPower = computeSlotDisplayPower(slot, atk.power);
              const isSelected = chosenOrEffectiveAttack === slot;
              const powerClass =
                dispPower > atk.power
                  ? 'boosted'
                  : dispPower < atk.power
                  ? 'reduced'
                  : '';

              return (
                <div
                  key={slot}
                  role={canSelectAttack ? 'button' : undefined}
                  tabIndex={canSelectAttack ? 0 : undefined}
                  className={`ddcb-attack-row ${
                    canSelectAttack ? 'selectable' : ''
                  } ${isSelected ? 'selected-attack' : ''}`}
                  onClick={() => {
                    if (canSelectAttack && onSelectAttack) {
                      onSelectAttack(slot);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (
                      canSelectAttack &&
                      onSelectAttack &&
                      (e.key === 'Enter' || e.key === ' ')
                    ) {
                      e.preventDefault();
                      onSelectAttack(slot);
                    }
                  }}
                  title={
                    canSelectAttack
                      ? `Click to select ${label} attack: ${atk.name} (${dispPower})`
                      : `${label}: ${atk.name} (${dispPower})`
                  }
                >
                  <AttackSymbolSvg slot={slot} size={20} />
                  <span className="ddcb-attack-name">
                    {atk.name}
                    {canSelectAttack && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: '0.68rem',
                          color: '#38bdf8',
                          fontWeight: 800,
                        }}
                      >
                        [SELECT]
                      </span>
                    )}
                  </span>
                  <span>
                    {slot === 'x' && atk.effect ? (
                      <XEffectBadge effect={atk.effect} jammed={isJammed} />
                    ) : null}
                  </span>
                  <span className={`ddcb-attack-power ${powerClass}`}>{dispPower}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Center Clash & Support Zone Component
// ---------------------------------------------------------------------------

export interface ClashStepBanner {
  title: string;
  detail: string;
  tone: 'info' | 'strike' | 'ko';
  slot?: AttackSlot;
}

export interface CenterClashZoneProps {
  battle: VisibleBattleContext | null;
  phase: MatchPhase;
  activePlayer: PlayerSide;
  activeClashBanner: ClashStepBanner | null;
  clashQueueCount: number;
  onAdvanceClashBanner: () => void;
  onInspectCard: (cardId: CardId) => void;
}

const SupportSlotBox: React.FC<{
  side: PlayerSide;
  supportCard: SupportSlotCard | null;
  decided?: boolean;
  onInspectCard: (cardId: CardId) => void;
}> = ({ side, supportCard, decided, onInspectCard }) => {
  const label = side === 'player' ? 'YOUR SUPPORT SLOT' : 'OPPONENT SUPPORT SLOT';

  if (!supportCard) {
    return (
      <div className="ddcb-support-slot-card">
        <div
          className="ddcb-support-thumb"
          style={{ borderStyle: 'dashed', borderColor: '#334155', color: '#475569' }}
        >
          <Zap size={18} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="ddcb-zone-label">{label}</div>
          <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#94a3b8', marginTop: 2 }}>
            {decided ? 'Passed Support' : 'No Support Card Set'}
          </div>
        </div>
      </div>
    );
  }

  const card = getCardById(supportCard.cardId);

  return (
    <div
      className="ddcb-support-slot-card clickable"
      onClick={() => onInspectCard(supportCard.cardId)}
      title="Click to inspect Support card"
    >
      <div className="ddcb-support-thumb">
        <CardArtwork card={card} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="ddcb-zone-label">{label}</span>
          <span
            className="ddcb-mini-badge"
            style={{
              fontSize: '0.6rem',
              borderColor: supportCard.source === 'deckTop' ? '#f59e0b' : '#38bdf8',
              color: supportCard.source === 'deckTop' ? '#fde68a' : '#bae6fd',
            }}
          >
            {supportCard.source === 'deckTop' ? 'DECK TOP' : 'FROM HAND'}
          </span>
        </div>
        <div
          style={{
            fontSize: '0.84rem',
            fontWeight: 800,
            color: '#f8fafc',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          #{card?.no} {card?.name ?? `Card #${supportCard.cardId}`}
        </div>
        <div
          style={{
            fontSize: '0.7rem',
            color: '#cbd5e1',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {card ? <SupportTextWithTokens text={card.supportText} iconSize={12} /> : null}
        </div>
      </div>

      {supportCard.voided && (
        <div className="ddcb-voided-stamp">
          <span>VOIDED!</span>
        </div>
      )}
    </div>
  );
};

export const CenterClashZone: React.FC<CenterClashZoneProps> = ({
  battle,
  phase,
  activePlayer,
  activeClashBanner,
  clashQueueCount,
  onAdvanceClashBanner,
  onInspectCard,
}) => {
  const playerAttack =
    battle?.effectiveAttacks?.player ?? battle?.chosenAttacks?.player ?? null;
  const opponentAttack =
    battle?.effectiveAttacks?.opponent ?? battle?.chosenAttacks?.opponent ?? null;

  return (
    <div className="ddcb-center-clash">
      {/* Opponent Support Slot */}
      <SupportSlotBox
        side="opponent"
        supportCard={battle?.supportCards.opponent ?? null}
        decided={battle?.supportDecided?.opponent}
        onInspectCard={onInspectCard}
      />

      {/* Center Battle Status / Clash Resolution Banner */}
      <div className="ddcb-clash-hud">
        <div className="ddcb-clash-vs-row">
          {/* Player Readout */}
          <div className="ddcb-clash-side-Readout">
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#38bdf8' }}>YOU</span>
            <AttackSymbolSvg slot={playerAttack} size={22} />
            {battle && battle.computedPowers.player > 0 && (
              <span
                style={{
                  fontFamily: 'monospace',
                  fontWeight: 900,
                  fontSize: '0.92rem',
                  color: '#fbbf24',
                }}
              >
                {battle.computedPowers.player}
              </span>
            )}
            {(battle ? battle.firstAttacker === 'player' : activePlayer === 'player') && (
              <span className="ddcb-first-atk-tag">1ST</span>
            )}
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              color: '#fbbf24',
              fontWeight: 900,
              fontSize: '0.8rem',
            }}
          >
            <Swords size={16} />
            <span>CLASH</span>
          </div>

          {/* Opponent Readout */}
          <div className="ddcb-clash-side-Readout">
            {(battle ? battle.firstAttacker === 'opponent' : activePlayer === 'opponent') && (
              <span className="ddcb-first-atk-tag">1ST</span>
            )}
            {battle && battle.computedPowers.opponent > 0 && (
              <span
                style={{
                  fontFamily: 'monospace',
                  fontWeight: 900,
                  fontSize: '0.92rem',
                  color: '#fb7185',
                }}
              >
                {battle.computedPowers.opponent}
              </span>
            )}
            <AttackSymbolSvg slot={opponentAttack} size={22} />
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#fb7185' }}>FOE</span>
          </div>
        </div>

        {/* Step-by-step Battle Clash Animation / Resolution Ticker */}
        {activeClashBanner ? (
          <div className={`ddcb-resolution-ticker ${activeClashBanner.tone}`}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, textAlign: 'left' }}>
              {activeClashBanner.slot && (
                <AttackSymbolSvg slot={activeClashBanner.slot} size={18} />
              )}
              <div>
                <div style={{ fontWeight: 900, fontSize: '0.78rem', color: '#fde68a' }}>
                  {activeClashBanner.title}
                </div>
                <div style={{ fontSize: '0.74rem', color: '#f8fafc' }}>
                  {activeClashBanner.detail}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="ddcb-hud-btn"
              onClick={onAdvanceClashBanner}
              style={{ flexShrink: 0, padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
            >
              <FastForward size={12} />
              <span>{clashQueueCount > 0 ? `Next (${clashQueueCount})` : 'Dismiss'}</span>
            </button>
          </div>
        ) : (
          <div style={{ fontSize: '0.74rem', color: '#93c5fd', fontWeight: 600 }}>
            {phase === 'attackSelect' &&
              'Both players select Circle (○), Triangle (△), or Cross (✕) attack.'}
            {phase === 'supportSelect' &&
              'Play a Support Card from Hand, Blind Support from Top of Online Deck, or Pass.'}
            {phase === 'digivolve' &&
              (activePlayer === 'player'
                ? 'Preparation Phase: Add 1 Digimon to DP Slot (+P), use Digivolve Options, or Digivolve.'
                : 'Opponent is executing their Preparation / Digivolve Phase...')}
            {phase === 'rookiePlacement' &&
              'Deploy a Level R or R P Rookie Digimon into the Battle Arena.'}
            {phase === 'mulligan' &&
              'Review your initial 4-card hand and choose to Keep Hand or Mulligan.'}
            {phase === 'gameOver' && 'Match Complete!'}
          </div>
        )}
      </div>

      {/* Player Support Slot */}
      <SupportSlotBox
        side="player"
        supportCard={battle?.supportCards.player ?? null}
        decided={battle?.supportDecided?.player}
        onInspectCard={onInspectCard}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Card Inspection Detail Modal
// ---------------------------------------------------------------------------

export const CardDetailModal: React.FC<{
  cardId: CardId | null;
  onClose: () => void;
}> = ({ cardId, onClose }) => {
  if (cardId === null) return null;
  const card = getCardById(cardId);
  if (!card) return null;

  return (
    <div className="ddcb-modal-backdrop" onClick={onClose}>
      <div className="ddcb-modal-card" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '1rem',
            paddingBottom: '0.6rem',
            borderBottom: '1px solid #2b4c85',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '0.95rem',
                fontWeight: 900,
                color: '#38bdf8',
              }}
            >
              No. {card.no}
            </span>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900 }}>{card.name}</h3>
            <SpecialtyBadge specialty={card.specialty} />
          </div>
          <button type="button" className="ddcb-hud-btn" onClick={onClose}>
            <X size={16} />
            <span>Close</span>
          </button>
        </div>

        <div className="ddcb-inspector-layout">
          <div className="ddcb-inspector-art">
            <CardArtwork card={card} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
            {/* Card Core Stats */}
            {card.kind === 'Digimon' ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                <span className="ddcb-mini-badge" style={{ fontSize: '0.78rem' }}>
                  Level: <strong>{card.level}</strong>
                </span>
                <span className="ddcb-mini-badge hp" style={{ fontSize: '0.78rem' }}>
                  HP: <strong>{card.hp}</strong>
                </span>
                <span className="ddcb-mini-badge dp" style={{ fontSize: '0.78rem' }}>
                  DP Cost: <strong>{card.dp}</strong>
                </span>
                <span className="ddcb-mini-badge plusp" style={{ fontSize: '0.78rem' }}>
                  DP Slot (+P): <strong>+{card.plusP}</strong>
                </span>
                {card.isPartner && (
                  <span
                    className="ddcb-mini-badge"
                    style={{
                      fontSize: '0.78rem',
                      borderColor: '#fbbf24',
                      color: '#fde68a',
                    }}
                  >
                    Partner / Armor Card
                  </span>
                )}
              </div>
            ) : (
              <div>
                <span className="ddcb-mini-badge" style={{ fontSize: '0.78rem' }}>
                  Card Kind: <strong>Option Card</strong>
                </span>
              </div>
            )}

            {/* Attacks Table for Digimon */}
            {card.attacks && (
              <div className="ddcb-attacks-list">
                <div
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    color: '#93c5fd',
                    textTransform: 'uppercase',
                  }}
                >
                  Battle Attacks
                </div>
                {(['circle', 'triangle', 'x'] as AttackSlot[]).map((slot) => {
                  const atk = card.attacks![slot];
                  return (
                    <div key={slot} className="ddcb-attack-row">
                      <AttackSymbolSvg slot={slot} size={20} />
                      <span className="ddcb-attack-name">{atk.name}</span>
                      <span>
                        {slot === 'x' && atk.effect ? (
                          <XEffectBadge effect={atk.effect} />
                        ) : null}
                      </span>
                      <span className="ddcb-attack-power">{atk.power}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Support / Option Effect */}
            <div
              style={{
                padding: '0.65rem 0.8rem',
                background: 'rgba(6, 12, 28, 0.9)',
                border: '1px solid #2b4c85',
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  color: '#fbbf24',
                  textTransform: 'uppercase',
                  marginBottom: 4,
                }}
              >
                {card.kind === 'Option' ? 'Option Effect' : 'Support Effect'}
              </div>
              <div style={{ fontSize: '0.86rem', lineHeight: 1.45, color: '#f1f5f9' }}>
                <SupportTextWithTokens text={card.supportText} iconSize={16} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Zone Pile Inspection Modal (Offline Pile, DP Slot, Digivolution Stack)
// ---------------------------------------------------------------------------

export interface ZoneInspectModalProps {
  title: string;
  subtitle?: string;
  cardIds: CardId[];
  onSelectCard: (cardId: CardId) => void;
  onClose: () => void;
}

export const ZoneInspectModal: React.FC<ZoneInspectModalProps> = ({
  title,
  subtitle,
  cardIds,
  onSelectCard,
  onClose,
}) => {
  return (
    <div className="ddcb-modal-backdrop" onClick={onClose}>
      <div className="ddcb-modal-card" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '0.6rem',
            borderBottom: '1px solid #2b4c85',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900, color: '#38bdf8' }}>
              {title} ({cardIds.length})
            </h3>
            {subtitle && (
              <div style={{ fontSize: '0.76rem', color: '#94a3b8', marginTop: 2 }}>{subtitle}</div>
            )}
          </div>
          <button type="button" className="ddcb-hud-btn" onClick={onClose}>
            <X size={16} />
            <span>Close</span>
          </button>
        </div>

        {cardIds.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
            No cards currently in this zone.
          </div>
        ) : (
          <div className="ddcb-pile-grid">
            {cardIds.map((id, idx) => {
              const c = getCardById(id);
              return (
                <div
                  key={`${id}-${idx}`}
                  className="ddcb-pile-card-item"
                  onClick={() => onSelectCard(id)}
                  title="Click to inspect card details"
                >
                  <CardArtwork card={c} />
                  <div
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: 800,
                      color: '#f8fafc',
                      width: '100%',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    #{c?.no} {c?.name}
                  </div>
                  <div style={{ display: 'flex', gap: 4, fontSize: '0.65rem' }}>
                    {c?.level && <span className="ddcb-mini-badge">Lv.{c.level}</span>}
                    {c?.plusP !== undefined && c.kind === 'Digimon' && (
                      <span className="ddcb-mini-badge plusp">+{c.plusP}P</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Battle Log Drawer Component
// ---------------------------------------------------------------------------

export interface LoggedGameEvent {
  id: number;
  turn: number;
  event: GameEvent;
}

function formatActor(side: PlayerSide, opponentName: string): string {
  return side === 'player' ? 'You' : opponentName;
}

function cardLabel(cardId: CardId): string {
  const c = getCardById(cardId);
  return c ? `${c.name} (#${c.no})` : `Card #${cardId}`;
}

export function describeGameEvent(
  event: GameEvent,
  opponentName: string
): { text: string; tone: 'player' | 'opponent' | 'combat' | 'ko' } {
  switch (event.type) {
    case 'matchStarted':
      return {
        text: `Match started! ${formatActor(event.firstPlayer, opponentName)} won the initiative for Turn 1.`,
        tone: event.firstPlayer,
      };
    case 'mulligan':
      return {
        text: `${formatActor(event.side, opponentName)} ${
          event.kept ? 'kept their opening hand.' : 'took a Mulligan and redrew 4 cards.'
        }`,
        tone: event.side,
      };
    case 'phaseChanged':
      return {
        text: `Turn ${event.turnNumber} — Phase: ${event.phase.toUpperCase()} (${formatActor(
          event.activePlayer,
          opponentName
        )})`,
        tone: event.activePlayer,
      };
    case 'cardsDrawn':
      return {
        text: `${formatActor(event.side, opponentName)} drew ${event.count} card(s).`,
        tone: event.side,
      };
    case 'rookiePlaced':
      return {
        text: `${formatActor(event.side, opponentName)} deployed ${cardLabel(
          event.cardId
        )} (${event.hp} HP) to the Battle Arena!`,
        tone: event.side,
      };
    case 'dpCardAdded':
      return {
        text: `${formatActor(event.side, opponentName)} placed ${cardLabel(
          event.cardId
        )} into DP Slot (+${event.plusP}P → Total ${event.newDpTotal} DP).`,
        tone: event.side,
      };
    case 'digivolved':
      return {
        text: `${formatActor(event.side, opponentName)} Digivolved ${cardLabel(
          event.fromCardId
        )} → ${cardLabel(event.toCardId)} (${event.hp} HP, ${event.method.toUpperCase()})!`,
        tone: event.side,
      };
    case 'digivolveOptionUsed':
      return {
        text: `${formatActor(event.side, opponentName)} activated ${cardLabel(
          event.cardId
        )}: ${event.description}`,
        tone: event.side,
      };
    case 'devolved':
      return {
        text: `${formatActor(event.side, opponentName)}'s ${cardLabel(
          event.fromCardId
        )} devolved to ${cardLabel(event.toCardId)} (${event.hp} HP).`,
        tone: event.side,
      };
    case 'attackChosen':
      return {
        text: `${formatActor(event.side, opponentName)} locked in their attack.`,
        tone: event.side,
      };
    case 'supportPlayed':
      return {
        text: `${formatActor(event.side, opponentName)} played Support ${cardLabel(
          event.cardId
        )} from ${event.source === 'deckTop' ? 'Top of Online Deck' : 'Hand'}.`,
        tone: event.side,
      };
    case 'supportPassed':
      return {
        text: `${formatActor(event.side, opponentName)} passed on Support.`,
        tone: event.side,
      };
    case 'supportTriggered':
      return {
        text: `${formatActor(event.side, opponentName)}'s ${cardLabel(
          event.cardId
        )} effect triggered: ${event.text}`,
        tone: 'combat',
      };
    case 'supportVoided':
      return {
        text: `${formatActor(event.bySide, opponentName)} VOIDED ${formatActor(
          event.side,
          opponentName
        )}'s Support card ${cardLabel(event.cardId)}!`,
        tone: 'combat',
      };
    case 'statModified':
      return {
        text: `${formatActor(event.side, opponentName)}'s ${event.stat.toUpperCase()} → ${
          event.newValue
        }${event.reason ? ` (${event.reason})` : ''}.`,
        tone: 'combat',
      };
    case 'attackChanged':
      return {
        text: `${formatActor(event.side, opponentName)}'s attack changed from ${event.from.toUpperCase()} to ${event.to.toUpperCase()}${
          event.reason ? ` (${event.reason})` : ''
        }!`,
        tone: 'combat',
      };
    case 'cardsMoved':
      return {
        text: `${formatActor(event.side, opponentName)}: moved ${event.count} card(s) from ${
          event.from
        } to ${event.to}.`,
        tone: event.side,
      };
    case 'attackStrike': {
      const extras: string[] = [];
      if (event.countered) extras.push('COUNTERATTACK!');
      if (event.eatUpHpHealed) extras.push(`Eat-Up HP +${event.eatUpHpHealed}`);
      if (event.crashSelfDamage) extras.push(`Crash self HP → 10`);
      return {
        text: `${formatActor(event.attacker, opponentName)} struck with [${event.slot.toUpperCase()}] ${
          event.attackName
        } for ${event.damage} dmg! (${formatActor(event.defender, opponentName)} HP: ${
          event.defenderHpBefore
        } → ${event.defenderHpAfter})${extras.length ? ` • ${extras.join(' • ')}` : ''}`,
        tone: 'combat',
      };
    }
    case 'digimonKo':
      return {
        text: `KO! ${formatActor(event.side, opponentName)}'s ${cardLabel(
          event.cardId
        )} was knocked out! (${formatActor(event.bySide, opponentName)} KOs: ${
          event.newKoCount
        }/3)${event.revivedHp ? ` — Revived with ${event.revivedHp} HP!` : ''}`,
        tone: 'ko',
      };
    case 'gameOver':
      return {
        text: `GAME OVER! Winner: ${
          event.winner === 'draw'
            ? 'Draw'
            : formatActor(event.winner, opponentName)
        } (${event.reason}).`,
        tone: 'ko',
      };
    case 'log':
      return {
        text: event.message,
        tone: event.side ?? 'combat',
      };
  }
}

export const BattleLogDrawer: React.FC<{
  logs: LoggedGameEvent[];
  opponentName: string;
  onClose: () => void;
}> = ({ logs, opponentName, onClose }) => {
  return (
    <div className="ddcb-log-drawer">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.65rem 0.85rem',
          borderBottom: '1px solid #2b4c85',
          background: '#09142a',
        }}
      >
        <span style={{ fontWeight: 900, fontSize: '0.88rem', color: '#38bdf8' }}>
          DIGIVICE BATTLE LOG ({logs.length})
        </span>
        <button type="button" className="ddcb-hud-btn" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className="ddcb-log-list">
        {logs.length === 0 ? (
          <div style={{ color: '#64748b', textAlign: 'center', padding: '1.5rem' }}>
            No battle events recorded yet.
          </div>
        ) : (
          logs
            .slice()
            .reverse()
            .map((entry) => {
              const { text, tone } = describeGameEvent(entry.event, opponentName);
              return (
                <div key={entry.id} className={`ddcb-log-item ${tone}`}>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      color: '#93c5fd',
                      marginRight: 6,
                    }}
                  >
                    [T{entry.turn}]
                  </span>
                  <span>{text}</span>
                </div>
              );
            })
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Rules / Help Modal
// ---------------------------------------------------------------------------

export const RulesHelpModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  return (
    <div className="ddcb-modal-backdrop" onClick={onClose}>
      <div className="ddcb-modal-card" onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '0.6rem',
            marginBottom: '0.85rem',
            borderBottom: '1px solid #2b4c85',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <HelpCircle size={20} color="#38bdf8" />
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900 }}>
              Digimon Digital Card Battle (PS1) — Arena Rules Guide
            </h3>
          </div>
          <button type="button" className="ddcb-hud-btn" onClick={onClose}>
            <X size={16} />
            <span>Close</span>
          </button>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            fontSize: '0.83rem',
            lineHeight: 1.5,
            color: '#e2e8f0',
          }}
        >
          <div>
            <strong style={{ color: '#fbbf24' }}>1. Objective (3 KOs or Deck-Out):</strong>
            <div>
              Knock out <strong>3</strong> of your opponent&apos;s Digimon to win! You also win if your
              opponent&apos;s Online Deck runs out of cards during a required draw, or if they have no
              playable Rookie.
            </div>
          </div>

          <div>
            <strong style={{ color: '#38bdf8' }}>2. Preparation / Digivolve Phase:</strong>
            <div>
              • Draw from your Online Deck until you have <strong>4 cards</strong> in Hand.
              <br />• Sacrifice up to <strong>1 Digimon card per turn</strong> from Hand to your{' '}
              <strong>DP Slot (+P)</strong>. Your DP Slot persists across KOs!
              <br />• <strong>Normal Digivolve (R → C → U):</strong> Matches Specialty and requires
              accumulated DP ≥ target&apos;s DP cost. Consumes all cards in your DP Slot and resets HP to
              the new form&apos;s max HP.
              <br />• <strong>Armor Digivolve (R P → A):</strong> Costs <strong>0 DP</strong> and does{' '}
              <strong>NOT</strong> consume your DP Slot!
            </div>
          </div>

          <div>
            <strong style={{ color: '#34d399' }}>3. Battle Phase (Attacks & Support):</strong>
            <div>
              • Both players secretly choose <AttackSymbolSvg slot="circle" size={14} /> Circle,{' '}
              <AttackSymbolSvg slot="triangle" size={14} /> Triangle, or{' '}
              <AttackSymbolSvg slot="x" size={14} /> Cross.
              <br />• Both players may play <strong>1 Support Card</strong> from Hand, blind-play the{' '}
              <strong>Top Card of their Online Deck</strong>, or Pass.
              <br />• The Turn Player attacks first by default unless overridden by{' '}
              <strong>1st Attack</strong> or Support effects. Surviving Digimon keep their remaining HP
              into the next turn!
            </div>
          </div>

          <div>
            <strong style={{ color: '#c084fc' }}>4. X-Attack Special Abilities:</strong>
            <div>
              • <strong>[Symbol] Counter:</strong> When attacking second, if you survive the opponent&apos;s
              matching attack symbol, you reflect <strong>2× their Attack Power + your own</strong>!
              <br />• <strong>[Symbol] to 0:</strong> Reduces opponent&apos;s Attack Power to 0 if they chose
              that symbol.
              <br />• <strong>[Specialty] Foe ×3:</strong> Triples your Cross Attack Power against a
              Digimon of that Specialty.
              <br />• <strong>Eat-Up HP:</strong> Heals your HP equal to the damage dealt (can exceed Max
              HP!).
              <br />• <strong>Crash:</strong> Converts your current HP into Attack Power and leaves you at
              10 HP.
              <br />• <strong>Jamming:</strong> Disables the opponent&apos;s X-Attack special ability.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Post-Match Victory / Defeat Overlay
// ---------------------------------------------------------------------------

export const GameOverModal: React.FC<{
  winner: PlayerSide | 'draw' | null;
  winReason?: 'three_ko' | 'opponent_deck_out' | 'opponent_no_rookie';
  turnNumber: number;
  playerKos: number;
  opponentKos: number;
  opponentName: string;
  onRematch: () => void;
  onExit: (winner: PlayerSide | 'draw' | null) => void;
}> = ({
  winner,
  winReason,
  turnNumber,
  playerKos,
  opponentKos,
  opponentName,
  onRematch,
  onExit,
}) => {
  if (!winner) return null;

  const isVictory = winner === 'player';
  const isDraw = winner === 'draw';

  let reasonLabel = '3 Knockouts Achieved!';
  if (winReason === 'opponent_deck_out') {
    reasonLabel =
      winner === 'player'
        ? `${opponentName}'s Online Deck ran out of cards (Deck-Out)!`
        : 'Your Online Deck ran out of cards (Deck-Out)!';
  } else if (winReason === 'opponent_no_rookie') {
    reasonLabel =
      winner === 'player'
        ? `${opponentName} had no playable Level R / R P Rookie!`
        : 'No playable Level R / R P Rookie available!';
  }

  return (
    <div className="ddcb-modal-backdrop">
      <div
        className="ddcb-modal-card"
        style={{
          maxWidth: 500,
          textAlign: 'center',
          borderColor: isVictory ? '#fbbf24' : isDraw ? '#38bdf8' : '#f43f5e',
        }}
      >
        <div
          style={{
            fontSize: '0.8rem',
            fontWeight: 900,
            letterSpacing: '0.14em',
            color: isVictory ? '#fde68a' : isDraw ? '#bae6fd' : '#fda4af',
            textTransform: 'uppercase',
          }}
        >
          DIGIMON BATTLE ARENA RESULT
        </div>

        <h2
          style={{
            margin: '0.4rem 0',
            fontSize: '2rem',
            fontWeight: 900,
            color: isVictory ? '#fbbf24' : isDraw ? '#38bdf8' : '#fb7185',
            textShadow: isVictory
              ? '0 0 18px rgba(251, 191, 36, 0.5)'
              : '0 0 18px rgba(244, 63, 94, 0.45)',
          }}
        >
          {isVictory ? 'YOU WIN!' : isDraw ? 'DRAW MATCH' : 'YOU LOSE'}
        </h2>

        <div style={{ fontSize: '0.9rem', color: '#e2e8f0', fontWeight: 700, marginBottom: '1rem' }}>
          {reasonLabel}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '0.6rem',
            padding: '0.85rem',
            background: 'rgba(5, 10, 24, 0.85)',
            border: '1px solid #2b4c85',
            borderRadius: 10,
            marginBottom: '1.25rem',
          }}
        >
          <div>
            <div className="ddcb-zone-label">YOUR KOs</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#38bdf8' }}>
              {playerKos} / 3
            </div>
          </div>
          <div>
            <div className="ddcb-zone-label">TURNS</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fbbf24' }}>
              {turnNumber}
            </div>
          </div>
          <div>
            <div className="ddcb-zone-label">{opponentName.toUpperCase()} KOs</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fb7185' }}>
              {opponentKos} / 3
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button type="button" className="ddcb-phase-cta-btn" onClick={onRematch}>
            Rematch {opponentName}
          </button>
          <button
            type="button"
            className="ddcb-hud-btn"
            style={{ padding: '0.5rem 1rem', fontSize: '0.84rem' }}
            onClick={() => onExit(winner)}
          >
            Return to Arena Lobby
          </button>
        </div>
      </div>
    </div>
  );
};

export const ForfeitConfirmModal: React.FC<{
  opponentName: string;
  onConfirmForfeit: () => void;
  onCancel: () => void;
}> = ({ opponentName, onConfirmForfeit, onCancel }) => {
  return (
    <div className="ddcb-modal-backdrop" onClick={onCancel}>
      <div
        className="ddcb-modal-card"
        style={{ maxWidth: 420, textAlign: 'center', borderColor: '#ef4444' }}
        onClick={(e) => e.stopPropagation()}
      >
        <AlertTriangle size={36} color="#f87171" style={{ marginBottom: 8 }} />
        <h3 style={{ margin: '0 0 0.4rem', fontSize: '1.15rem', fontWeight: 900 }}>
          Forfeit Match & Exit Arena?
        </h3>
        <p style={{ fontSize: '0.84rem', color: '#cbd5e1', margin: '0 0 1.1rem' }}>
          Leaving the Battle Arena now will forfeit the current match against{' '}
          <strong>{opponentName}</strong>.
        </p>
        <div style={{ display: 'flex', gap: '0.65rem', justifyContent: 'center' }}>
          <button type="button" className="ddcb-hud-btn" onClick={onCancel}>
            Continue Battle
          </button>
          <button type="button" className="ddcb-hud-btn danger" onClick={onConfirmForfeit}>
            Forfeit & Exit
          </button>
        </div>
      </div>
    </div>
  );
};
