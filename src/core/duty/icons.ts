// Small pictures for what a session cleared, by name, so saved reports keep working when the
// art's file names change. Forage and Treasure Haul use the duty report's own chest tiles
// (12x12, small to large); the other puzzles use a frame of their own piece art.
import chests from './media/chests.png?url';
import puzzles from './media/puzzles.png?url';
import haulCoin from '../../puzzles/treasure-haul/media/minipiece0.png?url';
import haulRuby from '../../puzzles/treasure-haul/media/minipiece4.png?url';
import haulEmerald from '../../puzzles/treasure-haul/media/minipiece5.png?url';
import swordRed from '../../puzzles/swordfight/media/piece_swords_red.png?url';
import swordGreen from '../../puzzles/swordfight/media/piece_swords_green.png?url';
import swordBlue from '../../puzzles/swordfight/media/piece_swords_blue.png?url';
import swordYellow from '../../puzzles/swordfight/media/piece_swords_yellow.png?url';
import swordStrike from '../../puzzles/swordfight/media/piece_swords_strike.png?url';
import brewWhite from '../../puzzles/distilling/media/piece_white.png?url';
import brewMid from '../../puzzles/distilling/media/piece_mid.png?url';
import brewDark from '../../puzzles/distilling/media/piece_dark.png?url';
import brewSpice from '../../puzzles/distilling/media/piece_spice.png?url';
import carpStars from '../../puzzles/vampire-carp/media/stars.png?url';
import smithBonus from '../../puzzles/blacksmithing/media/bonus.png?url';
import smithTally from '../../puzzles/blacksmithing/media/tally.png?url';

export interface Icon {
  url: string;
  /** The frame in the image: x, y, width, height. */
  area: [number, number, number, number];
  /** Drawn this tall in a tally (the game's chest tiles are 12). */
  height: number;
}

const frame = (url: string, w: number, h: number, index = 0, height = 12): Icon => ({ url, area: [index * w, 0, w, h], height });

export const ICONS: Record<string, Icon> = {
  'chest-small': frame(chests, 12, 12, 0),
  'chest-medium': frame(chests, 12, 12, 1),
  'chest-large': frame(chests, 12, 12, 2),
  'haul-coin': frame(haulCoin, 23, 23, 0, 14),
  'haul-ruby': frame(haulRuby, 16, 23, 0, 14),
  'haul-emerald': frame(haulEmerald, 16, 23, 0, 14),
  'sword-red': frame(swordRed, 27, 40, 0, 14),
  'sword-green': frame(swordGreen, 27, 40, 0, 14),
  'sword-blue': frame(swordBlue, 27, 40, 0, 14),
  'sword-yellow': frame(swordYellow, 27, 40, 0, 14),
  'sword-strike': frame(swordStrike, 27, 40, 0, 14),
  'brew-white': frame(brewWhite, 40, 40, 0, 14),
  'brew-mid': frame(brewMid, 40, 40, 0, 14),
  'brew-dark': frame(brewDark, 40, 40, 0, 14),
  'brew-spice': frame(brewSpice, 40, 40, 0, 14),
  'carp-slipshod': frame(carpStars, 21, 21, 0, 14),
  'carp-creaky': frame(carpStars, 21, 21, 1, 14),
  'carp-vampire-proof': frame(carpStars, 21, 21, 2, 14),
  'smith-number-set': frame(smithBonus, 42, 42, 0, 16),
  'smith-ordered-set': frame(smithBonus, 42, 42, 1, 16),
  'smith-chess-set': frame(smithBonus, 42, 42, 4, 16),
  'smith-chain2': frame(smithTally, 50, 46, 1, 16),
  'smith-chain3': frame(smithTally, 50, 46, 2, 16),
  'smith-chain4': frame(smithTally, 50, 46, 3, 16),
  'smith-chain5': frame(smithTally, 50, 46, 4, 16),
  'smith-chain6': frame(smithTally, 50, 46, 4, 16),
};

/** The game's puzzle icons (24x24), for the station heading. */
const STATION_ICON: Record<string, number> = { swordfight: 0, 'vampire-carp': 3, 'treasure-haul': 10, forage: 14 };

export function stationIcon(puzzle: string): Icon | null {
  const index = STATION_ICON[puzzle];
  return index === undefined ? null : frame(puzzles, 24, 24, index, 24);
}

const images = new Map<string, Promise<HTMLImageElement | null>>();

export function loadIcon(url: string): Promise<HTMLImageElement | null> {
  let loading = images.get(url);
  if (!loading) {
    loading = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
    images.set(url, loading);
  }
  return loading;
}

/** An icon's width when drawn at its tally height. */
export const iconWidth = (icon: Icon) => Math.max(1, Math.round((icon.area[2] * icon.height) / icon.area[3]));
