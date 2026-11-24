import React, { useEffect, useMemo, useState } from 'react';
import { Check, Cpu, RotateCcw, Search, Shield, Sparkles, X } from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { getCardById } from '../data/cards';
import {
  ALL_DIGI_PARTS,
  MAX_EQUIPPED_DIGI_PARTS,
  PARTNER_CARD_IDS,
  getDigiPartById,
  getEffectiveCardData,
  type DigiPartCategory,
  type DigiPartDef,
} from '../data/digiParts';
import { ARMOR_LINEAGE } from '../engine';
import {
  equipDigiPartToPartner,
  resetPartnerConfigs,
  updatePartnerConfig,
  type DeckStoreState,
} from '../state/deckStore';
import type { CardId } from '../types/game';
import {
  XEffectBadge,
  ensureDigiviceUiStyles,
  getSpecialtyMeta,
} from './CardView';
import {
  AttackSymbolSvg,
  CardArtwork,
  SpecialtyBadge,
  SupportTextWithTokens,
} from './battle/BattleField';

export interface PartnerEditorProps {
  storeState: DeckStoreState;
  onStoreChange: (next: DeckStoreState) => void;
}

const CATEGORY_TABS: Array<{ id: 'all' | DigiPartCategory; label: string }> = [
  { id: 'all', label: 'All (128)' },
  { id: 'hp', label: '[HP+]' },
  { id: 'allAtk', label: '[All Up]' },
  { id: 'slotAtk', label: '[○/△/✕ Atk]' },
  { id: 'xEffect', label: '[Effect]' },
  { id: 'dp', label: '[DP]' },
  { id: 'support', label: '[Sup Effect]' },
  { id: 'special', label: '[S Effect]' },
];

const renderStatDelta = (modified: number, base: number, suffix = '') => {
  const diff = modified - base;
  if (diff === 0) return null;
  const color = diff > 0 ? '#34d399' : '#f87171';
  return (
    <span style={{ fontSize: '0.74rem', fontWeight: 800, color, marginLeft: 4 }}>
      ({diff > 0 ? `+${diff}` : diff}
      {suffix})
    </span>
  );
};

export const PartnerEditor: React.FC<PartnerEditorProps> = ({
  storeState,
  onStoreChange,
}) => {
  useEffect(() => {
    ensureDigiviceUiStyles();
  }, []);

  const [selectedPartnerId, setSelectedPartnerId] = useState<CardId>(PARTNER_CARD_IDS[0]!);
  const [categoryFilter, setCategoryFilter] = useState<'all' | DigiPartCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const custom = storeState.partnerConfigs[selectedPartnerId] ?? {
    equippedParts: [],
    selectedArmorCardId: ARMOR_LINEAGE[selectedPartnerId]![0]!,
  };

  const basePartner = useMemo(() => getCardById(selectedPartnerId)!, [selectedPartnerId]);
  const effPartner = useMemo(
    () => getEffectiveCardData(selectedPartnerId, storeState.partnerConfigs) ?? basePartner,
    [selectedPartnerId, storeState.partnerConfigs, basePartner]
  );

  const armorIds = useMemo(() => ARMOR_LINEAGE[selectedPartnerId] ?? [], [selectedPartnerId]);

  const equippedPartDefs = useMemo(
    () =>
      custom.equippedParts
        .map((id) => getDigiPartById(id))
        .filter((p): p is DigiPartDef => Boolean(p)),
    [custom.equippedParts]
  );

  const filteredParts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return ALL_DIGI_PARTS.filter((part) => {
      if (categoryFilter !== 'all' && part.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        part.no.includes(q) ||
        part.tag.toLowerCase().includes(q) ||
        part.name.toLowerCase().includes(q) ||
        part.description.toLowerCase().includes(q)
      );
    });
  }, [categoryFilter, searchQuery]);

  const handleEquipToggle = (partId: number) => {
    const isEquipped = custom.equippedParts.includes(partId);
    const next = equipDigiPartToPartner(storeState, selectedPartnerId, partId);
    if (next === storeState) {
      soundEngine.playVoidJam();
      return;
    }
    if (isEquipped) {
      soundEngine.playClick();
    } else {
      soundEngine.playDpCharge();
    }
    onStoreChange(next);
  };

  const handleSelectArmor = (armorCardId: CardId) => {
    soundEngine.playArmorDigivolve();
    onStoreChange(
      updatePartnerConfig(storeState, selectedPartnerId, {
        selectedArmorCardId: armorCardId,
      })
    );
  };

  const handleClearPartnerParts = () => {
    soundEngine.playClick();
    onStoreChange(
      updatePartnerConfig(storeState, selectedPartnerId, {
        equippedParts: [],
      })
    );
  };

  const handleResetAll = () => {
    soundEngine.playVoidJam();
    onStoreChange(resetPartnerConfigs(storeState));
  };

  const specMeta = getSpecialtyMeta(basePartner);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Header Banner */}
      <div
        className="ddcb-panel"
        style={{
          padding: '16px 20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          border: '1px solid rgba(192, 132, 252, 0.38)',
          background:
            'linear-gradient(135deg, rgba(24, 16, 48, 0.92) 0%, rgba(10, 19, 40, 0.94) 100%)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={20} color="#c084fc" />
            <h2
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: '1.25rem',
                fontWeight: 800,
                color: '#f5f3ff',
              }}
            >
              Partner Studio — Digi-Parts &amp; Armor Selection
            </h2>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: '#cbd5e1' }}>
            Equip up to <strong>3 Digi-Parts</strong> per Partner Rookie (<strong>R P</strong>) card
            to customize its HP, Attack Powers, +P, X-Effect, or Support Effect, and choose which{' '}
            <strong>Armor (A)</strong> card (fixed printed stats) enters battle when you Armor
            Evolve.
          </p>
        </div>

        <button
          type="button"
          className="ddcb-btn ddcb-btn--sm ddcb-btn--danger"
          onClick={handleResetAll}
          title="Reset Digi-Parts & Armor selections for all 6 Partners"
        >
          <RotateCcw size={14} />
          <span>Reset All Partners</span>
        </button>
      </div>

      {/* Partner Selection Strip (All 6 Canonical Partner Cards) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
          gap: '10px',
        }}
      >
        {PARTNER_CARD_IDS.map((pid) => {
          const card = getCardById(pid);
          if (!card) return null;
          const pCfg = storeState.partnerConfigs[pid];
          const activeArmor = pCfg ? getCardById(pCfg.selectedArmorCardId) : undefined;
          const equippedCount = pCfg?.equippedParts.length ?? 0;
          const isSelected = pid === selectedPartnerId;
          const armorCount = (ARMOR_LINEAGE[pid] ?? []).length;

          return (
            <button
              key={pid}
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setSelectedPartnerId(pid);
              }}
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                padding: '10px 12px',
                borderRadius: '10px',
                border: isSelected
                  ? '2px solid #c084fc'
                  : '1px solid rgba(71, 85, 105, 0.55)',
                background: isSelected
                  ? 'linear-gradient(135deg, rgba(88, 28, 135, 0.45), rgba(15, 23, 42, 0.92))'
                  : 'rgba(15, 23, 42, 0.78)',
                color: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                transition:
                  'border-color 160ms ease, background-color 160ms ease, transform 160ms cubic-bezier(0.23, 1, 0.32, 1)',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 54,
                  borderRadius: 6,
                  overflow: 'hidden',
                  flexShrink: 0,
                  border: '1px solid rgba(148, 163, 184, 0.35)',
                }}
              >
                <CardArtwork card={card} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: '0.88rem',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  #{card.no} {card.name}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>
                  Parts: <strong style={{ color: '#38bdf8' }}>{equippedCount}/3</strong> •{' '}
                  {armorCount} Armor
                </div>
                {activeArmor && (
                  <div
                    style={{
                      fontSize: '0.72rem',
                      color: '#e9d5ff',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      marginTop: 2,
                    }}
                  >
                    ★ {activeArmor.name}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Two-Column Editor Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 430px) minmax(0, 1fr)',
          gap: '16px',
          alignItems: 'start',
        }}
      >
        {/* LEFT COLUMN: Live Partner Card + Armor Evolution Picker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Active Partner Preview Card */}
          <div
            className="ddcb-panel"
            style={{
              padding: '16px',
              border: `1px solid ${specMeta.borderColor ?? 'rgba(56, 189, 248, 0.4)'}`,
            }}
          >
            <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 96,
                  height: 118,
                  borderRadius: 10,
                  overflow: 'hidden',
                  flexShrink: 0,
                  border: '1px solid rgba(148, 163, 184, 0.45)',
                }}
              >
                <CardArtwork card={effPartner} />
              </div>

              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.76rem', color: '#94a3b8', fontWeight: 700 }}>
                    #{effPartner.no}
                  </span>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900 }}>
                    {effPartner.name}
                  </h3>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <SpecialtyBadge specialty={effPartner.specialty} />
                  <span className="ddcb-mini-badge">Lv. R P</span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: '6px',
                    marginTop: '10px',
                  }}
                >
                  <div
                    style={{
                      padding: '6px 8px',
                      borderRadius: 6,
                      background: 'rgba(15, 23, 42, 0.85)',
                      border: '1px solid rgba(52, 211, 153, 0.35)',
                      fontSize: '0.8rem',
                    }}
                  >
                    <span style={{ color: '#94a3b8', fontSize: '0.7rem', display: 'block' }}>
                      HP
                    </span>
                    <strong style={{ color: '#34d399', fontSize: '0.96rem' }}>
                      {effPartner.hp}
                    </strong>
                    {renderStatDelta(effPartner.hp, basePartner.hp)}
                  </div>

                  <div
                    style={{
                      padding: '6px 8px',
                      borderRadius: 6,
                      background: 'rgba(15, 23, 42, 0.85)',
                      border: '1px solid rgba(251, 191, 36, 0.35)',
                      fontSize: '0.8rem',
                    }}
                  >
                    <span style={{ color: '#94a3b8', fontSize: '0.7rem', display: 'block' }}>
                      DP VALUE (+P)
                    </span>
                    <strong style={{ color: '#fbbf24', fontSize: '0.96rem' }}>
                      +{effPartner.plusP}
                    </strong>
                    {renderStatDelta(effPartner.plusP, basePartner.plusP)}
                  </div>
                </div>
              </div>
            </div>

            {/* Modified Attacks Breakdown */}
            {effPartner.attacks && basePartner.attacks && (
              <div
                style={{
                  marginTop: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                {(['circle', 'triangle', 'x'] as const).map((slot) => {
                  const effAtk = effPartner.attacks![slot];
                  const baseAtk = basePartner.attacks![slot];
                  return (
                    <div
                      key={slot}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        padding: '6px 10px',
                        borderRadius: 7,
                        background: 'rgba(5, 10, 24, 0.78)',
                        border: '1px solid rgba(51, 65, 85, 0.6)',
                        fontSize: '0.8rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <AttackSymbolSvg slot={slot} size={16} />
                        <span
                          style={{
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {effAtk.name}
                        </span>
                        {slot === 'x' && effAtk.effect && (
                          <XEffectBadge effect={effAtk.effect} />
                        )}
                      </div>
                      <div style={{ fontFamily: 'monospace', fontWeight: 800, flexShrink: 0 }}>
                        {effAtk.power}
                        {renderStatDelta(effAtk.power, baseAtk.power)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Modified Support Effect Preview */}
            <div
              style={{
                marginTop: '10px',
                padding: '8px 10px',
                borderRadius: 7,
                background: 'rgba(15, 23, 42, 0.85)',
                border: '1px solid rgba(56, 189, 248, 0.28)',
                fontSize: '0.8rem',
              }}
            >
              <div
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 800,
                  color: '#38bdf8',
                  textTransform: 'uppercase',
                  marginBottom: 3,
                }}
              >
                Battle Support Effect
                {effPartner.supportText !== basePartner.supportText ? ' (Digi-Part Override)' : ''}
              </div>
              <div style={{ color: '#e2e8f0' }}>
                <SupportTextWithTokens
                  text={effPartner.supportText || 'None'}
                  iconSize={13}
                />
              </div>
            </div>
          </div>

          {/* Battle Armor Evolution Selection */}
          <div
            className="ddcb-panel"
            style={{
              padding: '16px',
              border: '1px solid rgba(192, 132, 252, 0.35)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Shield size={16} color="#c084fc" />
                <span style={{ fontWeight: 800, fontSize: '0.94rem', color: '#e9d5ff' }}>
                  In-Battle Armor Evolution ({armorIds.length} Forms)
                </span>
              </div>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>0 DP • Keeps DP Slot</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {armorIds.map((armorId) => {
                const armorCard = getCardById(armorId);
                if (!armorCard) return null;
                const isSelectedArmor = custom.selectedArmorCardId === armorId;

                return (
                  <button
                    key={armorId}
                    type="button"
                    onClick={() => handleSelectArmor(armorId)}
                    style={{
                      textAlign: 'left',
                      cursor: 'pointer',
                      padding: '10px',
                      borderRadius: 9,
                      border: isSelectedArmor
                        ? '2px solid #c084fc'
                        : '1px solid rgba(71, 85, 105, 0.6)',
                      background: isSelectedArmor
                        ? 'rgba(88, 28, 135, 0.36)'
                        : 'rgba(15, 23, 42, 0.78)',
                      color: '#f8fafc',
                      display: 'flex',
                      gap: '10px',
                      alignItems: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: 52,
                        height: 64,
                        borderRadius: 6,
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}
                    >
                      <CardArtwork card={armorCard} />
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 6,
                        }}
                      >
                        <strong style={{ fontSize: '0.88rem' }}>
                          #{armorCard.no} {armorCard.name}
                        </strong>
                        {isSelectedArmor && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '2px 7px',
                              borderRadius: 999,
                              fontSize: '0.68rem',
                              fontWeight: 800,
                              background: 'rgba(192, 132, 252, 0.25)',
                              color: '#e9d5ff',
                            }}
                          >
                            <Check size={11} /> Selected
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          marginTop: 4,
                          flexWrap: 'wrap',
                        }}
                      >
                        <SpecialtyBadge specialty={armorCard.specialty} />
                        <span className="ddcb-mini-badge hp">HP {armorCard.hp}</span>
                      </div>
                      {armorCard.attacks && (
                        <div
                          style={{
                            display: 'flex',
                            gap: 10,
                            marginTop: 5,
                            fontSize: '0.73rem',
                            fontFamily: 'monospace',
                            color: '#cbd5e1',
                          }}
                        >
                          <span>
                            <AttackSymbolSvg slot="circle" size={11} />{' '}
                            {armorCard.attacks.circle.power}
                          </span>
                          <span>
                            <AttackSymbolSvg slot="triangle" size={11} />{' '}
                            {armorCard.attacks.triangle.power}
                          </span>
                          <span>
                            <AttackSymbolSvg slot="x" size={11} /> {armorCard.attacks.x.power}
                          </span>
                        </div>
                      )}
                      {armorCard.attacks?.x.effect && (
                        <div style={{ marginTop: 4 }}>
                          <XEffectBadge effect={armorCard.attacks.x.effect} />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: 3 Equipped Digi-Parts Slots + Full 128 Digi-Parts Catalog */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* 3 Equipped Slots Panel */}
          <div className="ddcb-panel" style={{ padding: '16px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Cpu size={16} color="#38bdf8" />
                <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                  Equipped Digi-Parts ({equippedPartDefs.length} / {MAX_EQUIPPED_DIGI_PARTS})
                </span>
              </div>
              {equippedPartDefs.length > 0 && (
                <button
                  type="button"
                  className="ddcb-btn ddcb-btn--sm"
                  onClick={handleClearPartnerParts}
                >
                  Clear All 3 Slots
                </button>
              )}
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: '10px',
              }}
            >
              {[0, 1, 2].map((slotIdx) => {
                const part = equippedPartDefs[slotIdx];
                if (!part) {
                  return (
                    <div
                      key={slotIdx}
                      style={{
                        padding: '12px',
                        borderRadius: 9,
                        border: '1px dashed rgba(100, 116, 139, 0.55)',
                        background: 'rgba(15, 23, 42, 0.45)',
                        color: '#64748b',
                        fontSize: '0.78rem',
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        minHeight: 82,
                      }}
                    >
                      <strong style={{ color: '#94a3b8' }}>Slot {slotIdx + 1}</strong>
                      <span>Empty — Select a Digi-Part below</span>
                    </div>
                  );
                }

                return (
                  <div
                    key={part.id}
                    style={{
                      padding: '10px',
                      borderRadius: 9,
                      border: '1px solid rgba(56, 189, 248, 0.55)',
                      background: 'rgba(14, 30, 62, 0.85)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 6,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6,
                      }}
                    >
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 800,
                          color: '#38bdf8',
                        }}
                      >
                        #{part.no} {part.tag}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleEquipToggle(part.id)}
                        title="Unequip Digi-Part"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#f87171',
                          cursor: 'pointer',
                          padding: 2,
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#f8fafc' }}>
                      <SupportTextWithTokens text={part.name} iconSize={12} />
                    </div>
                    <div style={{ fontSize: '0.71rem', color: '#cbd5e1', lineHeight: 1.35 }}>
                      <SupportTextWithTokens text={part.description} iconSize={11} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 128 Digi-Parts Stock Browser */}
          <div className="ddcb-panel" style={{ padding: '16px' }}>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                marginBottom: '10px',
              }}
            >
              <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>
                Digi-Parts Stock (#000–#127)
              </div>
              <div style={{ position: 'relative', minWidth: 220, flex: '1 1 220px', maxWidth: 320 }}>
                <Search
                  size={14}
                  style={{
                    position: 'absolute',
                    left: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#94a3b8',
                  }}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search Digi-Parts (#, name, effect)..."
                  style={{
                    width: '100%',
                    padding: '6px 10px 6px 30px',
                    borderRadius: 7,
                    border: '1px solid rgba(71, 85, 105, 0.7)',
                    background: 'rgba(15, 23, 42, 0.9)',
                    color: '#f8fafc',
                    fontSize: '0.8rem',
                  }}
                />
              </div>
            </div>

            {/* Category Filter Pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '12px' }}>
              {CATEGORY_TABS.map((tab) => {
                const active = categoryFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      soundEngine.playClick();
                      setCategoryFilter(tab.id);
                    }}
                    className={`ddcb-btn ddcb-btn--sm ${active ? 'ddcb-btn--primary' : ''}`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Parts Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(235px, 1fr))',
                gap: '8px',
                maxHeight: '560px',
                overflowY: 'auto',
                paddingRight: '4px',
              }}
            >
              {filteredParts.map((part) => {
                const isEquipped = custom.equippedParts.includes(part.id);
                const replacesExclusive =
                  !isEquipped &&
                  (part.category === 'xEffect' || part.category === 'support') &&
                  custom.equippedParts.some((id) => getDigiPartById(id)?.category === part.category);
                const isBlockedFull =
                  !isEquipped &&
                  !replacesExclusive &&
                  custom.equippedParts.length >= MAX_EQUIPPED_DIGI_PARTS;

                return (
                  <div
                    key={part.id}
                    style={{
                      padding: '10px',
                      borderRadius: 8,
                      border: isEquipped
                        ? '1px solid #38bdf8'
                        : '1px solid rgba(51, 65, 85, 0.7)',
                      background: isEquipped
                        ? 'rgba(14, 42, 78, 0.78)'
                        : 'rgba(15, 23, 42, 0.72)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '6px',
                      opacity: isBlockedFull ? 0.55 : 1,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 6,
                          marginBottom: 3,
                        }}
                      >
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#38bdf8' }}>
                          #{part.no} {part.tag}
                        </span>
                        {isEquipped && (
                          <span
                            style={{
                              fontSize: '0.66rem',
                              fontWeight: 800,
                              color: '#34d399',
                            }}
                          >
                            EQUIPPED
                          </span>
                        )}
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '0.84rem', color: '#f8fafc' }}>
                        <SupportTextWithTokens text={part.name} iconSize={12} />
                      </div>
                      <div
                        style={{
                          fontSize: '0.74rem',
                          color: '#cbd5e1',
                          marginTop: 3,
                          lineHeight: 1.35,
                        }}
                      >
                        <SupportTextWithTokens text={part.description} iconSize={11} />
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isBlockedFull}
                      className={`ddcb-btn ddcb-btn--sm ${
                        isEquipped
                          ? 'ddcb-btn--danger'
                          : replacesExclusive
                            ? 'ddcb-btn--primary'
                            : ''
                      }`}
                      onClick={() => handleEquipToggle(part.id)}
                    >
                      {isEquipped
                        ? 'Remove'
                        : replacesExclusive
                          ? 'Swap & Equip'
                          : isBlockedFull
                            ? '3/3 Slots Full'
                            : '+ Equip Part'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartnerEditor;
