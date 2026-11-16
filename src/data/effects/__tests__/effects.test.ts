import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_CARDS, mustGetCardById } from '../../cards';
import type { EffectOp } from '../../../types/effects';
import {
  EFFECT_REGISTRY,
  FIRE_ICE_EFFECTS,
  NATURE_DARK_RARE_EFFECTS,
  OPTION_EFFECTS,
  getCardEffect,
  isBattleSupportOption,
  isDigivolvePhaseOption,
} from '../index';

function collectAllOps(ops: EffectOp[]): EffectOp[] {
  const result: EffectOp[] = [];
  for (const op of ops) {
    result.push(op);
    if (op.op === 'if') {
      result.push(...collectAllOps(op.then));
      if (op.else) {
        result.push(...collectAllOps(op.else));
      }
    } else if (op.op === 'seq') {
      result.push(...collectAllOps(op.ops));
    } else if (op.op === 'random') {
      for (const branch of op.branches) {
        result.push(...collectAllOps(branch.ops));
      }
    } else if (op.op === 'devolve' && op.onSuccess) {
      result.push(...collectAllOps(op.onSuccess));
    }
  }
  return result;
}

describe('Effect Registry (000..300)', () => {
  it('contains all 301 cards (0..300) with matching cardId', () => {
    expect(Object.keys(EFFECT_REGISTRY)).toHaveLength(301);
    for (let id = 0; id <= 300; id++) {
      const def = EFFECT_REGISTRY[id];
      expect(def, `Missing effect for card ${id}`).toBeDefined();
      expect(def.cardId).toBe(id);
      expect(getCardEffect(id)).toBe(def);
    }
  });

  it('throws when getCardEffect is called with an out-of-range ID', () => {
    expect(() => getCardEffect(-1)).toThrow();
    expect(() => getCardEffect(301)).toThrow();
  });

  it('partitions cards accurately across fire-ice, nature-dark-rare, and option modules', () => {
    expect(Object.keys(FIRE_ICE_EFFECTS)).toHaveLength(69);
    for (let id = 0; id <= 68; id++) {
      expect(FIRE_ICE_EFFECTS[id]).toBeDefined();
    }

    expect(Object.keys(NATURE_DARK_RARE_EFFECTS)).toHaveLength(122);
    for (let id = 69; id <= 190; id++) {
      expect(NATURE_DARK_RARE_EFFECTS[id]).toBeDefined();
    }

    expect(Object.keys(OPTION_EFFECTS)).toHaveLength(110);
    for (let id = 191; id <= 300; id++) {
      expect(OPTION_EFFECTS[id]).toBeDefined();
    }
  });

  it('has zero unimplemented ops across all 301 cards', () => {
    for (let id = 0; id <= 300; id++) {
      const def = EFFECT_REGISTRY[id];
      expect(def.ops.length).toBeGreaterThan(0);
      const allOps = collectAllOps(def.ops);
      for (const op of allOps) {
        expect(op.op, `Card ${id} has unimplemented op`).not.toBe('unimplemented');
      }
    }
  });

  it('maps every card with supportText === "None" to [{ op: "none" }] and all others to non-none ops', () => {
    expect(ALL_CARDS).toHaveLength(301);
    for (const card of ALL_CARDS) {
      const def = getCardEffect(card.id);
      if (card.supportText === 'None') {
        expect(def.ops, `Card ${card.no} (${card.name}) has supportText "None" but non-none ops`).toEqual([
          { op: 'none' },
        ]);
      } else {
        expect(def.ops, `Card ${card.no} (${card.name}) has supportText "${card.supportText}" but [{ op: "none" }]`).not.toEqual([
          { op: 'none' },
        ]);
        const allOps = collectAllOps(def.ops);
        for (const op of allOps) {
          expect(op.op, `Card ${card.no} (${card.name}) unexpectedly contains 'none' op`).not.toBe('none');
        }
      }
    }
  });

  it('assigns correct timing and option helper predicates for all 301 cards', () => {
    // Digimon cards 000..190
    for (let id = 0; id <= 190; id++) {
      const def = getCardEffect(id);
      expect(def.timing).toBe('support');
      expect(isBattleSupportOption(id)).toBe(false);
      expect(isDigivolvePhaseOption(id)).toBe(false);
    }

    // Battle Support Option cards 191..292
    for (let id = 191; id <= 292; id++) {
      const def = getCardEffect(id);
      expect(def.timing).toBe('support');
      expect(isBattleSupportOption(id)).toBe(true);
      expect(isDigivolvePhaseOption(id)).toBe(false);
    }

    // Digivolve Phase Option cards 293..300
    for (let id = 293; id <= 300; id++) {
      const def = getCardEffect(id);
      expect(def.timing).toBe('digivolvePhase');
      expect(isBattleSupportOption(id)).toBe(false);
      expect(isDigivolvePhaseOption(id)).toBe(true);
    }
  });

  describe('Representative card spot-checks', () => {
    it('encodes Fire & Ice Digimon effects accurately (000..068)', () => {
      // 000 Imperialdramon: Add number of DP Cards in DP Slot x100 to own Attack Power.
      expect(getCardEffect(0).ops).toEqual([
        { op: 'attackPower', target: 'self', mode: 'add', value: { ref: { stat: 'dpCount', who: 'self' }, mul: 100 } },
      ]);

      // 003 Phoenixmon: Digimon KO'd in battle revives with 500 HP.
      expect(getCardEffect(3).ops).toEqual([{ op: 'reviveOnKo', target: 'self', hp: 500 }]);

      // 019 Centarumon: Use [[circle]] and Boost own [[circle]] Attack Power +400.
      expect(getCardEffect(19).ops).toEqual([
        { op: 'forceAttack', target: 'self', to: 'circle' },
        { op: 'attackPower', target: 'self', slot: 'circle', mode: 'add', value: 400 },
      ]);

      // 025 BomberNanimon: If both Levels are C, boost own Attack Power +400.
      expect(getCardEffect(25).ops).toEqual([
        {
          op: 'if',
          cond: {
            cond: 'and',
            cs: [
              { cond: 'levelIs', who: 'self', in: ['C'] },
              { cond: 'levelIs', who: 'opponent', in: ['C'] },
            ],
          },
          then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 400 }],
        },
      ]);

      // 041 Panjyamon: [[triangle]] Counterattack. Attack second.
      expect(getCardEffect(41).ops).toEqual([
        { op: 'grantAbility', target: 'self', ability: { kind: 'counter', slot: 'triangle' } },
        { op: 'attackSecond', target: 'self' },
      ]);

      // 048 Dolphmon: If own Attack is not [[circle]], recover own HP by +300.
      expect(getCardEffect(48).ops).toEqual([
        {
          op: 'if',
          cond: { cond: 'not', c: { cond: 'attackIs', who: 'self', in: ['circle'] } },
          then: [{ op: 'hp', target: 'self', mode: 'add', value: 300 }],
        },
      ]);
    });

    it('encodes Nature, Darkness, Rare, Armor & Partner Digimon effects accurately (069..190)', () => {
      // 073 Rosemon: If opponent's HP are 1000+, own attack becomes "Eat-up HP."
      expect(getCardEffect(73).ops).toEqual([
        {
          op: 'if',
          cond: { cond: 'compare', left: { ref: { stat: 'hp', who: 'opponent' } }, cmp: 'gte', right: 1000 },
          then: [{ op: 'grantAbility', target: 'self', ability: { kind: 'eatUpHp' } }],
        },
      ]);

      // 085 Leomon: If own level is lower, boost own Attack Power +500.
      expect(getCardEffect(85).ops).toEqual([
        {
          op: 'if',
          cond: { cond: 'levelCompare', cmp: 'lt' },
          then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 500 }],
        },
      ]);

      // 122 Ogremon: Discard Cards in own DP Slot and multiply Attack Power by number of discards.
      expect(getCardEffect(122).ops).toEqual([
        { op: 'discardDp', target: 'self', count: 'all' },
        { op: 'attackPower', target: 'self', mode: 'multiply', value: { ref: { stat: 'lastMovedCount' } } },
      ]);

      // 135 Tsukaimon: Boost own [[x]] Attack Power +200. [[circle]] & [[triangle]] Attack Power are 0.
      expect(getCardEffect(135).ops).toEqual([
        { op: 'attackPower', target: 'self', slot: 'x', mode: 'add', value: 200 },
        { op: 'attackPower', target: 'self', slot: 'circle', mode: 'set', value: 0 },
        { op: 'attackPower', target: 'self', slot: 'triangle', mode: 'set', value: 0 },
      ]);

      // 144 Digitamamon & 145 Vademon
      expect(getCardEffect(144).ops).toEqual([{ op: 'swapSpecialty' }]);
      expect(getCardEffect(145).ops).toEqual([{ op: 'setSpecialty', target: 'opponent', to: { copyFrom: 'self' } }]);

      // 154 PlatinumSukamon & 156 Nanimon
      expect(getCardEffect(154).ops).toEqual([
        { op: 'recycleOffline', target: 'self', count: 1, shuffle: false, position: 'top' },
      ]);
      expect(getCardEffect(156).ops).toEqual([{ op: 'handToDeck', target: 'self', shuffle: true }]);

      // 160 Geremon: Discard all Cards in DP Slot. Foe discards same number of DP Cards.
      expect(getCardEffect(160).ops).toEqual([
        { op: 'discardDp', target: 'self', count: 'all' },
        { op: 'discardDp', target: 'opponent', count: { ref: { stat: 'lastMovedCount' } }, from: 'top' },
      ]);

      // Partner & Armor cards 172..190
      expect(mustGetCardById(172).name).toBe('Flamedramon');
      expect(getCardEffect(172).ops).toEqual([
        { op: 'attackPower', target: 'self', mode: 'add', value: 100 },
        { op: 'draw', target: 'self', count: 1 },
      ]);
      expect(mustGetCardById(182).name).toBe('Hawkmon');
      expect(getCardEffect(182).ops).toEqual([{ op: 'draw', target: 'self', count: 3 }]);
      expect(mustGetCardById(190).name).toBe('Armadillomon');
      expect(getCardEffect(190).ops).toEqual([
        { op: 'mill', target: 'opponent', count: 2 },
        { op: 'draw', target: 'self', count: 1 },
      ]);
    });

    it('encodes Option cards accurately (191..300), including Bananas, Digivices, Altars, Disks, Sevens, and Digivolve Options', () => {
      // 191 Golden Banana & 195 Metallic Banana
      expect(getCardEffect(191).ops).toEqual([
        { op: 'hp', target: 'self', mode: 'divide', value: 2 },
        { op: 'grantAbility', target: 'self', ability: { kind: 'counter', slot: 'any' } },
        { op: 'attackSecond', target: 'self' },
      ]);
      expect(getCardEffect(195).ops).toEqual([
        { op: 'hp', target: 'self', mode: 'divide', value: 2 },
        { op: 'attackPower', target: 'opponent', mode: 'set', value: 0 },
      ]);

      // 200 Fake Sevens
      expect(getCardEffect(200).ops).toEqual([{ op: 'none' }]);

      // 206..211 Digivices
      expect(getCardEffect(206).ops).toEqual([
        {
          op: 'if',
          cond: { cond: 'specialtyIs', who: 'self', in: ['Fire'] },
          then: [
            { op: 'attackPower', target: 'self', mode: 'add', value: 100 },
            { op: 'hp', target: 'self', mode: 'add', value: 200 },
          ],
        },
      ]);
      expect(getCardEffect(211).ops).toEqual([
        {
          op: 'if',
          cond: { cond: 'specialtiesSame' },
          then: [
            { op: 'attackPower', target: 'self', mode: 'add', value: 200 },
            { op: 'hp', target: 'self', mode: 'add', value: 400 },
          ],
        },
      ]);

      // 216..220 Altars
      expect(getCardEffect(216).ops).toEqual([
        { op: 'setSpecialty', target: 'opponent', to: 'Fire' },
        { op: 'draw', target: 'self', count: 1 },
      ]);

      // 222..224 Mega Def. Disks & 267..272 Attack/Defense Disks
      expect(getCardEffect(222).ops).toEqual([
        { op: 'attackPower', target: 'opponent', slot: 'circle', mode: 'set', value: 0 },
        { op: 'hp', target: 'self', mode: 'add', value: 100 },
      ]);
      expect(getCardEffect(267).ops).toEqual([
        { op: 'attackPower', target: 'self', slot: 'circle', mode: 'multiply', value: 2 },
      ]);
      expect(getCardEffect(272).ops).toEqual([
        { op: 'attackPower', target: 'opponent', slot: 'x', mode: 'set', value: 0 },
      ]);

      // 253 Cherrymon's Mist, 256 Data Copy, 257 Partner Finder, 263 Disrupt Ray
      expect(getCardEffect(253).ops).toEqual([{ op: 'voidSupport', target: 'opponent', scope: 'supportAndOption' }]);
      expect(getCardEffect(256).ops).toEqual([
        { op: 'copyStats', from: 'opponent', stats: ['attackPower', 'hp', 'specialty'] },
      ]);
      expect(getCardEffect(257).ops).toEqual([
        {
          op: 'searchDeck',
          target: 'self',
          filter: { levels: ['R P'] },
          count: 1,
          selection: 'random',
          to: 'hand',
          shuffleAfter: true,
        },
      ]);
      expect(getCardEffect(263).ops).toEqual([{ op: 'rotateAttack', target: 'opponent', direction: 'forward' }]);

      // 285..291 Sevens cards
      expect(getCardEffect(285).ops).toEqual([{ op: 'attackPower', target: 'self', mode: 'multiply', value: 3 }]);
      expect(getCardEffect(286).ops).toEqual([{ op: 'hp', target: 'self', mode: 'add', value: 1000 }]);
      expect(getCardEffect(288).ops).toEqual([
        { op: 'attackPower', target: 'self', mode: 'add', value: { ref: { stat: 'hp', who: 'self' } } },
      ]);
      expect(getCardEffect(289).ops).toEqual([
        { op: 'voidSupport', target: 'opponent', scope: 'supportAndOption' },
        { op: 'attackPower', target: 'opponent', mode: 'set', value: 0 },
      ]);
      expect(getCardEffect(290).ops).toEqual([
        { op: 'attackFirst', target: 'self' },
        { op: 'grantAbility', target: 'self', ability: { kind: 'eatUpHp' } },
        { op: 'attackPower', target: 'self', mode: 'add', value: 200 },
      ]);
      expect(getCardEffect(291).ops).toEqual([{ op: 'recycleOffline', target: 'self', count: 10, shuffle: true }]);

      // 293..300 Digivolve Phase Option cards
      expect(getCardEffect(293).ops).toEqual([
        { op: 'digivolveModifier', ignoreSpecialty: true, ignoreLevel: true, ignoreDp: true },
      ]);
      expect(getCardEffect(294).ops).toEqual([
        { op: 'digivolveModifier', requireFromLevels: ['A'], allowedToLevels: ['C', 'U'] },
      ]);
      expect(getCardEffect(295).ops).toEqual([
        { op: 'digivolveModifier', ignoreSpecialty: true, extraDp: 20 },
      ]);
      expect(getCardEffect(296).ops).toEqual([
        { op: 'digivolveModifier', allowSameLevel: true, ignoreSpecialty: true },
      ]);
      expect(getCardEffect(297).ops).toEqual([
        { op: 'digivolveModifier', allowSkipLevel: true, requireFromLevels: ['R', 'R P'], allowedToLevels: ['U'] },
      ]);
      expect(getCardEffect(298).ops).toEqual([
        { op: 'devolve', target: 'self', levels: 1, requireFromLevels: ['A'], toLevel: 'R' },
      ]);
      expect(getCardEffect(299).ops).toEqual([
        { op: 'digivolveModifier', ignoreDp: true, notInAbnormal: true },
      ]);
      expect(getCardEffect(300).ops).toEqual([
        { op: 'devolve', target: 'self', levels: 1, requireFromLevels: ['C', 'U'], onSuccess: [{ op: 'hp', target: 'self', mode: 'multiply', value: 2 }] },
      ]);
    });

    it('matches every single row of docs/EFFECT_DSL.md 1:1 across all 301 cards', () => {
      const docPath = path.resolve(__dirname, '../../../../docs/EFFECT_DSL.md');
      const md = fs.readFileSync(docPath, 'utf8');
      const lines = md.split(/\r?\n/);
      let matchedCount = 0;

      for (const line of lines) {
        const match = line.match(/^\|\s*`(\d{3})`\s*\|.*\|\s*`(\[\{.*\}\])`\s*\|$/);
        if (!match) continue;
        const id = Number(match[1]);
        const opsLiteral = match[2];
        // Evaluate the exact array literal from docs/EFFECT_DSL.md
        const expectedOps = new Function(`return (${opsLiteral});`)();
        expect(getCardEffect(id).ops, `Mismatch on card ${match[1]} vs docs/EFFECT_DSL.md`).toEqual(expectedOps);
        matchedCount++;
      }

      expect(matchedCount).toBe(301);
    });
  });
});
