import { describe, expect, it } from 'vitest';
import { createGame } from '../games/node-breaker/game';
import { buyCheapestUpgrade } from '../src/sim/simulator';

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
});
