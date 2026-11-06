import type { EffectRegistry } from '../../types/effects';

/**
 * Effect definitions for Option cards (191..300).
 * Cards 191..292 are Battle Support Option cards (`timing: 'support'`).
 * Cards 293..300 are Digivolve Phase Option cards (`timing: 'digivolvePhase'`).
 */
export const OPTION_EFFECTS: EffectRegistry = {
  // 191 Golden Banana — Own HP are halved. Counterattack. Attack second.
  191: {
    cardId: 191,
    timing: 'support',
    ops: [
      { op: 'hp', target: 'self', mode: 'divide', value: 2 },
      { op: 'grantAbility', target: 'self', ability: { kind: 'counter', slot: 'any' } },
      { op: 'attackSecond', target: 'self' },
    ],
  },
  // 192 Devil's Chip — Discard 1 Card from own Hand. Boost both players' Attack Power +600.
  192: {
    cardId: 192,
    timing: 'support',
    ops: [
      { op: 'discardHand', target: 'self', count: 1, selection: 'unspecified' },
      { op: 'attackPower', target: 'both', mode: 'add', value: 600 },
    ],
  },
  // 193 Whistle — If own Level is below opponent's, opponent's Attack Power becomes 0.
  193: {
    cardId: 193,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'levelCompare', cmp: 'lt' },
        then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }],
      },
    ],
  },
  // 194 Giga Hand — Discard 7 Cards from Online Deck. Own Attack Power is same as own HP.
  194: {
    cardId: 194,
    timing: 'support',
    ops: [
      { op: 'mill', target: 'self', count: 7 },
      { op: 'attackPower', target: 'self', mode: 'set', value: { ref: { stat: 'hp', who: 'self' } } },
    ],
  },
  // 195 Metallic Banana — Own HP are halved. Opponent's Attack Power becomes 0.
  195: {
    cardId: 195,
    timing: 'support',
    ops: [
      { op: 'hp', target: 'self', mode: 'divide', value: 2 },
      { op: 'attackPower', target: 'opponent', mode: 'set', value: 0 },
    ],
  },
  // 196 Shining Mane — If opponent's HP are more than 1000, opponent's HP are halved.
  196: {
    cardId: 196,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'compare', left: { ref: { stat: 'hp', who: 'opponent' } }, cmp: 'gt', right: 1000 },
        then: [{ op: 'hp', target: 'opponent', mode: 'divide', value: 2 }],
      },
    ],
  },
  // 197 Mega Rec. Floppy — Discard 7 Cards from own Online Deck. Recover own HP by +1000.
  197: {
    cardId: 197,
    timing: 'support',
    ops: [
      { op: 'mill', target: 'self', count: 7 },
      { op: 'hp', target: 'self', mode: 'add', value: 1000 },
    ],
  },
  // 198 Mega Attack Chip — Discard 7 Cards from own Online Deck. Boost own Attack Power +500.
  198: {
    cardId: 198,
    timing: 'support',
    ops: [
      { op: 'mill', target: 'self', count: 7 },
      { op: 'attackPower', target: 'self', mode: 'add', value: 500 },
    ],
  },
  // 199 Dark Lord's Cape — If opponent's HP is less than own, boost own Attack Power +400.
  199: {
    cardId: 199,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: {
          cond: 'compare',
          left: { ref: { stat: 'hp', who: 'opponent' } },
          cmp: 'lt',
          right: { ref: { stat: 'hp', who: 'self' } },
        },
        then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 400 }],
      },
    ],
  },
  // 200 Fake Sevens — None
  200: {
    cardId: 200,
    timing: 'support',
    ops: [{ op: 'none' }],
  },
  // 201 Net Worm — If both players use same Attack, discard all Cards in foe's Hand.
  201: {
    cardId: 201,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'attacksSame' },
        then: [{ op: 'discardHand', target: 'opponent', count: 'all', selection: 'unspecified' }],
      },
    ],
  },
  // 202 Missile Pod — Discard all Cards in own Hand. Own Attack Power is doubled.
  202: {
    cardId: 202,
    timing: 'support',
    ops: [
      { op: 'discardHand', target: 'self', count: 'all', selection: 'unspecified' },
      { op: 'attackPower', target: 'self', mode: 'multiply', value: 2 },
    ],
  },
  // 203 Shogun's Order — Both players' Attack Power becomes 0.
  203: {
    cardId: 203,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'both', mode: 'set', value: 0 }],
  },
  // 204 Beetle Diamond — Attack first. Boost own Attack Power +100.
  204: {
    cardId: 204,
    timing: 'support',
    ops: [
      { op: 'attackFirst', target: 'self' },
      { op: 'attackPower', target: 'self', mode: 'add', value: 100 },
    ],
  },
  // 205 Dark Bone — Own attack becomes "Eat-up HP."
  205: {
    cardId: 205,
    timing: 'support',
    ops: [{ op: 'grantAbility', target: 'self', ability: { kind: 'eatUpHp' } }],
  },
  // 206 Red Digivice — If own Specialty is Fire, boost own Attack Power +100, recover HP +200.
  206: {
    cardId: 206,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'self', in: ['Fire'] },
        then: [
          { op: 'attackPower', target: 'self', mode: 'add', value: 100 },
          { op: 'hp', target: 'self', mode: 'add', value: 200 },
        ],
      },
    ],
  },
  // 207 Blue Digivice — If own Specialty is Ice, boost own Attack Power +100, recover HP +200.
  207: {
    cardId: 207,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'self', in: ['Ice'] },
        then: [
          { op: 'attackPower', target: 'self', mode: 'add', value: 100 },
          { op: 'hp', target: 'self', mode: 'add', value: 200 },
        ],
      },
    ],
  },
  // 208 Green Digivice — If own Specialty is Nature, boost own Attack Power +100, recover HP +200.
  208: {
    cardId: 208,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'self', in: ['Nature'] },
        then: [
          { op: 'attackPower', target: 'self', mode: 'add', value: 100 },
          { op: 'hp', target: 'self', mode: 'add', value: 200 },
        ],
      },
    ],
  },
  // 209 Black Digivice — If own Specialty is Darkness, boost own Attack Power +100, recover HP +200.
  209: {
    cardId: 209,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'self', in: ['Darkness'] },
        then: [
          { op: 'attackPower', target: 'self', mode: 'add', value: 100 },
          { op: 'hp', target: 'self', mode: 'add', value: 200 },
        ],
      },
    ],
  },
  // 210 Yellow Digivice — If own Specialty is Rare, boost own Attack Power +100, recover HP +200.
  210: {
    cardId: 210,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'self', in: ['Rare'] },
        then: [
          { op: 'attackPower', target: 'self', mode: 'add', value: 100 },
          { op: 'hp', target: 'self', mode: 'add', value: 200 },
        ],
      },
    ],
  },
  // 211 Pink Digivice — If Specialties are same, boost own Attack Power +200, recover HP +400.
  211: {
    cardId: 211,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtiesSame' },
        then: [
          { op: 'attackPower', target: 'self', mode: 'add', value: 200 },
          { op: 'hp', target: 'self', mode: 'add', value: 400 },
        ],
      },
    ],
  },
  // 212 Another Dimension — Discard 7 Cards from both players' Online Decks.
  212: {
    cardId: 212,
    timing: 'support',
    ops: [{ op: 'mill', target: 'both', count: 7 }],
  },
  // 213 UnInstall — If both Attacks are same, discard 7 Cards from foe's Online Deck.
  213: {
    cardId: 213,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'attacksSame' },
        then: [{ op: 'mill', target: 'opponent', count: 7 }],
      },
    ],
  },
  // 214 Evil Program — Discard 1 Card in own DP Slot. Discard all foe's Cards in DP Slot.
  214: {
    cardId: 214,
    timing: 'support',
    ops: [
      { op: 'discardDp', target: 'self', count: 1, from: 'top' },
      { op: 'discardDp', target: 'opponent', count: 'all' },
    ],
  },
  // 215 Coliseum — Both players' attacks become [[circle]]. Boost own [[circle]] Attack Power +100.
  215: {
    cardId: 215,
    timing: 'support',
    ops: [
      { op: 'forceAttack', target: 'both', to: 'circle' },
      { op: 'attackPower', target: 'self', slot: 'circle', mode: 'add', value: 100 },
    ],
  },
  // 216 Fire Altar — Changes opponent's Specialty to Fire. Draw 1 Card from own Online Deck.
  216: {
    cardId: 216,
    timing: 'support',
    ops: [
      { op: 'setSpecialty', target: 'opponent', to: 'Fire' },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
  // 217 Ice Altar — Changes opponent's Specialty to Ice. Draw 1 Card from own Online Deck.
  217: {
    cardId: 217,
    timing: 'support',
    ops: [
      { op: 'setSpecialty', target: 'opponent', to: 'Ice' },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
  // 218 Nature Altar — Changes opponent's Specialty to Nature. Draw 1 Card from own Online Deck.
  218: {
    cardId: 218,
    timing: 'support',
    ops: [
      { op: 'setSpecialty', target: 'opponent', to: 'Nature' },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
  // 219 Darkness Altar — Changes opponent's Specialty to Darkness. Draw 1 Card from own Online Deck.
  219: {
    cardId: 219,
    timing: 'support',
    ops: [
      { op: 'setSpecialty', target: 'opponent', to: 'Darkness' },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
  // 220 Rare Altar — Changes opponent's Specialty to Rare. Draw 1 Card from own Online Deck.
  220: {
    cardId: 220,
    timing: 'support',
    ops: [
      { op: 'setSpecialty', target: 'opponent', to: 'Rare' },
      { op: 'draw', target: 'self', count: 1 },
    ],
  },
  // 221 Sup. Rec. Floppy — If own HP are less than foe's HP, recover own HP by +700.
  221: {
    cardId: 221,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: {
          cond: 'compare',
          left: { ref: { stat: 'hp', who: 'self' } },
          cmp: 'lt',
          right: { ref: { stat: 'hp', who: 'opponent' } },
        },
        then: [{ op: 'hp', target: 'self', mode: 'add', value: 700 }],
      },
    ],
  },
  // 222 Mega Def. Disk ○ — Opponent's [[circle]] Attack Power goes to 0. Recover own HP by +100.
  222: {
    cardId: 222,
    timing: 'support',
    ops: [
      { op: 'attackPower', target: 'opponent', slot: 'circle', mode: 'set', value: 0 },
      { op: 'hp', target: 'self', mode: 'add', value: 100 },
    ],
  },
  // 223 Mega Def. Disk △ — Opponent's [[triangle]] Attack Power goes to 0. Recover own HP by +100.
  223: {
    cardId: 223,
    timing: 'support',
    ops: [
      { op: 'attackPower', target: 'opponent', slot: 'triangle', mode: 'set', value: 0 },
      { op: 'hp', target: 'self', mode: 'add', value: 100 },
    ],
  },
  // 224 Mega Def. Disk × — Opponent's [[x]] Attack Power goes to 0. Recover own HP by +100.
  224: {
    cardId: 224,
    timing: 'support',
    ops: [
      { op: 'attackPower', target: 'opponent', slot: 'x', mode: 'set', value: 0 },
      { op: 'hp', target: 'self', mode: 'add', value: 100 },
    ],
  },
  // 225 Heap of Junk — Opponent discards 2 Cards from his Online Deck and 1 Card from Hand.
  225: {
    cardId: 225,
    timing: 'support',
    ops: [
      { op: 'mill', target: 'opponent', count: 2 },
      { op: 'discardHand', target: 'opponent', count: 1, selection: 'unspecified' },
    ],
  },
  // 226 Beam Gun — Own Attack Power becomes 0. Opponent's HP are halved.
  226: {
    cardId: 226,
    timing: 'support',
    ops: [
      { op: 'attackPower', target: 'self', mode: 'set', value: 0 },
      { op: 'hp', target: 'opponent', mode: 'divide', value: 2 },
    ],
  },
  // 227 Chain Saw — Make own HP 10. Own Attack Power is tripled.
  227: {
    cardId: 227,
    timing: 'support',
    ops: [
      { op: 'hp', target: 'self', mode: 'set', value: 10 },
      { op: 'attackPower', target: 'self', mode: 'multiply', value: 3 },
    ],
  },
  // 228 Metal Parts — Discard own Hand. Multiply own Attack Power by number of discarded Cards.
  228: {
    cardId: 228,
    timing: 'support',
    ops: [
      { op: 'discardHand', target: 'self', count: 'all', selection: 'unspecified' },
      { op: 'attackPower', target: 'self', mode: 'multiply', value: { ref: { stat: 'lastMovedCount' } } },
    ],
  },
  // 229 Metal Armor — Discard own DP Slot Cards. Multiply own Attack Power by number of discards.
  229: {
    cardId: 229,
    timing: 'support',
    ops: [
      { op: 'discardDp', target: 'self', count: 'all' },
      { op: 'attackPower', target: 'self', mode: 'multiply', value: { ref: { stat: 'lastMovedCount' } } },
    ],
  },
  // 230 Mega Hand — Own Attack Power matches own HP, then own HP are halved.
  230: {
    cardId: 230,
    timing: 'support',
    ops: [
      { op: 'attackPower', target: 'self', mode: 'set', value: { ref: { stat: 'hp', who: 'self' } } },
      { op: 'hp', target: 'self', mode: 'divide', value: 2 },
    ],
  },
  // 231 Level Balancer — If own Level is R, boost own Attack Power +400.
  231: {
    cardId: 231,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'levelIs', who: 'self', in: ['R'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 400 }],
      },
    ],
  },
  // 232 Level Manager — If own Level is C, boost own Attack Power +400.
  232: {
    cardId: 232,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'levelIs', who: 'self', in: ['C'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 400 }],
      },
    ],
  },
  // 233 Level Booster — If own Level is U, boost own Attack Power +400.
  233: {
    cardId: 233,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'levelIs', who: 'self', in: ['U'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'add', value: 400 }],
      },
    ],
  },
  // 234 Armor Clash — If opponent is Level A, his Atk Pwr becomes 0 and own Atk Pwr is doubled.
  234: {
    cardId: 234,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'levelIs', who: 'opponent', in: ['A'] },
        then: [
          { op: 'attackPower', target: 'opponent', mode: 'set', value: 0 },
          { op: 'attackPower', target: 'self', mode: 'multiply', value: 2 },
        ],
      },
    ],
  },
  // 235 Silver Ball — If opponent is Level U, his Atk Pwr becomes 0 and own Atk Pwr is doubled.
  235: {
    cardId: 235,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'levelIs', who: 'opponent', in: ['U'] },
        then: [
          { op: 'attackPower', target: 'opponent', mode: 'set', value: 0 },
          { op: 'attackPower', target: 'self', mode: 'multiply', value: 2 },
        ],
      },
    ],
  },
  // 236 Coral Charm — If foe's Specialty is Fire or Ice, his Attack Power goes to 0.
  236: {
    cardId: 236,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Fire', 'Ice'] },
        then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }],
      },
    ],
  },
  // 237 Patch of Love — If foe's Specialty is Nature or Darkness, his Attack Power goes to 0.
  237: {
    cardId: 237,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'specialtyIs', who: 'opponent', in: ['Nature', 'Darkness'] },
        then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }],
      },
    ],
  },
  // 238 Mystery Egg — Changes both players' Specialties to Rare.
  238: {
    cardId: 238,
    timing: 'support',
    ops: [{ op: 'setSpecialty', target: 'both', to: 'Rare' }],
  },
  // 239 Miracle Ruby — KO'd Digimon revives with 1000. Battle is still lost.
  239: {
    cardId: 239,
    timing: 'support',
    ops: [{ op: 'reviveOnKo', target: 'self', hp: 1000 }],
  },
  // 240 Cyber Parts — If both Attacks are same, own Attack Power is tripled.
  240: {
    cardId: 240,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'attacksSame' },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 3 }],
      },
    ],
  },
  // 241 Liquid Crystal — If both players use same attack, opponent's Attack Power becomes 0.
  241: {
    cardId: 241,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'attacksSame' },
        then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }],
      },
    ],
  },
  // 242 Deluxe Mushroom — If both players use same Attack, recover own HP +700.
  242: {
    cardId: 242,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'attacksSame' },
        then: [{ op: 'hp', target: 'self', mode: 'add', value: 700 }],
      },
    ],
  },
  // 243 Lucky Mushroom — If both Attacks are different, recover own HP by +500.
  243: {
    cardId: 243,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'attacksDifferent' },
        then: [{ op: 'hp', target: 'self', mode: 'add', value: 500 }],
      },
    ],
  },
  // 244 Premium Steak — Recover own HP by +500. Recover foe's HP by +200.
  244: {
    cardId: 244,
    timing: 'support',
    ops: [
      { op: 'hp', target: 'self', mode: 'add', value: 500 },
      { op: 'hp', target: 'opponent', mode: 'add', value: 200 },
    ],
  },
  // 245 Short Lance — If both attacks are different, own Attack Power is doubled.
  245: {
    cardId: 245,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'attacksDifferent' },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }],
      },
    ],
  },
  // 246 Med. Rec. Floppy — Own Attack Power is halved. Recover own HP by +500.
  246: {
    cardId: 246,
    timing: 'support',
    ops: [
      { op: 'attackPower', target: 'self', mode: 'divide', value: 2 },
      { op: 'hp', target: 'self', mode: 'add', value: 500 },
    ],
  },
  // 247 Digimon Analyzer — Move top 3 Cards from Offline Pile to Online Deck and shuffle.
  247: {
    cardId: 247,
    timing: 'support',
    ops: [{ op: 'recycleOffline', target: 'self', count: 3, shuffle: true }],
  },
  // 248 Training Manual — Draw until there are 4 Cards in own Hand. Recover own HP by +100.
  248: {
    cardId: 248,
    timing: 'support',
    ops: [
      { op: 'drawUntil', target: 'self', handSize: 4 },
      { op: 'hp', target: 'self', mode: 'add', value: 100 },
    ],
  },
  // 249 Circle Hitter — If opponent uses [[circle]], attack first and boost own Attack Power +500.
  249: {
    cardId: 249,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'attackIs', who: 'opponent', in: ['circle'] },
        then: [
          { op: 'attackFirst', target: 'self' },
          { op: 'attackPower', target: 'self', mode: 'add', value: 500 },
        ],
      },
    ],
  },
  // 250 Triangle Hitter — If opponent uses [[triangle]], attack first and boost own Attack Power +500.
  250: {
    cardId: 250,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'attackIs', who: 'opponent', in: ['triangle'] },
        then: [
          { op: 'attackFirst', target: 'self' },
          { op: 'attackPower', target: 'self', mode: 'add', value: 500 },
        ],
      },
    ],
  },
  // 251 Cross Hitter — If opponent uses [[x]], attack first and boost own Attack Power +500.
  251: {
    cardId: 251,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'attackIs', who: 'opponent', in: ['x'] },
        then: [
          { op: 'attackFirst', target: 'self' },
          { op: 'attackPower', target: 'self', mode: 'add', value: 500 },
        ],
      },
    ],
  },
  // 252 Suka's Curse — Opponent discards 2 Cards at random from his Hand.
  252: {
    cardId: 252,
    timing: 'support',
    ops: [{ op: 'discardHand', target: 'opponent', count: 2, selection: 'random' }],
  },
  // 253 Cherrymon's Mist — Opponent's Support and Option Effects are voided.
  253: {
    cardId: 253,
    timing: 'support',
    ops: [{ op: 'voidSupport', target: 'opponent', scope: 'supportAndOption' }],
  },
  // 254 Hacking — If own Level is lower, switch HP with opponent.
  254: {
    cardId: 254,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: { cond: 'levelCompare', cmp: 'lt' },
        then: [{ op: 'swapHp' }],
      },
    ],
  },
  // 255 Digimon Grave — Opponent discards 4 top Cards from Online Deck.
  255: {
    cardId: 255,
    timing: 'support',
    ops: [{ op: 'mill', target: 'opponent', count: 4 }],
  },
  // 256 Data Copy — Own Attack Power, HP, and Specialty become same as the opponent's.
  256: {
    cardId: 256,
    timing: 'support',
    ops: [{ op: 'copyStats', from: 'opponent', stats: ['attackPower', 'hp', 'specialty'] }],
  },
  // 257 Partner Finder — Pick Partner Card from own Online Deck at random and put in own Hand.
  257: {
    cardId: 257,
    timing: 'support',
    ops: [
      {
        op: 'searchDeck',
        target: 'self',
        filter: { levels: ['R P'] },
        count: 1,
        selection: 'random',
        to: 'hand',
        shuffleAfter: true,
      },
    ],
  },
  // 258 Fire Spot — Change own Specialty to Fire. Boost own Attack Power +200.
  258: {
    cardId: 258,
    timing: 'support',
    ops: [
      { op: 'setSpecialty', target: 'self', to: 'Fire' },
      { op: 'attackPower', target: 'self', mode: 'add', value: 200 },
    ],
  },
  // 259 Ice Crystal — Change own Specialty to Ice. Recover own HP by +200.
  259: {
    cardId: 259,
    timing: 'support',
    ops: [
      { op: 'setSpecialty', target: 'self', to: 'Ice' },
      { op: 'hp', target: 'self', mode: 'add', value: 200 },
    ],
  },
  // 260 Earth Charm — Change own Specialty to Nature. Attack first.
  260: {
    cardId: 260,
    timing: 'support',
    ops: [
      { op: 'setSpecialty', target: 'self', to: 'Nature' },
      { op: 'attackFirst', target: 'self' },
    ],
  },
  // 261 Black Gear — Change own Specialty to Darkness. Both players' HP are halved.
  261: {
    cardId: 261,
    timing: 'support',
    ops: [
      { op: 'setSpecialty', target: 'self', to: 'Darkness' },
      { op: 'hp', target: 'both', mode: 'divide', value: 2 },
    ],
  },
  // 262 Stuffed Animal — Change own Specialty to Rare. Opponent discards 1 Card at random.
  262: {
    cardId: 262,
    timing: 'support',
    ops: [
      { op: 'setSpecialty', target: 'self', to: 'Rare' },
      { op: 'discardHand', target: 'opponent', count: 1, selection: 'random' },
    ],
  },
  // 263 Disrupt Ray — Opponent's attack changes from [[circle]] to [[triangle]], [[triangle]] to [[x]], or [[x]] to [[circle]].
  263: {
    cardId: 263,
    timing: 'support',
    ops: [{ op: 'rotateAttack', target: 'opponent', direction: 'forward' }],
  },
  // 264 Attack Chip — Boost own Attack Power +300.
  264: {
    cardId: 264,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'self', mode: 'add', value: 300 }],
  },
  // 265 High Speed Disk — Randomly discard 1 Card from own Hand. Opponent's Attack Power is 0.
  265: {
    cardId: 265,
    timing: 'support',
    ops: [
      { op: 'discardHand', target: 'self', count: 1, selection: 'random' },
      { op: 'attackPower', target: 'opponent', mode: 'set', value: 0 },
    ],
  },
  // 266 Recovery Floppy — Recover own HP by +300.
  266: {
    cardId: 266,
    timing: 'support',
    ops: [{ op: 'hp', target: 'self', mode: 'add', value: 300 }],
  },
  // 267 Attack Disk ○ — Own [[circle]] Attack Power is doubled.
  267: {
    cardId: 267,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'self', slot: 'circle', mode: 'multiply', value: 2 }],
  },
  // 268 Attack Disk △ — Own [[triangle]] Attack Power is doubled.
  268: {
    cardId: 268,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'self', slot: 'triangle', mode: 'multiply', value: 2 }],
  },
  // 269 Attack Disk × — Own [[x]] Attack Power is doubled.
  269: {
    cardId: 269,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'self', slot: 'x', mode: 'multiply', value: 2 }],
  },
  // 270 Defense Disk ○ — Opponent's [[circle]] Attack Power is 0.
  270: {
    cardId: 270,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'opponent', slot: 'circle', mode: 'set', value: 0 }],
  },
  // 271 Defense Disk △ — Opponent's [[triangle]] Attack Power is 0.
  271: {
    cardId: 271,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'opponent', slot: 'triangle', mode: 'set', value: 0 }],
  },
  // 272 Defense Disk × — Opponent's [[x]] Attack Power is 0.
  272: {
    cardId: 272,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'opponent', slot: 'x', mode: 'set', value: 0 }],
  },
  // 273 Digi-Garnet — Boost own Attack Power +100.
  273: {
    cardId: 273,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'self', mode: 'add', value: 100 }],
  },
  // 274 Digi-Amethyst — Recover own HP by +100.
  274: {
    cardId: 274,
    timing: 'support',
    ops: [{ op: 'hp', target: 'self', mode: 'add', value: 100 }],
  },
  // 275 Digi-Aquamarine — KO'd Digimon revives with 100 HP. Battle is still lost.
  275: {
    cardId: 275,
    timing: 'support',
    ops: [{ op: 'reviveOnKo', target: 'self', hp: 100 }],
  },
  // 276 Digi-Diamond — Draw 2 Cards from Online Deck.
  276: {
    cardId: 276,
    timing: 'support',
    ops: [{ op: 'draw', target: 'self', count: 2 }],
  },
  // 277 Digi-Emerald — Change own Specialty to Nature.
  277: {
    cardId: 277,
    timing: 'support',
    ops: [{ op: 'setSpecialty', target: 'self', to: 'Nature' }],
  },
  // 278 Digi-Pearl — Changes own Specialty to Rare.
  278: {
    cardId: 278,
    timing: 'support',
    ops: [{ op: 'setSpecialty', target: 'self', to: 'Rare' }],
  },
  // 279 Digi-Ruby — Changes own Specialty to Fire.
  279: {
    cardId: 279,
    timing: 'support',
    ops: [{ op: 'setSpecialty', target: 'self', to: 'Fire' }],
  },
  // 280 Digi-Sardnyx — Change own Specialty to Darkness.
  280: {
    cardId: 280,
    timing: 'support',
    ops: [{ op: 'setSpecialty', target: 'self', to: 'Darkness' }],
  },
  // 281 Digi-Sapphire — Change own Specialty to Ice.
  281: {
    cardId: 281,
    timing: 'support',
    ops: [{ op: 'setSpecialty', target: 'self', to: 'Ice' }],
  },
  // 282 Digi-Opal — Own attack becomes [[circle]].
  282: {
    cardId: 282,
    timing: 'support',
    ops: [{ op: 'forceAttack', target: 'self', to: 'circle' }],
  },
  // 283 Digi-Topaz — Own attack becomes [[triangle]].
  283: {
    cardId: 283,
    timing: 'support',
    ops: [{ op: 'forceAttack', target: 'self', to: 'triangle' }],
  },
  // 284 Digi-Turquoise — Own attack becomes [[x]].
  284: {
    cardId: 284,
    timing: 'support',
    ops: [{ op: 'forceAttack', target: 'self', to: 'x' }],
  },
  // 285 Wild Sevens — Own Attack Power is tripled.
  285: {
    cardId: 285,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 3 }],
  },
  // 286 Holy Sevens — Recover own HP by +1000.
  286: {
    cardId: 286,
    timing: 'support',
    ops: [{ op: 'hp', target: 'self', mode: 'add', value: 1000 }],
  },
  // 287 Dark Sevens — If opponent's HP are lower then own, opponent's HP become 10.
  287: {
    cardId: 287,
    timing: 'support',
    ops: [
      {
        op: 'if',
        cond: {
          cond: 'compare',
          left: { ref: { stat: 'hp', who: 'opponent' } },
          cmp: 'lt',
          right: { ref: { stat: 'hp', who: 'self' } },
        },
        then: [{ op: 'hp', target: 'opponent', mode: 'set', value: 10 }],
      },
    ],
  },
  // 288 Grand Sevens — Own Attack Power is boosted by the number of own HP.
  288: {
    cardId: 288,
    timing: 'support',
    ops: [{ op: 'attackPower', target: 'self', mode: 'add', value: { ref: { stat: 'hp', who: 'self' } } }],
  },
  // 289 Mystic Sevens — Opponent's Support and Option Effects are voided. His Attack Power is 0.
  289: {
    cardId: 289,
    timing: 'support',
    ops: [
      { op: 'voidSupport', target: 'opponent', scope: 'supportAndOption' },
      { op: 'attackPower', target: 'opponent', mode: 'set', value: 0 },
    ],
  },
  // 290 Speed Sevens — Attack first. Own attack becomes "Eat-up HP." Boost Attack Power +200.
  290: {
    cardId: 290,
    timing: 'support',
    ops: [
      { op: 'attackFirst', target: 'self' },
      { op: 'grantAbility', target: 'self', ability: { kind: 'eatUpHp' } },
      { op: 'attackPower', target: 'self', mode: 'add', value: 200 },
    ],
  },
  // 291 Reverse Sevens — Move top 10 Cards from Offline Pile to Online Deck, then shuffle.
  291: {
    cardId: 291,
    timing: 'support',
    ops: [{ op: 'recycleOffline', target: 'self', count: 10, shuffle: true }],
  },
  // 292 Rosemon's Lure — Opponent discards his Hand and all Cards in his DP Slot.
  292: {
    cardId: 292,
    timing: 'support',
    ops: [
      { op: 'discardHand', target: 'opponent', count: 'all', selection: 'unspecified' },
      { op: 'discardDp', target: 'opponent', count: 'all' },
    ],
  },
  // 293 Download Digivolve — Can digivolve regardless of own Specialty, Level, or Digivolve Pts.
  293: {
    cardId: 293,
    timing: 'digivolvePhase',
    ops: [{ op: 'digivolveModifier', ignoreSpecialty: true, ignoreLevel: true, ignoreDp: true }],
  },
  // 294 ArmorCrush Digivolve — Digivolve a Level A Digimon to C or U. (DP are needed.)
  294: {
    cardId: 294,
    timing: 'digivolvePhase',
    ops: [{ op: 'digivolveModifier', requireFromLevels: ['A'], allowedToLevels: ['C', 'U'] }],
  },
  // 295 Special Digivolve — Can digivolve regardless of own Specialty by adding DP +20.
  295: {
    cardId: 295,
    timing: 'digivolvePhase',
    ops: [{ op: 'digivolveModifier', ignoreSpecialty: true, extraDp: 20 }],
  },
  // 296 Mutant Digivolve — Can digivolve Digimon at same Level. (Need DP) (Ignore Specialty)
  296: {
    cardId: 296,
    timing: 'digivolvePhase',
    ops: [{ op: 'digivolveModifier', allowSameLevel: true, ignoreSpecialty: true }],
  },
  // 297 Warp Digivolve — Can digivolve from R to U. (DP are needed.)
  297: {
    cardId: 297,
    timing: 'digivolvePhase',
    ops: [{ op: 'digivolveModifier', allowSkipLevel: true, requireFromLevels: ['R', 'R P'], allowedToLevels: ['U'] }],
  },
  // 298 De-Armor Digivolve — Downgrade a Level A Digimon to Level R.
  298: {
    cardId: 298,
    timing: 'digivolvePhase',
    ops: [{ op: 'devolve', target: 'self', levels: 1, requireFromLevels: ['A'], toLevel: 'R' }],
  },
  // 299 Speed Digivolve — Can disregard DP in digivolving. (Not possible in Abnormal states)
  299: {
    cardId: 299,
    timing: 'digivolvePhase',
    ops: [{ op: 'digivolveModifier', ignoreDp: true, notInAbnormal: true }],
  },
  // 300 Digi-devolve — DownGrade own digivolution by 1 Level. HP double when successful.
  300: {
    cardId: 300,
    timing: 'digivolvePhase',
    ops: [{ op: 'devolve', target: 'self', levels: 1, onSuccess: [{ op: 'hp', target: 'self', mode: 'multiply', value: 2 }] }],
  },
};
