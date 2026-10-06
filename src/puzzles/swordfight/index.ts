import { Images } from '../../core/assets';
import { SoundBank } from '../../core/audio';
import { keyFor } from '../../core/controls';
import { historyGroup } from '../../core/history';
import { ReplayRecorder, type PuzzleReplay } from '../../core/replay';
import type { PuzzleFactory } from '../../core/puzzle';
import type { InputEvent } from '../../core/input';
import { Match, DEFAULTS, validSettings, type Settings } from './match';
import { attackSize, type Piece, SwordBoard, W, H } from './logic';
import { SWORDS, SWORD_COLORS } from './patterns';
import { aiInterval } from './ai';

const COLOR = ['#db514c', '#56ad6b', '#559be2', '#e6bc48'];
const BINDINGS = [
  { id: 'left', label: 'Move left', defaultKey: 'ArrowLeft' }, { id: 'right', label: 'Move right', defaultKey: 'ArrowRight' },
  { id: 'ccw', label: 'Rotate counter-clockwise', defaultKey: 'ArrowUp' }, { id: 'cw', label: 'Rotate clockwise', defaultKey: 'ArrowDown' },
  { id: 'drop', label: 'Drop', defaultKey: 'Space' }, { id: 'previous', label: 'Previous target', defaultKey: 'A' },
  { id: 'next', label: 'Next target', defaultKey: 'S' }, { id: 'pause', label: 'Pause practice', defaultKey: 'Escape' },
];
interface ReplaySetup { settings: Settings; keys: Record<string, string>; }
const validSetup = (value: unknown): value is ReplaySetup => {
  const v = value as ReplaySetup;
  return !!v && validSettings(v.settings) && !!v.keys && BINDINGS.every(b => typeof v.keys[b.id] === 'string');
};
const validSeed = (value: unknown): value is string => typeof value === 'string' && /^-?\d{1,20}$/.test(value);

export default (async ({ screen, input, panel, store, ticks, setReplayTime }) => {
  const images = await Images.load(import.meta.glob<string>('./media/*.png', { eager: true, query: '?url', import: 'default' }));
  let recorder!: ReplayRecorder;
  const sounds = new SoundBank(import.meta.glob<string>('./sounds/*.ogg', { eager: true, query: '?url', import: 'default' }), () => recorder?.isSeeking || recorder?.isAdvancing || false);
  const stored = store.get<Settings>('settings', DEFAULTS);
  let settings: Settings = validSettings(stored) ? { ...stored } : { ...DEFAULTS };
  let keys: Record<string, string> = {};
  let seedText = store.get<string>('seed', '');
  let lastSeed = '';
  let game: Match | null = null;
  let origin = 0, pauseAt = 0, pausedTime = 0;
  let paused = false, recorded = false, aided = false;
  let lastCleared = 0, lastReceived = 0, lastChain = 0;
  let runKey = '';
  let savedReplaySettings: Settings | null = null;
  const live = () => !!game && !game.result;
  const locked = () => live() || !!recorder?.isPlaying;
  const historyKey = (s = settings) => JSON.stringify(s);
  function save(): void { store.set('settings', settings); }
  function freshSeed(): string {
    const words = crypto.getRandomValues(new Uint32Array(2));
    return BigInt.asIntN(64, BigInt(words[0]) << 32n | BigInt(words[1])).toString();
  }
  function start(seed = validSeed(seedText) ? BigInt.asIntN(64, BigInt(seedText)).toString() : freshSeed(), replay?: ReplaySetup): void {
    if (live()) dismiss();
    origin = ticks(); pauseAt = pausedTime = 0; paused = recorded = aided = false;
    lastCleared = lastReceived = lastChain = 0;
    keys = replay?.keys ?? Object.fromEntries(BINDINGS.map(b => [b.id, keyFor('swordfight', b.id, b.defaultKey)]));
    game = new Match({ ...settings }, seed); lastSeed = seed; runKey = historyKey();
    recorder.begin({ settings: { ...settings }, keys: { ...keys } } satisfies ReplaySetup, seed, origin);
  }
  function complete(): void {
    if (!game?.result || recorded) return;
    recorded = true;
    const replay = recorder.finish(`${game.result} · ${game.sent} attack blocks`);
    if (!recorder.isPlaying) store.addHistory(runKey, {
      score: game.sent, outcome: game.result, duration: game.elapsed, pairs: game.pairs, cleared: game.cleared,
      received: game.received, maxChain: game.maxChain, enemiesDefeated: game.bots.filter(b => b.board.topOut()).length,
      mode: game.settings.mode, seed: lastSeed, aided: aided ? 1 : 0, rulesVersion: 1, aiVersion: 1,
      ...(replay ? { replayAt: replay.at, replayId: replay.runId ?? '' } : {}),
    });
    if (game.result !== 'Dismissed') sounds.play(game.result === 'Won' ? 'win' : 'lose');
    paused = false;
  }
  function syncTime(): void { if (live() && !paused) { game!.advance(Math.max(0, ticks() - origin - pausedTime)); complete(); } }
  function dismiss(): void {
    syncTime(); if (!live()) return;
    recorder.command('dismiss'); game!.dismiss(); complete();
  }
  function togglePause(): void {
    if (!live()) return;
    // Pausing is a practice aid, and is recorded so replay time stays exact.
    if (paused) { pausedTime += ticks() - pauseAt; paused = false; }
    else { syncTime(); if (!live()) return; aided = true; paused = true; pauseAt = ticks(); }
  }
  function action(id: string): void {
    if (id === 'pause') { togglePause(); return; }
    if (!live() || paused) return;
    if (id === 'left') game!.move(-1);
    else if (id === 'right') game!.move(1);
    else if (id === 'ccw') game!.rotate(false);
    else if (id === 'cw') game!.rotate(true);
    else if (id === 'drop') { game!.drop(); complete(); }
    else if (id === 'previous') game!.cycleTarget(-1);
    else if (id === 'next') game!.cycleTarget(1);
  }
  function handle(event: InputEvent): void {
    if (event.type === 'keydown') {
      const id = BINDINGS.find(b => keys[b.id] === event.key)?.id;
      if (id) action(id);
    } else if (event.type === 'mousedown' && event.button === 1 && game) {
      const [x, y] = event.pos;
      for (let seat = 0; seat < game.bots.length; seat++) {
        const xx = 612 + seat % 2 * 84, yy = 88 + Math.floor(seat / 2) * 107;
        if (x >= xx && x < xx + 76 && y >= yy && y < yy + 99) game.chooseTarget(seat);
      }
    }
  }
  const ctx = screen.ctx;
  function text(value: string, x: number, y: number, size = 16, color = '#dbe3ee'): void {
    ctx.font = `${size}px system-ui, sans-serif`; ctx.fillStyle = color; ctx.textBaseline = 'top'; ctx.fillText(value, x, y);
  }
  function drawPiece(p: Piece, x: number, y: number, cellW: number, cellH: number, tile = 0, alpha = 1): void {
    ctx.save(); ctx.globalAlpha = alpha;
    let sheet = images.get(['piece_swords_red','piece_swords_green','piece_swords_blue','piece_swords_yellow'][p.color]);
    if (p.age === 3 && p.tile !== undefined) { sheet = images.get('piece_swords_strike'); tile = p.tile; }
    else if (p.age > 0) { sheet = images.get('piece_swords_metal'); tile = p.age > 1 ? 7 : p.color; }
    else if (p.breaker) tile = 10;
    ctx.drawImage(sheet, tile * 27, 0, 27, 40, x, y, cellW, cellH);
    ctx.restore();
  }
  function drawBoard(board: SwordBoard, x: number, y: number, cellW: number, cellH: number): void {
    ctx.fillStyle = '#101722'; ctx.fillRect(x, y, W * cellW, H * cellH);
    ctx.strokeStyle = '#293445'; ctx.lineWidth = 1;
    const gems = new Map(board.gems().map(g => [g.id, g]));
    for (let row = 0; row < H; row++) for (let col = 0; col < W; col++) {
      ctx.strokeRect(x + col * cellW, y + row * cellH, cellW, cellH);
      const p = board.get(col, row); if (!p) continue;
      const g = gems.get(p.gem);
      const tile = g ? 1 + (row === g.y ? 0 : row === g.y + g.height - 1 ? 2 : 1) * 3 + (col === g.x ? 0 : col === g.x + g.width - 1 ? 2 : 1) : 0;
      drawPiece(p, x + col * cellW, y + row * cellH, cellW, cellH, tile);
    }
    // Mark the actual loss column, not the tallest column anywhere on the board.
    ctx.strokeStyle = '#e8bb57'; ctx.strokeRect(x + 3 * cellW, y, cellW, cellH);
  }
  function drawPattern(pattern: number[][], x: number, y: number): void {
    for (let row = 0; row < pattern.length; row++) for (let col = 0; col < W; col++) {
      ctx.fillStyle = COLOR[pattern[pattern.length - row - 1][col]]; ctx.fillRect(x + col * 11, y + row * 7, 10, 6);
    }
  }
  function draw(): void {
    screen.fill('#18212e'); text('Swordfight', 32, 20, 26, '#f1d59a');
    text(game ? `Seed ${lastSeed}` : 'Build rectangles, break colours, and chain attacks.', 32, 55, 13);
    text('Your board', 42, 79); text('Next', 226, 104);
    const empty = new SwordBoard(); drawBoard(game?.player ?? empty, 42, 108, 27, 40);
    if (game?.falling) {
      for (const p of game.positions(game.landing())) if (p.y >= 0) drawPiece(p.piece, 42 + p.x * 27, 108 + p.y * 40, 27, 40, 0, 0.25);
      for (const p of game.positions()) if (p.y >= 0) drawPiece(p.piece, 42 + p.x * 27, 108 + p.y * 40, 27, 40);
    }
    if (game) {
      drawPiece(game.next[1], 230, 138, 27, 40); drawPiece(game.next[0], 230, 178, 27, 40);
      drawPattern(game.patterns[0], 224, 260); text('Your pattern', 222, 241, 12);
      const queued = game.incoming.reduce((total, entry) => total + attackSize(entry.attack), 0);
      text(`Incoming: ${queued}`, 220, 325, 13, queued ? '#edb58a' : '#dbe3ee');
      text(`Attack: ${game.sent}`, 220, 354, 13); text(`Best chain: ${game.maxChain}`, 220, 382, 13);
      const bot = game.bots[game.target];
      if (bot) {
        text(`TrainingBot ${game.target + 1}`, 364, 79); drawBoard(bot.board, 364, 108, 27, 40);
        drawPattern(game.patterns[game.target + 1], 540, 138); text('Pattern', 540, 113, 12);
        for (let seat = 0; seat < game.bots.length; seat++) {
          const x = 612 + seat % 2 * 84, y = 88 + Math.floor(seat / 2) * 107;
          ctx.strokeStyle = seat === game.target ? '#f1d59a' : '#485569'; ctx.lineWidth = 2; ctx.strokeRect(x - 3, y - 3, 77, 100);
          text(`#${seat + 1}${game.bots[seat].board.topOut() ? ' OUT' : ''}`, x, y, 11);
          drawBoard(game.bots[seat].board, x, y + 16, 11, 6);
        }
      } else text('Solo building practice', 364, 110, 18);
      if (paused || game.result) {
        ctx.fillStyle = '#101722dd'; ctx.fillRect(32, 432, 265, 106);
        text(paused ? 'Paused' : game.result!, 55, 448, 24, '#f1d59a');
        text(paused ? 'Resume when ready' : 'Press Start to play again', 55, 489, 15);
      }
    } else text('Press Start to fight.', 364, 110, 22);
    recorder.drawOverlay(ctx);
  }
  function frame(events: InputEvent[]): void {
    const routed = recorder.frame(events, input.mouse, ticks()); input.mouse = routed.mouse;
    if (!routed.renderOnly) {
      syncTime();
      for (const command of routed.commands) {
        if (command === 'pause') togglePause(); else if (command === 'dismiss') dismiss();
        else if (command.startsWith('target:')) game?.chooseTarget(Number(command.slice(7)));
      }
      for (const event of routed.events) handle(event);
      if (game && game.cleared !== lastCleared) { sounds.play('piece_explode'); lastCleared = game.cleared; }
      if (game && game.received !== lastReceived) { sounds.play('strike_land'); lastReceived = game.received; }
      if (game && game.maxChain > lastChain) { if (game.maxChain > 1) sounds.play(game.maxChain > 2 ? 'chain_triple' : 'chain_double'); lastChain = game.maxChain; }
    }
    if (!recorder.isSeeking && !recorder.isAdvancing) draw();
  }
  panel.controls('swordfight', BINDINGS);
  const session = panel.session();
  session.select('Mode', [{ value: 'Fight' as const, label: 'Fight TrainingBots' }, { value: 'Practice' as const, label: 'Solo building practice' }], () => settings.mode, mode => { settings.mode = mode; save(); }, { disabled: locked });
  session.note(() => settings.mode === 'Practice' ? 'No opponent attacks' : `${settings.enemies} opponent${settings.enemies === 1 ? '' : 's'} · ${(aiInterval(settings.speed) / 1000).toFixed(2)}s per pair`);
  panel.group().button('Start', () => live() ? dismiss() : start(), { variant: 'primary', disabled: () => !!recorder?.isPlaying, label: () => live() ? 'Dismiss' : 'Start' })
    .button('Pause', () => { recorder.command('pause'); togglePause(); }, { disabled: () => !live() || !!recorder?.isPlaying, label: () => paused ? 'Resume' : 'Pause' })
    .button('Retry same seed', () => { if (lastSeed) start(lastSeed); }, { disabled: () => locked() || !lastSeed });
  const targetGroup = panel.group('Opponent');
  for (let seat = 0; seat < 10; seat++) targetGroup.button(`Bot ${seat + 1}`, () => {
    recorder.command(`target:${seat}`); game?.chooseTarget(seat);
  }, { hidden: () => !game?.bots[seat], disabled: () => !live() || paused || !!recorder?.isPlaying || !!game?.bots[seat]?.board.topOut(),
    label: () => `${seat === game?.target ? '▶ ' : ''}Bot ${seat + 1}${game?.bots[seat]?.board.topOut() ? ' · Out' : ''}` });
  targetGroup.note(() => 'Click an opponent board or use A/S to change target.', { hidden: () => !game?.bots.length });
  panel.clock(() => game ? { label: 'Fight time', ms: game.elapsed } : null);
  panel.score().stats([], () => [
    ['Result', game?.result ?? (live() ? 'Fighting' : 'Ready')], ['Attack blocks', String(game?.sent ?? 0)],
    ['Blocks cleared', String(game?.cleared ?? 0)], ['Best chain', String(game?.maxChain ?? 0)],
    ['Opponents defeated', `${game?.bots.filter(b => b.board.topOut()).length ?? 0} / ${game?.bots.length ?? settings.enemies}`],
  ]);
  panel.results(() => game?.result ? { title: `Swordfight: ${game.result}`, rows: [
    ['Attack blocks', String(game.sent)], ['Received', String(game.received)], ['Pairs placed', String(game.pairs)], ['Best chain', String(game.maxChain)],
  ] } : null);
  const opponent = panel.settings.group('TrainingBot');
  for (const [key, label, title] of [
    ['speed', 'Opponent speed', '0% = 6 seconds per pair; 100% = 0.75 seconds per pair'],
    ['clearChance', 'Breaker clear chance', 'Chance of clearing a colour when a breaker arrives'],
    ['comboChance', 'Combo chance', 'Chance of saving a colour to combine with a later breaker'],
    ['breakAverage', 'Average colour broken', 'Average percentage of that colour removed by a successful clear'],
  ] as const) opponent.range(label, () => settings[key], value => { settings[key] = value; save(); }, { min: 0, max: 100, step: 1, formatValue: value => `${value}%`, disabled: locked, title });
  opponent.number('Enemies', () => settings.enemies, value => { settings.enemies = Math.max(1, Math.min(10, Math.round(value))); save(); }, { min: 1, max: 10, step: 1, disabled: locked });
  const swords = panel.settings.group('Sword');
  swords.select('Sword', SWORDS, () => settings.sword, value => { settings.sword = value; save(); }, { disabled: locked });
  for (const [key, label] of [['color1','Hilt colour'], ['color2','Pommel colour']] as const) swords.select(label,
    SWORD_COLORS.map((label, value) => ({ value, label })), () => settings[key], value => { settings[key] = value; save(); }, { disabled: locked });
  swords.toggle('Randomise opponent colours', () => settings.randomColors, value => { settings.randomColors = value; save(); }, { disabled: locked });
  panel.settings.group('Seed').text('Seed', () => seedText, value => { seedText = value.trim(); store.set('seed', seedText); }, { disabled: locked, placeholder: 'Blank for a new random fight', inputMode: 'numeric' });
  panel.settings.group('About this draft').note(() => 'Uses the cloned ocean’s TrainingBot settings and behaviour. Strike placement and overlapping block joins are still being refined against the client.');
  historyGroup(panel, () => store.history(historyKey()), [
    { label: 'Result', value: record => String(record.outcome ?? '') }, { label: 'Attack', value: record => String(record.score) },
    { label: 'Chain', value: record => String(record.maxChain ?? 0) },
  ], 'Past fights', {
    available: record => typeof record.replayAt === 'number' && (recorder?.hasPlayableAt(record.replayAt, typeof record.replayId === 'string' ? record.replayId : undefined) ?? false),
    play: record => { if (typeof record.replayAt === 'number') void recorder.playAt(record.replayAt, typeof record.replayId === 'string' ? record.replayId : undefined); },
  });
  recorder = new ReplayRecorder('swordfight', store, panel, ticks, (tape: PuzzleReplay) => {
    if (!validSetup(tape.settings) || !validSeed(tape.seed)) throw new Error('Unsupported Swordfight replay');
    savedReplaySettings ??= { ...settings };
    settings = { ...tape.settings.settings }; start(tape.seed, tape.settings);
  }, () => {
    if (live()) { game!.dismiss(); recorded = true; }
    paused = false;
    if (savedReplaySettings) { settings = savedReplaySettings; savedReplaySettings = null; }
  }, validSeed, setReplayTime, () => frame([]), {
    currentVersion: 1, simulatorVersion: 1, migrate: (version, value) => version === 1 && validSetup(value) ? value : null,
  }, () => !live() || recorder.isPlaying);
  return { frame, dispose: () => { if (!recorder.isPlaying) dismiss(); recorder.dispose(); sounds.dispose(); } };
}) satisfies PuzzleFactory;
