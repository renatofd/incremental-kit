import { BitmapText, Container, FederatedPointerEvent, FederatedWheelEvent, Graphics, Rectangle, Text } from 'pixi.js';
import type { Engine } from '../core/engine';
import { format } from '../core/num';
import type { UpgradeDef, UpgradeStatus } from '../core/types';
import type { Particles } from './fx';
import { theme } from './theme';
import { ease, Tweens } from './tween';
import { label, type Tooltip, type TooltipLine } from './widgets';

export interface TreeViewOptions {
  tree?: string;
  /** Distância em pixels entre posições da grade. */
  grid?: number;
  nodeSize?: number;
  /** Mostra como "?" os nós escondidos cujo pai já aparece. */
  teaseHidden?: boolean;
  /** Linhas extras no tooltip (ex.: valor atual do atributo). */
  extraTooltip?: (u: UpgradeDef, engine: Engine) => TooltipLine[];
  /** Cor do nó por tag ou id, para diferenciar ramos. */
  colorFor?: (u: UpgradeDef) => number | undefined;
  particles?: Particles;
  onBuy?: (u: UpgradeDef, level: number) => void;
}

interface NodeView {
  def: UpgradeDef;
  root: Container;
  shape: Graphics;
  glow: Graphics;
  icon: Text;
  level: BitmapText;
  status: UpgradeStatus | 'teased' | null;
}

const STATUS_TEXT: Record<UpgradeStatus, string> = {
  hidden: '',
  locked: 'Bloqueado',
  available: 'Recursos insuficientes',
  affordable: 'Clique para comprar',
  maxed: 'Nível máximo',
};

/**
 * Árvore de upgrades interativa: arrastar para mover, roda do mouse para
 * zoom, clique para comprar, segurar para comprar vários níveis.
 * Lê tudo da definição do jogo, então serve para qualquer árvore.
 */
export class TreeView extends Container {
  readonly world = new Container();
  private edges = new Graphics();
  private nodesLayer = new Container();
  private hit = new Graphics();
  private views = new Map<string, NodeView>();
  private opts: Required<Omit<TreeViewOptions, 'particles' | 'onBuy' | 'extraTooltip' | 'colorFor'>> & TreeViewOptions;
  private refreshTimer = 0;
  private time = 0;
  private dragging: { x: number; y: number; wx: number; wy: number; moved: boolean } | null = null;
  private holding: { id: string; t: number } | null = null;
  private hovered: string | null = null;
  private viewW = 800;
  private viewH = 600;
  private lastPointer = { x: 0, y: 0 };

  constructor(private engine: Engine, private tooltip: Tooltip, opts: TreeViewOptions = {}) {
    super();
    this.opts = { tree: 'main', grid: 96, nodeSize: 52, teaseHidden: true, ...opts };
    this.addChild(this.hit, this.world);
    this.world.addChild(this.edges, this.nodesLayer);
    if (opts.particles) this.world.addChild(opts.particles);
    for (const u of engine.upgradesInTree(this.opts.tree)) this.createNode(u);
    this.setupInput();
    engine.events.on('upgradeBought', () => (this.refreshTimer = 0));
    engine.events.on('upgradesRefunded', () => (this.refreshTimer = 0));
    engine.events.on('reset', () => (this.refreshTimer = 0));
    this.refresh(true);
  }

  /** Área visível da árvore, em coordenadas da tela. */
  setViewport(width: number, height: number): void {
    this.viewW = width;
    this.viewH = height;
    this.hit.clear().rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0.001 });
    this.hitArea = new Rectangle(0, 0, width, height);
    this.mask = this.hit;
  }

  /** Centraliza a câmera nos nós visíveis. */
  focus(animated = false): void {
    const pts = [...this.views.values()].filter((v) => v.root.visible).map((v) => v.root.position);
    if (pts.length === 0) return;
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const spanX = Math.max(...xs) - Math.min(...xs) + this.opts.grid * 2;
    const spanY = Math.max(...ys) - Math.min(...ys) + this.opts.grid * 2;
    const scale = Math.max(0.5, Math.min(1.2, Math.min(this.viewW / spanX, this.viewH / spanY)));
    const tx = this.viewW / 2 - cx * scale;
    const ty = this.viewH / 2 - cy * scale;
    if (!animated) {
      this.world.scale.set(scale);
      this.world.position.set(tx, ty);
      return;
    }
    const sx = this.world.x;
    const sy = this.world.y;
    const ss = this.world.scale.x;
    Tweens.add(0.5, (k) => {
      this.world.scale.set(ss + (scale - ss) * k);
      this.world.position.set(sx + (tx - sx) * k, sy + (ty - sy) * k);
    }, ease.inOutQuad);
  }

  update(dt: number): void {
    this.time += dt;
    this.refreshTimer -= dt;
    if (this.refreshTimer <= 0) {
      this.refresh();
      this.refreshTimer = 0.15;
    }
    if (this.holding) {
      this.holding.t -= dt;
      if (this.holding.t <= 0) {
        this.tryBuy(this.holding.id, true);
        this.holding.t = 0.1;
      }
    }
    // Pulso nos nós compráveis.
    const pulse = 0.35 + 0.35 * Math.sin(this.time * 4);
    for (const v of this.views.values()) {
      if (v.status === 'affordable') v.glow.alpha = pulse;
    }
    if (this.hovered) this.showTooltip(this.hovered);
  }

  private createNode(u: UpgradeDef): void {
    const root = new Container();
    const glow = new Graphics();
    const shape = new Graphics();
    const icon = label(u.icon ?? u.name.slice(0, 2), 18, theme.text, { fontWeight: '700' });
    icon.anchor.set(0.5);
    const level = new BitmapText({ text: '', style: { fontFamily: theme.fontFamily, fontSize: 12, fill: theme.textDim } });
    level.anchor.set(0.5, 0);
    level.y = this.opts.nodeSize / 2 + 4;
    root.addChild(glow, shape, icon, level);
    const pos = u.pos ?? { x: 0, y: 0 };
    root.position.set(pos.x * this.opts.grid, pos.y * this.opts.grid);
    root.eventMode = 'static';
    root.cursor = 'pointer';
    root.on('pointerover', (e: FederatedPointerEvent) => {
      this.hovered = u.id;
      this.lastPointer = { x: e.global.x, y: e.global.y };
      Tweens.to(0.12, root.scale.x, 1.1, (s) => !root.destroyed && root.scale.set(s));
    });
    root.on('pointermove', (e: FederatedPointerEvent) => (this.lastPointer = { x: e.global.x, y: e.global.y }));
    root.on('pointerout', () => {
      if (this.hovered === u.id) {
        this.hovered = null;
        this.tooltip.hide();
      }
      this.holding = null;
      Tweens.to(0.12, root.scale.x, 1, (s) => !root.destroyed && root.scale.set(s));
    });
    root.on('pointerdown', (e: FederatedPointerEvent) => {
      e.stopPropagation();
      this.tryBuy(u.id, false);
      if ((u.maxLevel ?? 1) > 1) this.holding = { id: u.id, t: 0.4 };
    });
    root.on('pointerup', () => (this.holding = null));
    root.on('pointerupoutside', () => (this.holding = null));
    this.nodesLayer.addChild(root);
    this.views.set(u.id, { def: u, root, shape, glow, icon, level, status: null });
  }

  private tryBuy(id: string, repeating: boolean): void {
    const v = this.views.get(id)!;
    if (this.engine.buyUpgrade(id)) {
      const level = this.engine.upgradeLevel(id);
      Tweens.to(0.3, 1.35, this.hovered === id ? 1.1 : 1, (s) => !v.root.destroyed && v.root.scale.set(s), ease.outBack);
      this.opts.particles?.burst(v.root.x, v.root.y, this.colorOf(v.def, 'affordable'), repeating ? 6 : 18, 260);
      this.opts.onBuy?.(v.def, level);
      this.refresh();
    } else if (!repeating) {
      const x0 = v.root.x;
      Tweens.add(0.25, (k) => (v.root.x = x0 + Math.sin(k * Math.PI * 6) * 5 * (1 - k)), ease.linear, () => (v.root.x = x0));
      this.holding = null;
    } else {
      this.holding = null;
    }
  }

  private colorOf(u: UpgradeDef, status: UpgradeStatus | 'teased'): number {
    const custom = this.opts.colorFor?.(u);
    switch (status) {
      case 'maxed':
        return theme.nodeMaxed;
      case 'affordable':
        return custom ?? theme.nodeAffordable;
      case 'available':
        return theme.nodeAvailable;
      case 'locked':
      case 'teased':
        return theme.nodeLocked;
      default:
        return theme.nodeHidden;
    }
  }

  /** Recalcula status de todos os nós e redesenha só o que mudou. */
  refresh(force = false): void {
    let edgesDirty = force;
    for (const v of this.views.values()) {
      let status: NodeView['status'] = this.engine.upgradeStatus(v.def.id);
      if (status === 'hidden') {
        const teased =
          this.opts.teaseHidden &&
          (v.def.parents ?? []).some((p) => this.views.has(p) && this.engine.upgradeStatus(p) !== 'hidden');
        status = teased ? 'teased' : 'hidden';
      }
      const lvl = this.engine.upgradeLevel(v.def.id);
      const max = v.def.maxLevel ?? 1;
      const levelText = status === 'hidden' || status === 'teased' ? '' : max === Infinity ? `${lvl}` : max > 1 ? `${lvl}/${max}` : '';
      if (v.level.text !== levelText) v.level.text = levelText;
      if (status === v.status && !force) continue;
      const appearing = (v.status === 'hidden' || v.status === 'teased') && status !== 'hidden' && status !== 'teased';
      v.status = status;
      edgesDirty = true;
      this.drawNode(v);
      if (appearing && !force) {
        Tweens.to(0.4, 0, 1, (s) => !v.root.destroyed && v.root.scale.set(s), ease.outBack);
      }
    }
    if (edgesDirty) this.drawEdges();
  }

  private drawNode(v: NodeView): void {
    const s = this.opts.nodeSize;
    const status = v.status!;
    v.root.visible = status !== 'hidden';
    const color = this.colorOf(v.def, status as UpgradeStatus);
    const bought = this.engine.upgradeLevel(v.def.id) > 0;
    v.shape.clear().roundRect(-s / 2, -s / 2, s, s, 12).fill({ color: theme.panel, alpha: 1 });
    v.shape
      .roundRect(-s / 2, -s / 2, s, s, 12)
      .fill({ color: bought ? color : theme.panel, alpha: bought ? 0.28 : 1 })
      .stroke({ width: status === 'affordable' || status === 'maxed' ? 2.5 : 1.5, color });
    v.glow.clear();
    if (status === 'affordable') {
      v.glow.roundRect(-s / 2 - 6, -s / 2 - 6, s + 12, s + 12, 16).stroke({ width: 3, color, alpha: 1 });
    }
    v.glow.alpha = status === 'affordable' ? 0.5 : 0;
    v.icon.text = status === 'teased' ? '?' : v.def.icon ?? v.def.name.slice(0, 2);
    v.icon.style.fontSize = v.icon.text.length > 3 ? 14 : 18;
    v.icon.alpha = status === 'teased' || status === 'locked' ? 0.4 : 1;
  }

  private drawEdges(): void {
    const g = this.edges.clear();
    for (const v of this.views.values()) {
      if (!v.root.visible) continue;
      for (const p of v.def.parents ?? []) {
        const pv = this.views.get(p);
        if (!pv || !pv.root.visible) continue;
        const active = this.engine.upgradeLevel(v.def.id) > 0;
        g.moveTo(pv.root.x, pv.root.y)
          .lineTo(v.root.x, v.root.y)
          .stroke({ width: active ? 3 : 2, color: active ? theme.edgeActive : theme.edge, alpha: v.status === 'teased' ? 0.4 : 1 });
      }
    }
  }

  private showTooltip(id: string): void {
    const v = this.views.get(id);
    if (!v || !v.status || v.status === 'hidden') return;
    if (v.status === 'teased') {
      this.tooltip.show([{ text: '???', bold: true, size: 16 }, { text: 'Compre um nó vizinho para revelar.', color: theme.textDim }], this.lastPointer.x, this.lastPointer.y);
      return;
    }
    const u = v.def;
    const level = this.engine.upgradeLevel(id);
    const max = u.maxLevel ?? 1;
    const desc = typeof u.description === 'function' ? u.description(level, this.engine.state) : u.description;
    const lines: TooltipLine[] = [{ text: u.name, bold: true, size: 16 }, { text: desc, color: theme.textDim }];
    if (max > 1) lines.push({ text: `Nível ${level}${max === Infinity ? '' : ' / ' + max}`, color: theme.text, size: 13 });
    if (this.opts.extraTooltip) lines.push(...this.opts.extraTooltip(u, this.engine));
    if (v.status !== 'maxed') {
      for (const c of this.engine.upgradeCost(id)) {
        const name = this.engine.def.resources.find((r) => r.id === c.resource)?.name ?? c.resource;
        const ok = this.engine.amount(c.resource).gte(c.amount);
        lines.push({ text: `Custo: ${format(c.amount)} ${name}`, color: ok ? theme.good : theme.bad, bold: true });
      }
    }
    lines.push({ text: STATUS_TEXT[v.status as UpgradeStatus], color: theme.textDim, size: 12 });
    this.tooltip.show(lines, this.lastPointer.x, this.lastPointer.y);
  }

  private setupInput(): void {
    this.eventMode = 'static';
    this.on('pointerdown', (e: FederatedPointerEvent) => {
      this.dragging = { x: e.global.x, y: e.global.y, wx: this.world.x, wy: this.world.y, moved: false };
      this.cursor = 'grabbing';
    });
    this.on('globalpointermove', (e: FederatedPointerEvent) => {
      if (!this.dragging) return;
      const dx = e.global.x - this.dragging.x;
      const dy = e.global.y - this.dragging.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.dragging.moved = true;
      this.world.position.set(this.dragging.wx + dx, this.dragging.wy + dy);
    });
    const stop = () => {
      this.dragging = null;
      this.cursor = 'grab';
    };
    this.on('pointerup', stop);
    this.on('pointerupoutside', stop);
    this.cursor = 'grab';
    this.on('wheel', (e: FederatedWheelEvent) => {
      const local = this.toLocal(e.global);
      const old = this.world.scale.x;
      const next = Math.max(0.35, Math.min(2.2, old * Math.exp(-e.deltaY * 0.0015)));
      const wx = (local.x - this.world.x) / old;
      const wy = (local.y - this.world.y) / old;
      this.world.scale.set(next);
      this.world.position.set(local.x - wx * next, local.y - wy * next);
    });
  }
}
