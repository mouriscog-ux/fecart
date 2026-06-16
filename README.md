# SmartEvac

SmartEvac e um simulador de evacuacao urbana feito em HTML, CSS e JavaScript para apresentacao em feira cientifica e publicacao no GitHub Pages.

## Recursos

- Mapa urbano em grade 20x20.
- Tres cenarios: incendio, enchente e acidente industrial.
- Obstaculos diferentes para cada cenario.
- Comparacao em tempo real entre:
  - Com IA: algoritmo A* para encontrar rotas eficientes ate os abrigos.
  - Sem IA: rota simples, com movimento direto e menos adaptativo.
- Indicadores ao vivo:
  - Pessoas evacuadas.
  - Tempo medio de evacuacao.
  - Taxa de congestionamento.
  - Comparacao de desempenho entre os modos.

## Como executar

Abra o arquivo `index.html` no navegador.

Para publicar no GitHub Pages:

1. Envie estes arquivos para um repositorio no GitHub.
2. Acesse `Settings` > `Pages`.
3. Em `Build and deployment`, selecione `Deploy from a branch`.
4. Escolha a branch principal e a pasta `/root`.
5. Salve e aguarde o link do GitHub Pages.

## Controles

- `1`, `2`, `3`: alternar entre Incendio, Enchente e Acidente industrial.
- `Espaco`: pausar ou continuar.
- `R`: reiniciar o cenario atual.
- `N`: nova simulacao com o mesmo cenario.

Tambem e possivel clicar nos botoes da interface.

## Versao anterior

O arquivo `smartevac.py` foi mantido como referencia da versao original em Python/Pygame, mas a versao recomendada para GitHub Pages e a web: `index.html`, `style.css` e `script.js`.
