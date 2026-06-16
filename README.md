# SmartEvac

SmartEvac e um simulador de evacuacao urbana feito em Python com Pygame para apresentacao em feira cientifica.

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

```bash
pip install -r requirements.txt
python smartevac.py
```

## Controles

- `1`, `2`, `3`: alternar entre Incendio, Enchente e Acidente industrial.
- `Espaco`: pausar ou continuar.
- `R`: reiniciar o cenario atual.
- `N`: nova simulacao com o mesmo cenario.
- `Esc`: sair.

Tambem e possivel clicar nos botoes da interface.
