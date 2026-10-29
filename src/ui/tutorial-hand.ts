import { Assets, Container, Sprite, Texture, type Text } from 'pixi.js';
import handUrl from './assets/hand.png';
import handPressUrl from './assets/hand-press.png';
import { theme } from './theme';
import { label } from './widgets';

export interface TutorialHandOptions {
  /**
   * Desenhos da mão, com a ponta do dedo em `anchor`: `idle` apontando e
   * `press` tocando. Sem eles, usa a mão em pixel art do kit (32×32).
   */
  textures?: { idle: Texture; press?: Texture };
  /** Ponto da ponta do dedo no desenho, de 0 a 1. */
  anchor?: { x: number; y: number };
  /** Escala do desenho (a mão do kit tem 32 px). */
  scale?: number;
  /** Tamanho da frase. */
  textSize?: number;
}

/** Ponta do dedo da mão do kit: pixel (13.5, 5) de 32×32. */
const KIT_ANCHOR = { x: 13.5 / 32, y: 5 / 32 };

/**
 * Mãozinha de tutorial: aponta para um alvo e "toca" nele em loop, com uma
 * frase curta embaixo (ou em cima, se vier de cima). A cena decide o alvo a
 * cada frame com `pointAt` e chama `update(dt)`; `hide()` some com ela.
 */
export class TutorialHand extends Container {
  private hand = new Sprite(Texture.EMPTY);
  private idle: Texture = Texture.EMPTY;
  private press: Texture = Texture.EMPTY;
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
    const anchor = opts.anchor ?? (opts.textures ? { x: 0.5, y: 0 } : KIT_ANCHOR);
    this.hand.anchor.set(anchor.x, anchor.y);
    this.baseScale = opts.scale ?? 3;
    if (opts.textures) this.setTextures(opts.textures.idle, opts.textures.press);
    else void Promise.all([Assets.load<Texture>(handUrl), Assets.load<Texture>(handPressUrl)]).then(([idle, press]) => {
      // Pixel art: sem suavização ao ampliar.
      idle.source.scaleMode = 'nearest';
      press.source.scaleMode = 'nearest';
      if (!this.destroyed) this.setTextures(idle, press);
    });
    this.text = label('', opts.textSize ?? 18, theme.text, { fontWeight: '700', stroke: { color: 0x000000, width: 5 }, align: 'center' });
    this.text.anchor.set(0.5, 0);
    this.addChild(this.hand, this.text);
    this.eventMode = 'none';
    this.alpha = 0;
    this.visible = false;
  }

  private setTextures(idle: Texture, press?: Texture): void {
    this.idle = idle;
    this.press = press ?? idle;
    this.hand.texture = idle;
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
      this.textShift = Math.max(half + 8, Math.min(screenW - half - 8, x)) - x;
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
    // Ciclo de 1 s: desce, toca (troca para o desenho do toque), sobe.
    const k = this.t % 1;
    const press = k < 0.25 ? k / 0.25 : k < 0.4 ? 1 : Math.max(0, 1 - (k - 0.4) / 0.3);
    const dir = this.fromAbove ? -1 : 1;
    this.hand.texture = k >= 0.2 && k < 0.45 ? this.press : this.idle;
    this.hand.rotation = this.fromAbove ? Math.PI : 0;
    this.hand.position.set(0, (18 - press * 16) * dir);
    this.hand.scale.set(this.baseScale);
    const handH = this.idle.height * this.baseScale;
    this.text.anchor.set(0.5, this.fromAbove ? 1 : 0);
    this.text.position.set(this.textShift, (handH + 22) * dir);
  }
}
