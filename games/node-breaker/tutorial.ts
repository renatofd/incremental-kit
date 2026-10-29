import type { GameState } from '../../src/core/types';

/**
 * Tutorial guiado da primeira run (`flags.tutor`), sem tela:
 * 0. a 1ª run começa direto e tem um nó de presente que paga a primeira
 *    compra (a run congela até o jogador destruí-lo);
 * 1. no resultado só há o botão de voltar à árvore; lá, a mãozinha aponta o
 *    Núcleo e depois o botão de nova run;
 * 2. concluído (ao iniciar a 2ª run). Saves sem a flag (anteriores ao
 *    tutorial, e o simulador) contam como concluído.
 */
export const TUTOR = { firstRun: 0, toHub: 1, done: 2 } as const;

export const tutorStep = (s: GameState): number => Number(s.flags.tutor ?? TUTOR.done);

/** Bits do nó de presente: pagam o Núcleo, a primeira compra. */
export const TUTOR_BITS = 10;
/** Segundos de run até o presente aparecer. */
export const TUTOR_GIFT_TIME = 2;
