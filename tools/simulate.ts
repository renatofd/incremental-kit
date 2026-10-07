/**
 * Simula o Node Breaker com um bot e imprime quanto tempo leva cada compra.
 * Uso: npm run sim -- [minutos] [segundos entre runs]
 */
import { ARENA_H, ARENA_W } from '../games/node-breaker/arena';
import { createGame } from '../games/node-breaker/game';
import { buyCheapestUpgrade, formatReport, simulate } from '../src/sim/simulator';

const maxMinutes = Number(process.argv[2] ?? 120);
const hubSeconds = Number(process.argv[3] ?? 4);

const { engine, runs, arena, prestige } = createGame(42);
let waiting = 0;

const result = simulate(
  {
    step(dt) {
      if (!runs.active) {
        waiting += dt;
        if (waiting >= hubSeconds) {
          waiting = 0;
          runs.start();
        }
        engine.tick(dt);
        return;
      }
      // Bot: mira no nó com mais vizinhos dentro do raio (aproxima um jogador atento).
      const radius = engine.statNumber('cursor.radius');
      let best = { x: ARENA_W / 2, y: ARENA_H / 2, score: -1 };
      for (const n of arena.nodes) {
        let score = n.kind === 'boss' ? 5 : n.kind === 'gold' ? 3 : 1;
        for (const o of arena.nodes) if (o !== n && (o.x - n.x) ** 2 + (o.y - n.y) ** 2 < radius * radius) score++;
        if (score > best.score) best = { x: n.x, y: n.y, score };
      }
      // Movimento limitado: o mouse não teleporta.
      const speed = 1400 * dt;
      const dx = best.x - arena.cursor.x;
      const dy = best.y - arena.cursor.y;
      const d = Math.hypot(dx, dy);
      if (d > speed) {
        arena.cursor.x += (dx / d) * speed;
        arena.cursor.y += (dy / d) * speed;
      } else {
        arena.cursor.x = best.x;
        arena.cursor.y = best.y;
      }
      arena.cursor.inside = true;
      engine.tick(dt);
      arena.drainEvents();
    },
    shop() {
      if (runs.active) return null;
      const up = buyCheapestUpgrade(engine, ['main', 'reboot']);
      if (up) return up;
      if (engine.isGeneratorUnlocked('miner') && engine.buyGenerator('miner') > 0) return 'miner';
      // Reboot quando o ganho de prismas dobraria o total atual.
      if (!process.env.NOREBOOT && prestige.canPrestige(engine, 'reboot')) {
        const gain = prestige.gain(engine, 'reboot');
        if (gain.gte(engine.amount('prisms').add(engine.state.lifetime.prisms ?? 0).max(3))) {
          prestige.prestige(engine, 'reboot');
          return 'REBOOT';
        }
      }
      return null;
    },
    done: () => engine.isUnlocked('victory'),
  },
  { maxSeconds: maxMinutes * 60, dt: 1 / 30, wallSeconds: 180 },
);

const names = (id: string) => {
  if (id === 'miner') return 'Minerador';
  if (id === 'REBOOT') return '>>> REBOOT';
  try {
    return engine.upgrade(id).name + ` (${id})`;
  } catch {
    return id;
  }
};
console.log(formatReport(result, names));
console.log(`\nRuns: ${runs.count} | Reboots: ${prestige.count(engine, 'reboot')} | Nós destruídos: ${engine.state.flags.kills}`);
