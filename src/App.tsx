import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  HelpCircle,
  Layers,
  RotateCcw,
  Shield,
  Swords,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { chooseAiAction } from './ai';
import { soundEngine } from './audio/soundEngine';
import { BattleScreen } from './components/BattleScreen';
import { CardBinder } from './components/CardBinder';
import { ensureDigiviceUiStyles, getUiAssetUrl } from './components/CardView';
import { DeckBuilder } from './components/DeckBuilder';
import { OpponentSelect } from './components/OpponentSelect';
import { RulesHelpModal } from './components/battle/BattleField';
import { ALL_CARDS } from './data/cards';
import { OPPONENTS, type AiDifficultyLevel, type OpponentDef } from './data/opponents';
import { engine as baseEngine } from './engine';
import {
  canAddCardToDeck,
  getActiveDeck,
  loadDeckStore,
  recordMatchResult,
  resetDeckStore,
  sortDeckCards,
  updateDeck,
  validateDeck,
  type DeckStoreState,
  type SavedDeck,
} from './state/deckStore';
import {
  DECK_SIZE,
  type Action,
  type CardData,
  type CreateMatchParams,
  type EngineApi,
  type GameEvent,
  type MatchState,
  type PlayerSide,
} from './types/game';

export type NavTab = 'arena' | 'deckbuilder' | 'codex';

interface ActiveMatchSession {
  opponent: OpponentDef;
  aiDifficulty: AiDifficultyLevel;
  playerDeck: SavedDeck;
}

export const App: React.FC = () => {
  useEffect(() => {
    ensureDigiviceUiStyles();
  }, []);

  const [storeState, setStoreState] = useState<DeckStoreState>(() => loadDeckStore());
  const [activeTab, setActiveTab] = useState<NavTab>('arena');
  const [activeMatch, setActiveMatch] = useState<ActiveMatchSession | null>(null);
  const [muted, setMuted] = useState<boolean>(() => soundEngine.isMuted());
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Track whether the current match instance has already recorded its W/L/D outcome
  const matchResultRecordedRef = useRef<boolean>(false);
  const activeMatchRef = useRef<ActiveMatchSession | null>(null);
  activeMatchRef.current = activeMatch;

  useEffect(() => {
    if (!toastMessage) return;
    const timer = window.setTimeout(() => setToastMessage(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const activeDeck = useMemo(() => getActiveDeck(storeState), [storeState]);
  const activeDeckValidation = useMemo(
    () => validateDeck(activeDeck.cards),
    [activeDeck.cards]
  );

  const commitOutcome = useCallback(
    (opponentId: string, winner: PlayerSide | 'draw') => {
      if (matchResultRecordedRef.current) return;
      matchResultRecordedRef.current = true;
      const outcome: 'win' | 'loss' | 'draw' =
        winner === 'player' ? 'win' : winner === 'opponent' ? 'loss' : 'draw';
      setStoreState((prev) => recordMatchResult(prev, opponentId, outcome));
    },
    []
  );

  // Sound-aware & stats-aware EngineApi wrapper for BattleScreen
  const soundAwareEngine: EngineApi = useMemo(
    () => ({
      createMatch(params: CreateMatchParams): MatchState {
        matchResultRecordedRef.current = false;
        const state = baseEngine.createMatch(params);
        soundEngine.playCardDraw();
        return state;
      },
      getLegalActions(state: MatchState, side: PlayerSide): Action[] {
        return baseEngine.getLegalActions(state, side);
      },
      applyAction(prevState: MatchState, action: Action): MatchState {
        const nextState = baseEngine.applyAction(prevState, action);

        let newEvents: GameEvent[] = [];
        if (
          nextState.events.length >= prevState.events.length &&
          prevState.events.every((e, idx) => nextState.events[idx] === e)
        ) {
          newEvents = nextState.events.slice(prevState.events.length);
        } else {
          newEvents = nextState.events;
        }

        soundEngine.playEvents(newEvents);

        if (
          (nextState.phase === 'gameOver' || nextState.winner !== null) &&
          nextState.winner &&
          activeMatchRef.current
        ) {
          commitOutcome(activeMatchRef.current.opponent.id, nextState.winner);
        }

        return nextState;
      },
      getVisibleState(state: MatchState, viewer: PlayerSide) {
        return baseEngine.getVisibleState(state, viewer);
      },
    }),
    [commitOutcome]
  );

  const handleStartMatch = useCallback(
    (opponent: OpponentDef, aiDifficulty: AiDifficultyLevel, playerDeck: SavedDeck) => {
      soundEngine.playAttackSelect();
      matchResultRecordedRef.current = false;
      setActiveMatch({
        opponent,
        aiDifficulty,
        playerDeck,
      });
    },
    []
  );

  const handleExitMatch = useCallback(
    (winner: PlayerSide | 'draw' | null) => {
      soundEngine.playClick();
      if (activeMatch && winner && !matchResultRecordedRef.current) {
        commitOutcome(activeMatch.opponent.id, winner);
      }
      setActiveMatch(null);
    },
    [activeMatch, commitOutcome]
  );

  const handleAddCardFromCodex = useCallback(
    (card: CardData) => {
      const check = canAddCardToDeck(activeDeck.cards, card.id);
      if (!check.allowed) {
        soundEngine.playVoidJam();
        setToastMessage(`Cannot add ${card.name}: ${check.reason}`);
        return;
      }
      soundEngine.playDpCharge();
      const nextCards = sortDeckCards([...activeDeck.cards, card.id]);
      setStoreState((prev) =>
        updateDeck(prev, activeDeck.id, {
          cards: nextCards,
        })
      );
      setToastMessage(
        `Added #${card.no} ${card.name} to "${activeDeck.name}" (${nextCards.length}/${DECK_SIZE})`
      );
    },
    [activeDeck]
  );

  const handleConfirmResetData = useCallback(() => {
    soundEngine.playVoidJam();
    const fresh = resetDeckStore();
    setStoreState(fresh);
    setShowResetModal(false);
    setToastMessage('Save data & battle records reset to default starter decks.');
  }, []);

  return (
    <div className="ddcb-app">
      {/* Top Cyber-Digital Digivice Navigation Header */}
      <header className="ddcb-header">
        <div
          className="ddcb-brand"
          style={{ cursor: activeMatch ? 'default' : 'pointer' }}
          onClick={() => {
            if (!activeMatch) {
              soundEngine.playClick();
              setActiveTab('arena');
            }
          }}
        >
          <div className="ddcb-brand__crest">
            <img
              src={getUiAssetUrl('digivice.svg')}
              alt="Digivice"
              className="ddcb-brand__logo"
            />
          </div>
          <div>
            <h1 className="ddcb-brand__title">Digimon Digital Card Battle</h1>
            <p className="ddcb-brand__sub">
              PS1 Cyber-Arena Edition • {ALL_CARDS.length} Cards • {OPPONENTS.length} Duelists
            </p>
          </div>
        </div>

        {/* Navigation Tabs (Hidden during active match to prevent accidental exit) */}
        {!activeMatch ? (
          <nav className="ddcb-nav" aria-label="Primary Navigation">
            <button
              type="button"
              className={`ddcb-nav__tab ${activeTab === 'arena' ? 'is-active' : ''}`}
              onClick={() => {
                soundEngine.playClick();
                setActiveTab('arena');
              }}
            >
              <Swords size={16} />
              <span>Battle Arena</span>
              <span className="ddcb-nav__count">{OPPONENTS.length}</span>
            </button>

            <button
              type="button"
              className={`ddcb-nav__tab ${activeTab === 'deckbuilder' ? 'is-active' : ''}`}
              onClick={() => {
                soundEngine.playClick();
                setActiveTab('deckbuilder');
              }}
            >
              <Layers size={16} />
              <span>Deck Builder</span>
              <span className="ddcb-nav__count">
                {activeDeck.cards.length}/{DECK_SIZE}
              </span>
            </button>

            <button
              type="button"
              className={`ddcb-nav__tab ${activeTab === 'codex' ? 'is-active' : ''}`}
              onClick={() => {
                soundEngine.playClick();
                setActiveTab('codex');
              }}
            >
              <BookOpen size={16} />
              <span>Card Codex</span>
              <span className="ddcb-nav__count">{ALL_CARDS.length}</span>
            </button>
          </nav>
        ) : (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '999px',
              background: 'rgba(244, 63, 94, 0.16)',
              border: '1px solid rgba(251, 113, 133, 0.45)',
              fontFamily: 'var(--font-display)',
              fontSize: '0.88rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              color: '#fda4af',
            }}
          >
            <Swords size={15} />
            <span>
              LIVE DUEL VS. <strong>{activeMatch.opponent.name.toUpperCase()}</strong>
            </span>
          </div>
        )}

        {/* Right HUD Telemetry & Utility Controls */}
        <div className="ddcb-hud-controls">
          {!activeMatch && (
            <button
              type="button"
              className="ddcb-deck-pill"
              onClick={() => {
                soundEngine.playClick();
                setActiveTab('deckbuilder');
              }}
              title="Equipped Active Deck (Click to open in Deck Builder)"
            >
              <Shield
                size={14}
                color={activeDeckValidation.valid ? '#34d399' : '#fbbf24'}
              />
              <span>
                Deck: <strong>{activeDeck.name}</strong>
              </span>
              <span
                style={{
                  padding: '1px 6px',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  background: activeDeckValidation.valid
                    ? 'rgba(16, 185, 129, 0.18)'
                    : 'rgba(245, 158, 11, 0.2)',
                  color: activeDeckValidation.valid ? '#34d399' : '#fbbf24',
                }}
              >
                {activeDeck.cards.length}/{DECK_SIZE}
              </span>
            </button>
          )}

          <div
            className="ddcb-record-badge"
            title={`Battle Record: ${storeState.stats.totalWins} Wins, ${storeState.stats.totalLosses} Losses, ${storeState.stats.totalDraws} Draws`}
          >
            <Trophy size={14} color="#fbbf24" />
            <span>
              <strong style={{ color: '#34d399' }}>{storeState.stats.totalWins}W</strong>
              {' - '}
              <strong style={{ color: '#f87171' }}>{storeState.stats.totalLosses}L</strong>
              {storeState.stats.totalDraws > 0 && ` - ${storeState.stats.totalDraws}D`}
            </span>
          </div>

          <button
            type="button"
            className="ddcb-icon-btn"
            onClick={() => {
              soundEngine.playClick();
              setShowRulesModal(true);
            }}
            title="How to Play & PS1 Battle Rules Guide"
            aria-label="How to Play & PS1 Battle Rules Guide"
          >
            <HelpCircle size={15} />
            <span>Rules</span>
          </button>

          <button
            type="button"
            className="ddcb-icon-btn"
            onClick={() => setMuted(soundEngine.toggleMute())}
            title={muted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
            aria-label={muted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
          >
            {muted ? <VolumeX size={16} color="#f87171" /> : <Volume2 size={16} color="#38bdf8" />}
          </button>

          {!activeMatch && (
            <button
              type="button"
              className="ddcb-icon-btn ddcb-icon-btn--danger"
              onClick={() => {
                soundEngine.playClick();
                setShowResetModal(true);
              }}
              title="Reset Save Data & Decks"
              aria-label="Reset Save Data & Decks"
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
      </header>

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 250,
            padding: '10px 16px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #0f2447 0%, #071124 100%)',
            border: '1px solid var(--accent-cyan)',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.75), 0 0 18px rgba(56, 189, 248, 0.35)',
            fontFamily: 'var(--font-display)',
            fontSize: '0.9rem',
            fontWeight: 700,
            color: '#f0f7ff',
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* Main Content Stage */}
      <main className={`ddcb-main ${activeMatch ? 'ddcb-main--battle' : ''}`}>
        {activeMatch ? (
          <BattleScreen
            playerDeck={activeMatch.playerDeck.cards}
            opponentDeck={activeMatch.opponent.cards}
            opponentName={activeMatch.opponent.name}
            opponentDeckName={activeMatch.opponent.deckName}
            opponentAvatarCardId={activeMatch.opponent.representativeCardId}
            aiDifficulty={activeMatch.aiDifficulty}
            engine={soundAwareEngine}
            chooseAiAction={chooseAiAction}
            onExit={handleExitMatch}
          />
        ) : activeTab === 'arena' ? (
          <OpponentSelect
            storeState={storeState}
            onStoreChange={setStoreState}
            onStartMatch={handleStartMatch}
            onOpenDeckBuilder={() => {
              soundEngine.playClick();
              setActiveTab('deckbuilder');
            }}
          />
        ) : activeTab === 'deckbuilder' ? (
          <DeckBuilder
            storeState={storeState}
            onStoreChange={setStoreState}
          />
        ) : (
          <CardBinder onAddCardToDeck={handleAddCardFromCodex} />
        )}
      </main>

      {/* Global How to Play / Rules Modal */}
      {showRulesModal && (
        <RulesHelpModal onClose={() => setShowRulesModal(false)} />
      )}

      {/* Reset Save Data Confirmation Modal */}
      {showResetModal && (
        <div
          className="ddcb-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Reset Save Data Confirmation"
          onClick={() => setShowResetModal(false)}
        >
          <div
            className="ddcb-modal-dialog"
            style={{ maxWidth: '460px', textAlign: 'center' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.35rem',
                fontWeight: 700,
                color: '#f87171',
                marginBottom: '8px',
              }}
            >
              Reset Digivice Save Data?
            </h3>
            <p
              style={{
                fontSize: '0.88rem',
                color: 'var(--text-secondary)',
                marginBottom: '18px',
                lineHeight: 1.5,
              }}
            >
              This will restore your saved decks to the 5 default Starter Decks and reset your
              overall Battle Arena win/loss statistics. All 301 cards and 138 preset decks remain
              unlocked.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
              <button
                type="button"
                className="ddcb-btn"
                onClick={() => setShowResetModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ddcb-btn ddcb-btn--danger"
                onClick={handleConfirmResetData}
              >
                Reset Save Data
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
