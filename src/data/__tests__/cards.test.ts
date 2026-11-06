import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_CARDS, getCardById, getCardByName, getCardImageUrl } from '../cards';

const projectRoot = path.resolve(__dirname, '../../..');

describe('Card Database & Importer', () => {
  it('contains all 301 cards with unique contiguous IDs 0..300', () => {
    expect(ALL_CARDS.length).toBe(301);
    const ids = new Set<number>();
    ALL_CARDS.forEach((card, index) => {
      expect(card.id).toBe(index);
      expect(card.no).toBe(String(index).padStart(3, '0'));
      ids.add(card.id);
      expect(getCardById(card.id)).toBe(card);
    });
    expect(ids.size).toBe(301);
  });

  it('correctly classifies Digimon, Partner/Armor, and Option cards', () => {
    const digimon = ALL_CARDS.filter((c) => c.kind === 'Digimon');
    const options = ALL_CARDS.filter((c) => c.kind === 'Option');
    const partners = ALL_CARDS.filter((c) => c.isPartner);
    const armors = partners.filter((c) => c.level === 'A');
    const partnerRookies = partners.filter((c) => c.level === 'R P');

    expect(digimon.length).toBe(191);
    expect(options.length).toBe(110);
    expect(partners.length).toBe(19);
    expect(armors.length).toBe(13);
    expect(partnerRookies.length).toBe(6);

    for (const c of digimon) {
      expect(c.level).not.toBeNull();
      expect(c.specialty).not.toBeNull();
      expect(c.hp).toBeGreaterThan(0);
      expect(c.attacks).not.toBeNull();
    }

    for (const c of options) {
      expect(c.level).toBeNull();
      expect(c.specialty).toBeNull();
      expect(c.hp).toBe(0);
      expect(c.dp).toBe(0);
      expect(c.plusP).toBe(0);
      expect(c.attacks).toBeNull();
    }
  });

  it('verifies every card image exists on disk under public/assets/cards', () => {
    for (const card of ALL_CARDS) {
      const fullPath = path.join(projectRoot, 'public', card.image);
      expect(fs.existsSync(fullPath), `Missing image for #${card.no} ${card.name}: ${fullPath}`).toBe(true);
      expect(getCardImageUrl(card)).toContain(card.image);
    }
  });

  it('resolves known GameFAQs / deck-list aliases and punctuation variations', () => {
    const aliasPairs: Array<[string, string]> = [
      ['Attack Disk O', 'Attack Disk ○'],
      ['Attack Disk Triangle', 'Attack Disk △'],
      ['Attack Disk X', 'Attack Disk ×'],
      ['Defense Disk O', 'Defense Disk ○'],
      ['Defense Disk Triangle', 'Defense Disk △'],
      ['Defense Disk X', 'Defense Disk ×'],
      ['Mega Def. Disk O', 'Mega Def. Disk ○'],
      ['Mega Def. Disk Triangle', 'Mega Def. Disk △'],
      ['Mega Def. Disk X', 'Mega Def. Disk ×'],
      ['Special Digivolv', 'Special Digivolve'],
      ['Speed Digivolv', 'Speed Digivolve'],
      ['Sylphymon', 'Silphymon'],
      ['Dokunemmon', 'Dokunemon'],
      ['Veemon [no armor]', 'Veemon'],
      ['Wormmon [no armor]', 'Wormmon'],
      ['Wormmon --- no armor', 'Wormmon'],
      ['Hawkmon [no armor]', 'Hawkmon'],
      ['Armadillomon [no armor]', 'Armadillomon'],
      ['Patamon [no armor]', 'Patamon'],
      ['Gatomon --- no armor', 'Gatomon'],
      ['Cherrymon’s Mist', "Cherrymon's Mist"],
      ['Suka’s Curse', "Suka's Curse"],
    ];

    for (const [alias, expectedName] of aliasPairs) {
      const resolved = getCardByName(alias);
      expect(resolved, `Failed to resolve alias "${alias}"`).toBeDefined();
      expect(resolved?.name).toBe(expectedName);
    }
  });

  it('resolves every deck card entry in docs/base-deck-list..txt via getCardByName', () => {
    const deckListPath = path.join(projectRoot, 'docs', 'base-deck-list..txt');
    const content = fs.readFileSync(deckListPath, 'utf8');
    const lines = content.split(/\r?\n/);

    let inHeaderBlock = false;
    let resolvedCount = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (/^=+$/.test(line)) {
        inHeaderBlock = !inHeaderBlock;
        continue;
      }
      if (inHeaderBlock || !line) continue;

      const cardMatch = line.match(/^([1-4])\s+(.+)$/);
      if (cardMatch) {
        const rawName = cardMatch[2].trim();
        const card = getCardByName(rawName);
        expect(card, `Line ${i + 1}: could not resolve "${rawName}"`).toBeDefined();
        resolvedCount++;
        continue;
      }

      const armorMatch = line.match(/^Armor:\s*([A-Za-z0-9'.\- ]+?)\s*\(/);
      if (armorMatch) {
        const armorName = armorMatch[1].trim();
        const card = getCardByName(armorName);
        expect(card, `Line ${i + 1}: could not resolve Armor "${armorName}"`).toBeDefined();
        expect(card?.level).toBe('A');
        resolvedCount++;
      }
    }

    expect(resolvedCount).toBeGreaterThan(1000);
  });
});
