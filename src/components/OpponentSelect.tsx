import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Cpu,
  Eye,
  EyeOff,
  MapPin,
  Search,
  Shield,
  Swords,
  Trophy,
  Wrench,
} from 'lucide-react';
import { getCardById, getCardImageUrl } from '../data/cards';
import {
  OPPONENTS,
  type AiDifficultyLevel,
  type DifficultyTier,
  type OpponentDef,
} from '../data/opponents';
import {
  analyzeDeck,
  getActiveDeck,
  loadDeckStore,
  selectActiveDeck,
  validateDeck,
  type DeckStoreState,
  type SavedDeck,
} from '../state/deckStore';
import type { CardData } from '../types/game';
import { CardDetailModal } from './CardDetailModal';
import {
  ensureDigiviceUiStyles,
  getLevelDisplayLabel,
  getSpecialtyMeta,
} from './CardView';

export type AiOverrideOption = 'default' | AiDifficultyLevel;

export interface OpponentSelectProps {
  /** Optional controlled DeckStoreState from parent App. */
  storeState?: DeckStoreState;
  /** Callback when DeckStoreState changes (e.g. switching active deck). */
  onStoreChange?: (next: DeckStoreState) => void;
  /** Optional callback when active deck ID changes. */
  onSelectActiveDeck?: (deckId: string) => void;
  /** Callback invoked when the player clicks "Enter Battle Arena". */
  onStartMatch?: (
    opponent: OpponentDef,
    aiDifficulty: AiDifficultyLevel,
    playerDeck: SavedDeck
  ) => void;
  /** Optional callback to jump to the Deck Builder screen. */
  onOpenDeckBuilder?: () => void;
}

const TIER_TABS: Array<{ id: 'All' | DifficultyTier; label: string; color: string }> = [
  { id: 'All', label: 'All Duelists', color: '#38bdf8' },
  { id: 'Easy', label: 'Easy Tier', color: '#10b981' },
  { id: 'Normal', label: 'Normal Tier', color: '#3b82f6' },
  { id: 'Hard', label: 'Hard Tier', color: '#f59e0b' },
  { id: 'Expert', label: 'Expert Bosses', color: '#ef4444' },
];

function getTierBadgeStyle(tier: DifficultyTier): React.CSSProperties {
  switch (tier) {
    case 'Easy':
      return {
        background: 'rgba(16, 185, 129, 0.16)',
        borderColor: 'rgba(16, 185, 129, 0.45)',
        color: '#34d399',
      };
    case 'Normal':
      return {
        background: 'rgba(59, 130, 246, 0.16)',
        borderColor: 'rgba(59, 130, 246, 0.45)',
        color: '#60a5fa',
      };
    case 'Hard':
      return {
        background: 'rgba(245, 158, 11, 0.16)',
        borderColor: 'rgba(245, 158, 11, 0.45)',
        color: '#fbbf24',
      };
    case 'Expert':
      return {
        background: 'rgba(239, 68, 68, 0.18)',
        borderColor: 'rgba(239, 68, 68, 0.5)',
        color: '#f87171',
      };
  }
}

export const OpponentSelect: React.FC<OpponentSelectProps> = ({
  storeState: controlledState,
  onStoreChange,
  onSelectActiveDeck,
  onStartMatch,
  onOpenDeckBuilder,
}) => {
  useEffect(() => {
    ensureDigiviceUiStyles();
  }, []);

  const [internalState, setInternalState] = useState<DeckStoreState>(() =>
    loadDeckStore()
  );
  const state = controlledState ?? internalState;

  const [tierFilter, setTierFilter] = useState<'All' | DifficultyTier>('All');
  const [search, setSearch] = useState('');
  const [selectedOpponentId, setSelectedOpponentId] = useState<string>(
    OPPONENTS[0]?.id ?? ''
  );
  const [aiOverride, setAiOverride] = useState<AiOverrideOption>('default');
  const [showOpponentDeck, setShowOpponentDeck] = useState(false);
  const [inspectedCard, setInspectedCard] = useState<CardData | null>(null);

  const filteredOpponents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return OPPONENTS.filter((opp) => {
      if (tierFilter !== 'All' && opp.tier !== tierFilter) return false;
      if (q) {
        const hay = `${opp.name} ${opp.deckName} ${opp.colors} ${opp.location ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tierFilter, search]);

  const selectedOpponent: OpponentDef = useMemo(
    () =>
      OPPONENTS.find((o) => o.id === selectedOpponentId) ??
      filteredOpponents[0] ??
      OPPONENTS[0],
    [selectedOpponentId, filteredOpponents]
  );

  const activeDeck = useMemo(() => getActiveDeck(state), [state]);
  const activeDeckValidation = useMemo(
    () => validateDeck(activeDeck.cards),
    [activeDeck.cards]
  );
  const activeDeckAnalysis = useMemo(
    () => analyzeDeck(activeDeck.cards),
    [activeDeck.cards]
  );

  const opponentAnalysis = useMemo(
    () => analyzeDeck(selectedOpponent?.cards ?? []),
    [selectedOpponent?.cards]
  );

  const signatureCard = useMemo(
    () =>
      selectedOpponent
        ? getCardById(selectedOpponent.representativeCardId)
        : undefined,
    [selectedOpponent]
  );

  const armorCard = useMemo(
    () =>
      selectedOpponent?.armorCardId !== undefined
        ? getCardById(selectedOpponent.armorCardId)
        : undefined,
    [selectedOpponent]
  );

  const resolvedAiDifficulty: AiDifficultyLevel =
    aiOverride === 'default'
      ? selectedOpponent?.defaultAiDifficulty ?? 'normal'
      : aiOverride;

  const oppRecord = selectedOpponent
    ? state.stats.byOpponent[selectedOpponent.id]
    : undefined;

  const handleSwitchActiveDeck = (deckId: string) => {
    const next = selectActiveDeck(state, deckId);
    if (!controlledState) {
      setInternalState(next);
    }
    onStoreChange?.(next);
    onSelectActiveDeck?.(deckId);
  };

  const handleEnterArena = () => {
    if (!selectedOpponent || !activeDeckValidation.valid) return;
    onStartMatch?.(selectedOpponent, resolvedAiDifficulty, activeDeck);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Arena Banner: Player Stats & Equipped Active Deck */}
      <div
        className="ddcb-panel"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '16px',
          alignItems: 'center',
        }}
      >
        {/* Left: Battle Arena Title & Overall Record */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              background: 'rgba(56, 189, 248, 0.14)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-cyan)',
              flexShrink: 0,
            }}
          >
            <Trophy size={24} />
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.74rem',
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: 'var(--accent-cyan)',
              }}
            >
              BATTLE CAFE & ARENA COLOSSEUM // {OPPONENTS.length} DUELISTS
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.4rem',
                fontWeight: 700,
                margin: 0,
              }}
            >
              Select Opponent & Enter Battle Arena
            </h2>
            <div
              style={{
                display: 'flex',
                gap: '12px',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
                marginTop: '2px',
              }}
            >
              <span>
                Wins: <strong style={{ color: '#34d399' }}>{state.stats.totalWins}</strong>
              </span>
              <span>
                Losses: <strong style={{ color: '#f87171' }}>{state.stats.totalLosses}</strong>
              </span>
              <span>
                Draws: <strong>{state.stats.totalDraws}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Right: Active Player Deck Summary & Quick Selector */}
        <div
          style={{
            background: 'rgba(7, 11, 20, 0.78)',
            border: `1px solid ${
              activeDeckValidation.valid
                ? 'rgba(56, 189, 248, 0.3)'
                : 'rgba(245, 158, 11, 0.5)'
            }`,
            borderRadius: '10px',
            padding: '10px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={15} style={{ color: 'var(--accent-cyan)' }} />
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  color: 'var(--text-secondary)',
                }}
              >
                EQUIPPED PLAYER DECK
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <select
                className="ddcb-select"
                style={{ padding: '4px 8px', fontSize: '0.82rem', fontWeight: 700 }}
                value={activeDeck.id}
                onChange={(e) => handleSwitchActiveDeck(e.target.value)}
                aria-label="Select Equipped Deck"
              >
                {state.decks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.cards.length}/30)
                  </option>
                ))}
              </select>

              {onOpenDeckBuilder && (
                <button
                  type="button"
                  className="ddcb-btn ddcb-btn--sm"
                  onClick={onOpenDeckBuilder}
                  title="Edit Deck in Deck Builder"
                >
                  <Wrench size={13} />
                  <span>Edit</span>
                </button>
              )}
            </div>
          </div>

          {/* Active Deck Specialty & Level Summary */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
              fontSize: '0.76rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {(['Fire', 'Ice', 'Nature', 'Darkness', 'Rare', 'Option'] as const).map((sp) => {
                const cnt = activeDeckAnalysis.bySpecialty[sp];
                if (cnt === 0) return null;
                const meta = getSpecialtyMeta(sp);
                return (
                  <span
                    key={sp}
                    className={`ddcb-badge ddcb-badge--spec spec-${meta.key}`}
                  >
                    <img src={meta.iconPath} alt="" className="ddcb-badge__icon" />
                    <span>{cnt}</span>
                  </span>
                );
              })}
            </div>

            <div style={{ color: 'var(--text-secondary)' }}>
              R:{activeDeckAnalysis.byLevel.R + activeDeckAnalysis.byLevel['R P']} • C:
              {activeDeckAnalysis.byLevel.C + activeDeckAnalysis.byLevel.A} • U:
              {activeDeckAnalysis.byLevel.U} • Opt:{activeDeckAnalysis.byLevel.Option} • Avg +P: +
              {activeDeckAnalysis.avgPlusPDigimon}
            </div>
          </div>

          {!activeDeckValidation.valid && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.76rem',
                color: '#fbbf24',
              }}
            >
              <AlertTriangle size={14} />
              <span>{activeDeckValidation.errors[0]}</span>
            </div>
          )}
        </div>
      </div>

      {/* Filter Bar: Tier Tabs + Search + AI Intelligence Override */}
      <div
        className="ddcb-panel"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '12px 16px',
        }}
      >
        <div className="ddcb-tab-bar" role="tablist" aria-label="Filter Opponents by Tier">
          {TIER_TABS.map((t) => {
            const count =
              t.id === 'All'
                ? OPPONENTS.length
                : OPPONENTS.filter((o) => o.tier === t.id).length;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tierFilter === t.id}
                className={`ddcb-tab-btn ${tierFilter === t.id ? 'is-active' : ''}`}
                onClick={() => setTierFilter(t.id)}
              >
                <span>{t.label}</span>
                <span
                  style={{
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: 'rgba(56, 189, 248, 0.14)',
                    fontSize: '0.7rem',
                    color: t.color,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 320px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              className="ddcb-input"
              style={{ width: '100%', paddingLeft: '32px' }}
              placeholder="Search duelist, deck name, arena location, or specialty colors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search opponents"
            />
          </div>

          {/* AI Difficulty Override */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(7, 11, 20, 0.85)',
              border: '1px solid rgba(56, 189, 248, 0.28)',
              borderRadius: '8px',
              padding: '4px 10px',
            }}
          >
            <Cpu size={15} style={{ color: 'var(--accent-cyan)' }} />
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.76rem',
                fontWeight: 700,
                color: 'var(--text-secondary)',
              }}
            >
              AI LEVEL:
            </span>
            <select
              className="ddcb-select"
              style={{ border: 'none', padding: '4px 6px', background: 'transparent' }}
              value={aiOverride}
              onChange={(e) => setAiOverride(e.target.value as AiOverrideOption)}
              aria-label="AI Intelligence Override"
            >
              <option value="default">
                Default ({selectedOpponent?.defaultAiDifficulty.toUpperCase() ?? 'NORMAL'})
              </option>
              <option value="easy">Easy (Novice AI)</option>
              <option value="normal">Normal (Tactical AI)</option>
              <option value="hard">Hard (Master Lookahead AI)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Split View: Roster List (Left) + Selected Opponent Dossier & Enter Battle (Right) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(300px, 1fr) minmax(340px, 1.35fr)',
          gap: '16px',
          alignItems: 'start',
        }}
      >
        {/* Left Roster Grid/List */}
        <div
          className="ddcb-panel"
          style={{
            maxHeight: '72vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.76rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: 'var(--text-secondary)',
              marginBottom: '4px',
            }}
          >
            AVAILABLE DUELISTS ({filteredOpponents.length})
          </div>

          {filteredOpponents.map((opp) => {
            const isSelected = selectedOpponent?.id === opp.id;
            const rep = getCardById(opp.representativeCardId);
            const rec = state.stats.byOpponent[opp.id];
            return (
              <button
                key={opp.id}
                type="button"
                onClick={() => setSelectedOpponentId(opp.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '9px 11px',
                  borderRadius: '9px',
                  background: isSelected
                    ? 'linear-gradient(90deg, rgba(56, 189, 248, 0.22), rgba(14, 23, 41, 0.92))'
                    : 'rgba(7, 11, 20, 0.72)',
                  border: isSelected
                    ? '1px solid var(--accent-cyan)'
                    : '1px solid rgba(56, 189, 248, 0.16)',
                  boxShadow: isSelected ? '0 0 14px rgba(56, 189, 248, 0.25)' : 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  transition: 'all 0.14s ease',
                }}
              >
                {rep && (
                  <img
                    src={getCardImageUrl(rep)}
                    alt={opp.name}
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '7px',
                      objectFit: 'cover',
                      border: '1px solid rgba(56, 189, 248, 0.35)',
                      flexShrink: 0,
                    }}
                    loading="lazy"
                  />
                )}

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <strong
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '1rem',
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {opp.name}
                    </strong>
                    {rec && rec.wins > 0 && (
                      <span
                        title={`Defeated ${rec.wins} time(s)`}
                        style={{
                          fontSize: '0.68rem',
                          color: '#34d399',
                          fontWeight: 700,
                        }}
                      >
                        ✓ {rec.wins}W
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: '0.76rem',
                      color: 'var(--accent-cyan)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {opp.deckName}
                  </div>
                  <div
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {opp.colors} {opp.location ? `• ${opp.location}` : ''}
                  </div>
                </div>

                <span
                  className="ddcb-badge"
                  style={getTierBadgeStyle(opp.tier)}
                >
                  {opp.tier}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right Pane: Selected Opponent Dossier & Enter Battle Arena CTA */}
        {selectedOpponent && (
          <div
            className="ddcb-panel"
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            {/* Opponent Hero Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '16px',
                paddingBottom: '14px',
                borderBottom: '1px solid rgba(56, 189, 248, 0.22)',
              }}
            >
              {signatureCard && (
                <div
                  style={{
                    width: '88px',
                    height: '88px',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    border: '2px solid var(--accent-cyan)',
                    boxShadow: '0 0 20px rgba(56, 189, 248, 0.3)',
                    flexShrink: 0,
                    cursor: 'pointer',
                  }}
                  onClick={() => setInspectedCard(signatureCard)}
                  title={`Inspect Signature Card: #${signatureCard.no} ${signatureCard.name}`}
                >
                  <img
                    src={getCardImageUrl(signatureCard)}
                    alt={selectedOpponent.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexWrap: 'wrap',
                    marginBottom: '4px',
                  }}
                >
                  <span
                    className="ddcb-badge"
                    style={getTierBadgeStyle(selectedOpponent.tier)}
                  >
                    {selectedOpponent.tier} Tier
                  </span>
                  <span className="ddcb-badge ddcb-badge--level">
                    AI: {resolvedAiDifficulty.toUpperCase()}
                  </span>
                  {selectedOpponent.location && (
                    <span
                      className="ddcb-badge"
                      style={{
                        background: 'rgba(148, 163, 184, 0.14)',
                        border: '1px solid rgba(148, 163, 184, 0.3)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <MapPin size={11} />
                      <span>{selectedOpponent.location}</span>
                    </span>
                  )}
                </div>

                <h3
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    margin: 0,
                    color: 'var(--text-primary)',
                  }}
                >
                  {selectedOpponent.name}
                </h3>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    color: 'var(--accent-cyan-bright)',
                  }}
                >
                  {selectedOpponent.deckName}
                </div>
                <p
                  style={{
                    margin: '6px 0 0',
                    fontSize: '0.84rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.45,
                  }}
                >
                  {selectedOpponent.description}
                </p>
              </div>
            </div>

            {/* Opponent Telemetry & Specialty Colors */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '10px',
              }}
            >
              <div
                style={{
                  background: 'rgba(7, 11, 20, 0.75)',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  borderRadius: '8px',
                  padding: '10px',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    color: 'var(--text-secondary)',
                    marginBottom: '6px',
                  }}
                >
                  OPPONENT SPECIALTY COMPOSITION
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {(['Fire', 'Ice', 'Nature', 'Darkness', 'Rare', 'Option'] as const).map(
                    (sp) => {
                      const cnt = opponentAnalysis.bySpecialty[sp];
                      if (cnt === 0) return null;
                      const meta = getSpecialtyMeta(sp);
                      return (
                        <span
                          key={sp}
                          className={`ddcb-badge ddcb-badge--spec spec-${meta.key}`}
                        >
                          <img src={meta.iconPath} alt="" className="ddcb-badge__icon" />
                          <span>
                            {meta.label}: {cnt}
                          </span>
                        </span>
                      );
                    }
                  )}
                </div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                    marginTop: '6px',
                  }}
                >
                  Level Curve: R:{opponentAnalysis.byLevel.R + opponentAnalysis.byLevel['R P']} • C:
                  {opponentAnalysis.byLevel.C + opponentAnalysis.byLevel.A} • U:
                  {opponentAnalysis.byLevel.U} • Opt:{opponentAnalysis.byLevel.Option}
                </div>
              </div>

              {/* Head-to-Head Record & Signature / Armor Info */}
              <div
                style={{
                  background: 'rgba(7, 11, 20, 0.75)',
                  border: '1px solid rgba(56, 189, 248, 0.2)',
                  borderRadius: '8px',
                  padding: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '6px',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    color: 'var(--text-secondary)',
                  }}
                >
                  HEAD-TO-HEAD RECORD & SIGNATURE
                </div>
                <div style={{ fontSize: '0.84rem' }}>
                  Record:{' '}
                  <strong style={{ color: '#34d399' }}>{oppRecord?.wins ?? 0}W</strong> –{' '}
                  <strong style={{ color: '#f87171' }}>{oppRecord?.losses ?? 0}L</strong> –{' '}
                  <strong>{oppRecord?.draws ?? 0}D</strong>
                  {oppRecord?.bestStreak ? ` (Best Streak: ${oppRecord.bestStreak})` : ''}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                  Signature:{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>
                    {signatureCard ? `#${signatureCard.no} ${signatureCard.name}` : 'Unknown'}
                  </strong>
                  {armorCard && (
                    <span>
                      {' '}
                      • Armor: <strong style={{ color: '#fbbf24' }}>{armorCard.name}</strong>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Enter Battle Arena Button + Inspect Deck Toggle */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
                paddingTop: '6px',
              }}
            >
              <button
                type="button"
                className="ddcb-btn"
                onClick={() => setShowOpponentDeck((prev) => !prev)}
              >
                {showOpponentDeck ? <EyeOff size={16} /> : <Eye size={16} />}
                <span>
                  {showOpponentDeck
                    ? 'Hide Opponent 30-Card Deck'
                    : 'Inspect Opponent 30-Card Deck'}
                </span>
              </button>

              <button
                type="button"
                className="ddcb-btn ddcb-btn--primary"
                style={{
                  padding: '11px 24px',
                  fontSize: '1.02rem',
                }}
                disabled={!activeDeckValidation.valid}
                title={
                  !activeDeckValidation.valid
                    ? activeDeckValidation.errors[0]
                    : `Start match vs ${selectedOpponent.name}`
                }
                onClick={handleEnterArena}
              >
                <Swords size={18} />
                <span>Enter Battle Arena</span>
              </button>
            </div>

            {/* Collapsible 30-Card Deck List Inspector */}
            {showOpponentDeck && (
              <div
                style={{
                  background: 'rgba(5, 10, 20, 0.85)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  borderRadius: '10px',
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    color: 'var(--accent-cyan)',
                  }}
                >
                  {selectedOpponent.deckName.toUpperCase()} — FULL 30-CARD LIST (CLICK TO INSPECT)
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
                    gap: '8px',
                  }}
                >
                  {selectedOpponent.entries.map((entry) => {
                    const card = getCardById(entry.cardId);
                    if (!card) return null;
                    const specMeta = getSpecialtyMeta(card);
                    return (
                      <div
                        key={entry.cardId}
                        onClick={() => setInspectedCard(card)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '6px 8px',
                          borderRadius: '7px',
                          background: 'rgba(17, 28, 50, 0.75)',
                          border: `1px solid ${specMeta.borderColor}`,
                          borderLeft: `3px solid ${specMeta.color}`,
                          cursor: 'pointer',
                        }}
                      >
                        <img
                          src={getCardImageUrl(card)}
                          alt={card.name}
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '5px',
                            objectFit: 'cover',
                          }}
                        />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div
                            style={{
                              fontFamily: 'var(--font-display)',
                              fontWeight: 700,
                              fontSize: '0.85rem',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {entry.count}× {card.name}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                            #{card.no} • {getLevelDisplayLabel(card)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Card Detail Modal */}
      {inspectedCard && (
        <CardDetailModal
          card={inspectedCard}
          isOpen={Boolean(inspectedCard)}
          mode="modal"
          onClose={() => setInspectedCard(null)}
          onSelectCard={(c) => setInspectedCard(c)}
        />
      )}
    </div>
  );
};
