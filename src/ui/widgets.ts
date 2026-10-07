import { BitmapText, Container, Graphics, Text, type TextStyleOptions } from 'pixi.js';
import { theme } from './theme';
import { ease, Tweens } from './tween';

export function textStyle(size = 16, color = theme.text, extra: Partial<TextStyleOptions> = {}): TextStyleOptions {
  return { fontFamily: theme.fontFamily, fontSize: size, fill: color, ...extra };
}

/** Texto estático ou que muda pouco (títulos, descrições). */
export function label(text: string, size = 16, color = theme.text, extra: Partial<TextStyleOptions> = {}): Text {
  return new Text({ text, style: textStyle(size, color, extra), resolution: 2 });
}

/**
 * Texto que muda todo frame (contadores, números flutuantes). BitmapText
 * reaproveita um atlas de glifos e é muito mais barato que Text.
 */
export function numberLabel(text: string, size = 16, color = theme.text, bold = false): BitmapText {
  return new BitmapText({
    text,
    style: { fontFamily: theme.fontFamily, fontSize: size, fill: color, fontWeight: bold ? 'bold' : 'normal' },
  });
}

export interface PanelOptions {
  width: number;
  height: number;
  radius?: number;
  fill?: number;
  alpha?: number;
  border?: number;
}

export class Panel extends Container {
  readonly bg = new Graphics();
  private opts: Required<PanelOptions>;

  constructor(opts: PanelOptions) {
    super();
    this.opts = { radius: 10, fill: theme.panel, alpha: 0.95, border: theme.panelBorder, ...opts };
    this.addChild(this.bg);
    this.redraw();
  }

  setSize(width: number, height: number): void {
    this.opts.width = width;
    this.opts.height = height;
    this.redraw();
  }

  get panelWidth(): number {
    return this.opts.width;
  }

  get panelHeight(): number {
    return this.opts.height;
  }

  private redraw(): void {
    const o = this.opts;
    this.bg
      .clear()
      .roundRect(0, 0, o.width, o.height, o.radius)
      .fill({ color: o.fill, alpha: o.alpha })
      .stroke({ width: 1, color: o.border, alpha: 1 });
  }
}

export interface ButtonOptions {
  text: string;
  width?: number;
  height?: number;
  size?: number;
  color?: number;
  onClick?: () => void;
}

/** Botão com estados de hover, pressionado e desabilitado, e um "pop" ao clicar. */
export class Button extends Container {
  private bg = new Graphics();
  readonly text: Text;
  private hovered = false;
  private pressed = false;
  private _enabled = true;
  private w: number;
  private h: number;
  private color: number;
  onClick?: () => void;

  constructor(opts: ButtonOptions) {
    super();
    this.w = opts.width ?? 160;
    this.h = opts.height ?? 44;
    this.color = opts.color ?? theme.accent;
    this.onClick = opts.onClick;
    this.text = label(opts.text, opts.size ?? 16, theme.text, { fontWeight: '600' });
    this.text.anchor.set(0.5);
    this.text.position.set(this.w / 2, this.h / 2);
    this.pivot.set(this.w / 2, this.h / 2);
    this.addChild(this.bg, this.text);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerover', () => ((this.hovered = true), this.redraw()));
    this.on('pointerout', () => ((this.hovered = false), (this.pressed = false), this.redraw()));
    this.on('pointerdown', () => ((this.pressed = true), this.redraw()));
    this.on('pointerup', () => ((this.pressed = false), this.redraw()));
    this.on('pointertap', () => {
      if (!this._enabled) return;
      Tweens.to(0.25, 0.9, 1, (v) => !this.destroyed && this.scale.set(v), ease.outBack);
      this.onClick?.();
    });
    this.redraw();
  }

  /** Posiciona pelo canto superior esquerdo (o pivô fica no centro para o "pop"). */
  place(x: number, y: number): this {
    this.position.set(x + this.w / 2, y + this.h / 2);
    return this;
  }

  get buttonWidth(): number {
    return this.w;
  }

  get buttonHeight(): number {
    return this.h;
  }

  set enabled(v: boolean) {
    if (v === this._enabled) return;
    this._enabled = v;
    this.cursor = v ? 'pointer' : 'default';
    this.redraw();
  }

  get enabled(): boolean {
    return this._enabled;
  }

  setText(t: string): void {
    if (this.text.text !== t) this.text.text = t;
  }

  setColor(c: number): void {
    this.color = c;
    this.redraw();
  }

  private redraw(): void {
    const c = this._enabled ? this.color : theme.nodeLocked;
    const fillAlpha = !this._enabled ? 0.15 : this.pressed ? 0.45 : this.hovered ? 0.32 : 0.2;
    this.bg
      .clear()
      .roundRect(0, 0, this.w, this.h, 8)
      .fill({ color: c, alpha: fillAlpha })
      .stroke({ width: 1.5, color: c, alpha: this._enabled ? 1 : 0.5 });
    this.text.alpha = this._enabled ? 1 : 0.5;
  }
}

/** Barra de progresso com preenchimento suavizado. */
export class ProgressBar extends Container {
  private bg = new Graphics();
  private fg = new Graphics();
  private shown = 0;
  private target = 0;

  constructor(private w: number, private h: number, private color = theme.accent) {
    super();
    this.addChild(this.bg, this.fg);
    this.bg.roundRect(0, 0, w, h, h / 2).fill({ color: theme.panelBorder });
  }

  setValue(v: number, instant = false): void {
    this.target = Math.max(0, Math.min(1, v));
    if (instant) this.shown = this.target;
    this.draw();
  }

  setColor(c: number): void {
    this.color = c;
    this.draw();
  }

  resizeBar(w: number): void {
    this.w = w;
    this.bg.clear().roundRect(0, 0, w, this.h, this.h / 2).fill({ color: theme.panelBorder });
    this.draw();
  }

  update(dt: number): void {
    if (Math.abs(this.shown - this.target) < 0.001) return;
    this.shown += (this.target - this.shown) * Math.min(1, dt * 12);
    this.draw();
  }

  private draw(): void {
    this.fg.clear();
    const w = this.w * this.shown;
    if (w > 0.5) this.fg.roundRect(0, 0, Math.max(this.h, w), this.h, this.h / 2).fill({ color: this.color });
  }
}

export interface TooltipLine {
  text: string;
  color?: number;
  size?: number;
  bold?: boolean;
}

/**
 * Tooltip único, desenhado na camada overlay. Mostre com show() passando
 * linhas e uma posição; ele se ajusta para não sair da tela.
 */
export class Tooltip extends Container {
  private bg = new Graphics();
  private lines = new Container();
  private pool: Text[] = [];

  constructor(private screen: () => { width: number; height: number }) {
    super();
    this.addChild(this.bg, this.lines);
    this.visible = false;
    this.eventMode = 'none';
  }

  show(content: TooltipLine[], x: number, y: number, maxWidth = 280): void {
    this.lines.removeChildren();
    let cy = 10;
    let w = 0;
    content.forEach((l, i) => {
      let t = this.pool[i];
      if (!t) this.pool.push((t = label('', 14)));
      t.style = textStyle(l.size ?? 14, l.color ?? theme.text, {
        fontWeight: l.bold ? '700' : '400',
        wordWrap: true,
        wordWrapWidth: maxWidth,
      });
      t.text = l.text;
      t.position.set(12, cy);
      this.lines.addChild(t);
      cy += t.height + 4;
      w = Math.max(w, t.width);
    });
    const width = w + 24;
    const height = cy + 6;
    this.bg
      .clear()
      .roundRect(0, 0, width, height, 8)
      .fill({ color: theme.panel, alpha: 0.97 })
      .stroke({ width: 1, color: theme.panelBorder });
    const s = this.screen();
    let px = x + 18;
    let py = y + 18;
    if (px + width > s.width - 8) px = x - width - 18;
    if (py + height > s.height - 8) py = s.height - height - 8;
    this.position.set(Math.max(8, px), Math.max(8, py));
    this.visible = true;
  }

  hide(): void {
    this.visible = false;
  }
}

/** Notificações curtas empilhadas no canto (conquistas, desbloqueios). */
export class Toasts extends Container {
  private items: Container[] = [];

  constructor(private screen: () => { width: number; height: number }) {
    super();
    this.eventMode = 'none';
  }

  push(title: string, body = '', color = theme.warning): void {
    const c = new Container();
    const t = label(title, 15, color, { fontWeight: '700' });
    const b = label(body, 13, theme.textDim, { wordWrap: true, wordWrapWidth: 260 });
    t.position.set(14, 10);
    b.position.set(14, 32);
    const w = Math.max(t.width, b.width) + 28;
    const h = body ? b.y + b.height + 10 : 40;
    const bg = new Graphics()
      .roundRect(0, 0, w, h, 8)
      .fill({ color: theme.panel, alpha: 0.97 })
      .stroke({ width: 1.5, color });
    c.addChild(bg, t);
    if (body) c.addChild(b);
    this.addChild(c);
    this.items.unshift(c);
    this.layout();
    const s = this.screen();
    Tweens.to(0.35, s.width + 10, s.width - w - 16, (v) => (c.x = v), ease.outCubic);
    setTimeout(() => {
      Tweens.to(0.3, 1, 0, (v) => (c.alpha = v), ease.linear, () => {
        this.items = this.items.filter((x) => x !== c);
        c.destroy({ children: true });
        this.layout();
      });
    }, 3500);
  }

  private layout(): void {
    let y = 16;
    for (const c of this.items) {
      c.y = y;
      y += c.height + 8;
    }
  }
}
