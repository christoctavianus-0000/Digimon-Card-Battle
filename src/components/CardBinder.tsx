import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ, BookOpen, Grid, List, Search, X } from 'lucide-react';
import { ALL_CARDS, getCardImageUrl } from '../data/cards';
import type { CardData, Level, Specialty } from '../types/game';
import { CardDetailModal } from './CardDetailModal';
import {
  CardView,
  XEffectBadge,
  ensureDigiviceUiStyles,
  formatSupportTextWithIcons,
  formatXEffectText,
  getLevelDisplayLabel,
  getSpecialtyMeta,
  getUiAssetUrl,
} from './CardView';

export type BinderSpecialtyFilter =
  | 'All'
  | Specialty
  | 'Option'
  | 'Partner';

export type BinderLevelFilter = 'All' | Level | 'Option';

export type BinderSortKey =
  | 'no'
  | 'name'
  | 'hp'
  | 'dp'
  | 'plusP'
  | 'circle'
  | 'triangle'
  | 'x';

export interface CardBinderProps {
  /** Optional callback when user wants to add a card to their active deck from the binder. */
  onAddCardToDeck?: (card: CardData) => void;
}

const SPECIALTY_TABS: Array<{
  id: BinderSpecialtyFilter;
  label: string;
  icon: string;
}> = [
  { id: 'All', label: 'All Cards', icon: 'spec-all.svg' },
  { id: 'Fire', label: 'Fire', icon: 'spec-fire.svg' },
  { id: 'Ice', label: 'Ice', icon: 'spec-ice.svg' },
  { id: 'Nature', label: 'Nature', icon: 'spec-nature.svg' },
  { id: 'Darkness', label: 'Darkness', icon: 'spec-darkness.svg' },
  { id: 'Rare', label: 'Rare', icon: 'spec-rare.svg' },
  { id: 'Partner', label: 'Partner / Armor', icon: 'spec-partner.svg' },
  { id: 'Option', label: 'Option', icon: 'spec-option.svg' },
];

const LEVEL_FILTERS: Array<{ id: BinderLevelFilter; label: string }> = [
  { id: 'All', label: 'All Levels' },
  { id: 'R', label: 'R — Rookie' },
  { id: 'C', label: 'C — Champion' },
  { id: 'U', label: 'U — Ultimate' },
  { id: 'A', label: 'A — Armor' },
  { id: 'R P', label: 'R P — Partner' },
  { id: 'Option', label: 'Option' },
];

const SORT_OPTIONS: Array<{ id: BinderSortKey; label: string }> = [
  { id: 'no', label: 'Card No. (#000)' },
  { id: 'name', label: 'Name (A–Z)' },
  { id: 'hp', label: 'HP' },
  { id: 'dp', label: 'DP Cost' },
  { id: 'plusP', label: '+P Value' },
  { id: 'circle', label: '○ Circle Power' },
  { id: 'triangle', label: '△ Triangle Power' },
  { id: 'x', label: '✕ Cross Power' },
];

function matchesSpecialtyFilter(
  card: CardData,
  filter: BinderSpecialtyFilter
): boolean {
  if (filter === 'All') return true;
  if (filter === 'Partner') return card.isPartner;
  if (filter === 'Option') return card.kind === 'Option';
  return card.specialty === filter;
}

function matchesLevelFilter(card: CardData, filter: BinderLevelFilter): boolean {
  if (filter === 'All') return true;
  if (filter === 'Option') return card.kind === 'Option';
  return card.level === filter;
}

function matchesCardSearch(card: CardData, rawQuery: string): boolean {
  if (!rawQuery) return true;
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;

  const cleanNo = q.replace(/^#/, '');
  if (card.no.toLowerCase().includes(cleanNo) || String(card.id) === cleanNo) {
    return true;
  }
  if (card.name.toLowerCase().includes(q)) return true;
  if (card.supportText.toLowerCase().includes(q)) return true;

  if (card.attacks) {
    const atkNames = `${card.attacks.circle.name} ${card.attacks.triangle.name} ${card.attacks.x.name}`.toLowerCase();
    if (atkNames.includes(q)) return true;
    const xFx = formatXEffectText(card.attacks.x.effect).toLowerCase();
    if (xFx.includes(q)) return true;
  }

  return false;
}

function getCardSortValue(card: CardData, key: BinderSortKey): number | string {
  switch (key) {
    case 'no':
      return card.id;
    case 'name':
      return card.name.toLowerCase();
    case 'hp':
      return card.kind === 'Digimon' ? card.hp : -1;
    case 'dp':
      return card.kind === 'Digimon' ? card.dp : -1;
    case 'plusP':
      return card.kind === 'Digimon' ? card.plusP : -1;
    case 'circle':
      return card.attacks ? card.attacks.circle.power : -1;
    case 'triangle':
      return card.attacks ? card.attacks.triangle.power : -1;
    case 'x':
      return card.attacks ? card.attacks.x.power : -1;
  }
}

export const CardBinder: React.FC<CardBinderProps> = ({ onAddCardToDeck }) => {
  useEffect(() => {
    ensureDigiviceUiStyles();
  }, []);

  const [specFilter, setSpecFilter] = useState<BinderSpecialtyFilter>('All');
  const [levelFilter, setLevelFilter] = useState<BinderLevelFilter>('All');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<BinderSortKey>('no');
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [inspectedCard, setInspectedCard] = useState<CardData | null>(null);

  const tabCounts = useMemo(() => {
    const counts: Record<BinderSpecialtyFilter, number> = {
      All: ALL_CARDS.length,
      Fire: 0,
      Ice: 0,
      Nature: 0,
      Darkness: 0,
      Rare: 0,
      Partner: 0,
      Option: 0,
    };
    for (const c of ALL_CARDS) {
      if (c.isPartner) counts.Partner += 1;
      if (c.kind === 'Option') counts.Option += 1;
      else if (c.specialty) counts[c.specialty] += 1;
    }
    return counts;
  }, []);

  const filteredAndSortedCards = useMemo(() => {
    const filtered = ALL_CARDS.filter(
      (c) =>
        matchesSpecialtyFilter(c, specFilter) &&
        matchesLevelFilter(c, levelFilter) &&
        matchesCardSearch(c, search)
    );

    return filtered.slice().sort((a, b) => {
      const va = getCardSortValue(a, sortKey);
      const vb = getCardSortValue(b, sortKey);
      let cmp = 0;
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb));
      }
      if (cmp === 0) cmp = a.id - b.id;
      return cmp * sortDir;
    });
  }, [specFilter, levelFilter, search, sortKey, sortDir]);

  const handleColumnSort = (key: BinderSortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(key === 'no' || key === 'name' ? 1 : -1);
    }
  };

  const digimonCount = useMemo(
    () => ALL_CARDS.filter((c) => c.kind === 'Digimon').length,
    []
  );
  const optionCount = useMemo(
    () => ALL_CARDS.filter((c) => c.kind === 'Option').length,
    []
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Telemetry Header */}
      <div
        className="ddcb-panel"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'rgba(56, 189, 248, 0.14)',
              border: '1px solid rgba(56, 189, 248, 0.38)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-cyan)',
            }}
          >
            <BookOpen size={22} />
          </div>
          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '0.72rem',
                fontWeight: 700,
                letterSpacing: '0.14em',
                color: 'var(--accent-cyan)',
                textTransform: 'uppercase',
              }}
            >
              DIGIVICE CARD CODEX // COMPLETE ARCHIVE
            </div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.4rem',
                fontWeight: 700,
                letterSpacing: '0.03em',
                margin: 0,
              }}
            >
              Card Binder — {ALL_CARDS.length} / {ALL_CARDS.length} Cards Unlocked
            </h2>
          </div>
        </div>

        {/* Summary Metric Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div
            style={{
              padding: '5px 12px',
              borderRadius: '7px',
              background: 'rgba(7, 11, 20, 0.85)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderLeft: '3px solid #38bdf8',
              fontFamily: 'var(--font-display)',
              fontSize: '0.84rem',
            }}
          >
            <span style={{ color: 'var(--text-secondary)', marginRight: '6px' }}>SHOWING</span>
            <strong>{filteredAndSortedCards.length}</strong> / {ALL_CARDS.length}
          </div>
          <div
            style={{
              padding: '5px 12px',
              borderRadius: '7px',
              background: 'rgba(7, 11, 20, 0.85)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderLeft: '3px solid #ef4444',
              fontFamily: 'var(--font-display)',
              fontSize: '0.84rem',
            }}
          >
            <span style={{ color: 'var(--text-secondary)', marginRight: '6px' }}>DIGIMON</span>
            <strong>{digimonCount}</strong>
          </div>
          <div
            style={{
              padding: '5px 12px',
              borderRadius: '7px',
              background: 'rgba(7, 11, 20, 0.85)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderLeft: '3px solid #eab308',
              fontFamily: 'var(--font-display)',
              fontSize: '0.84rem',
            }}
          >
            <span style={{ color: 'var(--text-secondary)', marginRight: '6px' }}>OPTIONS</span>
            <strong>{optionCount}</strong>
          </div>
        </div>
      </div>

      {/* Specialty Category Tabs */}
      <div className="ddcb-tab-bar" role="tablist" aria-label="Filter by Specialty">
        {SPECIALTY_TABS.map((tab) => {
          const active = specFilter === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`ddcb-tab-btn ${active ? 'is-active' : ''}`}
              onClick={() => setSpecFilter(tab.id)}
            >
              <img
                src={getUiAssetUrl(tab.icon)}
                alt=""
                style={{ width: '15px', height: '15px' }}
              />
              <span>{tab.label}</span>
              <span
                style={{
                  padding: '1px 6px',
                  borderRadius: '4px',
                  background: 'rgba(56, 189, 248, 0.14)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  color: 'var(--accent-cyan)',
                  fontSize: '0.72rem',
                }}
              >
                {tabCounts[tab.id]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search, Level Filter, Sort & View Mode Controls */}
      <div
        className="ddcb-panel"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          padding: '12px 14px',
        }}
      >
        {/* Search Input */}
        <div
          style={{
            position: 'relative',
            flex: '1 1 260px',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '11px',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            className="ddcb-input"
            style={{ width: '100%', paddingLeft: '34px', paddingRight: '30px' }}
            placeholder="Search #000–#300, Digimon/Option name, Support text, or X-effect (e.g. Counter, Jamming, Crash)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search cards"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              style={{
                position: 'absolute',
                right: '8px',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Level Filter Pills / Select */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <select
            className="ddcb-select"
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value as BinderLevelFilter)}
            aria-label="Filter by Level"
          >
            {LEVEL_FILTERS.map((lf) => (
              <option key={lf.id} value={lf.id}>
                {lf.label}
              </option>
            ))}
          </select>

          {/* Sort Select */}
          <select
            className="ddcb-select"
            value={sortKey}
            onChange={(e) => {
              const nextKey = e.target.value as BinderSortKey;
              setSortKey(nextKey);
              setSortDir(nextKey === 'no' || nextKey === 'name' ? 1 : -1);
            }}
            aria-label="Sort cards by"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                Sort: {opt.label}
              </option>
            ))}
          </select>

          {/* Sort Direction */}
          <button
            type="button"
            className="ddcb-btn"
            onClick={() => setSortDir((prev) => (prev === 1 ? -1 : 1))}
            title={sortDir === 1 ? 'Ascending' : 'Descending'}
          >
            {sortDir === 1 ? <ArrowUpAZ size={16} /> : <ArrowDownAZ size={16} />}
            <span>{sortDir === 1 ? 'ASC' : 'DESC'}</span>
          </button>

          {/* Grid vs Table Toggle */}
          <div
            style={{
              display: 'inline-flex',
              borderRadius: '8px',
              overflow: 'hidden',
              border: '1px solid rgba(56, 189, 248, 0.32)',
            }}
          >
            <button
              type="button"
              className={`ddcb-btn ddcb-btn--sm ${viewMode === 'grid' ? 'ddcb-btn--primary' : ''}`}
              style={{ borderRadius: 0, border: 'none' }}
              onClick={() => setViewMode('grid')}
              title="Grid View"
            >
              <Grid size={15} />
              <span>Grid</span>
            </button>
            <button
              type="button"
              className={`ddcb-btn ddcb-btn--sm ${viewMode === 'table' ? 'ddcb-btn--primary' : ''}`}
              style={{ borderRadius: 0, border: 'none' }}
              onClick={() => setViewMode('table')}
              title="Table View"
            >
              <List size={15} />
              <span>Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredAndSortedCards.length === 0 ? (
        <div
          className="ddcb-panel"
          style={{
            textAlign: 'center',
            padding: '48px 20px',
            color: 'var(--text-secondary)',
          }}
        >
          <p style={{ fontSize: '1.05rem', marginBottom: '12px' }}>
            No cards match your current filters.
          </p>
          <button
            type="button"
            className="ddcb-btn"
            onClick={() => {
              setSpecFilter('All');
              setLevelFilter('All');
              setSearch('');
            }}
          >
            Reset Filters
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(265px, 1fr))',
            gap: '12px',
          }}
        >
          {filteredAndSortedCards.map((card) => (
            <CardView
              key={card.id}
              card={card}
              size="full"
              selected={inspectedCard?.id === card.id}
              onClick={(c) => setInspectedCard(c)}
              onAdd={onAddCardToDeck ? (c) => onAddCardToDeck(c) : undefined}
            />
          ))}
        </div>
      ) : (
        /* Table View (Digimon Wiki / Codex Matrix Table) */
        <div className="ddcb-table-wrap">
          <table className="ddcb-table">
            <thead>
              <tr>
                {(
                  [
                    ['no', 'No.'],
                    ['name', 'Card'],
                  ] as const
                ).map(([k, label]) => (
                  <th
                    key={k}
                    onClick={() => handleColumnSort(k)}
                    style={{ cursor: 'pointer' }}
                  >
                    {label} {sortKey === k ? (sortDir === 1 ? '▲' : '▼') : ''}
                  </th>
                ))}
                <th>Level</th>
                <th>Specialty</th>
                {(
                  [
                    ['hp', 'HP'],
                    ['dp', 'DP'],
                    ['plusP', '+P'],
                    ['circle', '○ Circle'],
                    ['triangle', '△ Triangle'],
                    ['x', '✕ Cross'],
                  ] as const
                ).map(([k, label]) => (
                  <th
                    key={k}
                    onClick={() => handleColumnSort(k)}
                    style={{ cursor: 'pointer' }}
                  >
                    {label} {sortKey === k ? (sortDir === 1 ? '▲' : '▼') : ''}
                  </th>
                ))}
                <th>Support / Option Effect</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedCards.map((card) => {
                const specMeta = getSpecialtyMeta(card);
                return (
                  <tr
                    key={card.id}
                    className={inspectedCard?.id === card.id ? 'is-selected' : ''}
                    onClick={() => setInspectedCard(card)}
                  >
                    <td
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 700,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      #{card.no}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <img
                          src={getCardImageUrl(card)}
                          alt={card.name}
                          style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '6px',
                            objectFit: 'cover',
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                            background: '#050a14',
                          }}
                          loading="lazy"
                        />
                        <strong
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '0.96rem',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {card.name}
                        </strong>
                      </div>
                    </td>
                    <td>
                      <span className="ddcb-badge ddcb-badge--level">
                        {getLevelDisplayLabel(card)}
                      </span>
                    </td>
                    <td>
                      <span className={`ddcb-badge ddcb-badge--spec spec-${specMeta.key}`}>
                        <img src={specMeta.iconPath} alt="" className="ddcb-badge__icon" />
                        <span>{specMeta.label}</span>
                      </span>
                    </td>
                    <td>{card.kind === 'Digimon' ? card.hp : '—'}</td>
                    <td>{card.kind === 'Digimon' ? card.dp : '—'}</td>
                    <td>{card.kind === 'Digimon' ? `+${card.plusP}` : '—'}</td>
                    <td>
                      {card.attacks ? (
                        <span>
                          {card.attacks.circle.name}{' '}
                          <strong style={{ color: 'var(--accent-cyan)' }}>
                            ({card.attacks.circle.power})
                          </strong>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {card.attacks ? (
                        <span>
                          {card.attacks.triangle.name}{' '}
                          <strong style={{ color: 'var(--accent-cyan)' }}>
                            ({card.attacks.triangle.power})
                          </strong>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {card.attacks ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                          <span>
                            {card.attacks.x.name}{' '}
                            <strong style={{ color: 'var(--accent-cyan)' }}>
                              ({card.attacks.x.power})
                            </strong>
                          </span>
                          {card.attacks.x.effect && (
                            <XEffectBadge effect={card.attacks.x.effect} compact />
                          )}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ maxWidth: '280px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                      {formatSupportTextWithIcons(card.supportText, 13)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {inspectedCard && (
        <CardDetailModal
          card={inspectedCard}
          isOpen={Boolean(inspectedCard)}
          mode="modal"
          onClose={() => setInspectedCard(null)}
          onSelectCard={(c) => setInspectedCard(c)}
          onAddToDeck={onAddCardToDeck}
        />
      )}
    </div>
  );
};
