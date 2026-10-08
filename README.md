# incremental-kit

Template reutilizável para jogos incrementais em TypeScript, desenhado 100% em canvas com [PixiJS](https://pixijs.com/) v8. A página tem só uma tag `<canvas>`: botões, painéis, árvore de upgrades, tooltips e textos são todos desenhados pelo PixiJS.

Inclui um jogo de exemplo completo, **Node Breaker** (no estilo de Nodebuster): runs curtas com tempo limitado, uma árvore de 28 upgrades, chefes, mineradores que produzem offline e uma camada de prestígio (Reboot) com árvore própria. O bot do simulador termina o jogo em 34 a 43 minutos; uma pessoa deve levar entre 45 e 60.

## Como rodar

```bash
npm install
npm run dev        # abre o jogo em http://localhost:5173
npm test           # testes do núcleo e do jogo de exemplo
npm run sim        # simula o jogo com um bot e mostra o ritmo
npm run build      # build de produção em dist/
```

No jogo, **M** abre o menu (opções, estatísticas, conquistas e save) e **F1** (ou a tecla `) abre o painel de debug: dar recursos, acelerar o tempo, pular uma hora e apagar o save.

## Estrutura

```
src/
  core/        motor sem tela: números grandes, modificadores, árvore, save, loop
  modules/     módulos opcionais: prestígio, runs, automação, eventos aleatórios
  ui/          kit de interface em canvas: cenas, botões, árvore, partículas, HUD
  sim/         simulador de balanceamento headless
games/
  node-breaker/  jogo de exemplo (conteúdo, arena, cenas)
tools/
  simulate.ts    script do simulador para o jogo de exemplo
tests/
```

O núcleo (`src/core`, `src/modules`, `src/sim`) não importa o PixiJS. A mesma lógica roda no navegador, nos testes e no simulador.

## Núcleo

| Sistema | Arquivo | O que faz |
| --- | --- | --- |
| Números grandes | `core/num.ts` | `Decimal` do break_eternity.js (passa de 1e308) e `format()` com sufixos K, M, B… e notação científica |
| Motor | `core/engine.ts` | Estado, recursos, geradores com custo exponencial e compra em lote, upgrades, condições, conquistas, desbloqueios, reset |
| Modificadores | `core/modifiers.ts` | Cada atributo vale `(base + Σ add) × Π mult ^ Π pow`, juntando upgrades, conquistas, módulos e buffs |
| Árvore de upgrades | `core/types.ts` (`UpgradeDef`) | Nós com pais, posição, níveis, custos em várias moedas, requisitos extras e várias árvores |
| Save | `core/save.ts` | Salva em localStorage, migra versões antigas, exporta/importa texto e calcula o progresso offline |
| Loop | `core/loop.ts` | Passo fixo (o jogo dá o mesmo resultado em qualquer FPS) e multiplicador de velocidade |
| Eventos | `core/events.ts` | O motor emite `upgradeBought`, `achievement`, `unlock`, `gain`… e a interface reage |

## Módulos opcionais

| Módulo | Arquivo | Uso |
| --- | --- | --- |
| Prestígio em camadas | `modules/prestige.ts` | Reset com moeda permanente; cada camada preserva sua própria árvore |
| Runs curtas | `modules/runs.ts` | Rodada com duração por atributo, soma o que foi coletado, resumo no fim |
| Automação | `modules/automation.ts` | Compradores automáticos desbloqueáveis |
| Eventos aleatórios | `modules/random-events.ts` | Bônus raros e temporários no estilo golden cookie |

## Kit de interface (canvas)

| Peça | Arquivo |
| --- | --- |
| `KitApp` e `Scene` (camadas e troca de telas) | `ui/app.ts` |
| `Button`, `Panel`, `ProgressBar`, `Tooltip`, `Toasts`, textos | `ui/widgets.ts` |
| `TreeView`: arrastar, zoom, comprar, segurar para comprar vários níveis, nós "?" escondidos | `ui/tree-view.ts` |
| `Particles` (ParticleContainer), `FloatingText` (BitmapText com pool), `ScreenShake` | `ui/fx.ts` |
| `ResourceBar` e `DebugPanel` | `ui/hud.ts` |
| Tweens e easing sem dependências | `ui/tween.ts` |
| `audio`: efeitos e música sintetizados com Web Audio (sem arquivos), volumes por canal | `ui/audio.ts` |
| `settings`: volumes, intensidade de efeitos, tremida de tela e notação, salvos à parte do jogo | `ui/settings.ts` |
| `GameMenu`: opções, estatísticas, conquistas e save (exportar, importar, apagar) | `ui/menu.ts` |
| `Slider` | `ui/widgets.ts` |

Textos que mudam todo frame usam `BitmapText`, e partículas usam `ParticleContainer`, que são os caminhos mais rápidos do PixiJS.

## Como criar um jogo novo

1. Copie `games/node-breaker` para `games/meu-jogo`.
2. Edite `content.ts`: recursos, atributos base (`stats`), árvore (`upgrades`), conquistas e camadas de prestígio. Um upgrade é só dado:

   ```ts
   {
     id: 'dmg1', name: 'Dano', icon: 'DMG', pos: { x: 0, y: -1 }, parents: ['core'], maxLevel: 10,
     description: '+1 de dano por nível.',
     cost: { resource: 'bits', base: 10, growth: 1.5 },
     effects: [{ stat: 'cursor.damage', op: 'add', value: 1 }],
   }
   ```

3. Leia os atributos na lógica do jogo com `engine.statNumber('cursor.damage')`. Upgrades, conquistas e prestígio já entram no cálculo.
4. Escolha os módulos em `game.ts` e troque a lógica de `arena.ts` pela do seu jogo, mantendo-a sem dependência de tela.
5. Aponte o `index.html` para o `main.ts` do novo jogo.
6. Ajuste o ritmo com o simulador antes de testar com pessoas.

## Simulador de balanceamento

`npm run sim -- [minutos] [segundos entre runs]` roda o jogo com um bot que mira nos grupos de nós, compra sempre o upgrade mais barato e faz Reboot quando o ganho compensa. Ele imprime quando cada item foi comprado pela primeira vez e aponta paredes (mais de 3 minutos sem nenhuma compra).

```
Tempo simulado: 34m09s | terminou: sim
    0m12s  Núcleo (core)
    ...
   17m20s  >>> REBOOT
   34m09s  Singularidade (singularity)
Nenhuma parede encontrada.
```

`NOREBOOT=1 npm run sim` mostra como o jogo fica sem prestígio: sem Reboot aparecem paredes no fim, que é o que empurra o jogador para o reset.
