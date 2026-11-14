import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  FolderOpen,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react';
import { ALL_CARDS, getCardById, getCardImageUrl } from '../data/cards';
import {
  ALL_BASE_DECKS,
  STARTER_DECKS,
  type BaseDeckDef,
  type DifficultyTier,
} from '../data/opponents';
import {
  analyzeDeck,
  autoCompleteDeck,
  canAddCardToDeck,
  createDeck,
  deleteDeck,
  duplicateDeck,
  exportDeckCode,
  exportDeckJson,
  getMaxCopiesForCard,
  importDeckCode,
  loadBaseDeckIntoSlot,
  loadDeckStore,
  renameDeck,
  selectActiveDeck,
  sortDeckCards,
  updateDeck,
  validateDeck,
  type DeckStoreState,
  type SavedDeck,
} from '../state/deckStore';
import {
  DECK_SIZE,
  type CardData,
  type CardId,
  type Specialty,
} from '../types/game';
import type { BinderLevelFilter, BinderSpecialtyFilter } from './CardBinder';
import { CardDetailModal } from './CardDetailModal';
import {
  CardView,
  ensureDigiviceUiStyles,
  formatXEffectText,
  getLevelDisplayLabel,
  getSpecialtyMeta,
  getUiAssetUrl,
} from './CardView';

export interface DeckBuilderProps {
  /** Optional controlled DeckStoreState from parent App. */
  storeState?: DeckStoreState;
  /** Callback when DeckStoreState is updated. */
  onStoreChange?: (next: DeckStoreState) => void;
  /** Optional legacy/convenience callback when active deck changes. */
  onSelectActiveDeck?: (deckId: string) => void;
  /** Optional legacy/convenience callback when a deck's cards/name change. */
  onUpdateDeck?: (deckId: string, name: string, cards: CardId[]) => void;
}

const CATALOG_SPEC_TABS: Array<{
  id: BinderSpecialtyFilter;
  label: string;
  icon: string;
}> = [
  { id: 'All', label: 'All', icon: 'spec-all.svg' },
  { id: 'Fire', label: 'Fire', icon: 'spec-fire.svg' },
  { id: 'Ice', label: 'Ice', icon: 'spec-ice.svg' },
  { id: 'Nature', label: 'Nature', icon: 'spec-nature.svg' },
  { id: 'Darkness', label: 'Darkness', icon: 'spec-darkness.svg' },
  { id: 'Rare', label: 'Rare', icon: 'spec-rare.svg' },
  { id: 'Partner', label: 'Partner', icon: 'spec-partner.svg' },
  { id: 'Option', label: 'Option', icon: 'spec-option.svg' },
];

export const DeckBuilder: React.FC<DeckBuilderProps> = ({
  storeState: controlledState,
  onStoreChange,
  onSelectActiveDeck,
  onUpdateDeck,
}) => {
  useEffect(() => {
    ensureDigiviceUiStyles();
  }, []);

  const [internalState, setInternalState] = useState<DeckStoreState>(() =>
    loadDeckStore()
  );

  const state = controlledState ?? internalState;

  const commitState = (next: DeckStoreState) => {
    if (!controlledState) {
      setInternalState(next);
    }
    onStoreChange?.(next);
  };

  const [editingDeckId, setEditingDeckId] = useState<string>(state.activeDeckId);

  useEffect(() => {
    if (!state.decks.some((d) => d.id === editingDeckId)) {
      setEditingDeckId(state.activeDeckId);
    }
  }, [state.decks, state.activeDeckId, editingDeckId]);

  const currentDeck: SavedDeck = useMemo(
    () =>
      state.decks.find((d) => d.id === editingDeckId) ??
      state.decks.find((d) => d.id === state.activeDeckId) ??
      state.decks[0],
    [state.decks, editingDeckId, state.activeDeckId]
  );

  const [deckNameDraft, setDeckNameDraft] = useState<string>(currentDeck?.name ?? '');
  useEffect(() => {
    if (currentDeck) {
      setDeckNameDraft(currentDeck.name);
    }
  }, [currentDeck?.id, currentDeck?.name]);

  // Catalog Filters
  const [specFilter, setSpecFilter] = useState<BinderSpecialtyFilter>('All');
  const [levelFilter, setLevelFilter] = useState<BinderLevelFilter>('All');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'no' | 'name' | 'hp' | 'dp' | 'plusP'>('no');
  const [inspectedCard, setInspectedCard] = useState<CardData | null>(null);

  // Modals: Load Base Deck & Import/Export
  const [isBaseDeckModalOpen, setIsBaseDeckModalOpen] = useState(false);
  const [baseDeckTab, setBaseDeckTab] = useState<'starters' | 'all'>('starters');
  const [baseDeckTierFilter, setBaseDeckTierFilter] = useState<'All' | DifficultyTier>('All');
  const [baseDeckSearch, setBaseDeckSearch] = useState('');
  const [selectedBaseDeck, setSelectedBaseDeck] = useState<BaseDeckDef>(
    STARTER_DECKS[0] ?? ALL_BASE_DECKS[0]
  );

  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [importExportText, setImportExportText] = useState('');
  const [importFeedback, setImportFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Auto-Fill specialty preference & Sample Opening Hand Simulator
  const [autoFillSpecialty, setAutoFillSpecialty] = useState<'Auto' | Specialty>('Auto');
  const [isHandSimOpen, setIsHandSimOpen] = useState(false);
  const [simHand, setSimHand] = useState<CardId[]>([]);
  const [simMulliganUsed, setSimMulliganUsed] = useState(false);
  const [simDrawCount, setSimDrawCount] = useState(0);

  // Analytics & Validation for currentDeck
  const validation = useMemo(
    () => validateDeck(currentDeck?.cards ?? []),
    [currentDeck?.cards]
  );
  const analysis = useMemo(
    () => analyzeDeck(currentDeck?.cards ?? []),
    [currentDeck?.cards]
  );

  // Grouped cards in current deck
  const groupedDeckEntries = useMemo(() => {
    const sorted = sortDeckCards(currentDeck?.cards ?? []);
    const map = new Map<CardId, number>();
    for (const id of sorted) {
      map.set(id, (map.get(id) ?? 0) + 1);
    }
    const list: Array<{ card: CardData; count: number }> = [];
    for (const [id, count] of map.entries()) {
      const c = getCardById(id);
      if (c) list.push({ card: c, count });
    }
    return list;
  }, [currentDeck?.cards]);

  // Filtered Catalog Cards
  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = ALL_CARDS.filter((c) => {
      if (specFilter !== 'All') {
        if (specFilter === 'Partner' && !c.isPartner) return false;
        else if (specFilter === 'Option' && c.kind !== 'Option') return false;
        else if (
          specFilter !== 'Partner' &&
          specFilter !== 'Option' &&
          c.specialty !== specFilter
        ) {
          return false;
        }
      }
      if (levelFilter !== 'All') {
        if (levelFilter === 'Option' && c.kind !== 'Option') return false;
        if (levelFilter !== 'Option' && c.level !== levelFilter) return false;
      }
      if (q) {
        const cleanNo = q.replace(/^#/, '');
        const matchNo = c.no.toLowerCase().includes(cleanNo);
        const matchName = c.name.toLowerCase().includes(q);
        const matchSupport = c.supportText.toLowerCase().includes(q);
        const matchX = c.attacks
          ? formatXEffectText(c.attacks.x.effect).toLowerCase().includes(q)
          : false;
        if (!matchNo && !matchName && !matchSupport && !matchX) return false;
      }
      return true;
    });

    return list.slice().sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'hp':
          return b.hp - a.hp || a.id - b.id;
        case 'dp':
          return b.dp - a.dp || a.id - b.id;
        case 'plusP':
          return b.plusP - a.plusP || a.id - b.id;
        default:
          return a.id - b.id;
      }
    });
  }, [specFilter, levelFilter, search, sortBy]);

  // Filtered Base Decks in Modal
  const filteredBaseDecks = useMemo(() => {
    const source = baseDeckTab === 'starters' ? STARTER_DECKS : ALL_BASE_DECKS;
    const q = baseDeckSearch.trim().toLowerCase();
    return source.filter((bd) => {
      if (baseDeckTierFilter !== 'All' && bd.tier !== baseDeckTierFilter) {
        return false;
      }
      if (q) {
        const hay = `${bd.name} ${bd.duelistName} ${bd.colors} ${bd.location ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [baseDeckTab, baseDeckTierFilter, baseDeckSearch]);

  // Deck Mutation Handlers
  const handleUpdateCurrentCards = (nextCards: CardId[], nextName?: string) => {
    if (!currentDeck) return;
    const sorted = sortDeckCards(nextCards);
    const updatedName = nextName ?? currentDeck.name;
    const nextState = updateDeck(state, currentDeck.id, {
      name: updatedName,
      cards: sorted,
    });
    commitState(nextState);
    onUpdateDeck?.(currentDeck.id, updatedName, sorted);
  };

  const handleAddCard = (card: CardData) => {
    if (!currentDeck) return;
    const check = canAddCardToDeck(currentDeck.cards, card.id);
    if (!check.allowed) return;
    handleUpdateCurrentCards([...currentDeck.cards, card.id]);
  };

  const handleRemoveCard = (card: CardData) => {
    if (!currentDeck) return;
    const idx = currentDeck.cards.indexOf(card.id);
    if (idx < 0) return;
    const next = [...currentDeck.cards];
    next.splice(idx, 1);
    handleUpdateCurrentCards(next);
  };

  const handleRenameSubmit = () => {
    if (!currentDeck) return;
    const trimmed = deckNameDraft.trim() || currentDeck.name;
    setDeckNameDraft(trimmed);
    const nextState = renameDeck(state, currentDeck.id, trimmed);
    commitState(nextState);
    onUpdateDeck?.(currentDeck.id, trimmed, currentDeck.cards);
  };

  const handleEquipDeck = (deckId: string) => {
    const nextState = selectActiveDeck(state, deckId);
    commitState(nextState);
    onSelectActiveDeck?.(deckId);
  };

  const handleCreateNewDeck = () => {
    const nextState = createDeck(
      state,
      `Custom Deck ${state.decks.length + 1}`,
      []
    );
    commitState(nextState);
    setEditingDeckId(nextState.activeDeckId);
  };

  const handleDuplicateDeck = () => {
    if (!currentDeck) return;
    const nextState = duplicateDeck(state, currentDeck.id);
    commitState(nextState);
    setEditingDeckId(nextState.activeDeckId);
  };

  const handleDeleteDeck = () => {
    if (!currentDeck || state.decks.length <= 1) return;
    const nextState = deleteDeck(state, currentDeck.id);
    commitState(nextState);
    setEditingDeckId(nextState.activeDeckId);
  };

  const handleAutoFill = (preferredSpecialty?: Specialty) => {
    if (!currentDeck) return;
    const completed = autoCompleteDeck(currentDeck.cards, {
      preferredSpecialty,
    });
    handleUpdateCurrentCards(completed);
  };

  const handleClearDeck = () => {
    if (!currentDeck) return;
    handleUpdateCurrentCards([]);
  };

  const dealSampleHand = (isMulligan: boolean) => {
    const pool = [...(currentDeck?.cards ?? [])];
    if (pool.length < 4) return;
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i]!;
      pool[i] = pool[j]!;
      pool[j] = tmp;
    }
    const hand = pool.slice(0, 4);
    const online = pool.slice(4);
    const isRookie = (id: CardId): boolean => {
      const card = getCardById(id);
      return Boolean(card && card.kind === 'Digimon' && (card.level === 'R' || card.level === 'R P'));
    };
    if (!hand.some(isRookie)) {
      const rookieIdx = online.findIndex(isRookie);
      if (rookieIdx >= 0) {
        const rookieId = online[rookieIdx]!;
        online[rookieIdx] = hand[0]!;
        hand[0] = rookieId;
      }
    }
    setSimHand(hand);
    setSimMulliganUsed(isMulligan);
    setSimDrawCount((c) => (isMulligan ? c : c + 1));
  };

  const handleLoadBaseDeck = (target: 'current' | 'new') => {
    if (!selectedBaseDeck || !currentDeck) return;
    const nextState = loadBaseDeckIntoSlot(
      state,
      target === 'new' ? 'new' : currentDeck.id,
      selectedBaseDeck
    );
    commitState(nextState);
    if (target === 'new') {
      setEditingDeckId(nextState.activeDeckId);
    } else {
      onUpdateDeck?.(currentDeck.id, selectedBaseDeck.name, selectedBaseDeck.cards);
    }
    setIsBaseDeckModalOpen(false);
  };

  const handleOpenImportExport = (initialMode: 'code' | 'json') => {
    if (!currentDeck) return;
    setImportFeedback(null);
    setImportExportText(
      initialMode === 'json'
        ? exportDeckJson(currentDeck)
        : exportDeckCode(currentDeck)
    );
    setIsImportExportOpen(true);
  };

  const handleImportSubmit = (asNewDeck: boolean) => {
    try {
      const parsed = importDeckCode(importExportText, currentDeck?.name || 'Imported Deck');
      if (asNewDeck) {
        const nextState = createDeck(state, parsed.name, sortDeckCards(parsed.cards));
        commitState(nextState);
        setEditingDeckId(nextState.activeDeckId);
      } else if (currentDeck) {
        handleUpdateCurrentCards(parsed.cards, parsed.name);
      }
      setImportFeedback({
        type: 'success',
        message: `Loaded "${parsed.name}" (${parsed.cards.length} cards).${
          parsed.warnings.length > 0 ? ` Note: ${parsed.warnings.join(' ')}` : ''
        }`,
      });
    } catch (err) {
      setImportFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to import deck code.',
      });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Deck Slots Bar */}
      <div className="ddcb-panel" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {state.decks.map((d) => {
              const isEditing = d.id === currentDeck?.id;
              const isActive = d.id === state.activeDeckId;
              const v = validateDeck(d.cards);
              return (
                <button
                  key={d.id}
                  type="button"
                  className={`ddcb-tab-btn ${isEditing ? 'is-active' : ''}`}
                  onClick={() => setEditingDeckId(d.id)}
                  style={{
                    border: isEditing
                      ? '1px solid var(--accent-cyan)'
                      : '1px solid rgba(56, 189, 248, 0.2)',
                  }}
                >
                  {isActive && (
                    <span
                      title="Equipped Active Deck for Battle"
                      style={{ color: '#fbbf24', fontSize: '0.85rem' }}
                    >
                      ★
                    </span>
                  )}
                  <span>{d.name}</span>
                  <span
                    style={{
                      padding: '1px 6px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      background: v.valid
                        ? 'rgba(16, 185, 129, 0.18)'
                        : 'rgba(245, 158, 11, 0.18)',
                      color: v.valid ? '#34d399' : '#fbbf24',
                    }}
                  >
                    {d.cards.length}/{DECK_SIZE}
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              className="ddcb-btn ddcb-btn--sm"
              onClick={handleCreateNewDeck}
              title="Create a new empty deck slot"
            >
              <Plus size={14} />
              <span>New Slot</span>
            </button>
          </div>

          {/* Preset Base Deck Loader + Import/Export */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="ddcb-btn ddcb-btn--amber"
              onClick={() => setIsBaseDeckModalOpen(true)}
            >
              <FolderOpen size={16} />
              <span>Load Base Deck (138 Presets)</span>
            </button>

            <button
              type="button"
              className="ddcb-btn"
              onClick={() => handleOpenImportExport('code')}
            >
              <Upload size={15} />
              <span>Import / Export</span>
            </button>
          </div>
        </div>

        {/* Active Deck Controls & Name Editor */}
        {currentDeck && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
              paddingTop: '10px',
              borderTop: '1px solid rgba(56, 189, 248, 0.16)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 280px' }}>
              <Edit3 size={16} style={{ color: 'var(--accent-cyan)' }} />
              <input
                type="text"
                className="ddcb-input"
                value={deckNameDraft}
                onChange={(e) => setDeckNameDraft(e.target.value)}
                onBlur={handleRenameSubmit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameSubmit();
                }}
                aria-label="Deck Name"
                style={{ fontWeight: 700, maxWidth: '280px', width: '100%' }}
              />
              {currentDeck.id === state.activeDeckId ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '5px 10px',
                    borderRadius: '6px',
                    background: 'rgba(16, 185, 129, 0.16)',
                    border: '1px solid rgba(16, 185, 129, 0.45)',
                    color: '#34d399',
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                  }}
                >
                  ★ EQUIPPED FOR BATTLE
                </span>
              ) : (
                <button
                  type="button"
                  className="ddcb-btn ddcb-btn--primary ddcb-btn--sm"
                  onClick={() => handleEquipDeck(currentDeck.id)}
                >
                  Equip as Active Deck
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <select
                className="ddcb-select"
                style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                value={autoFillSpecialty}
                onChange={(e) => setAutoFillSpecialty(e.target.value as 'Auto' | Specialty)}
                aria-label="Auto-Fill Specialty Preference"
              >
                <option value="Auto">Auto Specialty</option>
                <option value="Fire">Fire</option>
                <option value="Ice">Ice</option>
                <option value="Nature">Nature</option>
                <option value="Darkness">Darkness</option>
                <option value="Rare">Rare</option>
              </select>
              <button
                type="button"
                className="ddcb-btn ddcb-btn--sm"
                onClick={() =>
                  handleAutoFill(autoFillSpecialty === 'Auto' ? undefined : autoFillSpecialty)
                }
                title="Automatically complete deck to 30 cards with balanced curve"
              >
                <Wand2 size={14} />
                <span>Auto-Fill (30)</span>
              </button>
              <button
                type="button"
                className="ddcb-btn ddcb-btn--sm"
                disabled={(currentDeck?.cards.length ?? 0) < 4}
                onClick={() => {
                  dealSampleHand(false);
                  setIsHandSimOpen(true);
                }}
                title="Simulate a 4-card opening draw and Mulligan check"
              >
                <Sparkles size={14} />
                <span>Test Hand (4)</span>
              </button>
              <button
                type="button"
                className="ddcb-btn ddcb-btn--sm"
                onClick={handleDuplicateDeck}
                title="Duplicate this deck into a new slot"
              >
                <Copy size={14} />
                <span>Duplicate</span>
              </button>
              <button
                type="button"
                className="ddcb-btn ddcb-btn--sm ddcb-btn--danger"
                onClick={handleClearDeck}
                disabled={currentDeck.cards.length === 0}
                title="Remove all 30 cards from this deck"
              >
                Clear
              </button>
              {state.decks.length > 1 && (
                <button
                  type="button"
                  className="ddcb-btn ddcb-btn--sm ddcb-btn--danger"
                  onClick={handleDeleteDeck}
                  title="Delete this deck slot"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Telemetry & Validation Strip: Specialty Breakdown, Level Curve, Avg +P */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '12px',
        }}
      >
        {/* Validation Status Box */}
        <div
          className="ddcb-panel"
          style={{
            borderColor: validation.valid
              ? 'rgba(16, 185, 129, 0.45)'
              : 'rgba(245, 158, 11, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {validation.valid ? (
                <CheckCircle2 size={18} style={{ color: '#34d399' }} />
              ) : (
                <AlertTriangle size={18} style={{ color: '#fbbf24' }} />
              )}
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                  fontSize: '1rem',
                  color: validation.valid ? '#34d399' : '#fbbf24',
                }}
              >
                {validation.valid ? 'DECK READY FOR ARENA' : 'DECK INCOMPLETE / INVALID'}
              </span>
            </div>
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.15rem',
                fontWeight: 700,
                color: 'var(--text-primary)',
              }}
            >
              {validation.cardCount} / {DECK_SIZE} Cards
            </span>
          </div>

          {/* Progress Bar */}
          <div
            style={{
              height: '8px',
              borderRadius: '999px',
              background: 'rgba(7, 11, 20, 0.9)',
              overflow: 'hidden',
              border: '1px solid rgba(56, 189, 248, 0.2)',
            }}
          >
            <div
              style={{
                width: `${Math.min(100, (validation.cardCount / DECK_SIZE) * 100)}%`,
                height: '100%',
                background: validation.valid
                  ? 'linear-gradient(90deg, #10b981, #34d399)'
                  : 'linear-gradient(90deg, #f59e0b, #fbbf24)',
                transition: 'width 0.2s ease',
              }}
            />
          </div>

          {validation.errors.length > 0 ? (
            <ul
              style={{
                margin: 0,
                paddingLeft: '18px',
                fontSize: '0.78rem',
                color: '#fca5a5',
              }}
            >
              {validation.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          ) : validation.warnings.length > 0 ? (
            <div style={{ fontSize: '0.78rem', color: '#fde68a' }}>
              {validation.warnings[0]}
            </div>
          ) : (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              All 30-card, max-4 copy, Rookie ({validation.rookieCount}), and Partner (
              {validation.partnerCount}/3) rules satisfied.
            </div>
          )}
        </div>

        {/* Specialty Color Distribution */}
        <div className="ddcb-panel" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.78rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
            }}
          >
            SPECIALTY COLOR BREAKDOWN
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
            {(['Fire', 'Ice', 'Nature', 'Darkness', 'Rare', 'Option'] as const).map((sp) => {
              const meta = getSpecialtyMeta(sp);
              const count = analysis.bySpecialty[sp];
              return (
                <div
                  key={sp}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '6px 4px',
                    borderRadius: '7px',
                    background: 'rgba(7, 11, 20, 0.75)',
                    border: `1px solid ${count > 0 ? meta.borderColor : 'rgba(56, 189, 248, 0.12)'}`,
                    opacity: count > 0 ? 1 : 0.45,
                  }}
                >
                  <img
                    src={meta.iconPath}
                    alt={sp}
                    style={{ width: '16px', height: '16px', marginBottom: '2px' }}
                  />
                  <strong
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1rem',
                      color: meta.color,
                    }}
                  >
                    {count}
                  </strong>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                    {sp === 'Darkness' ? 'Dark' : sp}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Level Curve & Average +P */}
        <div className="ddcb-panel" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontFamily: 'var(--font-display)',
              fontSize: '0.78rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: 'var(--text-secondary)',
              textTransform: 'uppercase',
            }}
          >
            <span>LEVEL CURVE</span>
            <span style={{ color: '#fbbf24' }}>
              AVG +P: +{analysis.avgPlusPDigimon} (Digimon) / +{analysis.avgPlusPAll} (All)
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
            {(
              [
                ['R', 'R'],
                ['R P', 'R P'],
                ['C', 'C'],
                ['A', 'A'],
                ['U', 'U'],
                ['Option', 'OPT'],
              ] as const
            ).map(([lvl, label]) => {
              const count = analysis.byLevel[lvl];
              return (
                <div
                  key={lvl}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '6px 4px',
                    borderRadius: '7px',
                    background: 'rgba(7, 11, 20, 0.75)',
                    border: '1px solid rgba(56, 189, 248, 0.2)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      color: 'var(--accent-cyan)',
                    }}
                  >
                    {label}
                  </span>
                  <strong
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.05rem',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {count}
                  </strong>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Split Workspace: Current 30-Card Deck List (Left) + Card Catalog (Right) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 400px) minmax(0, 1fr)',
          gap: '16px',
          alignItems: 'start',
        }}
      >
        {/* Left Pane: Current Deck List */}
        <div
          className="ddcb-panel"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            position: 'sticky',
            top: '12px',
            maxHeight: 'calc(100vh - 24px)',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingBottom: '8px',
              borderBottom: '1px solid rgba(56, 189, 248, 0.2)',
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.1em',
                  color: 'var(--accent-cyan)',
                }}
              >
                CURRENT DECK LIST
              </div>
              <strong style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem' }}>
                {currentDeck?.name} ({validation.cardCount}/{DECK_SIZE})
              </strong>
            </div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {groupedDeckEntries.length} unique
            </span>
          </div>

          {groupedDeckEntries.length === 0 ? (
            <div
              style={{
                padding: '32px 16px',
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '0.86rem',
                border: '1px dashed rgba(56, 189, 248, 0.22)',
                borderRadius: '8px',
              }}
            >
              Deck is empty. Click cards in the catalog on the right to add them, or use{' '}
              <strong>Load Base Deck</strong> / <strong>Auto-Fill</strong>.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {groupedDeckEntries.map(({ card, count }) => {
                const specMeta = getSpecialtyMeta(card);
                const maxForCard = getMaxCopiesForCard(card);
                const addCheck = canAddCardToDeck(currentDeck.cards, card.id);
                return (
                  <div
                    key={card.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      padding: '6px 8px',
                      borderRadius: '8px',
                      background: 'rgba(7, 11, 20, 0.8)',
                      border: `1px solid ${specMeta.borderColor}`,
                      borderLeft: `4px solid ${specMeta.color}`,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        minWidth: 0,
                        flex: 1,
                        cursor: 'pointer',
                      }}
                      onClick={() => setInspectedCard(card)}
                      title={`Click to inspect #${card.no} ${card.name}`}
                    >
                      <img
                        src={getCardImageUrl(card)}
                        alt={card.name}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '5px',
                          objectFit: 'cover',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                        }}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          <span
                            style={{
                              fontFamily: 'var(--font-display)',
                              fontSize: '0.72rem',
                              color: 'var(--text-secondary)',
                            }}
                          >
                            #{card.no}
                          </span>
                          <strong
                            style={{
                              fontFamily: 'var(--font-display)',
                              fontSize: '0.9rem',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {card.name}
                          </strong>
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '0.7rem',
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <span>{getLevelDisplayLabel(card)}</span>
                          {card.kind === 'Digimon' && (
                            <>
                              <span>• HP {card.hp}</span>
                              <span>• DP {card.dp}</span>
                              <span>• +{card.plusP}P</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-display)',
                          fontWeight: 700,
                          fontSize: '0.88rem',
                          color: count > maxForCard ? '#f87171' : 'var(--accent-cyan-bright)',
                          minWidth: '32px',
                          textAlign: 'center',
                        }}
                      >
                        {count}/{maxForCard}
                      </span>
                      <button
                        type="button"
                        className="ddcb-card__act-btn ddcb-card__act-btn--remove"
                        onClick={() => handleRemoveCard(card)}
                        title={`Remove 1 copy of ${card.name}`}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className="ddcb-card__act-btn ddcb-card__act-btn--add"
                        disabled={!addCheck.allowed}
                        title={addCheck.reason ?? `Add 1 copy of ${card.name}`}
                        onClick={() => handleAddCard(card)}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Pane: Card Catalog Browser */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Catalog Filter Header */}
          <div className="ddcb-panel" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="ddcb-tab-bar">
              {CATALOG_SPEC_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`ddcb-tab-btn ${specFilter === t.id ? 'is-active' : ''}`}
                  onClick={() => setSpecFilter(t.id)}
                >
                  <img
                    src={getUiAssetUrl(t.icon)}
                    alt=""
                    style={{ width: '14px', height: '14px' }}
                  />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: '1 1 220px' }}>
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
                  placeholder="Search catalog by name, #000, support text, or X-effect..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                className="ddcb-select"
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value as BinderLevelFilter)}
                aria-label="Filter Catalog by Level"
              >
                <option value="All">All Levels</option>
                <option value="R">Level R (Rookie)</option>
                <option value="C">Level C (Champion)</option>
                <option value="U">Level U (Ultimate)</option>
                <option value="A">Level A (Armor)</option>
                <option value="R P">Level R P (Partner)</option>
                <option value="Option">Option Cards</option>
              </select>

              <select
                className="ddcb-select"
                value={sortBy}
                onChange={(e) =>
                  setSortBy(e.target.value as 'no' | 'name' | 'hp' | 'dp' | 'plusP')
                }
                aria-label="Sort Catalog"
              >
                <option value="no">Sort: No. (#000)</option>
                <option value="name">Sort: Name</option>
                <option value="hp">Sort: HP</option>
                <option value="dp">Sort: DP Cost</option>
                <option value="plusP">Sort: +P Value</option>
              </select>
            </div>
          </div>

          {/* Catalog Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(235px, 1fr))',
              gap: '10px',
            }}
          >
            {filteredCatalog.map((card) => {
              const inDeckCount = validation.copyCounts[card.id] ?? 0;
              const maxAllowed = getMaxCopiesForCard(card);
              const addCheck = canAddCardToDeck(currentDeck?.cards ?? [], card.id);
              return (
                <CardView
                  key={card.id}
                  card={card}
                  size="compact"
                  showSupport
                  countBadge={`${inDeckCount}/${maxAllowed}`}
                  selected={inDeckCount > 0}
                  lockedReason={!addCheck.allowed ? addCheck.reason : null}
                  onClick={() => {
                    if (addCheck.allowed) {
                      handleAddCard(card);
                    } else {
                      setInspectedCard(card);
                    }
                  }}
                  onInspect={(c) => setInspectedCard(c)}
                  onAdd={addCheck.allowed ? () => handleAddCard(card) : undefined}
                  onRemove={inDeckCount > 0 ? () => handleRemoveCard(card) : undefined}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Modal 1: Load Base Deck (Browse all 138 GameFAQs Decks or 26 Starter Decks) */}
      {isBaseDeckModalOpen && (
        <div
          className="ddcb-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Load Base Deck"
          onClick={() => setIsBaseDeckModalOpen(false)}
        >
          <div
            className="ddcb-modal-dialog"
            style={{ maxWidth: '940px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
                paddingBottom: '10px',
                borderBottom: '1px solid rgba(56, 189, 248, 0.25)',
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    color: 'var(--accent-amber-bright)',
                  }}
                >
                  CANONICAL PRESET ARCHIVE // 138 GAMEFAQS BASE DECKS
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.35rem', margin: 0 }}>
                  Load Canonical Base Deck or Starter Preset
                </h3>
              </div>
              <button
                type="button"
                className="ddcb-btn ddcb-btn--sm"
                onClick={() => setIsBaseDeckModalOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            {/* Filter controls for Base Decks */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                marginBottom: '14px',
              }}
            >
              <div className="ddcb-tab-bar">
                <button
                  type="button"
                  className={`ddcb-tab-btn ${baseDeckTab === 'starters' ? 'is-active' : ''}`}
                  onClick={() => setBaseDeckTab('starters')}
                >
                  Starter / Gift Decks ({STARTER_DECKS.length})
                </button>
                <button
                  type="button"
                  className={`ddcb-tab-btn ${baseDeckTab === 'all' ? 'is-active' : ''}`}
                  onClick={() => setBaseDeckTab('all')}
                >
                  All GameFAQs Base Decks ({ALL_BASE_DECKS.length})
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 280px' }}>
                <input
                  type="text"
                  className="ddcb-input"
                  style={{ flex: 1 }}
                  placeholder="Search by deck name, duelist, location, or colors..."
                  value={baseDeckSearch}
                  onChange={(e) => setBaseDeckSearch(e.target.value)}
                />
                <select
                  className="ddcb-select"
                  value={baseDeckTierFilter}
                  onChange={(e) =>
                    setBaseDeckTierFilter(e.target.value as 'All' | DifficultyTier)
                  }
                >
                  <option value="All">All Tiers</option>
                  <option value="Easy">Easy</option>
                  <option value="Normal">Normal</option>
                  <option value="Hard">Hard</option>
                  <option value="Expert">Expert</option>
                </select>
              </div>
            </div>

            {/* Split List + Preview */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(260px, 1fr) minmax(300px, 1.2fr)',
                gap: '14px',
                maxHeight: '58vh',
              }}
            >
              {/* Deck List */}
              <div
                style={{
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  paddingRight: '4px',
                }}
              >
                {filteredBaseDecks.map((bd) => {
                  const isSel = selectedBaseDeck?.id === bd.id;
                  const repCard = getCardById(bd.representativeCardId);
                  return (
                    <button
                      key={bd.id}
                      type="button"
                      onClick={() => setSelectedBaseDeck(bd)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        background: isSel
                          ? 'rgba(56, 189, 248, 0.18)'
                          : 'rgba(7, 11, 20, 0.75)',
                        border: isSel
                          ? '1px solid var(--accent-cyan)'
                          : '1px solid rgba(56, 189, 248, 0.16)',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      {repCard && (
                        <img
                          src={getCardImageUrl(repCard)}
                          alt=""
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '6px',
                            objectFit: 'cover',
                          }}
                        />
                      )}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontWeight: 700,
                            fontSize: '0.94rem',
                            color: 'var(--text-primary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {bd.name}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                          {bd.duelistName} • {bd.colors}
                        </div>
                      </div>
                      <span className="ddcb-badge ddcb-badge--level">{bd.tier}</span>
                    </button>
                  );
                })}
              </div>

              {/* Selected Base Deck Preview */}
              {selectedBaseDeck && (
                <div
                  style={{
                    overflowY: 'auto',
                    background: 'rgba(5, 10, 20, 0.8)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    borderRadius: '10px',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div>
                    <h4
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: '1.15rem',
                        margin: 0,
                        color: 'var(--accent-cyan-bright)',
                      }}
                    >
                      {selectedBaseDeck.name}
                    </h4>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Duelist: <strong>{selectedBaseDeck.duelistName}</strong> • Colors:{' '}
                      <strong>{selectedBaseDeck.colors}</strong>
                    </div>
                    {selectedBaseDeck.note && (
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: '#fde68a',
                          marginTop: '4px',
                        }}
                      >
                        Note: {selectedBaseDeck.note}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(135px, 1fr))',
                      gap: '6px',
                    }}
                  >
                    {selectedBaseDeck.entries.map((entry) => {
                      const c = getCardById(entry.cardId);
                      if (!c) return null;
                      return (
                        <div
                          key={entry.cardId}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '5px 7px',
                            borderRadius: '6px',
                            background: 'rgba(17, 28, 50, 0.75)',
                            border: '1px solid rgba(56, 189, 248, 0.16)',
                            fontSize: '0.76rem',
                          }}
                        >
                          <strong style={{ color: 'var(--accent-cyan)' }}>
                            {entry.count}×
                          </strong>
                          <span
                            style={{
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                            title={`#${c.no} ${c.name}`}
                          >
                            {c.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div
                    style={{
                      marginTop: 'auto',
                      paddingTop: '10px',
                      display: 'flex',
                      gap: '8px',
                      justifyContent: 'flex-end',
                      flexWrap: 'wrap',
                    }}
                  >
                    <button
                      type="button"
                      className="ddcb-btn"
                      onClick={() => handleLoadBaseDeck('new')}
                    >
                      <Plus size={15} />
                      <span>Load as New Deck Slot</span>
                    </button>
                    <button
                      type="button"
                      className="ddcb-btn ddcb-btn--primary"
                      onClick={() => handleLoadBaseDeck('current')}
                    >
                      <Sparkles size={15} />
                      <span>Overwrite "{currentDeck?.name}"</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Import / Export Deck Code or JSON */}
      {isImportExportOpen && (
        <div
          className="ddcb-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Import or Export Deck"
          onClick={() => setIsImportExportOpen(false)}
        >
          <div
            className="ddcb-modal-dialog"
            style={{ maxWidth: '620px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
              }}
            >
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', margin: 0 }}>
                Import / Export Deck Code & JSON
              </h3>
              <button
                type="button"
                className="ddcb-btn ddcb-btn--sm"
                onClick={() => setIsImportExportOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="ddcb-btn ddcb-btn--sm"
                onClick={() =>
                  currentDeck && setImportExportText(exportDeckCode(currentDeck))
                }
              >
                <Download size={14} />
                <span>Show Compact Code (DDCB1)</span>
              </button>
              <button
                type="button"
                className="ddcb-btn ddcb-btn--sm"
                onClick={() =>
                  currentDeck && setImportExportText(exportDeckJson(currentDeck))
                }
              >
                <Download size={14} />
                <span>Show Full JSON</span>
              </button>
              <button
                type="button"
                className="ddcb-btn ddcb-btn--sm"
                onClick={() => {
                  navigator.clipboard?.writeText(importExportText);
                  setImportFeedback({
                    type: 'success',
                    message: 'Copied to clipboard!',
                  });
                }}
              >
                <Copy size={14} />
                <span>Copy Text</span>
              </button>
            </div>

            <textarea
              className="ddcb-input"
              rows={8}
              style={{
                width: '100%',
                fontFamily: 'monospace',
                fontSize: '0.82rem',
                resize: 'vertical',
              }}
              value={importExportText}
              onChange={(e) => setImportExportText(e.target.value)}
              placeholder="Paste a DDCB1:... code, JSON deck, or plain-text card list (e.g. '4 Agumon')..."
            />

            {importFeedback && (
              <div
                style={{
                  marginTop: '8px',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  fontSize: '0.82rem',
                  background:
                    importFeedback.type === 'success'
                      ? 'rgba(16, 185, 129, 0.16)'
                      : 'rgba(239, 68, 68, 0.16)',
                  color: importFeedback.type === 'success' ? '#34d399' : '#fca5a5',
                }}
              >
                {importFeedback.message}
              </div>
            )}

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                marginTop: '12px',
              }}
            >
              <button
                type="button"
                className="ddcb-btn"
                onClick={() => handleImportSubmit(true)}
              >
                Import as New Deck Slot
              </button>
              <button
                type="button"
                className="ddcb-btn ddcb-btn--primary"
                onClick={() => handleImportSubmit(false)}
              >
                Import into Current Deck
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Sample Opening Hand Simulator */}
      {isHandSimOpen && (() => {
        const simCards = simHand
          .map((id) => getCardById(id))
          .filter((c): c is CardData => Boolean(c));
        const rookieCount = simCards.filter(
          (c) => c.kind === 'Digimon' && (c.level === 'R' || c.level === 'R P')
        ).length;
        const champArmorCount = simCards.filter(
          (c) => c.kind === 'Digimon' && (c.level === 'C' || c.level === 'A')
        ).length;
        const ultimateCount = simCards.filter(
          (c) => c.kind === 'Digimon' && c.level === 'U'
        ).length;
        const optionCount = simCards.filter((c) => c.kind === 'Option').length;
        const maxPlusP = simCards.reduce(
          (max, c) => (c.kind === 'Digimon' ? Math.max(max, c.plusP) : max),
          0
        );
        return (
          <div
            className="ddcb-modal-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Sample Opening Hand Simulator"
            onClick={() => setIsHandSimOpen(false)}
          >
            <div
              className="ddcb-modal-dialog"
              style={{ maxWidth: '880px' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '12px',
                  paddingBottom: '10px',
                  borderBottom: '1px solid rgba(56, 189, 248, 0.25)',
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      color: 'var(--accent-cyan)',
                    }}
                  >
                    OPENING HAND SIMULATOR // TEST #{simDrawCount}
                    {simMulliganUsed ? ' (MULLIGAN)' : ''}
                  </div>
                  <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', margin: 0 }}>
                    {currentDeck?.name} — 4-Card Opening Draw
                  </h3>
                </div>
                <button
                  type="button"
                  className="ddcb-btn ddcb-btn--sm"
                  onClick={() => setIsHandSimOpen(false)}
                >
                  <X size={16} />
                </button>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flexWrap: 'wrap',
                  marginBottom: '14px',
                  fontSize: '0.78rem',
                }}
              >
                <span className="ddcb-badge ddcb-badge--level">Rookies (R/R P): {rookieCount}</span>
                <span className="ddcb-badge ddcb-badge--level">Champ/Armor (C/A): {champArmorCount}</span>
                <span className="ddcb-badge ddcb-badge--level">Ultimate (U): {ultimateCount}</span>
                <span className="ddcb-badge ddcb-badge--spec spec-option">Options: {optionCount}</span>
                <span className="ddcb-badge" style={{ color: '#34d399', borderColor: 'rgba(16, 185, 129, 0.4)' }}>
                  Max +P in Hand: +{maxPlusP}P
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '10px',
                  marginBottom: '16px',
                }}
              >
                {simCards.map((card, idx) => (
                  <CardView
                    key={`${card.id}-${idx}`}
                    card={card}
                    size="compact"
                    showSupport
                    onClick={() => setInspectedCard(card)}
                    onInspect={(c) => setInspectedCard(c)}
                  />
                ))}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  className="ddcb-btn ddcb-btn--amber"
                  disabled={simMulliganUsed}
                  onClick={() => dealSampleHand(true)}
                >
                  <span>Simulate Mulligan (Redraw 4)</span>
                </button>
                <button
                  type="button"
                  className="ddcb-btn ddcb-btn--primary"
                  onClick={() => dealSampleHand(false)}
                >
                  <Sparkles size={15} />
                  <span>Deal New Opening Hand</span>
                </button>
                <button
                  type="button"
                  className="ddcb-btn"
                  onClick={() => setIsHandSimOpen(false)}
                >
                  <span>Close</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Card Inspector Modal */}
      {inspectedCard && (
        <CardDetailModal
          card={inspectedCard}
          isOpen={Boolean(inspectedCard)}
          mode="modal"
          onClose={() => setInspectedCard(null)}
          onSelectCard={(c) => setInspectedCard(c)}
          deckCount={validation.copyCounts[inspectedCard.id] ?? 0}
          canAddToDeck={canAddCardToDeck(currentDeck?.cards ?? [], inspectedCard.id).allowed}
          addDisabledReason={canAddCardToDeck(currentDeck?.cards ?? [], inspectedCard.id).reason}
          onAddToDeck={(c) => handleAddCard(c)}
          onRemoveFromDeck={(c) => handleRemoveCard(c)}
        />
      )}
    </div>
  );
};
