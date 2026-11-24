import type {
  AttackSlot,
  CardData,
  CardEffectDef,
  CardId,
  EffectOp,
  PartnerConfigMap,
  PartnerCustomization,
  Specialty,
  XEffect,
} from '../types/game';
import { getCardById } from './cards';

export const MAX_EQUIPPED_DIGI_PARTS = 3;

export const PARTNER_CARD_IDS: readonly CardId[] = [175, 182, 183, 184, 187, 190];

export const DEFAULT_PARTNER_ARMOR: Readonly<Record<CardId, CardId>> = {
  175: 172, // Veemon -> Flamedramon
  182: 179, // Hawkmon -> Halsemon
  183: 174, // Patamon -> Baronmon
  184: 178, // Gatomon -> Tylomon
  187: 177, // Wormmon -> Quetzalmon
  190: 176, // Armadillomon -> Submarimon
};

export const ARMOR_TO_PARTNER_ID: Readonly<Record<CardId, CardId>> = {
  172: 175,
  173: 175,
  185: 175,
  179: 182,
  188: 182,
  174: 183,
  180: 183,
  178: 184,
  181: 184,
  177: 187,
  186: 187,
  176: 190,
  189: 190,
};

export type DigiPartCategory =
  | 'hp'
  | 'allAtk'
  | 'slotAtk'
  | 'xEffect'
  | 'dp'
  | 'support'
  | 'special';

export interface DigiPartDef {
  id: number; // 0..127
  no: string; // "000".."127"
  tag: string;
  category: DigiPartCategory;
  name: string;
  description: string;
  hpAdd?: number;
  allAtkAdd?: number;
  slotAtkAdd?: Partial<Record<AttackSlot, number>>;
  xPowerSetZero?: boolean;
  xEffect?: XEffect;
  dpAdd?: number;
  supportText?: string;
  supportOps?: EffectOp[];
}

const pad3 = (n: number): string => String(n).padStart(3, '0');

function makeSameAttackOp(): EffectOp[] {
  return [
    {
      op: 'if',
      cond: { cond: 'attackIs', who: 'self', in: ['circle'] },
      then: [{ op: 'forceAttack', target: 'opponent', to: 'circle' }],
      else: [
        {
          op: 'if',
          cond: { cond: 'attackIs', who: 'self', in: ['triangle'] },
          then: [{ op: 'forceAttack', target: 'opponent', to: 'triangle' }],
          else: [{ op: 'forceAttack', target: 'opponent', to: 'x' }],
        },
      ],
    },
  ];
}

export const ALL_DIGI_PARTS: readonly DigiPartDef[] = [
  // 000..006: [HP+]
  ...[50, 100, 150, 200, 300, 400, 500].map(
    (hpAdd, i): DigiPartDef => ({
      id: i,
      no: pad3(i),
      tag: '[HP+]',
      category: 'hp',
      name: `HP +${hpAdd}`,
      description: `Increases Partner HP by +${hpAdd}.`,
      hpAdd,
    }),
  ),
  // 007..009: [All Up]
  ...[50, 100, 200].map(
    (allAtkAdd, idx): DigiPartDef => ({
      id: 7 + idx,
      no: pad3(7 + idx),
      tag: '[All Up]',
      category: 'allAtk',
      name: `All Attack Powers +${allAtkAdd}`,
      description: `Increases ○, △, and ✕ Attack Powers by +${allAtkAdd}.`,
      allAtkAdd,
    }),
  ),
  // 010..014: [○ Atk]
  ...[100, 150, 200, 250, 300].map(
    (val, idx): DigiPartDef => ({
      id: 10 + idx,
      no: pad3(10 + idx),
      tag: '[○ Atk]',
      category: 'slotAtk',
      name: `Circle Attack +${val}`,
      description: `Increases [[circle]] Attack Power by +${val}.`,
      slotAtkAdd: { circle: val },
    }),
  ),
  // 015..019: [△ Atk]
  ...[50, 100, 150, 200, 250].map(
    (val, idx): DigiPartDef => ({
      id: 15 + idx,
      no: pad3(15 + idx),
      tag: '[△ Atk]',
      category: 'slotAtk',
      name: `Triangle Attack +${val}`,
      description: `Increases [[triangle]] Attack Power by +${val}.`,
      slotAtkAdd: { triangle: val },
    }),
  ),
  // 020..023: [✕ Atk]
  ...[50, 100, 150, 200].map(
    (val, idx): DigiPartDef => ({
      id: 20 + idx,
      no: pad3(20 + idx),
      tag: '[✕ Atk]',
      category: 'slotAtk',
      name: `Cross Attack +${val}`,
      description: `Increases [[x]] Attack Power by +${val}.`,
      slotAtkAdd: { x: val },
    }),
  ),
  // 024..026: [Effect] [slot] to 0, ✕ Attack -100
  ...(['circle', 'triangle', 'x'] as const).map(
    (slot, idx): DigiPartDef => {
      const token = `[[${slot}]]`;
      return {
        id: 24 + idx,
        no: pad3(24 + idx),
        tag: '[Effect]',
        category: 'xEffect',
        name: `${token} to 0`,
        description: `Sets [[x]] Effect to "${token} to 0" and adjusts [[x]] Attack Power by -100.`,
        slotAtkAdd: { x: -100 },
        xEffect: { type: 'zero', target: slot },
      };
    },
  ),
  // 027..029: [Effect] [slot] Counter, ✕ Attack to 0
  ...(['circle', 'triangle', 'x'] as const).map(
    (slot, idx): DigiPartDef => {
      const token = `[[${slot}]]`;
      return {
        id: 27 + idx,
        no: pad3(27 + idx),
        tag: '[Effect]',
        category: 'xEffect',
        name: `${token} Counter`,
        description: `Sets [[x]] Effect to "${token} Counter" and sets [[x]] Attack Power to 0.`,
        xPowerSetZero: true,
        xEffect: { type: 'counter', target: slot },
      };
    },
  ),
  // 030..034: [Effect] Opponent [Spec] ×3, ✕ Attack -200
  ...(['Fire', 'Ice', 'Nature', 'Darkness', 'Rare'] as const satisfies readonly Specialty[]).map(
    (specialty, idx): DigiPartDef => ({
      id: 30 + idx,
      no: pad3(30 + idx),
      tag: '[Effect]',
      category: 'xEffect',
      name: `${specialty} Foe ×3`,
      description: `Sets [[x]] Effect to "${specialty} Foe ×3" and adjusts [[x]] Attack Power by -200.`,
      slotAtkAdd: { x: -200 },
      xEffect: { type: 'foeX3', specialty },
    }),
  ),
  // 035..037: [Effect] 1st Attack / Jamming / Eat-Up HP
  {
    id: 35,
    no: '035',
    tag: '[Effect]',
    category: 'xEffect',
    name: '1st Attack',
    description: 'Sets [[x]] Effect to "1st Attack" and adjusts [[x]] Attack Power by -100.',
    slotAtkAdd: { x: -100 },
    xEffect: { type: 'firstAttack' },
  },
  {
    id: 36,
    no: '036',
    tag: '[Effect]',
    category: 'xEffect',
    name: 'Jamming',
    description: 'Sets [[x]] Effect to "Jamming" and adjusts [[x]] Attack Power by -100.',
    slotAtkAdd: { x: -100 },
    xEffect: { type: 'jamming' },
  },
  {
    id: 37,
    no: '037',
    tag: '[Effect]',
    category: 'xEffect',
    name: 'Eat-Up HP',
    description: 'Sets [[x]] Effect to "Eat-Up HP" and adjusts [[x]] Attack Power by -200.',
    slotAtkAdd: { x: -200 },
    xEffect: { type: 'eatUpHp' },
  },
  // 038..040: [DP]
  ...[10, 20, 30].map(
    (dpAdd, idx): DigiPartDef => ({
      id: 38 + idx,
      no: pad3(38 + idx),
      tag: '[DP]',
      category: 'dp',
      name: `DP Value +${dpAdd}P`,
      description: `Increases the Partner Rookie's DP Slot (+P) value by +${dpAdd}.`,
      dpAdd,
    }),
  ),
  // 041..045: [Sup Effect] Boost Attack Power
  ...[50, 100, 200, 300].map(
    (val, idx): DigiPartDef => ({
      id: 41 + idx,
      no: pad3(41 + idx),
      tag: '[Sup Effect]',
      category: 'support',
      name: `Boost Attack +${val}`,
      description: `Replaces Partner Support Effect with "Boost own Attack Power +${val}."`,
      supportText: `Boost own Attack Power +${val}.`,
      supportOps: [{ op: 'attackPower', target: 'self', mode: 'add', value: val }],
    }),
  ),
  {
    id: 45,
    no: '045',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Own Attack Doubled',
    description: 'Replaces Partner Support Effect with "Own Attack Power is doubled."',
    supportText: 'Own Attack Power is doubled.',
    supportOps: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }],
  },
  // 046..050: [Sup Effect] Circle Attack Boost/Multiplier
  ...[300, 400, 500].map(
    (val, idx): DigiPartDef => ({
      id: 46 + idx,
      no: pad3(46 + idx),
      tag: '[Sup Effect]',
      category: 'support',
      name: `Circle Attack +${val}`,
      description: `Replaces Support Effect with "If [[circle]] Attack, boost own Attack Power +${val}."`,
      supportText: `If own Attack is [[circle]], boost own Attack Power +${val}.`,
      supportOps: [
        {
          op: 'if',
          cond: { cond: 'attackIs', who: 'self', in: ['circle'] },
          then: [{ op: 'attackPower', target: 'self', mode: 'add', value: val }],
        },
      ],
    }),
  ),
  {
    id: 49,
    no: '049',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Circle Attack Doubled',
    description: 'Replaces Support Effect with "If [[circle]] Attack, own Attack Power is doubled."',
    supportText: 'If own Attack is [[circle]], own Attack Power is doubled.',
    supportOps: [
      {
        op: 'if',
        cond: { cond: 'attackIs', who: 'self', in: ['circle'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }],
      },
    ],
  },
  {
    id: 50,
    no: '050',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Circle Attack Tripled',
    description: 'Replaces Support Effect with "If [[circle]] Attack, own Attack Power is tripled."',
    supportText: 'If own Attack is [[circle]], own Attack Power is tripled.',
    supportOps: [
      {
        op: 'if',
        cond: { cond: 'attackIs', who: 'self', in: ['circle'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 3 }],
      },
    ],
  },
  // 051..055: [Sup Effect] Triangle Attack Boost/Multiplier
  ...[200, 300, 400].map(
    (val, idx): DigiPartDef => ({
      id: 51 + idx,
      no: pad3(51 + idx),
      tag: '[Sup Effect]',
      category: 'support',
      name: `Triangle Attack +${val}`,
      description: `Replaces Support Effect with "If [[triangle]] Attack, boost own Attack Power +${val}."`,
      supportText: `If own Attack is [[triangle]], boost own Attack Power +${val}.`,
      supportOps: [
        {
          op: 'if',
          cond: { cond: 'attackIs', who: 'self', in: ['triangle'] },
          then: [{ op: 'attackPower', target: 'self', mode: 'add', value: val }],
        },
      ],
    }),
  ),
  {
    id: 54,
    no: '054',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Triangle Attack Doubled',
    description: 'Replaces Support Effect with "If [[triangle]] Attack, own Attack Power is doubled."',
    supportText: 'If own Attack is [[triangle]], own Attack Power is doubled.',
    supportOps: [
      {
        op: 'if',
        cond: { cond: 'attackIs', who: 'self', in: ['triangle'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }],
      },
    ],
  },
  {
    id: 55,
    no: '055',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Triangle Attack Tripled',
    description: 'Replaces Support Effect with "If [[triangle]] Attack, own Attack Power is tripled."',
    supportText: 'If own Attack is [[triangle]], own Attack Power is tripled.',
    supportOps: [
      {
        op: 'if',
        cond: { cond: 'attackIs', who: 'self', in: ['triangle'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 3 }],
      },
    ],
  },
  // 056..060: [Sup Effect] Cross Attack Boost/Multiplier
  ...[100, 200, 300].map(
    (val, idx): DigiPartDef => ({
      id: 56 + idx,
      no: pad3(56 + idx),
      tag: '[Sup Effect]',
      category: 'support',
      name: `Cross Attack +${val}`,
      description: `Replaces Support Effect with "If [[x]] Attack, boost own Attack Power +${val}."`,
      supportText: `If own Attack is [[x]], boost own Attack Power +${val}.`,
      supportOps: [
        {
          op: 'if',
          cond: { cond: 'attackIs', who: 'self', in: ['x'] },
          then: [{ op: 'attackPower', target: 'self', mode: 'add', value: val }],
        },
      ],
    }),
  ),
  {
    id: 59,
    no: '059',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Cross Attack Doubled',
    description: 'Replaces Support Effect with "If [[x]] Attack, own Attack Power is doubled."',
    supportText: 'If own Attack is [[x]], own Attack Power is doubled.',
    supportOps: [
      {
        op: 'if',
        cond: { cond: 'attackIs', who: 'self', in: ['x'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }],
      },
    ],
  },
  {
    id: 60,
    no: '060',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Cross Attack Tripled',
    description: 'Replaces Support Effect with "If [[x]] Attack, own Attack Power is tripled."',
    supportText: 'If own Attack is [[x]], own Attack Power is tripled.',
    supportOps: [
      {
        op: 'if',
        cond: { cond: 'attackIs', who: 'self', in: ['x'] },
        then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 3 }],
      },
    ],
  },
  // 061..069: Special Support Combat Effects
  {
    id: 61,
    no: '061',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Attack Equals Own HP',
    description: 'Replaces Support Effect with "Own Attack Power becomes same as own HP."',
    supportText: 'Own Attack Power becomes same as own HP.',
    supportOps: [
      { op: 'attackPower', target: 'self', mode: 'set', value: { ref: { stat: 'hp', who: 'self' } } },
    ],
  },
  {
    id: 62,
    no: '062',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Support 1st Attack',
    description: 'Replaces Support Effect with "Attack first."',
    supportText: 'Attack first.',
    supportOps: [{ op: 'attackFirst', target: 'self' }],
  },
  {
    id: 63,
    no: '063',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Support Eat-Up HP',
    description: 'Replaces Support Effect with "Own Attack becomes Eat-Up HP."',
    supportText: 'Own Attack becomes Eat-Up HP.',
    supportOps: [{ op: 'grantAbility', target: 'self', ability: { kind: 'eatUpHp' } }],
  },
  ...(['circle', 'triangle', 'x'] as const).map(
    (slot, idx): DigiPartDef => ({
      id: 64 + idx,
      no: pad3(64 + idx),
      tag: '[Sup Effect]',
      category: 'support',
      name: `If Foe Uses [[${slot}]], 0 Atk`,
      description: `Replaces Support Effect with "If Opponent uses [[${slot}]], lower Opponent's Attack Power to 0."`,
      supportText: `If Opponent's Attack is [[${slot}]], lower Opponent's Attack Power to 0.`,
      supportOps: [
        {
          op: 'if',
          cond: { cond: 'attackIs', who: 'opponent', in: [slot] },
          then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }],
        },
      ],
    }),
  ),
  ...(['circle', 'triangle', 'x'] as const).map(
    (slot, idx): DigiPartDef => ({
      id: 67 + idx,
      no: pad3(67 + idx),
      tag: '[Sup Effect]',
      category: 'support',
      name: `Counterattack [[${slot}]]`,
      description: `Replaces Support Effect with "[[${slot}]] Counterattack. Attack second."`,
      supportText: `[[${slot}]] Counterattack. Attack second.`,
      supportOps: [
        { op: 'grantAbility', target: 'self', ability: { kind: 'counter', slot } },
        { op: 'attackSecond', target: 'self' },
      ],
    }),
  ),
  // 070..079: [Sup Effect] Specialty Multipliers (×2 / ×3 vs each Specialty)
  ...(['Fire', 'Ice', 'Nature', 'Darkness', 'Rare'] as const satisfies readonly Specialty[]).flatMap(
    (specialty, specIdx): DigiPartDef[] => [
      {
        id: 70 + specIdx * 2,
        no: pad3(70 + specIdx * 2),
        tag: '[Sup Effect]',
        category: 'support',
        name: `If ${specialty} Foe, Atk ×2`,
        description: `Replaces Support Effect with "If Opponent's Specialty is ${specialty}, own Attack Power is doubled."`,
        supportText: `If Opponent's Specialty is ${specialty}, own Attack Power is doubled.`,
        supportOps: [
          {
            op: 'if',
            cond: { cond: 'specialtyIs', who: 'opponent', in: [specialty] },
            then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 2 }],
          },
        ],
      },
      {
        id: 71 + specIdx * 2,
        no: pad3(71 + specIdx * 2),
        tag: '[Sup Effect]',
        category: 'support',
        name: `If ${specialty} Foe, Atk ×3`,
        description: `Replaces Support Effect with "If Opponent's Specialty is ${specialty}, own Attack Power is tripled."`,
        supportText: `If Opponent's Specialty is ${specialty}, own Attack Power is tripled.`,
        supportOps: [
          {
            op: 'if',
            cond: { cond: 'specialtyIs', who: 'opponent', in: [specialty] },
            then: [{ op: 'attackPower', target: 'self', mode: 'multiply', value: 3 }],
          },
        ],
      },
    ],
  ),
  // 080..086: [Sup Effect] Specialty Shifts
  ...(['Fire', 'Ice', 'Nature', 'Darkness', 'Rare'] as const satisfies readonly Specialty[]).map(
    (specialty, idx): DigiPartDef => ({
      id: 80 + idx,
      no: pad3(80 + idx),
      tag: '[Sup Effect]',
      category: 'support',
      name: `Change Own Specialty: ${specialty}`,
      description: `Replaces Support Effect with "Change own Specialty to ${specialty}."`,
      supportText: `Change own Specialty to ${specialty}.`,
      supportOps: [{ op: 'setSpecialty', target: 'self', to: specialty }],
    }),
  ),
  {
    id: 85,
    no: '085',
    tag: '[Sup Effect]',
    category: 'support',
    name: "Copy Specialty to Opponent",
    description: 'Replaces Support Effect with "Change Opponent\'s Specialty to same as own."',
    supportText: "Change Opponent's Specialty to same as own.",
    supportOps: [{ op: 'setSpecialty', target: 'opponent', to: { copyFrom: 'self' } }],
  },
  {
    id: 86,
    no: '086',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Swap Specialty',
    description: 'Replaces Support Effect with "Swap Specialty with Opponent\'s."',
    supportText: "Swap Specialty with Opponent's.",
    supportOps: [{ op: 'swapSpecialty' }],
  },
  // 087..092: [Sup Effect] Lower Attack Power to 0
  ...(['Fire', 'Ice', 'Nature', 'Darkness', 'Rare'] as const satisfies readonly Specialty[]).map(
    (specialty, idx): DigiPartDef => ({
      id: 87 + idx,
      no: pad3(87 + idx),
      tag: '[Sup Effect]',
      category: 'support',
      name: `If ${specialty} Foe, Foe Atk 0`,
      description: `Replaces Support Effect with "If Opponent's Specialty is ${specialty}, lower its Attack Power to 0."`,
      supportText: `If Opponent's Specialty is ${specialty}, lower its Attack Power to 0.`,
      supportOps: [
        {
          op: 'if',
          cond: { cond: 'specialtyIs', who: 'opponent', in: [specialty] },
          then: [{ op: 'attackPower', target: 'opponent', mode: 'set', value: 0 }],
        },
      ],
    }),
  ),
  {
    id: 92,
    no: '092',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Both Attacks to 0',
    description: 'Replaces Support Effect with "Reduce both Players\' Attack Power to 0."',
    supportText: "Reduce both Players' Attack Power to 0.",
    supportOps: [{ op: 'attackPower', target: 'both', mode: 'set', value: 0 }],
  },
  // 093..095: [Sup Effect] Level-based Boost
  ...(
    [
      { level: 'R', boost: 200 },
      { level: 'C', boost: 300 },
      { level: 'U', boost: 400 },
    ] as const
  ).map(
    ({ level, boost }, idx): DigiPartDef => ({
      id: 93 + idx,
      no: pad3(93 + idx),
      tag: '[Sup Effect]',
      category: 'support',
      name: `If Level ${level}, Atk +${boost}`,
      description: `Replaces Support Effect with "If own Level is ${level}, boost own Attack Power +${boost}."`,
      supportText: `If own Level is ${level}, boost own Attack Power +${boost}.`,
      supportOps: [
        {
          op: 'if',
          cond: { cond: 'levelIs', who: 'self', in: [level] },
          then: [{ op: 'attackPower', target: 'self', mode: 'add', value: boost }],
        },
      ],
    }),
  ),
  // 096..099: [Sup Effect] Force Opponent Attack
  ...(['circle', 'triangle', 'x'] as const).map(
    (slot, idx): DigiPartDef => ({
      id: 96 + idx,
      no: pad3(96 + idx),
      tag: '[Sup Effect]',
      category: 'support',
      name: `Opponent Uses [[${slot}]]`,
      description: `Replaces Support Effect with "Opponent uses [[${slot}]]."`,
      supportText: `Opponent uses [[${slot}]].`,
      supportOps: [{ op: 'forceAttack', target: 'opponent', to: slot }],
    }),
  ),
  {
    id: 99,
    no: '099',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Opponent Uses Same Attack',
    description: 'Replaces Support Effect with "Opponent uses same Attack as own."',
    supportText: 'Opponent uses same Attack as own.',
    supportOps: makeSameAttackOp(),
  },
  // 100..109: [Sup Effect] HP Recovery & Revive
  ...[200, 300, 400].map(
    (heal, idx): DigiPartDef => ({
      id: 100 + idx,
      no: pad3(100 + idx),
      tag: '[Sup Effect]',
      category: 'support',
      name: `Recover HP +${heal}`,
      description: `Replaces Support Effect with "Recover own HP +${heal}."`,
      supportText: `Recover own HP +${heal}.`,
      supportOps: [{ op: 'hp', target: 'self', mode: 'add', value: heal }],
    }),
  ),
  {
    id: 103,
    no: '103',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Halve Atk, Heal +400',
    description: 'Replaces Support Effect with "Halve own Attack Power, recover own HP +400."',
    supportText: 'Halve own Attack Power, recover own HP +400.',
    supportOps: [
      { op: 'attackPower', target: 'self', mode: 'divide', value: 2 },
      { op: 'hp', target: 'self', mode: 'add', value: 400 },
    ],
  },
  {
    id: 104,
    no: '104',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Halve Atk, Heal +600',
    description: 'Replaces Support Effect with "Halve own Attack Power, recover own HP +600."',
    supportText: 'Halve own Attack Power, recover own HP +600.',
    supportOps: [
      { op: 'attackPower', target: 'self', mode: 'divide', value: 2 },
      { op: 'hp', target: 'self', mode: 'add', value: 600 },
    ],
  },
  {
    id: 105,
    no: '105',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Underdog Heal +400',
    description: 'Replaces Support Effect with "If own HP < Opponent HP, recover own HP +400."',
    supportText: 'If own HP < Opponent HP, recover own HP +400.',
    supportOps: [
      {
        op: 'if',
        cond: {
          cond: 'compare',
          left: { ref: { stat: 'hp', who: 'self' } },
          cmp: 'lt',
          right: { ref: { stat: 'hp', who: 'opponent' } },
        },
        then: [{ op: 'hp', target: 'self', mode: 'add', value: 400 }],
      },
    ],
  },
  {
    id: 106,
    no: '106',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Underdog Heal +700',
    description: 'Replaces Support Effect with "If own HP < Opponent HP, recover own HP +700."',
    supportText: 'If own HP < Opponent HP, recover own HP +700.',
    supportOps: [
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
  ...[300, 600, 1000].map(
    (reviveHp, idx): DigiPartDef => ({
      id: 107 + idx,
      no: pad3(107 + idx),
      tag: '[Sup Effect]',
      category: 'support',
      name: `Revive with ${reviveHp} HP`,
      description: `Replaces Support Effect with "If KO'd in battle, revive with ${reviveHp} HP."`,
      supportText: `If KO'd in battle, revive with ${reviveHp} HP.`,
      supportOps: [{ op: 'reviveOnKo', target: 'self', hp: reviveHp }],
    }),
  ),
  // 110..122: [Sup Effect] Hand / Deck / DP Manipulation & Utility
  {
    id: 110,
    no: '110',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Discard 1 Foe Hand Card',
    description: 'Replaces Support Effect with "Discard 1 Card from Opponent\'s Hand."',
    supportText: "Discard 1 Card from Opponent's Hand.",
    supportOps: [{ op: 'discardHand', target: 'opponent', count: 1, selection: 'unspecified' }],
  },
  {
    id: 111,
    no: '111',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Discard 2 Foe Hand Cards',
    description: 'Replaces Support Effect with "Discard 2 Cards from Opponent\'s Hand."',
    supportText: "Discard 2 Cards from Opponent's Hand.",
    supportOps: [{ op: 'discardHand', target: 'opponent', count: 2, selection: 'unspecified' }],
  },
  ...[2, 3, 4].map(
    (dpCount, idx): DigiPartDef => ({
      id: 112 + idx,
      no: pad3(112 + idx),
      tag: '[Sup Effect]',
      category: 'support',
      name: `Discard ${dpCount} Foe DP Cards`,
      description: `Replaces Support Effect with "Discard Opponent's Top ${dpCount} DP Cards."`,
      supportText: `Discard Opponent's Top ${dpCount} DP Cards.`,
      supportOps: [{ op: 'discardDp', target: 'opponent', count: dpCount, from: 'top' }],
    }),
  ),
  {
    id: 115,
    no: '115',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Mill 2 Foe Deck Cards',
    description: 'Replaces Support Effect with "Discard 2 Cards from Opponent\'s Online Deck."',
    supportText: "Discard 2 Cards from Opponent's Online Deck.",
    supportOps: [{ op: 'mill', target: 'opponent', count: 2 }],
  },
  {
    id: 116,
    no: '116',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Mill 3 Foe Deck Cards',
    description: 'Replaces Support Effect with "Discard 3 Cards from Opponent\'s Online Deck."',
    supportText: "Discard 3 Cards from Opponent's Online Deck.",
    supportOps: [{ op: 'mill', target: 'opponent', count: 3 }],
  },
  {
    id: 117,
    no: '117',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Recycle Offline Top Card',
    description: 'Replaces Support Effect with "Move top Card from Offline Pile to Online Deck."',
    supportText: 'Move top Card from Offline Pile to Online Deck.',
    supportOps: [{ op: 'recycleOffline', target: 'self', count: 1, shuffle: false, position: 'top' }],
  },
  {
    id: 118,
    no: '118',
    tag: '[Sup Effect]',
    category: 'support',
    name: "Void Opponent Support",
    description: 'Replaces Support Effect with "Opponent\'s Support Effect is voided."',
    supportText: "Opponent's Support Effect is voided.",
    supportOps: [{ op: 'voidSupport', target: 'opponent', scope: 'support' }],
  },
  {
    id: 119,
    no: '119',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Draw Until 4 Cards',
    description: 'Replaces Support Effect with "Draw Cards until there are 4 Cards in Hand."',
    supportText: 'Draw Cards until there are 4 Cards in Hand.',
    supportOps: [{ op: 'drawUntil', target: 'self', handSize: 4 }],
  },
  {
    id: 120,
    no: '120',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'Partner Finder Support',
    description: 'Replaces Support Effect with "Draw 1 Partner Card from Online Deck, then Shuffle."',
    supportText: 'Draw 1 Partner Card from Online Deck, then Shuffle.',
    supportOps: [
      {
        op: 'searchDeck',
        target: 'self',
        filter: { levels: ['R P'] },
        count: 1,
        selection: 'user',
        to: 'hand',
        shuffleAfter: true,
      },
    ],
  },
  {
    id: 121,
    no: '121',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'If Level R, HP+200 & Atk+100',
    description: 'Replaces Support Effect with "If own Level is R, HP +200 & boost Attack Power +100."',
    supportText: 'If own Level is R, HP +200 & boost Attack Power +100.',
    supportOps: [
      {
        op: 'if',
        cond: { cond: 'levelIs', who: 'self', in: ['R'] },
        then: [
          { op: 'hp', target: 'self', mode: 'add', value: 200 },
          { op: 'attackPower', target: 'self', mode: 'add', value: 100 },
        ],
      },
    ],
  },
  {
    id: 122,
    no: '122',
    tag: '[Sup Effect]',
    category: 'support',
    name: 'If Level A, HP+200 & Atk+100',
    description: 'Replaces Support Effect with "If own Level is A, HP +200 & boost Attack Power +100."',
    supportText: 'If own Level is A, HP +200 & boost Attack Power +100.',
    supportOps: [
      {
        op: 'if',
        cond: { cond: 'levelIs', who: 'self', in: ['A'] },
        then: [
          { op: 'hp', target: 'self', mode: 'add', value: 200 },
          { op: 'attackPower', target: 'self', mode: 'add', value: 100 },
        ],
      },
    ],
  },
  // 123..127: [S Effect] Battle Progression / Collection Bonus Parts
  {
    id: 123,
    no: '123',
    tag: '[S Effect]',
    category: 'special',
    name: 'Battle EXP +10%',
    description: 'Special Part: Boost Battle Experience gained after match by +10%.',
  },
  {
    id: 124,
    no: '124',
    tag: '[S Effect]',
    category: 'special',
    name: 'Battle EXP +20%',
    description: 'Special Part: Boost Battle Experience gained after match by +20%.',
  },
  {
    id: 125,
    no: '125',
    tag: '[S Effect]',
    category: 'special',
    name: 'Battle EXP +30%',
    description: 'Special Part: Boost Battle Experience gained after match by +30%.',
  },
  {
    id: 126,
    no: '126',
    tag: '[S Effect]',
    category: 'special',
    name: 'Rare Card Might Appear',
    description: 'Special Part: Rare Card might appear in prize packs after battle.',
  },
  {
    id: 127,
    no: '127',
    tag: '[S Effect]',
    category: 'special',
    name: 'Rare Card More Likely',
    description: 'Special Part: Rare Card is even more likely to appear after battle.',
  },
];

const digiPartByIdMap = new Map<number, DigiPartDef>(ALL_DIGI_PARTS.map((p) => [p.id, p]));

export function getDigiPartById(id: number): DigiPartDef | undefined {
  return digiPartByIdMap.get(id);
}

export function createDefaultPartnerConfigs(): Record<CardId, PartnerCustomization> {
  const configs: Record<CardId, PartnerCustomization> = {};
  for (const partnerId of PARTNER_CARD_IDS) {
    configs[partnerId] = {
      equippedParts: [],
      selectedArmorCardId: DEFAULT_PARTNER_ARMOR[partnerId]!,
    };
  }
  return configs;
}

const clampHp = (v: number): number => Math.max(10, Math.min(9990, v));
const clampAtk = (v: number): number => Math.max(0, Math.min(9990, v));

/**
 * Returns `CardData` for `cardId` with any equipped Digi-Parts applied for a Partner Rookie ('R P').
 * Armor Digivolutions ('A') keep their fixed printed stats per PS1 DDCB rules.
 */
export function getEffectiveCardData(
  cardId: CardId,
  partnerConfigs?: PartnerConfigMap,
): CardData | undefined {
  const base = getCardById(cardId);
  if (!base) return undefined;

  if (base.level !== 'R P' || !partnerConfigs) return base;
  const custom = partnerConfigs[base.id];
  if (!custom || custom.equippedParts.length === 0) return base;

  const cloned: CardData = {
    ...base,
    attacks: base.attacks
      ? {
          circle: { ...base.attacks.circle },
          triangle: { ...base.attacks.triangle },
          x: { ...base.attacks.x },
        }
      : null,
  };

  for (const partId of custom.equippedParts.slice(0, MAX_EQUIPPED_DIGI_PARTS)) {
    const part = getDigiPartById(partId);
    if (!part) continue;

    if (part.hpAdd !== undefined) {
      cloned.hp = clampHp(cloned.hp + part.hpAdd);
    }

    if (cloned.attacks) {
      if (part.allAtkAdd !== undefined) {
        cloned.attacks.circle.power = clampAtk(cloned.attacks.circle.power + part.allAtkAdd);
        cloned.attacks.triangle.power = clampAtk(cloned.attacks.triangle.power + part.allAtkAdd);
        cloned.attacks.x.power = clampAtk(cloned.attacks.x.power + part.allAtkAdd);
      }
      if (part.slotAtkAdd) {
        if (part.slotAtkAdd.circle !== undefined) {
          cloned.attacks.circle.power = clampAtk(
            cloned.attacks.circle.power + part.slotAtkAdd.circle,
          );
        }
        if (part.slotAtkAdd.triangle !== undefined) {
          cloned.attacks.triangle.power = clampAtk(
            cloned.attacks.triangle.power + part.slotAtkAdd.triangle,
          );
        }
        if (part.slotAtkAdd.x !== undefined) {
          cloned.attacks.x.power = clampAtk(cloned.attacks.x.power + part.slotAtkAdd.x);
        }
      }
      if (part.xPowerSetZero) {
        cloned.attacks.x.power = 0;
      }
      if (part.xEffect) {
        cloned.attacks.x.effect = { ...part.xEffect };
      }
    }

    if (base.level === 'R P') {
      if (part.dpAdd !== undefined) {
        cloned.plusP = Math.max(0, cloned.plusP + part.dpAdd);
      }
      if (part.supportText !== undefined) {
        cloned.supportText = part.supportText;
      }
    }
  }

  return cloned;
}

/**
 * Resolves a Partner card's effective Support Effect if an equipped Digi-Part overrides `[Sup Effect]`.
 */
export function getEffectivePartnerSupportEffect(
  cardId: CardId,
  partnerConfigs?: PartnerConfigMap,
): CardEffectDef | undefined {
  const base = getCardById(cardId);
  if (!base || base.level !== 'R P' || !partnerConfigs) return undefined;
  const custom = partnerConfigs[cardId];
  if (!custom || custom.equippedParts.length === 0) return undefined;

  let overrideDef: CardEffectDef | undefined;
  for (const partId of custom.equippedParts.slice(0, MAX_EQUIPPED_DIGI_PARTS)) {
    const part = getDigiPartById(partId);
    if (part?.supportOps) {
      overrideDef = {
        cardId,
        timing: 'support',
        ops: part.supportOps,
      };
    }
  }
  return overrideDef;
}
