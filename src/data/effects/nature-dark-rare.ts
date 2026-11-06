import type { EffectRegistry } from '../../types/effects';

/**
 * Effect definitions for Nature, Darkness, Rare, Armor & Partner Digimon cards (069..190).
 * All Digimon support effects execute with `timing: 'support'`.
 */
export const NATURE_DARK_RARE_EFFECTS: EffectRegistry = {
  // 069 Valkyrimon — Opponent uses O.
  69: {
    cardId: 69,
    timing: 'support',
    ops: [{ op: 'forceAttack', target: 'opponent', to: 'circle' }],
  },
  // 070 Seraphimon — If opponent's Specialty is Darkness, own Attack Power is +200 & HP +200.
  70: {
    cardId: 70,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Darkness'] },
        then: [
          { op: 'attackPower', target: 'self', mode: 'add', value: 200 },
          { op: 'hp', target: 'self', mode: 'add', value: 200 },
        ],
      },
    ],
  },
  // 071 Magnadramon — [[x]] Counterattack. Attack second.
  71: {
    cardId: 71,
    timing: 'support',
    ops: [
      { op: 'grantAbility', target: 'self', ability: { kind: 'counter', slot: 'x' } },
      { op: 'attackSecond', target: 'self' },
    ],
  },
  // 072 AeroVeedramon — If own level is U, own Attack Power is doubled.
  72: {
    cardId: 72,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'levelIs', who: 'self', in: ['U'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }],
      },
    ],
  },
  // 073 Rosemon — If opponent's HP are 1000+, own attack becomes "Eat-up HP."
  73: {
    cardId: 73,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'compare', left: { ref: { stat: 'hp', who: 'opponent' } }, cmp: 'gte', right: 1000 },
        then: [{ op: 'grantAbility', target: 'self', ability: { kind: 'eatUpHp' } }],
      },
    ],
  },
  // 074 HerculesKabuterimon — None
  74: {
    cardId: 74,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 075 MagnaAngemon — If opponent's Specialty is Darkness, boost own Attack Power +500.
  75: {
    cardId: 75,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Darkness'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 500 }],
      },
    ],
  },
  // 076 Silphymon — If opponent's Specialty is not Nature, attack second.
  76: {
    cardId: 76,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'not', c: { cond: 'specialtyIs', who: 'opponent', in: ['Nature'] } },
        then: [{ op: 'attackSecond', target: 'self' }],
      },
    ],
  },
  // 077 Angewomon — If opponent's Specialty is Darkness, recover own HP by +500.
  77: {
    cardId: 77,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Darkness'] },
        then: [{ op: 'hp', target: 'self', mode: 'add', value: 500 }],
      },
    ],
  },
  // 078 Lillymon — Recover own HP by +200.
  78: {
    cardId: 78,
    timing: 'support',
    ops: [{ op: 'hp', target: 'self', mode: 'add', value: 200 }],
  },
  // 079 MegaKabuterimon — None
  79: {
    cardId: 79,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 080 Piximon — Opponent's Support Effect is voided. Own Attack Power is halved.
  80: {
    cardId: 80,
    timing: 'support',
    ops: [
      { op: 'voidSupport', target: 'opponent', scope: 'support' },
      { op: 'attackPower', target: 'self', mode: 'divide', value: 2 },
    ],
  },
  // 081 Veedramon — If own level is U, own Attack Power is doubled.
  81: {
    cardId: 81,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'levelIs', who: 'self', in: ['U'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }],
      },
    ],
  },
  // 082 Angemon — If opponent's Specialty is Darkness, own Attack Power is tripled.
  82: {
    cardId: 82,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Darkness'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 3 }],
      },
    ],
  },
  // 083 R-Gatomon — If own HP are less than 500, boost own Attack Power +300.
  83: {
    cardId: 83,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'compare', left: { ref: { stat: 'hp', who: 'self' } }, cmp: 'lt', right: 500 },
        then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 300 }],
      },
    ],
  },
  // 084 Togemon — Boost own Attack Power +100.
  84: {
    cardId: 84,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'self', mode: 'add', value: 100 }],
  },
  // 085 Leomon — If own level is lower, boost own Attack Power +500.
  85: {
    cardId: 85,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'levelCompare', cmp: 'lt' },
        then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 500 }],
      },
    ],
  },
  // 086 Kabuterimon — None
  86: {
    cardId: 86,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 087 Airdramon — Recover own HP by +100. Boost own Attack Power by +100.
  87: {
    cardId: 87,
    timing: 'support',
    ops: [
      { op: 'hp', target: 'self', mode: 'add', value: 100 },
      { op: 'attackPower', target: 'self', mode: 'add', value: 100 },
    ],
  },
  // 088 Unimon — If opponent's Specialty is Darkness, lower opponent's Attack Power to 0.
  88: {
    cardId: 88,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Darkness'] },
        then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }],
      },
    ],
  },
  // 089 Ninjamon — Attack first.
  89: {
    cardId: 89,
    timing: 'support',
    ops: [{ op: 'attackFirst', target: 'self' }],
  },
  // 090 Kuwagamon — None
  90: {
    cardId: 90,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 091 Drimogemon — Boost own Attack Power +200.
  91: {
    cardId: 91,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'self', mode: 'add', value: 200 }],
  },
  // 092 Vegiemon — Changes opponent's Specialty to Nature.
  92: {
    cardId: 92,
    timing: 'support',
    ops: [{ op: 'setSpecialty', target: 'opponent', to: 'Nature' }],
  },
  // 093 Kokatorimon — Lower opponent's Attack Power to 0. Opponent's HP are doubled.
  93: {
    cardId: 93,
    timing: 'support',
    ops: [
      { op: 'attackPower', target: 'opponent', mode: 'set', value: 0 },
      { op: 'hp', target: 'opponent', mode: 'multiply', value: 2 },
    ],
  },
  // 094 Yanmamon — None
  94: {
    cardId: 94,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 095 J-Mojyamon — If own Level is R, boost own Attack Power +300.
  95: {
    cardId: 95,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'levelIs', who: 'self', in: ['R'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 300 }],
      },
    ],
  },
  // 096 MoriShellmon — If opponent's Specialty is Darkness, lower opponent's Attack Power -200.
  96: {
    cardId: 96,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Darkness'] },
        then: [{ op: 'attackPower', target: 'opponent', mode: 'sub', value: 200 }],
      },
    ],
  },
  // 097 Tentomon — None
  97: {
    cardId: 97,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 098 Palmon — None
  98: {
    cardId: 98,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 099 Salamon — Changes own Specialty to Nature. Draw 1 Card.
  99: {
    cardId: 99,
    timing: 'support',
    ops: [
      { op: 'setSpecialty', target: 'self', to: 'Nature' },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
  // 100 Elecmon — If opponent's Specialty is Ice, boost own Attack Power +300.
  100: {
    cardId: 100,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Ice'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 300 }],
      },
    ],
  },
  // 101 Gotsumon — If own HP are more than opponent's HP, own Attack Power is doubled.
  101: {
    cardId: 101,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: {
          cond: 'compare',
          left: { ref: { stat: 'hp', who: 'self' } },
          cmp: 'gt',
          right: { ref: { stat: 'hp', who: 'opponent' } },
        },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }],
      },
    ],
  },
  // 102 Kunemon — Lower both Attack Powers -200.
  102: {
    cardId: 102,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'both', mode: 'sub', value: 200 }],
  },
  // 103 Apokarimon — Own HP are halved. Change own Specialty to Darkness.
  103: {
    cardId: 103,
    timing: 'support',
    ops: [
      { op: 'hp', target: 'self', mode: 'divide', value: 2 },
      { op: 'setSpecialty', target: 'self', to: 'Darkness' },
    ],
  },
  // 104 GranKuwagamon — Discard 7 Cards from own Online Deck. Opponent's HP are halved.
  104: {
    cardId: 104,
    timing: 'support',
    ops: [
      { op: 'mill', target: 'self', count: 7 },
      { op: 'hp', target: 'opponent', mode: 'divide', value: 2 },
    ],
  },
  // 105 Diaboromon — Own HP become 10. Changes opponent's Specialty to Darkness.
  105: {
    cardId: 105,
    timing: 'support',
    ops: [
      { op: 'hp', target: 'self', mode: 'set', value: 10 },
      { op: 'setSpecialty', target: 'opponent', to: 'Darkness' },
    ],
  },
  // 106 VenomMyotismon — None
  106: {
    cardId: 106,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 107 Piedmon — Both players discard all Cards in Hands.
  107: {
    cardId: 107,
    timing: 'support',
    ops: [{ op: 'discardHand', target: 'both', count: 'all', selection: 'unspecified' }],
  },
  // 108 Machinedramon — None
  108: {
    cardId: 108,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 109 Infermon — Discard 5 Cards from own Online Deck. Boost own Attack Power +400.
  109: {
    cardId: 109,
    timing: 'support',
    ops: [
      { op: 'mill', target: 'self', count: 5 },
      { op: 'attackPower', target: 'self', mode: 'add', value: 400 },
    ],
  },
  // 110 LadyDevimon — Both players boost Attack Power +200.
  110: {
    cardId: 110,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'both', mode: 'add', value: 200 }],
  },
  // 111 Myotismon — Digimon KO'd in battle revives with 500 HP. Battle is still lost.
  111: {
    cardId: 111,
    timing: 'support',
    ops: [{ op: 'reviveOnKo', target: 'self', hp: 500 }],
  },
  // 112 Megadramon — Both players' HP are halved.
  112: {
    cardId: 112,
    timing: 'support',
    ops: [{ op: 'hp', target: 'both', mode: 'divide', value: 2 }],
  },
  // 113 SkullGreymon — If opponent's Specialty is Nature, opponent discards all Cards.
  113: {
    cardId: 113,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Nature'] },
        then: [{ op: 'discardHand', target: 'opponent', count: 'all', selection: 'unspecified' }],
      },
    ],
  },
  // 114 Phantomon — Discard 7 Cards from own Online Deck, own Attack is "Eat-up HP."
  114: {
    cardId: 114,
    timing: 'support',
    ops: [
      { op: 'mill', target: 'self', count: 7 },
      { op: 'grantAbility', target: 'self', ability: { kind: 'eatUpHp' } },
    ],
  },
  // 115 WaruMonzaemon — Own HP become 10. Own Attack Power is doubled.
  115: {
    cardId: 115,
    timing: 'support',
    ops: [
      { op: 'hp', target: 'self', mode: 'set', value: 10 },
      { op: 'attackPower', target: 'self', mode: 'multiply', value: 2 },
    ],
  },
  // 116 Andromon — Own HP are halved. Boost own Attack Power +400.
  116: {
    cardId: 116,
    timing: 'support',
    ops: [
      { op: 'hp', target: 'self', mode: 'divide', value: 2 },
      { op: 'attackPower', target: 'self', mode: 'add', value: 400 },
    ],
  },
  // 117 Stingmon — Discard 1 DP Card from own DP Slot. Boost own Attack Power +200.
  117: {
    cardId: 117,
    timing: 'support',
    ops: [
      { op: 'discardDp', target: 'self', count: 1, from: 'top' },
      { op: 'attackPower', target: 'self', mode: 'add', value: 200 },
    ],
  },
  // 118 Wizardmon — Discard all Cards in own Hand, then draw 2 Cards.
  118: {
    cardId: 118,
    timing: 'support',
    ops: [
      { op: 'discardHand', target: 'self', count: 'all', selection: 'unspecified' },
      { op: 'draw', target: 'self', count: 2 },
    ],
  },
  // 119 Devidramon — Own Attack becomes [[triangle]].
  119: {
    cardId: 119,
    timing: 'support',
    ops: [{ op: 'forceAttack', target: 'self', to: 'triangle' }],
  },
  // 120 Devimon — If opponent's Specialty is Nature, own Attack Power is tripled.
  120: {
    cardId: 120,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Nature'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 3 }],
      },
    ],
  },
  // 121 Tuskmon — Own Attack becomes [[x]].
  121: {
    cardId: 121,
    timing: 'support',
    ops: [{ op: 'forceAttack', target: 'self', to: 'x' }],
  },
  // 122 Ogremon — Discard Cards in own DP Slot and multiply Attack Power by number of discards.
  122: {
    cardId: 122,
    timing: 'support',
    ops: [
      { op: 'discardDp', target: 'self', count: 'all' },
      { op: 'attackPower', target: 'self', mode: 'multiply', value: { ref: { stat: 'lastMovedCount' } } },
    ],
  },
  // 123 Bakemon — Change own Specialty to Darkness.
  123: {
    cardId: 123,
    timing: 'support',
    ops: [{ op: 'setSpecialty', target: 'self', to: 'Darkness' }],
  },
  // 124 Guardromon — Own HP are halved. Boost own Attack Power +300.
  124: {
    cardId: 124,
    timing: 'support',
    ops: [
      { op: 'hp', target: 'self', mode: 'divide', value: 2 },
      { op: 'attackPower', target: 'self', mode: 'add', value: 300 },
    ],
  },
  // 125 Tekkamon — Both players boost Attack Power +300.
  125: {
    cardId: 125,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'both', mode: 'add', value: 300 }],
  },
  // 126 Gururumon — Both players use [[triangle]].
  126: {
    cardId: 126,
    timing: 'support',
    ops: [{ op: 'forceAttack', target: 'both', to: 'triangle' }],
  },
  // 127 Soulmon — Discard 1 Card in DP Slot. change opponent's Specialty to Darkness.
  127: {
    cardId: 127,
    timing: 'support',
    ops: [
      { op: 'discardDp', target: 'self', count: 1, from: 'top' },
      { op: 'setSpecialty', target: 'opponent', to: 'Darkness' },
    ],
  },
  // 128 Fugamon — Own Attack becomes [[circle]].
  128: {
    cardId: 128,
    timing: 'support',
    ops: [{ op: 'forceAttack', target: 'self', to: 'circle' }],
  },
  // 129 Saberdramon — Both players use [[x]].
  129: {
    cardId: 129,
    timing: 'support',
    ops: [{ op: 'forceAttack', target: 'both', to: 'x' }],
  },
  // 130 Darkrizamon — Both players use [[circle]].
  130: {
    cardId: 130,
    timing: 'support',
    ops: [{ op: 'forceAttack', target: 'both', to: 'circle' }],
  },
  // 131 Zassomon — Opponent's Attack Power become 300.
  131: {
    cardId: 131,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 300 }],
  },
  // 132 DemiDevimon — If opponent's Specialty is Nature, own Attack Power is doubled.
  132: {
    cardId: 132,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Nature'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }],
      },
    ],
  },
  // 133 BKGatomon — If opponent's Level is A, opponent's HP are halved.
  133: {
    cardId: 133,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'levelIs', who: 'opponent', in: ['A'] },
        then: [{ op: 'hp', target: 'opponent', mode: 'divide', value: 2 }],
      },
    ],
  },
  // 134 Kokuwamon — Reduce own Attack Power by -100. Recover own HP by +200.
  134: {
    cardId: 134,
    timing: 'support',
    ops: [
      { op: 'attackPower', target: 'self', mode: 'sub', value: 100 },
      { op: 'hp', target: 'self', mode: 'add', value: 200 },
    ],
  },
  // 135 Tsukaimon — Boost own [[x]] Attack Power +200. [[circle]] & [[triangle]] Attack Power are 0.
  135: {
    cardId: 135,
    timing: 'support',
    ops: [
      { op: 'attackPower', target: 'self', slot: 'x', mode: 'add', value: 200 },
      { op: 'attackPower', target: 'self', slot: 'circle', mode: 'set', value: 0 },
      { op: 'attackPower', target: 'self', slot: 'triangle', mode: 'set', value: 0 },
    ],
  },
  // 136 Dokunemon — If opponent's Specialty is Rare, opponent's HP become 100.
  136: {
    cardId: 136,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Rare'] },
        then: [{ op: 'hp', target: 'opponent', mode: 'set', value: 100 }],
      },
    ],
  },
  // 137 Aruraumon — Own Attack becomes "Eat-up HP." Own Attack Power is halved.
  137: {
    cardId: 137,
    timing: 'support',
    ops: [
      { op: 'grantAbility', target: 'self', ability: { kind: 'eatUpHp' } },
      { op: 'attackPower', target: 'self', mode: 'divide', value: 2 },
    ],
  },
  // 138 Sharmamon — Opponent's HP are halved. opponent's Attack Power is doubled.
  138: {
    cardId: 138,
    timing: 'support',
    ops: [
      { op: 'hp', target: 'opponent', mode: 'divide', value: 2 },
      { op: 'attackPower', target: 'opponent', mode: 'multiply', value: 2 },
    ],
  },
  // 139 Puppetmon — Discard 1 of opponent's Cards in DP Slot. Draw 1 Card.
  139: {
    cardId: 139,
    timing: 'support',
    ops: [
      { op: 'discardDp', target: 'opponent', count: 1, from: 'top' },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
  // 140 SuperStarmon — If opponent's Specialty is Rare, lower opponent's Attack Power to 0.
  140: {
    cardId: 140,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Rare'] },
        then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }],
      },
    ],
  },
  // 141 MetalEtemon — [[circle]] Counterattack. Attack second.
  141: {
    cardId: 141,
    timing: 'support',
    ops: [
      { op: 'grantAbility', target: 'self', ability: { kind: 'counter', slot: 'circle' } },
      { op: 'attackSecond', target: 'self' },
    ],
  },
  // 142 Shakkoumon — Recover own HP by +100. Boost own [[x]] Attack Power by +100.
  142: {
    cardId: 142,
    timing: 'support',
    ops: [
      { op: 'hp', target: 'self', mode: 'add', value: 100 },
      { op: 'attackPower', target: 'self', slot: 'x', mode: 'add', value: 100 },
    ],
  },
  // 143 Jijimon — If opponent's Specialty is Darkness, lower opponent's Attack Power to 0.
  143: {
    cardId: 143,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Darkness'] },
        then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }],
      },
    ],
  },
  // 144 Digitamamon — Swap own Specialty with opponent's Specialty.
  144: {
    cardId: 144,
    timing: 'support',
    ops: [{ op: 'swapSpecialty' }],
  },
  // 145 Vademon — Opponent's Specialty becomes the same as own Specialty.
  145: {
    cardId: 145,
    timing: 'support',
    ops: [{ op: 'setSpecialty', target: 'opponent', to: { copyFrom: 'self' } }],
  },
  // 146 Giromon — Opponent uses [[x]].
  146: {
    cardId: 146,
    timing: 'support',
    ops: [{ op: 'forceAttack', target: 'opponent', to: 'x' }],
  },
  // 147 Monzaemon — Recover own HP by +200. Boost own Attack Power by +100.
  147: {
    cardId: 147,
    timing: 'support',
    ops: [
      { op: 'hp', target: 'self', mode: 'add', value: 200 },
      { op: 'attackPower', target: 'self', mode: 'add', value: 100 },
    ],
  },
  // 148 MetalMamemon — None
  148: {
    cardId: 148,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 149 Mamemon — None
  149: {
    cardId: 149,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 150 Etemon — Lower opponent's [[x]] Attack Power to 0.
  150: {
    cardId: 150,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'opponent', slot: 'x', mode: 'set', value: 0 }],
  },
  // 151 Ankylomon — If opponent has more than 2 Cards in DP Slot, his Attack Power is 0.
  151: {
    cardId: 151,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'compare', left: { ref: { stat: 'dpCount', who: 'opponent' } }, cmp: 'gt', right: 2 },
        then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }],
      },
    ],
  },
  // 152 Starmon — If opponent's Specialty is Darkness, opponent's Support Effect is voided.
  152: {
    cardId: 152,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Darkness'] },
        then: [{ op: 'voidSupport', target: 'opponent', scope: 'support' }],
      },
    ],
  },
  // 153 Thundermon — If opponent used [[x]], discard all Cards in opponent's Hand.
  153: {
    cardId: 153,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'attackIs', who: 'opponent', in: ['x'] },
        then: [{ op: 'discardHand', target: 'opponent', count: 'all', selection: 'unspecified' }],
      },
    ],
  },
  // 154 PlatinumSukamon — Move the top Card from Offline Pile to Online Deck.
  154: {
    cardId: 154,
    timing: 'support',
    ops: [{ op: 'recycleOffline', target: 'self', count: 1, shuffle: false, position: 'top' }],
  },
  // 155 ShellNumemon — Discard opponent's top DP Card shown in DP Slot.
  155: {
    cardId: 155,
    timing: 'support',
    ops: [{ op: 'discardDp', target: 'opponent', count: 1, from: 'top' }],
  },
  // 156 Nanimon — Return all Cards in own Hand to Online Deck and Shuffle.
  156: {
    cardId: 156,
    timing: 'support',
    ops: [{ op: 'handToDeck', target: 'self', shuffle: true }],
  },
  // 157 Numemon — Discard opponent's 2 top DP Cards in his DP Slot.
  157: {
    cardId: 157,
    timing: 'support',
    ops: [{ op: 'discardDp', target: 'opponent', count: 2, from: 'top' }],
  },
  // 158 Sukamon — Discard 1 Card from opponent's Hand at random.
  158: {
    cardId: 158,
    timing: 'support',
    ops: [{ op: 'discardHand', target: 'opponent', count: 1, selection: 'random' }],
  },
  // 159 Rockmon — Discard 3 Cards from opponent's Online Deck.
  159: {
    cardId: 159,
    timing: 'support',
    ops: [{ op: 'mill', target: 'opponent', count: 3 }],
  },
  // 160 Geremon — Discard all Cards in DP Slot. Foe discards same number of DP Cards.
  160: {
    cardId: 160,
    timing: 'support',
    ops: [
      { op: 'discardDp', target: 'self', count: 'all' },
      { op: 'discardDp', target: 'opponent', count: { ref: { stat: 'lastMovedCount' } }, from: 'top' },
    ],
  },
  // 161 NiseDrimogemon — Opponent uses [[triangle]].
  161: {
    cardId: 161,
    timing: 'support',
    ops: [{ op: 'forceAttack', target: 'opponent', to: 'triangle' }],
  },
  // 162 ShimaUnimon — None
  162: {
    cardId: 162,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 163 MudFrigimon — None
  163: {
    cardId: 163,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 164 SandYanmamon — Opponent uses [[circle]]. Lower opponent's Attack Power -100.
  164: {
    cardId: 164,
    timing: 'support',
    ops: [
      { op: 'forceAttack', target: 'opponent', to: 'circle' },
      { op: 'attackPower', target: 'opponent', mode: 'sub', value: 100 },
    ],
  },
  // 165 L-ToyAgumon — If 1 or less Cards left in own Hand, opponent's Attack Power goes to 0.
  165: {
    cardId: 165,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'compare', left: { ref: { stat: 'handCount', who: 'self' } }, cmp: 'lte', right: 1 },
        then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }],
      },
    ],
  },
  // 166 Hagurumon — Discard all Cards in DP Slot. Recover HP, number of discards x100.
  166: {
    cardId: 166,
    timing: 'support',
    ops: [
      { op: 'discardDp', target: 'self', count: 'all' },
      { op: 'hp', target: 'self', mode: 'add', value: { ref: { stat: 'lastMovedCount' }, mul: 100 } },
    ],
  },
  // 167 ToyAgumon — Discard 1 Card at random from own Hand. HP of both Players are 200.
  167: {
    cardId: 167,
    timing: 'support',
    ops: [
      { op: 'discardHand', target: 'self', count: 1, selection: 'random' },
      { op: 'hp', target: 'both', mode: 'set', value: 200 },
    ],
  },
  // 168 ClearAgumon — Opponent's Support Effect is voided.
  168: {
    cardId: 168,
    timing: 'support',
    ops: [{ op: 'voidSupport', target: 'opponent', scope: 'support' }],
  },
  // 169 Vi-Elecmon — None
  169: {
    cardId: 169,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 170 Psychemon — Own HP become same as opponent's.
  170: {
    cardId: 170,
    timing: 'support',
    ops: [{ op: 'hp', target: 'self', mode: 'set', value: { ref: { stat: 'hp', who: 'opponent' } } }],
  },
  // 171 ModokiBetamon — Opponent's HP become same as own. Own Attack Power becomes 0.
  171: {
    cardId: 171,
    timing: 'support',
    ops: [
      { op: 'hp', target: 'opponent', mode: 'set', value: { ref: { stat: 'hp', who: 'self' } } },
      { op: 'attackPower', target: 'self', mode: 'set', value: 0 },
    ],
  },
  // 172 Flamedramon — Boost own Attack Power +100. Draw 1 Card.
  172: {
    cardId: 172,
    timing: 'support',
    ops: [
      { op: 'attackPower', target: 'self', mode: 'add', value: 100 },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
  // 173 Magnamon — Boost own Attack Power by +100. Draw 1 Card.
  173: {
    cardId: 173,
    timing: 'support',
    ops: [
      { op: 'attackPower', target: 'self', mode: 'add', value: 100 },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
  // 174 Baronmon — If foe's Specialty is Darkness, own Attack Power is Doubled. Draw 1 Card.
  174: {
    cardId: 174,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Darkness'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }],
      },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
  // 175 Veemon — Boost own Attack Power +100. Draw 1 Card.
  175: {
    cardId: 175,
    timing: 'support',
    ops: [
      { op: 'attackPower', target: 'self', mode: 'add', value: 100 },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
  // 176 Submarimon — Discard 2 Cards from opponent's Online Deck. Draw 1 Card.
  176: {
    cardId: 176,
    timing: 'support',
    ops: [
      { op: 'mill', target: 'opponent', count: 2 },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
  // 177 Quetzalmon — Lower Opponent's Attack Power -100. Draw 1 Card.
  177: {
    cardId: 177,
    timing: 'support',
    ops: [
      { op: 'attackPower', target: 'opponent', mode: 'sub', value: 100 },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
  // 178 Tylomon — Change own Specialty to Nature. Draw 1 Card.
  178: {
    cardId: 178,
    timing: 'support',
    ops: [
      { op: 'setSpecialty', target: 'self', to: 'Nature' },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
  // 179 Halsemon — Draw 3 Cards.
  179: {
    cardId: 179,
    timing: 'support',
    ops: [{ op: 'draw', target: 'self', count: 3 }],
  },
  // 180 Pegasusmon — If foe's Specialty is Nature, own Attack Power is doubled. Draw 1 Card.
  180: {
    cardId: 180,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Nature'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }],
      },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
  // 181 Nefertimon — Change own Specialty to Nature. Draw 1 card.
  181: {
    cardId: 181,
    timing: 'support',
    ops: [
      { op: 'setSpecialty', target: 'self', to: 'Nature' },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
  // 182 Hawkmon — Draw 3 Cards.
  182: {
    cardId: 182,
    timing: 'support',
    ops: [{ op: 'draw', target: 'self', count: 3 }],
  },
  // 183 Patamon — If foe's Specialty is Darkness, own Attack Power is doubled. Draw 1 Card.
  183: {
    cardId: 183,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Darkness'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }],
      },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
  // 184 Gatomon — Change own Specialty to Nature. Draw 1 Card.
  184: {
    cardId: 184,
    timing: 'support',
    ops: [
      { op: 'setSpecialty', target: 'self', to: 'Nature' },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
  // 185 Raidramon — Boost own Attack Power by +100. Draw 1 Card.
  185: {
    cardId: 185,
    timing: 'support',
    ops: [
      { op: 'attackPower', target: 'self', mode: 'add', value: 100 },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
  // 186 Shadramon — Lower Opponent's Attack Power -100. Draw 1 Card.
  186: {
    cardId: 186,
    timing: 'support',
    ops: [
      { op: 'attackPower', target: 'opponent', mode: 'sub', value: 100 },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
  // 187 Wormmon — Lower Opponent's Attack Power -100. Draw 1 Card.
  187: {
    cardId: 187,
    timing: 'support',
    ops: [
      { op: 'attackPower', target: 'opponent', mode: 'sub', value: 100 },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
  // 188 Shurimon — Draw 3 Cards.
  188: {
    cardId: 188,
    timing: 'support',
    ops: [{ op: 'draw', target: 'self', count: 3 }],
  },
  // 189 Digmon — Discard 2 Cards from opponent's Online Deck. Draw 1 Card.
  189: {
    cardId: 189,
    timing: 'support',
    ops: [
      { op: 'mill', target: 'opponent', count: 2 },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
  // 190 Armadillomon — Discard 2 Cards from opponent's Online Deck. Draw 1 Card.
  190: {
    cardId: 190,
    timing: 'support',
    ops: [
      { op: 'mill', target: 'opponent', count: 2 },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
};
