import type { Engine } from '../core/engine';
import { format } from '../core/num';

export interface SimEvent {
  t: number;
  action: string;
}

export interface SimResult {
  seconds: number;
  events: SimEvent[];
  /** Segundo em que cada upgrade foi comprado pela primeira vez. */
  firstBuy: Record<string, number>;
  /** Intervalos longos sem nenhuma compra (possíveis paredes). */
  walls: Array<{ from: number; to: number }>;
  finished: boolean;
}

export interface SimPolicy {
  /** Avança o jogo `dt` segundos (o jogo decide o que o "jogador" faz). */
  step(dt: number, t: number): void;
  /** Chamado quando há chance de gastar recursos. Retorna o nome do que comprou, ou null. */
  shop?(t: number): string | null;
  /** O jogo terminou? */
  done(): boolean;
}

/**
 * Simulador headless: roda o jogo com um bot e mede quanto tempo leva cada
 * desbloqueio. Serve para achar paredes (longos trechos sem compra) e
 * trechos rápidos demais antes de alguém jogar.
 */
export function simulate(policy: SimPolicy, opts: { maxSeconds: number; dt: number; wallSeconds?: number }): SimResult {
  const events: SimEvent[] = [];
  const firstBuy: Record<string, number> = {};
  let t = 0;
  let lastBuy = 0;
  const walls: SimResult['walls'] = [];
  const wallSeconds = opts.wallSeconds ?? 180;
  while (t < opts.maxSeconds && !policy.done()) {
    policy.step(opts.dt, t);
    t += opts.dt;
    if (policy.shop) {
      let bought: string | null;
      while ((bought = policy.shop(t))) {
        events.push({ t, action: bought });
        if (firstBuy[bought] === undefined) firstBuy[bought] = t;
        if (t - lastBuy > wallSeconds) walls.push({ from: lastBuy, to: t });
        lastBuy = t;
      }
    }
  }
  return { seconds: t, events, firstBuy, walls, finished: policy.done() };
}

/** Compra o upgrade mais barato disponível (por custo no primeiro recurso). */
export function buyCheapestUpgrade(engine: Engine, trees: string[] = ['main']): string | null {
  let best: { id: string; cost: number } | null = null;
  for (const tree of trees) {
    for (const u of engine.upgradesInTree(tree)) {
      if (engine.upgradeStatus(u.id) !== 'affordable') continue;
      const c = engine.upgradeCost(u.id)[0]?.amount.toNumber() ?? 0;
      if (!best || c < best.cost) best = { id: u.id, cost: c };
    }
  }
  if (best && engine.buyUpgrade(best.id)) return best.id;
  return null;
}

export function formatReport(r: SimResult, names: (id: string) => string): string {
  const lines: string[] = [];
  const mm = (s: number) => `${Math.floor(s / 60)}m${String(Math.floor(s % 60)).padStart(2, '0')}s`;
  lines.push(`Tempo simulado: ${mm(r.seconds)} | terminou: ${r.finished ? 'sim' : 'não'}`);
  lines.push('');
  lines.push('Primeira compra de cada item:');
  for (const [id, t] of Object.entries(r.firstBuy).sort((a, b) => a[1] - b[1])) {
    lines.push(`  ${mm(t).padStart(7)}  ${names(id)}`);
  }
  lines.push('');
  lines.push(r.walls.length ? 'Paredes (sem compras por muito tempo):' : 'Nenhuma parede encontrada.');
  for (const w of r.walls) lines.push(`  ${mm(w.from)} até ${mm(w.to)} (${format(w.to - w.from)}s)`);
  return lines.join('\n');
}
