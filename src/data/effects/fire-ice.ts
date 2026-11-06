import type { EffectRegistry } from '../../types/effects';

/**
 * Effect definitions for Fire & Ice Digimon cards (000..068).
 * All Digimon support effects execute with `timing: 'support'`.
 */
export const FIRE_ICE_EFFECTS: EffectRegistry = {
  // 000 Imperialdramon — Add number of DP Cards in DP Slot x100 to own Attack Power.
  0: {
    cardId: 0,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'self', mode: 'add', value: { ref: { stat: 'dpCount', who: 'self' }, mul: 100 } }],
  },
  // 001 Omnimon I — Changes own Specialty to Fire. Boost own Attack Power +100.
  1: {
    cardId: 1,
    timing: 'support',
    ops: [
      { op: 'setSpecialty', target: 'self', to: 'Fire' },
      { op: 'attackPower', target: 'self', mode: 'add', value: 100 },
    ],
  },
  // 002 WarGreymon — Add number of Cards in Hand x100 to own Attack Power.
  2: {
    cardId: 2,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'self', mode: 'add', value: { ref: { stat: 'handCount', who: 'self' }, mul: 100 } }],
  },
  // 003 Phoenixmon — Digimon KO'd in battle revives with 500 HP. Battle is still lost.
  3: {
    cardId: 3,
    timing: 'support',
    ops: [{ op: 'reviveOnKo', target: 'self', hp: 500 }],
  },
  // 004 Paildramon — If own Specialty is Fire, boost own Attack Power +300.
  4: {
    cardId: 4,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'self', in: ['Fire'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 300 }],
      },
    ],
  },
  // 005 Gigadramon — None
  5: {
    cardId: 5,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 006 RealMetalGreymon — Boost own Attack Power +300.
  6: {
    cardId: 6,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'self', mode: 'add', value: 300 }],
  },
  // 007 Garudamon — If own Attack is [[circle]], attack first.
  7: {
    cardId: 7,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'attackIs', who: 'self', in: ['circle'] },
        then: [{ op: 'attackFirst', target: 'self' }],
      },
    ],
  },
  // 008 MasterTyrannomon — If own Specialty is Fire, own Attack Power is doubled.
  8: {
    cardId: 8,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'self', in: ['Fire'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }],
      },
    ],
  },
  // 009 MetalGreymon — If own Level is U, boost own Attack Power +500.
  9: {
    cardId: 9,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'levelIs', who: 'self', in: ['U'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 500 }],
      },
    ],
  },
  // 010 Vermilimon — None
  10: {
    cardId: 10,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 011 Meteormon — Lower opponent's [[circle]] Attack Power to 0.
  11: {
    cardId: 11,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'opponent', slot: 'circle', mode: 'set', value: 0 }],
  },
  // 012 ExVeemon — If own Level is A, boost own Attack Power +300.
  12: {
    cardId: 12,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'levelIs', who: 'self', in: ['A'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 300 }],
      },
    ],
  },
  // 013 Aquilamon — If own attack is [[triangle]], attack first.
  13: {
    cardId: 13,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'attackIs', who: 'self', in: ['triangle'] },
        then: [{ op: 'attackFirst', target: 'self' }],
      },
    ],
  },
  // 014 Greymon — If own Level is C, boost own Attack Power +300.
  14: {
    cardId: 14,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'levelIs', who: 'self', in: ['C'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 300 }],
      },
    ],
  },
  // 015 Apemon — Change own Specialty to Fire. Boost own Attack Power +200.
  15: {
    cardId: 15,
    timing: 'support',
    ops: [
      { op: 'setSpecialty', target: 'self', to: 'Fire' },
      { op: 'attackPower', target: 'self', mode: 'add', value: 200 },
    ],
  },
  // 016 Tyrannomon — None
  16: {
    cardId: 16,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 017 Monochromon — None
  17: {
    cardId: 17,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 018 Meramon — If opponent's Specialty is Ice, own Attack Power is tripled.
  18: {
    cardId: 18,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Ice'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 3 }],
      },
    ],
  },
  // 019 Centarumon — Use [[circle]] and Boost own [[circle]] Attack Power +400.
  19: {
    cardId: 19,
    timing: 'support',
    ops: [
      { op: 'forceAttack', target: 'self', to: 'circle' },
      { op: 'attackPower', target: 'self', slot: 'circle', mode: 'add', value: 400 },
    ],
  },
  // 020 Birdramon — Attack first.
  20: {
    cardId: 20,
    timing: 'support',
    ops: [{ op: 'attackFirst', target: 'self' }],
  },
  // 021 Tankmon — Own HP become 10. Boost own Attack Power +500.
  21: {
    cardId: 21,
    timing: 'support',
    ops: [
      { op: 'hp', target: 'self', mode: 'set', value: 10 },
      { op: 'attackPower', target: 'self', mode: 'add', value: 500 },
    ],
  },
  // 022 RedVegiemon — Discard all own DP Cards in DP Slot, boost own Attack Power +300.
  22: {
    cardId: 22,
    timing: 'support',
    ops: [
      { op: 'discardDp', target: 'self', count: 'all' },
      { op: 'attackPower', target: 'self', mode: 'add', value: 300 },
    ],
  },
  // 023 Piddomon — Own [[circle]] Attack Power becomes same as own HP.
  23: {
    cardId: 23,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'self', slot: 'circle', mode: 'set', value: { ref: { stat: 'hp', who: 'self' } } }],
  },
  // 024 Akatorimon — Boost own Attack Power +200.
  24: {
    cardId: 24,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'self', mode: 'add', value: 200 }],
  },
  // 025 BomberNanimon — If both Levels are C, boost own Attack Power +400.
  25: {
    cardId: 25,
    timing: 'support',
    ops: [
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
    ],
  },
  // 026 Flarerizamon — Change own Specialty to Fire.
  26: {
    cardId: 26,
    timing: 'support',
    ops: [{ op: 'setSpecialty', target: 'self', to: 'Fire' }],
  },
  // 027 Agumon — Boost own [[circle]] Attack Power +300.
  27: {
    cardId: 27,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'self', slot: 'circle', mode: 'add', value: 300 }],
  },
  // 028 Solarmon — None
  28: {
    cardId: 28,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 029 Biyomon — Boost own Attack Power +200.
  29: {
    cardId: 29,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'self', mode: 'add', value: 200 }],
  },
  // 030 Muchomon — Boost own [[triangle]] Attack Power +300.
  30: {
    cardId: 30,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'self', slot: 'triangle', mode: 'add', value: 300 }],
  },
  // 031 Candlemon — Boost own [[x]] Attack Power +200.
  31: {
    cardId: 31,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'self', slot: 'x', mode: 'add', value: 200 }],
  },
  // 032 D-Otamamon — If opponent's Specialty is Ice, own Attack Power is doubled.
  32: {
    cardId: 32,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Ice'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }],
      },
    ],
  },
  // 033 Goburimon — None
  33: {
    cardId: 33,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 034 Vikemon — None
  34: {
    cardId: 34,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 035 Omnimon II — Change own Specialty to Ice. Recover own HP by +100.
  35: {
    cardId: 35,
    timing: 'support',
    ops: [
      { op: 'setSpecialty', target: 'self', to: 'Ice' },
      { op: 'hp', target: 'self', mode: 'add', value: 100 },
    ],
  },
  // 036 MetalSeadramon — If own Specialty is Ice, opponent's Support Effect is voided.
  36: {
    cardId: 36,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'self', in: ['Ice'] },
        then: [{ op: 'voidSupport', target: 'opponent', scope: 'support' }],
      },
    ],
  },
  // 037 MetalGarurumon — If own Cards in Hand 3 or more, opponent's Attack Power becomes 0.
  37: {
    cardId: 37,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'compare', left: { ref: { stat: 'handCount', who: 'self' } }, cmp: 'gte', right: 3 },
        then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }],
      },
    ],
  },
  // 038 MarineAngemon — Recover own HP by +200.
  38: {
    cardId: 38,
    timing: 'support',
    ops: [{ op: 'hp', target: 'self', mode: 'add', value: 200 }],
  },
  // 039 WereGarurumon — Add number of DP Cards in DP Slot x100 to own HP.
  39: {
    cardId: 39,
    timing: 'support',
    ops: [{ op: 'hp', target: 'self', mode: 'add', value: { ref: { stat: 'dpCount', who: 'self' }, mul: 100 } }],
  },
  // 040 Zudomon — If own Specialty is Ice, opponent's Attack Power is halved.
  40: {
    cardId: 40,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'self', in: ['Ice'] },
        then: [{ op: 'attackPower', target: 'opponent', mode: 'divide', value: 2 }],
      },
    ],
  },
  // 041 Panjyamon — [[triangle]] Counterattack. Attack second.
  41: {
    cardId: 41,
    timing: 'support',
    ops: [
      { op: 'grantAbility', target: 'self', ability: { kind: 'counter', slot: 'triangle' } },
      { op: 'attackSecond', target: 'self' },
    ],
  },
  // 042 MegaSeadramon — [[circle]] Counterattack. Attack second.
  42: {
    cardId: 42,
    timing: 'support',
    ops: [
      { op: 'grantAbility', target: 'self', ability: { kind: 'counter', slot: 'circle' } },
      { op: 'attackSecond', target: 'self' },
    ],
  },
  // 043 WaruSeadramon — Opponent's Support Effect is voided.
  43: {
    cardId: 43,
    timing: 'support',
    ops: [{ op: 'voidSupport', target: 'opponent', scope: 'support' }],
  },
  // 044 Brachiomon — Lower opponent's [[circle]] Attack Power to 0.
  44: {
    cardId: 44,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'opponent', slot: 'circle', mode: 'set', value: 0 }],
  },
  // 045 BlueMeramon — Lower opponent's [[x]] Attack Power to 0.
  45: {
    cardId: 45,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'opponent', slot: 'x', mode: 'set', value: 0 }],
  },
  // 046 Garurumon — Opponent uses [[circle]].
  46: {
    cardId: 46,
    timing: 'support',
    ops: [{ op: 'forceAttack', target: 'opponent', to: 'circle' }],
  },
  // 047 Ikkakumon — If opponent's Specialty is Fire, own Attack Power is tripled.
  47: {
    cardId: 47,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Fire'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 3 }],
      },
    ],
  },
  // 048 Dolphmon — If own Attack is not [[circle]], recover own HP by +300.
  48: {
    cardId: 48,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'not', c: { cond: 'attackIs', who: 'self', in: ['circle'] } },
        then: [{ op: 'hp', target: 'self', mode: 'add', value: 300 }],
      },
    ],
  },
  // 049 Whamon — Own HP become 700.
  49: {
    cardId: 49,
    timing: 'support',
    ops: [{ op: 'hp', target: 'self', mode: 'set', value: 700 }],
  },
  // 050 Seadramon — Opponent's Attack Power is halved.
  50: {
    cardId: 50,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'opponent', mode: 'divide', value: 2 }],
  },
  // 051 Gesomon — None
  51: {
    cardId: 51,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 052 Frigimon — Recover own HP by +200.
  52: {
    cardId: 52,
    timing: 'support',
    ops: [{ op: 'hp', target: 'self', mode: 'add', value: 200 }],
  },
  // 053 Gekomon — Change opponent's Specialty to Ice.
  53: {
    cardId: 53,
    timing: 'support',
    ops: [{ op: 'setSpecialty', target: 'opponent', to: 'Ice' }],
  },
  // 054 Coelamon — Lower opponent's [[circle]] Attack Power to 0.
  54: {
    cardId: 54,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'opponent', slot: 'circle', mode: 'set', value: 0 }],
  },
  // 055 Mojyamon — Recover own HP by +200.
  55: {
    cardId: 55,
    timing: 'support',
    ops: [{ op: 'hp', target: 'self', mode: 'add', value: 200 }],
  },
  // 056 Shellmon — If opponent used [[circle]], change it to [[x]].
  56: {
    cardId: 56,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'attackIs', who: 'opponent', in: ['circle'] },
        then: [{ op: 'forceAttack', target: 'opponent', to: 'x' }],
      },
    ],
  },
  // 057 Sorcerimon — Change own Specialty to Ice.
  57: {
    cardId: 57,
    timing: 'support',
    ops: [{ op: 'setSpecialty', target: 'self', to: 'Ice' }],
  },
  // 058 IceDevimon — If opponent's Specialty is fire, own Attack Power is tripled.
  58: {
    cardId: 58,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Fire'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 3 }],
      },
    ],
  },
  // 059 Hyogamon — None
  59: {
    cardId: 59,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 060 Icemon — None
  60: {
    cardId: 60,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 061 Gomamon — Lower opponent's [[triangle]] Attack Power to 0.
  61: {
    cardId: 61,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'opponent', slot: 'triangle', mode: 'set', value: 0 }],
  },
  // 062 Gabumon — None
  62: {
    cardId: 62,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 063 Betamon — If own HP are less then 200, reduce opponent's Attack Power to 0.
  63: {
    cardId: 63,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'compare', left: { ref: { stat: 'hp', who: 'self' } }, cmp: 'lt', right: 200 },
        then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }],
      },
    ],
  },
  // 064 Penguinmon — If opponent's Specialty is Fire, reduce opponent's Attack Power to 0.
  64: {
    cardId: 64,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Fire'] },
        then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }],
      },
    ],
  },
  // 065 Gizamon — If opponent's Specialty is Fire, own Attack Power is doubled.
  65: {
    cardId: 65,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Fire'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }],
      },
    ],
  },
  // 066 Otamamon — Reduce opponent's [[circle]] Attack Power to 0.
  66: {
    cardId: 66,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'opponent', slot: 'circle', mode: 'set', value: 0 }],
  },
  // 067 SnowAgumon — Reduce opponent's [[x]] Attack Power to 0.
  67: {
    cardId: 67,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'opponent', slot: 'x', mode: 'set', value: 0 }],
  },
  // 068 SnowGoburimon — None
  68: {
    cardId: 68,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
};
