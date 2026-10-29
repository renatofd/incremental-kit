import { describe, expect, it } from 'vitest';
import { createGame } from '../games/node-breaker/game';
import { TUTOR, TUTOR_BITS, tutorStep } from '../games/node-breaker/tutorial';
import { buyCheapestUpgrade, formatProfileTable, simulate, simulateProfiles, type SimProfile } from '../src/sim/simulator';

describe('Node Breaker (jogo de exemplo)', () => {
  it('a árvore só aponta para pais existentes e toda run dá Bits', () => {
    const { engine, runs, arena } = createGame(1);
    runs.start();
    for (let i = 0; i < 60 * 10 && runs.active; i++) {
      const n = arena.nodes[0];
      if (n) Object.assign(arena.cursor, { x: n.x, y: n.y, inside: true });
      engine.tick(1 / 60);
      arena.drainEvents();
    }
    expect(runs.active).toBe(false);
    expect(runs.last!.collected.bits.gt(0)).toBe(true);
  });

  it('um bot compra os primeiros upgrades em poucos minutos', () => {
    const { engine, runs, arena } = createGame(7);
    for (let t = 0; t < 5 * 60 * 30; t++) {
      if (!runs.active) {
        while (buyCheapestUpgrade(engine)) {}
        runs.start();
      }
      const n = arena.nodes[0];
      if (n) Object.assign(arena.cursor, { x: n.x, y: n.y, inside: true });
      engine.tick(1 / 30);
      arena.drainEvents();
    }
    expect(engine.upgradeLevel('core')).toBe(1);
    expect(Object.keys(engine.state.upgrades).length).toBeGreaterThan(5);
  });

  it('o bot que poupa não gasta o recurso guardado', () => {
    const { engine } = createGame(3);
    engine.add('bits', 1e6);
    expect(buyCheapestUpgrade(engine, ['main'], ['bits'])).toBeNull();
    expect(buyCheapestUpgrade(engine, ['main'])).toBe('core');
  });

  it('roda um perfil por jogo e marca a parede final de quem para de comprar', () => {
    const profiles: SimProfile[] = [
      { id: 'a', name: 'A', effort: 1, idleSeconds: 1, prestige: true },
      { id: 'b', name: 'B', effort: 0.5, idleSeconds: 6, prestige: false },
    ];
    const seen: string[] = [];
    const results = simulateProfiles(
      (p) => {
        seen.push(p.id);
        let bought = false;
        return { step() {}, shop: () => (bought ? null : ((bought = true), 'x')), done: () => false };
      },
      { maxSeconds: 400, dt: 1, wallSeconds: 180 },
      profiles,
    );
    expect(seen).toEqual(['a', 'b']);
    expect(results[0].result.walls).toEqual([{ from: 1, to: 400 }]);
    expect(formatProfileTable(results, [{ id: 'x', label: 'X' }])).toContain('0m01s');
    expect(simulate({ step() {}, done: () => true }, { maxSeconds: 10, dt: 1 }).walls).toEqual([]);
  });

  it('tutorial: o presente congela a 1ª run e paga a primeira compra', () => {
    const { engine, runs, arena } = createGame(5);
    engine.state.flags.tutor = TUTOR.firstRun;
    runs.start();
    arena.cursor.inside = false;
    for (let i = 0; i < 60 * 20; i++) engine.tick(1 / 60);
    const gift = arena.nodes.find((n) => n.kind === 'gift');
    expect(gift).toBeDefined();
    expect(runs.active).toBe(true);
    expect(runs.elapsed).toBeLessThan(2.1);
    const count = arena.nodes.length;
    for (let i = 0; i < 60 * 5; i++) engine.tick(1 / 60);
    expect(arena.nodes.length).toBe(count);

    Object.assign(arena.cursor, { x: gift!.x, y: gift!.y, inside: true });
    for (let i = 0; i < 60 && arena.tutorialHold; i++) engine.tick(1 / 60);
    expect(arena.tutorialHold).toBe(false);
    expect(tutorStep(engine.state)).toBe(TUTOR.toHub);
    expect(engine.amount('bits').gte(TUTOR_BITS)).toBe(true);
    expect(engine.upgradeStatus('core')).toBe('affordable');
    for (let i = 0; i < 60 * 30 && runs.active; i++) engine.tick(1 / 60);
    expect(runs.active).toBe(false);
    runs.start();
    expect(tutorStep(engine.state)).toBe(TUTOR.done);
  });

  it('sem a flag (saves antigos e simulador) não há tutorial', () => {
    const { engine, runs, arena } = createGame(5);
    expect(tutorStep(engine.state)).toBe(TUTOR.done);
    runs.start();
    for (let i = 0; i < 60 * 5; i++) engine.tick(1 / 60);
    expect(arena.nodes.some((n) => n.kind === 'gift')).toBe(false);
  });
});
