import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  ScrollText,
  Gauge,
  LogOut,
  Layers,
  Sparkles,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
  ShieldAlert,
  Zap,
  PlusCircle,
  ChevronsUp,
  Swords,
} from 'lucide-react';
import type {
  Action,
  AttackSlot,
  CardId,
  EngineApi,
  GameEvent,
  MatchPhase,
  MatchState,
  PartnerConfigMap,
  PlayerSide,
} from '../types/game';
import { getCardById } from '../data/cards';
import { getEffectiveCardData } from '../data/digiParts';
import {
  ActiveDigimonBattleSlot,
  AttackSymbolSvg,
  BattleLogDrawer,
  CardArtwork,
  CardDetailModal,
  CenterClashZone,
  ClashStepBanner,
  ForfeitConfirmModal,
  GameOverModal,
  LoggedGameEvent,
  RulesHelpModal,
  SpecialtyBadge,
  SupportTextWithTokens,
  ZoneInspectModal,
} from './battle/BattleField';
import './battle/battle.css';

export interface BattleScreenProps {
  playerDeck: CardId[];
  opponentDeck: CardId[];
  opponentName: string;
  opponentDeckName?: string;
  opponentAvatarCardId?: CardId;
  opponentPreserveExactOrder?: boolean;
  opponentDisableArmorOnCardIds?: CardId[];
  playerPartnerConfig?: PartnerConfigMap;
  aiDifficulty: 'easy' | 'normal' | 'hard';
  engine: EngineApi;
  chooseAiAction: (
    state: MatchState,
    side: PlayerSide,
    difficulty: 'easy' | 'normal' | 'hard'
  ) => Action;
  onExit: (winner: PlayerSide | 'draw' | null) => void;
}

type SpeedMode = '1x' | '2x' | 'instant';

const PHASE_DISPLAY_NAMES: Record<MatchPhase, string> = {
  mulligan: 'Mulligan Check',
  draw: 'Draw Phase',
  rookiePlacement: 'Place Rookie',
  digivolve: 'Preparation / Digivolve',
  attackSelect: 'Select Attack',
  supportSelect: 'Select Support',
  battleResolve: 'Battle Resolution',
  turnEnd: 'Turn End',
  gameOver: 'Game Over',
};

function buildClashBannersFromEvents(
  events: GameEvent[],
  opponentName: string
): ClashStepBanner[] {
  const banners: ClashStepBanner[] = [];
  const actorName = (side: PlayerSide) => (side === 'player' ? 'You' : opponentName);

  for (const ev of events) {
    if (ev.type === 'supportVoided') {
      const c = getCardById(ev.cardId);
      banners.push({
        title: 'SUPPORT EFFECT VOIDED!',
        detail: `${actorName(ev.bySide)} voided ${actorName(ev.side)}'s ${
          c ? c.name : `Card #${ev.cardId}`
        }!`,
        tone: 'info',
      });
    } else if (ev.type === 'supportTriggered') {
      const c = getCardById(ev.cardId);
      banners.push({
        title: `${actorName(ev.side).toUpperCase()} SUPPORT: ${c ? c.name : `#${ev.cardId}`}`,
        detail: ev.text,
        tone: 'info',
      });
    } else if (ev.type === 'attackChanged') {
      banners.push({
        title: 'ATTACK SLOT CHANGED!',
        detail: `${actorName(ev.side)}'s attack shifted from ${ev.from.toUpperCase()} to ${ev.to.toUpperCase()}!`,
        tone: 'info',
        slot: ev.to,
      });
    } else if (ev.type === 'attackStrike') {
      const tags: string[] = [];
      if (ev.countered) tags.push('COUNTER!');
      if (ev.eatUpHpHealed) tags.push(`Eat-Up HP +${ev.eatUpHpHealed}`);
      if (ev.crashSelfDamage) tags.push('CRASH! (Self HP → 10)');
      banners.push({
        title: `${ev.countered ? '⚡ COUNTERATTACK! ' : ''}${actorName(
          ev.attacker
        ).toUpperCase()} — ${ev.attackName.toUpperCase()}`,
        detail: `Dealt ${ev.damage} DMG! (${actorName(ev.defender)} HP: ${
          ev.defenderHpBefore
        } → ${ev.defenderHpAfter})${tags.length ? ` • ${tags.join(' • ')}` : ''}`,
        tone: 'strike',
        slot: ev.slot,
      });
    } else if (ev.type === 'digimonKo') {
      const c = getCardById(ev.cardId);
      banners.push({
        title: `💥 DIGIMON KO! (${actorName(ev.bySide).toUpperCase()} ${ev.newKoCount}/3 KOs)`,
        detail: `${actorName(ev.side)}'s ${c ? c.name : `Digimon #${ev.cardId}`} was knocked out!${
          ev.revivedHp ? ` Revived at ${ev.revivedHp} HP!` : ''
        }`,
        tone: 'ko',
      });
    }
  }

  return banners;
}

export const BattleScreen: React.FC<BattleScreenProps> = ({
  playerDeck,
  opponentDeck,
  opponentName,
  opponentDeckName,
  opponentAvatarCardId,
  opponentPreserveExactOrder,
  opponentDisableArmorOnCardIds,
  playerPartnerConfig,
  aiDifficulty,
  engine,
  chooseAiAction,
  onExit,
}) => {
  const matchRulesConfig = useMemo(
    () => ({
      ...(opponentPreserveExactOrder ? { preserveDeckOrder: { opponent: true } } : {}),
      ...(opponentDisableArmorOnCardIds && opponentDisableArmorOnCardIds.length > 0
        ? { disableArmorOnCardIds: { opponent: opponentDisableArmorOnCardIds } }
        : {}),
      ...(playerPartnerConfig ? { partnerConfig: { player: playerPartnerConfig } } : {}),
    }),
    [opponentPreserveExactOrder, opponentDisableArmorOnCardIds, playerPartnerConfig]
  );

  // Initialize match state
  const [matchState, setMatchState] = useState<MatchState>(() =>
    engine.createMatch({
      playerDeck,
      opponentDeck,
      config: {
        ...(opponentPreserveExactOrder ? { preserveDeckOrder: { opponent: true } } : {}),
        ...(opponentDisableArmorOnCardIds && opponentDisableArmorOnCardIds.length > 0
          ? { disableArmorOnCardIds: { opponent: opponentDisableArmorOnCardIds } }
          : {}),
        ...(playerPartnerConfig ? { partnerConfig: { player: playerPartnerConfig } } : {}),
      },
    })
  );

  // Speed toggle ('1x' | '2x' | 'instant')
  const [speedMode, setSpeedMode] = useState<SpeedMode>('1x');

  // UI Modals & Drawers
  const [inspectedCardId, setInspectedCardId] = useState<CardId | null>(null);
  const [inspectedZone, setInspectedZone] = useState<{
    title: string;
    subtitle?: string;
    cardIds: CardId[];
  } | null>(null);
  const [showLogDrawer, setShowLogDrawer] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showForfeitModal, setShowForfeitModal] = useState(false);

  // Option target selection state (when a Digivolve Option requires targetHandIndex)
  const [pendingOptionHandIndex, setPendingOptionHandIndex] = useState<number | null>(null);
  // Partner Rookie deployment choice modal state (Normal Rookie vs Armor Evolution)
  const [pendingPartnerHandIndex, setPendingPartnerHandIndex] = useState<number | null>(null);

  // Persistent Battle Log & Clash Resolution Banner Queue
  const logIdCounter = useRef(1);
  const processedEventsCountRef = useRef<number>(matchState.events.length);
  const [battleLogs, setBattleLogs] = useState<LoggedGameEvent[]>(() =>
    matchState.events.map((ev) => ({
      id: logIdCounter.current++,
      turn: matchState.turnNumber,
      event: ev,
    }))
  );
  const [clashBanners, setClashBanners] = useState<ClashStepBanner[]>([]);

  // Visible state from the player's perspective
  const visibleState = useMemo(
    () => engine.getVisibleState(matchState, 'player'),
    [engine, matchState]
  );

  // Legal actions for both sides
  const playerLegalActions = useMemo(
    () => engine.getLegalActions(matchState, 'player'),
    [engine, matchState]
  );
  const opponentLegalActions = useMemo(
    () => engine.getLegalActions(matchState, 'opponent'),
    [engine, matchState]
  );

  // Helper to apply an action and record newly emitted events
  const dispatchAction = useCallback(
    (action: Action) => {
      setPendingOptionHandIndex(null);
      setPendingPartnerHandIndex(null);
      setMatchState((prev) => {
        const next = engine.applyAction(prev, action);

        // Extract newly emitted events whether engine appends or replaces next.events
        let newEvents: GameEvent[] = [];
        if (
          next.events.length >= prev.events.length &&
          prev.events.every((e, idx) => next.events[idx] === e)
        ) {
          newEvents = next.events.slice(prev.events.length);
        } else {
          newEvents = next.events;
        }
        processedEventsCountRef.current = next.events.length;

        if (newEvents.length > 0) {
          const addedLogs: LoggedGameEvent[] = newEvents.map((event) => ({
            id: logIdCounter.current++,
            turn: next.turnNumber,
            event,
          }));
          setBattleLogs((old) => [...old, ...addedLogs]);

          const newBanners = buildClashBannersFromEvents(newEvents, opponentName);
          if (newBanners.length > 0 && speedMode !== 'instant') {
            setClashBanners((old) => [...old, ...newBanners]);
          }
        }

        return next;
      });
    },
    [engine, opponentName, speedMode]
  );

  // Rematch handler
  const handleRematch = useCallback(() => {
    setPendingOptionHandIndex(null);
    setPendingPartnerHandIndex(null);
    setClashBanners([]);
    const fresh = engine.createMatch({
      playerDeck,
      opponentDeck,
      config: matchRulesConfig,
    });
    processedEventsCountRef.current = fresh.events.length;
    setBattleLogs(
      fresh.events.map((event) => ({
        id: logIdCounter.current++,
        turn: fresh.turnNumber,
        event,
      }))
    );
    setMatchState(fresh);
  }, [engine, playerDeck, opponentDeck, matchRulesConfig]);

  // Auto-advance Clash Resolution Banner Queue on timer
  useEffect(() => {
    if (clashBanners.length === 0) return;
    if (speedMode === 'instant') {
      setClashBanners([]);
      return;
    }
    const duration = speedMode === '2x' ? 950 : 1850;
    const timer = window.setTimeout(() => {
      setClashBanners((prev) => prev.slice(1));
    }, duration);
    return () => window.clearTimeout(timer);
  }, [clashBanners, speedMode]);

  // AI Turn Automation
  useEffect(() => {
    if (matchState.phase === 'gameOver' || matchState.winner !== null) return;
    if (opponentLegalActions.length === 0) return;

    // Determine if AI should act now:
    // 1. Player has no legal actions (strictly AI's turn)
    // 2. Or it is AI's active turn during Preparation/Digivolve or Support selection
    const shouldAiAct =
      playerLegalActions.length === 0 ||
      (matchState.activePlayer === 'opponent' &&
        (matchState.phase === 'digivolve' ||
          matchState.phase === 'rookiePlacement' ||
          (matchState.phase === 'supportSelect' &&
            !matchState.battle?.supportDecided?.opponent)));

    if (!shouldAiAct) return;

    const delayMs =
      speedMode === 'instant' ? 25 : speedMode === '2x' ? 280 : 620;

    const timer = window.setTimeout(() => {
      const aiAction = chooseAiAction(matchState, 'opponent', aiDifficulty);
      if (aiAction) {
        dispatchAction(aiAction);
      }
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [
    matchState,
    opponentLegalActions,
    playerLegalActions,
    aiDifficulty,
    speedMode,
    chooseAiAction,
    dispatchAction,
  ]);

  // Cycle speed toggle
  const handleToggleSpeed = () => {
    setSpeedMode((prev) => (prev === '1x' ? '2x' : prev === '2x' ? 'instant' : '1x'));
  };

  // Player state & Opponent state shortcuts
  const playerState = visibleState.players.player;
  const opponentState = visibleState.players.opponent;
  const avatarCard = opponentAvatarCardId !== undefined ? getCardById(opponentAvatarCardId) : undefined;
  const hasActiveOptionModifier = Boolean(playerState.activeDigivolveModifier);
  const activeOptionSourceCard =
    playerState.activeDigivolveModifier?.sourceCardId !== undefined
      ? getCardById(playerState.activeDigivolveModifier.sourceCardId)
      : undefined;

  // Group player legal actions by type & handIndex
  const canPlayerSelectAttack = useMemo(
    () => playerLegalActions.some((a) => a.type === 'chooseAttack'),
    [playerLegalActions]
  );

  const endDigivolveAction = useMemo(
    () => playerLegalActions.find((a) => a.type === 'endDigivolvePhase'),
    [playerLegalActions]
  );

  const hasDigivolveTargets = useMemo(
    () => playerLegalActions.some((a) => a.type === 'digivolve'),
    [playerLegalActions]
  );

  const playBlindSupportAction = useMemo(
    () => playerLegalActions.find((a) => a.type === 'playSupportFromDeckTop'),
    [playerLegalActions]
  );

  const passSupportAction = useMemo(
    () => playerLegalActions.find((a) => a.type === 'passSupport'),
    [playerLegalActions]
  );

  const keepMulliganAction = useMemo(
    () => playerLegalActions.find((a) => a.type === 'mulligan' && a.keep === true),
    [playerLegalActions]
  );

  const redrawMulliganAction = useMemo(
    () => playerLegalActions.find((a) => a.type === 'mulligan' && a.keep === false),
    [playerLegalActions]
  );

  // Target hand indices when pendingOptionHandIndex is active
  const targetedOptionActionsForPending = useMemo(() => {
    if (pendingOptionHandIndex === null) return [];
    return playerLegalActions.filter(
      (a): a is Extract<Action, { type: 'useDigivolveOption' }> =>
        a.type === 'useDigivolveOption' &&
        a.handIndex === pendingOptionHandIndex &&
        typeof a.targetHandIndex === 'number'
    );
  }, [playerLegalActions, pendingOptionHandIndex]);

  // Keyboard shortcuts for smooth combat controls
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (
        inspectedCardId !== null ||
        inspectedZone !== null ||
        showRulesModal ||
        showForfeitModal ||
        visibleState.phase === 'gameOver'
      ) {
        return;
      }

      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        setShowLogDrawer((v) => !v);
        return;
      }

      if (e.key === 'Escape') {
        if (pendingPartnerHandIndex !== null) {
          e.preventDefault();
          setPendingPartnerHandIndex(null);
        } else if (pendingOptionHandIndex !== null) {
          e.preventDefault();
          setPendingOptionHandIndex(null);
        } else if (showLogDrawer) {
          e.preventDefault();
          setShowLogDrawer(false);
        }
        return;
      }

      if (pendingPartnerHandIndex !== null) {
        return;
      }

      if (canPlayerSelectAttack && (e.key === '1' || e.key === '2' || e.key === '3')) {
        const slotMap: Record<string, AttackSlot> = {
          '1': 'circle',
          '2': 'triangle',
          '3': 'x',
        };
        const slot = slotMap[e.key];
        const act = playerLegalActions.find(
          (a) => a.type === 'chooseAttack' && a.slot === slot
        );
        if (act) {
          e.preventDefault();
          dispatchAction(act);
        }
        return;
      }

      if (e.key === ' ' || e.key === 'Enter') {
        if (clashBanners.length > 0) {
          e.preventDefault();
          setClashBanners((prev) => prev.slice(1));
          return;
        }
        if (visibleState.phase === 'digivolve' && endDigivolveAction) {
          e.preventDefault();
          dispatchAction(endDigivolveAction);
          return;
        }
        if (visibleState.phase === 'supportSelect' && passSupportAction) {
          e.preventDefault();
          dispatchAction(passSupportAction);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    inspectedCardId,
    inspectedZone,
    showRulesModal,
    showForfeitModal,
    visibleState.phase,
    pendingOptionHandIndex,
    pendingPartnerHandIndex,
    showLogDrawer,
    canPlayerSelectAttack,
    playerLegalActions,
    clashBanners.length,
    endDigivolveAction,
    passSupportAction,
    dispatchAction,
  ]);

  // Inspect stack helper
  const handleInspectStack = (side: PlayerSide) => {
    const digi = visibleState.players[side].battleDigimon;
    if (!digi) return;
    const ownerLabel = side === 'player' ? 'Your' : `${opponentName}'s`;
    setInspectedZone({
      title: `${ownerLabel} Digivolution Stack`,
      subtitle: 'Cards stacked beneath the active Digimon (bottom to top)',
      cardIds: [...digi.stack, digi.cardId],
    });
  };

  // Phase instruction banner text
  const getPhaseInstruction = (): string => {
    if (pendingPartnerHandIndex !== null) {
      return 'Partner Deployment: Choose to deploy as a Normal Rookie (evolves to C/U) or Armor Evolve immediately for 0 DP!';
    }
    if (pendingOptionHandIndex !== null) {
      return 'Select a target card in your Hand to apply the Digivolve Option, or click Cancel.';
    }
    switch (visibleState.phase) {
      case 'mulligan':
        return playerLegalActions.length > 0
          ? 'Opening Hand Check: Choose to Keep Hand or Mulligan (Redraw 4 cards).'
          : `Waiting for ${opponentName} to complete Mulligan...`;
      case 'rookiePlacement':
        return playerLegalActions.length > 0
          ? 'Select a Rookie (R / R P, offers Armor Evolution) or deploy Champion (1/2 Stats) / Ultimate (1/4 Stats)!'
          : `Waiting for ${opponentName} to deploy their Digimon...`;
      case 'digivolve':
        if (visibleState.activePlayer === 'player' && hasActiveOptionModifier) {
          return hasDigivolveTargets
            ? `Digivolve Option Active (${activeOptionSourceCard?.name ?? 'Modifier'}): Click "▲ Option Digivolve" on a highlighted Digimon in your Hand!`
            : `Digivolve Option Active (${activeOptionSourceCard?.name ?? 'Modifier'}): No valid targets in Hand — add DP or click "End Preparation" (Option discarded).`;
        }
        return visibleState.activePlayer === 'player' && playerLegalActions.length > 0
          ? 'Preparation Phase: Add up to 1 card to DP Slot (+P), use Digivolve Options, or Digivolve. Click "End Preparation" when ready!'
          : `${opponentName} is executing their Preparation / Digivolve Phase...`;
      case 'attackSelect':
        return canPlayerSelectAttack
          ? 'Battle Phase — Step 1: Click Circle (○), Triangle (△), or Cross (✕) on your Active Digimon to lock in your attack!'
          : `Waiting for ${opponentName} to choose their attack...`;
      case 'supportSelect':
        return playerLegalActions.length > 0
          ? 'Battle Phase — Step 2: Play a card from Hand as Support, click your Online Deck for Blind Support, or Pass Support.'
          : `Waiting for ${opponentName} to select Support...`;
      case 'battleResolve':
        return 'Resolving Battle Clash!';
      case 'gameOver':
        return 'Match Ended!';
      default:
        return 'Processing turn...';
    }
  };

  return (
    <div className="ddcb-arena-root">
      {/* ===================================================================
       * 1. TOP BAR HUD
       * =================================================================== */}
      <header className="ddcb-top-bar">
        {/* Turn & Phase Indicator */}
        <div className="ddcb-top-group">
          <div className="ddcb-turn-badge">
            <Layers size={14} />
            <span>TURN {visibleState.turnNumber}</span>
          </div>

          <div className="ddcb-phase-banner">
            <Sparkles size={14} color="#fbbf24" />
            <span>{PHASE_DISPLAY_NAMES[visibleState.phase]}</span>
          </div>

          <span
            className={`ddcb-active-player-pill ${
              visibleState.activePlayer === 'player' ? 'is-player' : 'is-opponent'
            }`}
          >
            {visibleState.activePlayer === 'player'
              ? 'YOUR INITIATIVE (1ST)'
              : `${opponentName.toUpperCase()} INITIATIVE (1ST)`}
          </span>
        </div>

        {/* KO Scoreboard (3 Orbs per side) */}
        <div className="ddcb-scoreboard" aria-label="KO Scoreboard">
          <div className="ddcb-score-side player">
            <span>PLAYER</span>
            <div className="ddcb-ko-orbs">
              {[0, 1, 2].map((idx) => (
                <span
                  key={idx}
                  className={`ddcb-ko-orb player ${
                    playerState.koCount > idx ? 'filled' : ''
                  }`}
                  title={`Player KO Orb ${idx + 1}`}
                />
              ))}
            </div>
          </div>

          <span className="ddcb-score-vs">VS</span>

          <div className="ddcb-score-side opponent">
            <div className="ddcb-ko-orbs">
              {[0, 1, 2].map((idx) => (
                <span
                  key={idx}
                  className={`ddcb-ko-orb opponent ${
                    opponentState.koCount > idx ? 'filled' : ''
                  }`}
                  title={`Opponent KO Orb ${idx + 1}`}
                />
              ))}
            </div>
            <span>{opponentName}</span>
          </div>
        </div>

        {/* Opponent Info & Utility Controls */}
        <div className="ddcb-top-group">
          <div className="ddcb-opponent-meta">
            {avatarCard && (
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  overflow: 'hidden',
                  border: '1px solid #fb7185',
                }}
              >
                <CardArtwork card={avatarCard} />
              </div>
            )}
            <span className="ddcb-opponent-name">{opponentName}</span>
            {opponentDeckName && (
              <span className="ddcb-opponent-deck">({opponentDeckName})</span>
            )}
            <span className={`ddcb-diff-badge ${aiDifficulty}`}>{aiDifficulty}</span>
          </div>

          <button
            type="button"
            className="ddcb-hud-btn"
            onClick={handleToggleSpeed}
            title="Toggle AI & Animation Speed (1x / 2x / Instant)"
          >
            <Gauge size={14} />
            <span>Speed: {speedMode.toUpperCase()}</span>
          </button>

          <button
            type="button"
            className={`ddcb-hud-btn ${showLogDrawer ? 'active' : ''}`}
            onClick={() => setShowLogDrawer((v) => !v)}
            title="Toggle Battle Log Drawer (Shortcut: L)"
          >
            <ScrollText size={14} />
            <span>Log ({battleLogs.length}) [L]</span>
          </button>

          <button
            type="button"
            className="ddcb-hud-btn"
            onClick={() => setShowRulesModal(true)}
            title="View PS1 Digimon Digital Card Battle Rules"
          >
            <BookOpen size={14} />
            <span>Rules</span>
          </button>

          <button
            type="button"
            className="ddcb-hud-btn danger"
            onClick={() => setShowForfeitModal(true)}
            title="Forfeit Match and Exit to Lobby"
          >
            <LogOut size={14} />
            <span>Exit Arena</span>
          </button>
        </div>
      </header>

      {/* ===================================================================
       * 2. MAIN ARENA BODY
       * =================================================================== */}
      <main className="ddcb-arena-body">
        {/* -----------------------------------------------------------------
         * 2A. OPPONENT HALF OF ARENA
         * ----------------------------------------------------------------- */}
        <section className="ddcb-half-row" aria-label="Opponent Arena Area">
          {/* Opponent Hand & Deck/Offline Piles */}
          <div className="ddcb-panel">
            <div className="ddcb-panel-header">
              <span>{opponentName} Zones</span>
              <span>Hand: {opponentState.handCount}</span>
            </div>

            <div className="ddcb-zones-grid">
              {/* Opponent Online Deck */}
              <div
                className="ddcb-zone-box"
                title={`${opponentName}'s Online Deck (${opponentState.onlineCount} cards remaining)`}
              >
                <span className="ddcb-zone-label">Online Deck</span>
                <span className="ddcb-zone-value">{opponentState.onlineCount}</span>
                <span className="ddcb-zone-sub">Cards Left</span>
              </div>

              {/* Opponent DP Slot */}
              <div
                className="ddcb-zone-box"
                onClick={() =>
                  setInspectedZone({
                    title: `${opponentName}'s DP Slot (${opponentState.dpTotal} DP)`,
                    subtitle: 'Cards accumulated for Digivolution (persists across KOs)',
                    cardIds: opponentState.dpSlot,
                  })
                }
                title="Click to inspect Opponent's DP Slot cards"
              >
                <span className="ddcb-zone-label">DP Slot</span>
                <span className="ddcb-zone-value dp-value">{opponentState.dpTotal} DP</span>
                <span className="ddcb-zone-sub">{opponentState.dpSlot.length} Cards 🔍</span>
              </div>

              {/* Opponent Offline Pile */}
              <div
                className="ddcb-zone-box"
                onClick={() =>
                  setInspectedZone({
                    title: `${opponentName}'s Offline Pile`,
                    subtitle: 'Discarded & KO’d cards',
                    cardIds: opponentState.offline,
                  })
                }
                title="Click to inspect Opponent's Offline discard pile"
              >
                <span className="ddcb-zone-label">Offline Pile</span>
                <span className="ddcb-zone-value">{opponentState.offline.length}</span>
                <span className="ddcb-zone-sub">Inspect 🔍</span>
              </div>
            </div>

            {/* Opponent Face-down Hand Cards */}
            <div
              className="ddcb-opp-hand-row"
              title={`${opponentName} holds ${opponentState.handCount} card(s) in hand`}
            >
              {Array.from({ length: opponentState.handCount }).map((_, idx) => (
                <div key={idx} className="ddcb-card-back" />
              ))}
              {opponentState.handCount === 0 && (
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Empty Hand</span>
              )}
            </div>
          </div>

          {/* Opponent Active Digimon Battle Slot */}
          <ActiveDigimonBattleSlot
            side="opponent"
            activeDigimon={opponentState.battleDigimon}
            battle={visibleState.battle}
            phase={visibleState.phase}
            canSelectAttack={false}
            activeDigivolveModifier={opponentState.activeDigivolveModifier}
            partnerConfig={visibleState.config.partnerConfig?.opponent}
            onInspectCard={(id) => setInspectedCardId(id)}
            onInspectStack={handleInspectStack}
          />

          {/* Opponent Status Summary Panel */}
          <div className="ddcb-panel">
            <div className="ddcb-panel-header">
              <span>Opponent Status</span>
              <span>KO: {opponentState.koCount}/3</span>
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem',
                fontSize: '0.78rem',
                color: '#cbd5e1',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Chosen Attack:</span>
                <strong>
                  {visibleState.battle?.chosenAttacks.opponent ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <AttackSymbolSvg
                        slot={
                          visibleState.battle.effectiveAttacks?.opponent ??
                          visibleState.battle.chosenAttacks.opponent
                        }
                        size={16}
                      />
                      <span>
                        {visibleState.battle.chosenAttacks.opponent === 'hidden'
                          ? 'Locked In'
                          : (
                              visibleState.battle.effectiveAttacks?.opponent ??
                              visibleState.battle.chosenAttacks.opponent
                            ).toUpperCase()}
                      </span>
                    </span>
                  ) : (
                    'None'
                  )}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Support Status:</span>
                <strong>
                  {visibleState.battle?.supportCards.opponent
                    ? visibleState.battle.supportCards.opponent.voided
                      ? 'VOIDED!'
                      : 'Card Set'
                    : visibleState.battle?.supportDecided?.opponent
                    ? visibleState.battle?.supportDecided?.player
                      ? 'Passed'
                      : 'Locked In'
                    : 'Waiting'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Top DP Card:</span>
                <strong>
                  {opponentState.dpSlot.length > 0
                    ? getCardById(opponentState.dpSlot[opponentState.dpSlot.length - 1])?.name ??
                      'Card'
                    : 'Empty'}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Top Offline:</span>
                <strong>
                  {opponentState.offline.length > 0
                    ? getCardById(opponentState.offline[opponentState.offline.length - 1])?.name ??
                      'Card'
                    : 'Empty'}
                </strong>
              </div>
            </div>
          </div>
        </section>

        {/* -----------------------------------------------------------------
         * 2B. CENTER CLASH / SUPPORT ZONE
         * ----------------------------------------------------------------- */}
        <CenterClashZone
          battle={visibleState.battle}
          phase={visibleState.phase}
          activePlayer={visibleState.activePlayer}
          activeClashBanner={clashBanners[0] ?? null}
          clashQueueCount={Math.max(0, clashBanners.length - 1)}
          onAdvanceClashBanner={() => setClashBanners((prev) => prev.slice(1))}
          onInspectCard={(id) => setInspectedCardId(id)}
        />

        {/* -----------------------------------------------------------------
         * 2C. PLAYER HALF OF ARENA (BATTLE SLOT + ZONES + HAND DOCK)
         * ----------------------------------------------------------------- */}
        <section
          style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}
          aria-label="Player Arena Area"
        >
          <div className="ddcb-half-row">
            {/* Player Zones: Online Deck (Clickable for Blind Support!), DP Slot, Offline Pile */}
            <div className="ddcb-panel">
              <div className="ddcb-panel-header">
                <span>Your Digivice Zones</span>
                <span>DP: {playerState.dpTotal}</span>
              </div>

              <div className="ddcb-zones-grid">
                {/* Player Online Deck — Clickable in supportSelect for Blind Support! */}
                <div
                  className={`ddcb-zone-box ${
                    playBlindSupportAction ? 'interactive-highlight' : ''
                  }`}
                  onClick={() => {
                    if (playBlindSupportAction) {
                      dispatchAction(playBlindSupportAction);
                    }
                  }}
                  title={
                    playBlindSupportAction
                      ? 'Click to Play Top Card of Online Deck as Blind Support!'
                      : `Your Online Deck (${playerState.onlineCount} cards remaining)`
                  }
                >
                  <span className="ddcb-zone-label">Online Deck</span>
                  <span className="ddcb-zone-value">{playerState.onlineCount}</span>
                  <span className="ddcb-zone-sub">
                    {playBlindSupportAction ? '⚡ BLIND SUPPORT!' : 'Cards Left'}
                  </span>
                </div>

                {/* Player DP Slot */}
                <div
                  className="ddcb-zone-box"
                  onClick={() =>
                    setInspectedZone({
                      title: `Your DP Slot (${playerState.dpTotal} DP)`,
                      subtitle: 'Cards accumulated for Digivolution (persists across KOs)',
                      cardIds: playerState.dpSlot,
                    })
                  }
                  title="Click to inspect cards in your DP Slot"
                >
                  <span className="ddcb-zone-label">DP Slot</span>
                  <span className="ddcb-zone-value dp-value">{playerState.dpTotal} DP</span>
                  <span className="ddcb-zone-sub">{playerState.dpSlot.length} Cards 🔍</span>
                </div>

                {/* Player Offline Pile */}
                <div
                  className="ddcb-zone-box"
                  onClick={() =>
                    setInspectedZone({
                      title: 'Your Offline Pile',
                      subtitle: 'Discarded, consumed DP, and KO’d cards',
                      cardIds: playerState.offline,
                    })
                  }
                  title="Click to inspect your Offline discard pile"
                >
                  <span className="ddcb-zone-label">Offline Pile</span>
                  <span className="ddcb-zone-value">{playerState.offline.length}</span>
                  <span className="ddcb-zone-sub">Inspect 🔍</span>
                </div>
              </div>
            </div>

            {/* Player Active Digimon Battle Slot */}
            <ActiveDigimonBattleSlot
              side="player"
              activeDigimon={playerState.battleDigimon}
              battle={visibleState.battle}
              phase={visibleState.phase}
              canSelectAttack={canPlayerSelectAttack}
              activeDigivolveModifier={playerState.activeDigivolveModifier}
              partnerConfig={visibleState.config.partnerConfig?.player ?? playerPartnerConfig}
              onSelectAttack={(slot: AttackSlot) => {
                const action = playerLegalActions.find(
                  (a) => a.type === 'chooseAttack' && a.slot === slot
                );
                if (action) dispatchAction(action);
              }}
              onInspectCard={(id) => setInspectedCardId(id)}
              onInspectStack={handleInspectStack}
            />

            {/* Player Phase Command Panel */}
            <div className="ddcb-panel">
              <div className="ddcb-panel-header">
                <span>Phase Commands</span>
                <span>{PHASE_DISPLAY_NAMES[visibleState.phase]}</span>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  justifyContent: 'center',
                  height: 'calc(100% - 28px)',
                }}
              >
                {/* Mulligan Quick Buttons */}
                {visibleState.phase === 'mulligan' && (keepMulliganAction || redrawMulliganAction) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {keepMulliganAction && (
                      <button
                        type="button"
                        className="ddcb-phase-cta-btn"
                        onClick={() => dispatchAction(keepMulliganAction)}
                      >
                        <CheckCircle2 size={16} />
                        <span>Keep Opening Hand</span>
                      </button>
                    )}
                    {redrawMulliganAction && (
                      <button
                        type="button"
                        className="ddcb-action-btn primary"
                        onClick={() => dispatchAction(redrawMulliganAction)}
                      >
                        <RotateCcw size={15} />
                        <span>Mulligan (Redraw 4)</span>
                      </button>
                    )}
                  </div>
                )}

                {/* End Preparation -> Battle Phase Button */}
                {endDigivolveAction && (
                  <button
                    type="button"
                    className="ddcb-phase-cta-btn"
                    onClick={() => dispatchAction(endDigivolveAction)}
                    title="Shortcut: Space or Enter"
                  >
                    <Swords size={16} />
                    <span>End Preparation → Battle Phase [Space]</span>
                    <ArrowRight size={16} />
                  </button>
                )}

                {/* Support Phase Quick Buttons (Blind Support + Pass Support) */}
                {visibleState.phase === 'supportSelect' &&
                  (playBlindSupportAction || passSupportAction) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      {playBlindSupportAction && (
                        <button
                          type="button"
                          className="ddcb-action-btn amber"
                          onClick={() => dispatchAction(playBlindSupportAction)}
                        >
                          <Zap size={15} />
                          <span>Blind Support (Top of Online Deck)</span>
                        </button>
                      )}
                      {passSupportAction && (
                        <button
                          type="button"
                          className="ddcb-phase-cta-btn"
                          onClick={() => dispatchAction(passSupportAction)}
                          title="Shortcut: Space or Enter"
                        >
                          <ArrowRight size={15} />
                          <span>Pass Support [Space]</span>
                        </button>
                      )}
                    </div>
                  )}

                {/* Attack Selection Prompt */}
                {canPlayerSelectAttack && (
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {(['circle', 'triangle', 'x'] as AttackSlot[]).map((slot) => {
                      const act = playerLegalActions.find(
                        (a) => a.type === 'chooseAttack' && a.slot === slot
                      );
                      if (!act) return null;
                      const keyHint = slot === 'circle' ? '1' : slot === 'triangle' ? '2' : '3';
                      return (
                        <button
                          key={slot}
                          type="button"
                          className="ddcb-action-btn primary"
                          onClick={() => dispatchAction(act)}
                          title={`Shortcut: ${keyHint}`}
                        >
                          <AttackSymbolSvg slot={slot} size={16} />
                          <span>{slot === 'x' ? 'Cross' : slot} [{keyHint}]</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {playerLegalActions.length === 0 && visibleState.phase !== 'gameOver' && (
                  <div
                    style={{
                      fontSize: '0.78rem',
                      color: '#94a3b8',
                      textAlign: 'center',
                      padding: '0.5rem',
                    }}
                  >
                    Waiting for {opponentName} ({aiDifficulty.toUpperCase()} AI)...
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ---------------------------------------------------------------
           * 2D. PLAYER HAND DOCK (Context-Sensitive Action Buttons)
           * --------------------------------------------------------------- */}
          <div className="ddcb-hand-dock">
            <div className="ddcb-hand-header">
              <div className="ddcb-phase-instruction">
                <ShieldAlert size={16} color="#38bdf8" />
                <span>{getPhaseInstruction()}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {pendingOptionHandIndex !== null && (
                  <button
                    type="button"
                    className="ddcb-hud-btn danger"
                    onClick={() => setPendingOptionHandIndex(null)}
                    title="Shortcut: Escape"
                  >
                    Cancel Option Target Selection [Esc]
                  </button>
                )}
                {endDigivolveAction && (
                  <button
                    type="button"
                    className="ddcb-phase-cta-btn"
                    onClick={() => dispatchAction(endDigivolveAction)}
                    title="Shortcut: Space or Enter"
                  >
                    <span>End Preparation → Battle Phase [Space]</span>
                    <ArrowRight size={15} />
                  </button>
                )}
                {passSupportAction && (
                  <button
                    type="button"
                    className="ddcb-phase-cta-btn"
                    onClick={() => dispatchAction(passSupportAction)}
                    title="Shortcut: Space or Enter"
                  >
                    <span>Pass Support [Space]</span>
                    <ArrowRight size={15} />
                  </button>
                )}
              </div>
            </div>

            {/* Hand Cards Grid */}
            <div className="ddcb-hand-cards-grid">
              {playerState.hand.map((cardId, handIndex) => {
                const effectivePartnerConfig =
                  visibleState.config.partnerConfig?.player ?? playerPartnerConfig;
                const card =
                  getEffectiveCardData(cardId, effectivePartnerConfig) ?? getCardById(cardId);

                // Find all legal actions for this handIndex
                const placeRookieActs = playerLegalActions.filter(
                  (a): a is Extract<Action, { type: 'placeRookie' }> =>
                    a.type === 'placeRookie' && a.handIndex === handIndex
                );
                const normalRookieAct = placeRookieActs.find((a) => a.armorCardId === undefined);
                const armorPlaceActs = placeRookieActs.filter((a) => a.armorCardId !== undefined);
                const addToDpAct = playerLegalActions.find(
                  (a) => a.type === 'addToDp' && a.handIndex === handIndex
                );
                const digivolveAct = playerLegalActions.find(
                  (a) => a.type === 'digivolve' && a.handIndex === handIndex
                );
                const optionActs = playerLegalActions.filter(
                  (a): a is Extract<Action, { type: 'useDigivolveOption' }> =>
                    a.type === 'useDigivolveOption' && a.handIndex === handIndex
                );
                const playSupportAct = playerLegalActions.find(
                  (a) => a.type === 'playSupportFromHand' && a.handIndex === handIndex
                );

                // Check if this card is a valid target for a pending or active digivolve option card
                const asTargetAction = targetedOptionActionsForPending.find(
                  (a) => a.targetHandIndex === handIndex
                );
                const isOptionTarget = Boolean(
                  asTargetAction || (hasActiveOptionModifier && digivolveAct)
                );
                const dimNonOptionTarget =
                  (pendingOptionHandIndex !== null ||
                    (hasActiveOptionModifier && hasDigivolveTargets)) &&
                  !isOptionTarget;

                const hasAnyAction = Boolean(
                  placeRookieActs.length > 0 ||
                    addToDpAct ||
                    digivolveAct ||
                    optionActs.length > 0 ||
                    playSupportAct ||
                    asTargetAction
                );

                return (
                  <div
                    key={`${cardId}-${handIndex}`}
                    className={`ddcb-hand-card ${hasAnyAction ? 'has-legal-action' : ''} ${
                      isOptionTarget ? 'target-highlight' : ''
                    }`}
                    style={dimNonOptionTarget ? { opacity: 0.58 } : undefined}
                  >
                    {/* Card Header & Artwork (Click to Inspect) */}
                    <div
                      className="ddcb-hand-card-top"
                      onClick={() => setInspectedCardId(cardId)}
                      title="Click to inspect full card details"
                    >
                      <div className="ddcb-hand-thumb">
                        <CardArtwork card={card} />
                      </div>

                      <div className="ddcb-hand-card-meta">
                        <div className="ddcb-hand-card-title">
                          #{card?.no} {card?.name ?? `Card #${cardId}`}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <SpecialtyBadge specialty={card?.specialty ?? null} />
                          {card?.level && (
                            <span className="ddcb-mini-badge">Lv. {card.level}</span>
                          )}
                        </div>

                        {card?.kind === 'Digimon' && (
                          <div className="ddcb-hand-stat-badges">
                            <span className="ddcb-mini-badge hp">HP {card.hp}</span>
                            <span className="ddcb-mini-badge dp">DP {card.dp}</span>
                            <span className="ddcb-mini-badge plusp">+{card.plusP}P</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Mini Attacks or Support Preview */}
                    {card?.attacks && (
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 4,
                          marginTop: '0.35rem',
                          padding: '0.2rem 0.4rem',
                          background: 'rgba(5, 10, 24, 0.75)',
                          borderRadius: 5,
                          fontSize: '0.7rem',
                          fontFamily: 'monospace',
                        }}
                      >
                        <span>
                          <AttackSymbolSvg slot="circle" size={12} /> {card.attacks.circle.power}
                        </span>
                        <span>
                          <AttackSymbolSvg slot="triangle" size={12} />{' '}
                          {card.attacks.triangle.power}
                        </span>
                        <span>
                          <AttackSymbolSvg slot="x" size={12} /> {card.attacks.x.power}
                        </span>
                      </div>
                    )}

                    <div className="ddcb-hand-support-preview">
                      <SupportTextWithTokens text={card?.supportText ?? ''} iconSize={12} />
                    </div>

                    {/* Context-Sensitive Action Buttons */}
                    {hasAnyAction && (
                      <div className="ddcb-hand-actions">
                        {/* If currently picking a targetHandIndex for a Digivolve Option */}
                        {pendingOptionHandIndex !== null ? (
                          asTargetAction ? (
                            <button
                              type="button"
                              className="ddcb-action-btn amber"
                              onClick={() => dispatchAction(asTargetAction)}
                            >
                              <Sparkles size={13} />
                              <span>Select as Option Target</span>
                            </button>
                          ) : null
                        ) : (
                          <>
                            {placeRookieActs.length > 0 && (
                              <button
                                type="button"
                                className={`ddcb-action-btn ${
                                  armorPlaceActs.length > 0 ? 'purple' : 'emerald'
                                }`}
                                onClick={() => {
                                  if (armorPlaceActs.length > 0) {
                                    setPendingPartnerHandIndex(handIndex);
                                  } else if (normalRookieAct) {
                                    dispatchAction(normalRookieAct);
                                  } else if (placeRookieActs[0]) {
                                    dispatchAction(placeRookieActs[0]);
                                  }
                                }}
                              >
                                {armorPlaceActs.length > 0 ? (
                                  <>
                                    <Sparkles size={13} />
                                    <span>
                                      Deploy Partner (
                                      {armorPlaceActs.length === 1
                                        ? 'Armor / Rookie'
                                        : `${armorPlaceActs.length} Armor / Rookie`}
                                      )
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <ChevronsUp size={14} />
                                    <span>
                                      {card?.level === 'C'
                                        ? 'Deploy Champion (1/2 Stats)'
                                        : card?.level === 'U'
                                          ? 'Deploy Ultimate (1/4 Stats)'
                                          : 'Deploy Rookie to Arena'}
                                    </span>
                                  </>
                                )}
                              </button>
                            )}

                            {addToDpAct && (
                              <button
                                type="button"
                                className="ddcb-action-btn emerald"
                                onClick={() => dispatchAction(addToDpAct)}
                              >
                                <PlusCircle size={13} />
                                <span>+ Add to DP (+{card?.plusP ?? 0}P)</span>
                              </button>
                            )}

                            {digivolveAct && (() => {
                              const effectiveDpCost = playerState.activeDigivolveModifier?.ignoreDp
                                ? 0
                                : Math.max(
                                    0,
                                    (card?.dp ?? 0) -
                                      (playerState.activeDigivolveModifier?.extraDp ?? 0)
                                  );
                              return (
                                <button
                                  type="button"
                                  className="ddcb-action-btn amber"
                                  onClick={() => dispatchAction(digivolveAct)}
                                >
                                  <ChevronsUp size={14} />
                                  <span>
                                    ▲ {hasActiveOptionModifier ? 'Option Digivolve' : 'Digivolve'}{' '}
                                    (Cost: {effectiveDpCost} DP)
                                  </span>
                                </button>
                              );
                            })()}

                            {optionActs.length > 0 && (
                              <button
                                type="button"
                                className="ddcb-action-btn primary"
                                onClick={() => {
                                  if (
                                    optionActs.length === 1 &&
                                    optionActs[0].targetHandIndex === undefined
                                  ) {
                                    dispatchAction(optionActs[0]);
                                  } else if (optionActs.length === 1) {
                                    dispatchAction(optionActs[0]);
                                  } else {
                                    setPendingOptionHandIndex(handIndex);
                                  }
                                }}
                              >
                                <Zap size={13} />
                                <span>⚡ Use Digivolve Option</span>
                              </button>
                            )}

                            {playSupportAct && (
                              <button
                                type="button"
                                className="ddcb-action-btn primary"
                                onClick={() => dispatchAction(playSupportAct)}
                              >
                                <Zap size={13} />
                                <span>Play as Support</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {playerState.hand.length === 0 && (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    textAlign: 'center',
                    padding: '1.25rem',
                    color: '#64748b',
                    fontSize: '0.84rem',
                  }}
                >
                  Your Hand is currently empty. Cards will be drawn up to 4 at the start of your
                  Draw Phase.
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* ===================================================================
       * 3. MULLIGAN MODAL OVERLAY (During Initial 'mulligan' Phase)
       * =================================================================== */}
      {visibleState.phase === 'mulligan' && (keepMulliganAction || redrawMulliganAction) && (
        <div className="ddcb-modal-backdrop">
          <div className="ddcb-modal-card" style={{ maxWidth: 680 }}>
            <div style={{ textAlign: 'center', marginBottom: '0.9rem' }}>
              <div
                style={{
                  fontSize: '0.76rem',
                  fontWeight: 900,
                  color: '#38bdf8',
                  letterSpacing: '0.1em',
                }}
              >
                INITIAL HAND CHECK — MULLIGAN PHASE
              </div>
              <h3 style={{ margin: '0.25rem 0', fontSize: '1.3rem', fontWeight: 900 }}>
                Review Your Opening 4-Card Hand
              </h3>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#94a3b8' }}>
                Ensure you have a playable Level <strong>R</strong> or <strong>R P</strong> Rookie
                Digimon. You may keep this hand or redraw 4 new cards.
              </p>
            </div>

            <div className="ddcb-pile-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {playerState.hand.map((cid, idx) => {
                const c = getCardById(cid);
                const isRookie = c?.level === 'R' || c?.level === 'R P';
                return (
                  <div
                    key={`${cid}-${idx}`}
                    className="ddcb-pile-card-item"
                    style={{
                      borderColor: isRookie ? '#34d399' : '#335c9e',
                      boxShadow: isRookie ? '0 0 10px rgba(52, 211, 153, 0.3)' : undefined,
                    }}
                    onClick={() => setInspectedCardId(cid)}
                  >
                    <CardArtwork card={c} />
                    <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#f8fafc' }}>
                      #{c?.no} {c?.name}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <SpecialtyBadge specialty={c?.specialty ?? null} />
                      {c?.level && (
                        <span
                          className="ddcb-mini-badge"
                          style={{
                            borderColor: isRookie ? '#34d399' : undefined,
                            color: isRookie ? '#6ee7b7' : undefined,
                          }}
                        >
                          Lv.{c.level}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: '0.85rem',
                marginTop: '1.25rem',
              }}
            >
              {keepMulliganAction && (
                <button
                  type="button"
                  className="ddcb-phase-cta-btn"
                  onClick={() => dispatchAction(keepMulliganAction)}
                >
                  <CheckCircle2 size={16} />
                  <span>Keep Hand</span>
                </button>
              )}
              {redrawMulliganAction && (
                <button
                  type="button"
                  className="ddcb-hud-btn"
                  style={{ padding: '0.5rem 1.1rem', fontSize: '0.84rem' }}
                  onClick={() => dispatchAction(redrawMulliganAction)}
                >
                  <RotateCcw size={16} />
                  <span>Mulligan (Redraw)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
       * 4. MODALS & DRAWERS (Card Detail, Zone Pile, Battle Log, Rules, Game Over)
       * =================================================================== */}
      <CardDetailModal
        cardId={inspectedCardId}
        onClose={() => setInspectedCardId(null)}
      />

      {inspectedZone && (
        <ZoneInspectModal
          title={inspectedZone.title}
          subtitle={inspectedZone.subtitle}
          cardIds={inspectedZone.cardIds}
          onSelectCard={(id) => setInspectedCardId(id)}
          onClose={() => setInspectedZone(null)}
        />
      )}

      {showLogDrawer && (
        <BattleLogDrawer
          logs={battleLogs}
          opponentName={opponentName}
          onClose={() => setShowLogDrawer(false)}
        />
      )}

      {pendingPartnerHandIndex !== null &&
        (() => {
          const effectivePartnerConfig =
            visibleState.config.partnerConfig?.player ?? playerPartnerConfig;
          const partnerCardId = playerState.hand[pendingPartnerHandIndex];
          const partnerCard =
            partnerCardId !== undefined
              ? getEffectiveCardData(partnerCardId, effectivePartnerConfig) ??
                getCardById(partnerCardId)
              : undefined;
          const placeChoices = playerLegalActions.filter(
            (a): a is Extract<Action, { type: 'placeRookie' }> =>
              a.type === 'placeRookie' && a.handIndex === pendingPartnerHandIndex
          );
          const normalChoice = placeChoices.find((a) => a.armorCardId === undefined);
          const armorChoices = placeChoices.filter((a) => a.armorCardId !== undefined);

          if (!partnerCard || placeChoices.length === 0) return null;

          return (
            <div
              className="ddcb-modal-backdrop"
              onClick={() => setPendingPartnerHandIndex(null)}
            >
              <div
                className="ddcb-modal-card"
                style={{ maxWidth: 680, width: '92vw' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    paddingBottom: '0.65rem',
                    marginBottom: '0.85rem',
                    borderBottom: '1px solid #2b4c85',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Sparkles size={20} color="#c084fc" />
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 900 }}>
                        Deploy Partner — #{partnerCard.no} {partnerCard.name}
                      </h3>
                      <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                        Choose to deploy as a Normal Rookie (evolves into {partnerCard.specialty} C / U)
                        or Armor Evolve immediately for 0 DP (keeps DP Slot).
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="ddcb-hud-btn"
                    onClick={() => setPendingPartnerHandIndex(null)}
                  >
                    Cancel
                  </button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                    gap: '0.75rem',
                  }}
                >
                  {normalChoice && (
                    <div
                      style={{
                        border: '1px solid rgba(52, 211, 153, 0.45)',
                        background: 'rgba(15, 23, 42, 0.85)',
                        borderRadius: 10,
                        padding: '0.7rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '0.55rem',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <div style={{ width: 52, height: 64, flexShrink: 0, borderRadius: 6, overflow: 'hidden' }}>
                          <CardArtwork card={partnerCard} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#6ee7b7' }}>
                            Normal Rookie (Lv. R P)
                          </div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                            #{partnerCard.no} {partnerCard.name}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                            <SpecialtyBadge specialty={partnerCard.specialty} />
                            <span className="ddcb-mini-badge hp">HP {partnerCard.hp}</span>
                          </div>
                        </div>
                      </div>
                      {partnerCard.attacks && (
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            padding: '0.25rem 0.5rem',
                            borderRadius: 6,
                            background: 'rgba(5, 10, 24, 0.75)',
                            fontSize: '0.75rem',
                            fontFamily: 'monospace',
                          }}
                        >
                          <span>
                            <AttackSymbolSvg slot="circle" size={12} /> {partnerCard.attacks.circle.power}
                          </span>
                          <span>
                            <AttackSymbolSvg slot="triangle" size={12} /> {partnerCard.attacks.triangle.power}
                          </span>
                          <span>
                            <AttackSymbolSvg slot="x" size={12} /> {partnerCard.attacks.x.power}
                          </span>
                        </div>
                      )}
                      <div style={{ fontSize: '0.74rem', color: '#cbd5e1' }}>
                        Stays Level R P; can Digivolve normally into {partnerCard.specialty} Champion (C) &amp;
                        Ultimate (U) in the Preparation Phase.
                      </div>
                      <button
                        type="button"
                        className="ddcb-action-btn emerald"
                        onClick={() => dispatchAction(normalChoice)}
                      >
                        <ChevronsUp size={14} />
                        <span>Deploy as Normal Rookie</span>
                      </button>
                    </div>
                  )}

                  {armorChoices.map((act) => {
                    const armorCard =
                      act.armorCardId !== undefined
                        ? getEffectiveCardData(act.armorCardId, effectivePartnerConfig) ??
                          getCardById(act.armorCardId)
                        : undefined;
                    if (!armorCard) return null;
                    return (
                      <div
                        key={armorCard.id}
                        style={{
                          border: '1px solid rgba(192, 132, 252, 0.55)',
                          background: 'rgba(24, 16, 46, 0.85)',
                          borderRadius: 10,
                          padding: '0.7rem',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: '0.55rem',
                        }}
                      >
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <div style={{ width: 52, height: 64, flexShrink: 0, borderRadius: 6, overflow: 'hidden' }}>
                            <CardArtwork card={armorCard} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#e9d5ff' }}>
                              ★ Armor Evolution (Lv. A)
                            </div>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                              #{armorCard.no} {armorCard.name}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                              <SpecialtyBadge specialty={armorCard.specialty} />
                              <span className="ddcb-mini-badge hp">HP {armorCard.hp}</span>
                              <span className="ddcb-mini-badge dp">0 DP</span>
                            </div>
                          </div>
                        </div>
                        {armorCard.attacks && (
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              padding: '0.25rem 0.5rem',
                              borderRadius: 6,
                              background: 'rgba(5, 10, 24, 0.75)',
                              fontSize: '0.75rem',
                              fontFamily: 'monospace',
                            }}
                          >
                            <span>
                              <AttackSymbolSvg slot="circle" size={12} /> {armorCard.attacks.circle.power}
                            </span>
                            <span>
                              <AttackSymbolSvg slot="triangle" size={12} /> {armorCard.attacks.triangle.power}
                            </span>
                            <span>
                              <AttackSymbolSvg slot="x" size={12} /> {armorCard.attacks.x.power}
                            </span>
                          </div>
                        )}
                        <div style={{ fontSize: '0.74rem', color: '#cbd5e1' }}>
                          <SupportTextWithTokens text={armorCard.supportText || 'Evolves directly at 0 DP (keeps DP Slot).'} iconSize={12} />
                        </div>
                        <button
                          type="button"
                          className="ddcb-action-btn purple"
                          onClick={() => dispatchAction(act)}
                        >
                          <Sparkles size={13} />
                          <span>Evolve to {armorCard.name} (0 DP)</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

      {showRulesModal && <RulesHelpModal onClose={() => setShowRulesModal(false)} />}

      {showForfeitModal && (
        <ForfeitConfirmModal
          opponentName={opponentName}
          onConfirmForfeit={() => {
            setShowForfeitModal(false);
            onExit('opponent');
          }}
          onCancel={() => setShowForfeitModal(false)}
        />
      )}

      {visibleState.phase === 'gameOver' && (
        <GameOverModal
          winner={visibleState.winner}
          winReason={visibleState.winReason}
          turnNumber={visibleState.turnNumber}
          playerKos={playerState.koCount}
          opponentKos={opponentState.koCount}
          opponentName={opponentName}
          onRematch={handleRematch}
          onExit={onExit}
        />
      )}
    </div>
  );
};

export default BattleScreen;
