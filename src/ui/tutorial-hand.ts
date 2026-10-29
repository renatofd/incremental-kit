import { Container, Graphics, Sprite, type Text, type Texture } from 'pixi.js';
import { theme } from './theme';
import { label } from './widgets';

export interface TutorialHandOptions {
  /** Desenho da mão, com a ponta do dedo no topo. Sem textura, usa uma mão vetorial. */
  texture?: Texture;
  /** Escala da textura (ex.: 6 para pixel art pequena). */
  scale?: number;
  /** Tamanho da frase. */
  textSize?: number;
}

/**
 * Mãozinha de tutorial: aponta para um alvo e "toca" nele em loop, com uma
 * frase curta embaixo (ou em cima, se vier de cima). A cena decide o alvo a
 * cada frame com `pointAt` e chama `update(dt)`; `hide()` some com ela.
 */
export class TutorialHand extends Container {
  private hand: Container;
  private text: Text;
  private baseScale: number;
  private t = 0;
  private shown = 0;
  private want = false;
  /** Vem de cima (dedo para baixo), para alvos perto da borda de baixo. */
  private fromAbove = false;
  /** Deslocamento da frase para caber na tela. */
  private textShift = 0;

  constructor(opts: TutorialHandOptions = {}) {
    super();
    if (opts.texture) {
      const s = new Sprite(opts.texture);
      // A ponta do dedo fica no topo do desenho.
      s.anchor.set(0.45, 0);
      this.hand = s;
      this.baseScale = opts.scale ?? 1;
    } else {
      this.hand = drawHand();
      this.baseScale = opts.scale ?? 1;
    }
    this.text = label('', opts.textSize ?? 18, theme.text, { fontWeight: '700', stroke: { color: 0x000000, width: 5 }, align: 'center' });
    this.text.anchor.set(0.5, 0);
    this.addChild(this.hand, this.text);
    this.eventMode = 'none';
    this.alpha = 0;
    this.visible = false;
  }

  /**
   * Aponta para (x, y) no espaço do pai. `fromAbove` vira a mão de cabeça
   * para baixo; `screenW` é a largura da tela nesse espaço (a frase encolhe
   * e desliza para não passar das bordas).
   */
  pointAt(x: number, y: number, text = '', fromAbove = false, screenW = 0): void {
    this.want = true;
    this.fromAbove = fromAbove;
    this.position.set(x, y);
    if (this.text.text !== text) this.text.text = text;
    this.text.scale.set(1);
    this.textShift = 0;
    if (screenW > 0 && text) {
      if (this.text.width > screenW - 16) this.text.scale.set((screenW - 16) / this.text.width);
      const half = this.text.width / 2;
      const cx = x + 10;
      this.textShift = Math.max(half + 8, Math.min(screenW - half - 8, cx)) - cx;
    }
  }

  hide(): void {
    this.want = false;
  }

  get pointing(): boolean {
    return this.want;
  }

  update(dt: number): void {
    this.shown += ((this.want ? 1 : 0) - this.shown) * Math.min(1, dt * 8);
    this.alpha = this.shown;
    this.visible = this.shown > 0.01;
    if (!this.visible) return;
    this.t += dt;
    // Ciclo de 1 s: desce, toca, sobe.
    const k = this.t % 1;
    const press = k < 0.25 ? k / 0.25 : k < 0.4 ? 1 : Math.max(0, 1 - (k - 0.4) / 0.3);
    const dir = this.fromAbove ? -1 : 1;
    this.hand.rotation = this.fromAbove ? Math.PI : 0;
    this.hand.position.set(10 * dir, (26 - press * 22) * dir);
    this.hand.scale.set(this.baseScale * (1 - press * 0.08));
    const handH = this.hand.height;
    this.text.anchor.set(0.5, this.fromAbove ? 1 : 0);
    this.text.position.set(10 * dir + this.textShift, (handH + 36) * dir);
  }
}

/** Mão vetorial apontando para cima, com a ponta do dedo em (0, 0). */
function drawHand(): Graphics {
  const line = { width: 3, color: 0x111111 };
  const skin = 0xffffff;
  return new Graphics()
    // Dedos dobrados, palma e polegar.
    .roundRect(-6, 26, 40, 34, 12)
    .fill(skin)
    .stroke(line)
    .roundRect(-14, 30, 14, 22, 7)
    .fill(skin)
    .stroke(line)
    // Indicador esticado, por cima da palma.
    .roundRect(-8, 0, 16, 44, 8)
    .fill(skin)
    .stroke(line)
    .moveTo(10, 34)
    .lineTo(30, 34)
    .moveTo(10, 44)
    .lineTo(30, 44)
    .stroke({ width: 2, color: 0x111111, alpha: 0.5 });
}
