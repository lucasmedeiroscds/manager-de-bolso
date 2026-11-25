# Manager de Bolso

Jogo de gerenciamento de futebol no estilo clássico, com menus e texto. Roda no navegador do celular e funciona offline depois de instalado.

## Dados reais: 31 ligas em 5 continentes
O banco padrão ("🌍 Mundo real") tem **528 clubes e cerca de 15.600 jogadores reais**, com os elencos de julho de 2026:
- **América do Sul:** Brasil, Argentina
- **América do Norte:** EUA (MLS), México
- **Europa:** Inglaterra, Espanha, Itália, Alemanha, França, Portugal, Holanda, Bélgica, Turquia, Escócia, Grécia, Rússia, Ucrânia, Áustria, Suíça, Dinamarca, Noruega, Suécia, Polônia, Rep. Tcheca, Croácia, Sérvia e Romênia
- **Ásia:** Japão, Coreia do Sul, Arábia Saudita
- **Oceania:** Austrália

Sobre a origem e o tratamento dos dados:
- **Fonte:** base aberta [transfermarkt-datasets](https://github.com/dcaribou/transfermarkt-datasets), licença CC0, com dados originados do Transfermarkt. Ela não inclui Série B, estaduais nem copas.
- **Atributos:** são **estimativas** calculadas pelo valor de mercado real, pela idade e pela posição. Por exemplo, Haaland e Kane ficaram com 93, e Neymar com 84. Qualquer jogador pode ser corrigido no jogo pelo botão "Editar".
- **Valores e salários:** seguem o modelo econômico do jogo, em R$. O valor real em euros aparece na ficha do jogador.
- **Jogadores fictícios:** quando a IA precisa completar um elenco, e nos garotos da base, o jogo cria jogadores inventados, marcados como "fictício".
- **Direitos:** nomes reais de clubes e atletas podem ter restrições de direito de imagem. O jogo é para **uso pessoal** e não usa escudos.
- **Liga fictícia:** continua disponível na tela inicial, no botão "🎲 Liga fictícia".

### Atualizar os dados reais
1. Baixe de novo os arquivos `players.csv.gz`, `clubs.csv.gz`, `competitions.csv.gz` e `countries.csv.gz` (endereços no site do projeto) para a pasta `dados-origem/transfermarkt`.
2. Rode o conversor:
   ```
   node ferramentas/converter-transfermarkt.js dados-origem/transfermarkt data/mundo.json
   ```

## Como jogar no PC
1. Abra o PowerShell **nesta pasta** e rode:
   ```
   node servidor.js
   ```
2. Abra `http://localhost:8080` no navegador.

## Como jogar no celular (mesmo Wi-Fi)
1. No PC, rode `node servidor.js`. Ele mostra uma linha **"No celular: http://192.168.x.x:8080"**.
2. Digite esse endereço no Chrome do Android.
3. Se não abrir, permita o Node.js no Firewall do Windows em "redes privadas".

Assim o jogo funciona, mas só enquanto o PC estiver ligado. Para instalar de verdade, com ícone e funcionando offline, o jogo precisa ficar num endereço com **https**. A opção gratuita é o GitHub Pages. Isso é a Etapa 8.

## O que o jogo tem
- Escolha do clube por continente, depois país e liga, ou buscando pelo nome
- 31 ligas simuladas ao mesmo tempo. Ligas de até 22 clubes jogam turno e returno; as maiores, turno único. A tabela, as rodadas e a artilharia de qualquer liga podem ser vistas.
- Partida ao vivo:
  - campo com os 22 jogadores posicionados pela formação, com a energia de cada um
  - **movimento com sentido** (arquivo `js/ui/pitch-anim.js`):
    - a bola sempre tem um dono: conduções, passes para companheiros (de preferência à frente) e passes longos com a bola "subindo"
    - chutes ao gol, defesa e reposição do goleiro, tiro de meta, desarmes, e saída de bola depois do gol
    - os times se movem em bloco: quem ataca sobe as linhas, quem defende recua e se fecha, todos deslizam para o lado da bola, o marcador pressiona e os atacantes entram na área
    - quem finaliza na animação é o jogador citado na narração
    - em 1x e 2x o relógio segura um pouco nos lances de perigo para dar tempo de ver a jogada
  - estádio, público e renda
  - abas Campo, Lances e Números (posse, finalizações, desarmes, erros de passe, faltas e cartões)
  - substituição tocando no jogador no campo e depois no reserva
- Táticas: formação, estilo de jogo, marcação (leve, média ou pesada) e foco do ataque (pelo meio ou pelas laterais). Dá para mudar tudo durante a partida.
- **Copas.** Os jogos de copa acontecem no meio da semana; quem joga duas vezes na mesma semana se cansa mais.
  - **31 copas nacionais** (Copa do Brasil, FA Cup, Copa del Rey e outras): mata-mata em jogo único, com pênaltis se empatar. Os mais fracos jogam uma fase preliminar; os mais fortes entram direto.
  - **4 continentais**, com grupos de 4 em ida e volta seguidos de mata-mata (final em campo neutro):
    - Copa Libertadores (16 clubes)
    - Liga dos Campeões (32 clubes)
    - Liga dos Campeões da Ásia (16 clubes)
    - Copa dos Campeões da Concacaf (16 clubes)
  - **Vagas continentais:** vêm da tabela da temporada anterior; na primeira temporada, da reputação dos clubes. Ligas mais fortes recebem mais vagas, até 4 por país.
  - **3 continentais secundárias**, com os clubes logo abaixo na tabela: Copa Sul-Americana, Liga Europa e Liga Conferência. Cada clube joga só uma continental por temporada.
  - **Mundial de Clubes** no fim da temporada, com os campeões continentais.
- **Notas por jogo** (de 3 a 10) para cada jogador, com o "craque do jogo" na aba Números da partida. A ficha do jogador mostra jogos, gols, assistências e nota média da temporada, além dos prêmios que ele ganhou.
- **Premiações:**
  - **Por liga:** Melhor jogador, Artilheiro, Melhor jovem (até 21 anos), Melhor goleiro e Seleção do campeonato.
  - **No mundo:** Melhor do Mundo, com pódio e top 10.
  - **Critério:** nota média, gols, assistências, títulos e nível do jogador; no prêmio mundial também conta a força da liga.
  - **Onde ver:** em **Mais → Prêmios**, com a corrida parcial durante a temporada e as premiações passadas, e na cerimônia ao fim de cada temporada.
- **Carreira do técnico** (Início → cartão do técnico, ou Mais → Carreira):
  - **Perfil:** seu nome, reputação de 0 a 100 e nível (Iniciante, Promissor, Experiente, Respeitado, Renomado, Elite, Lenda).
  - **Diretoria e Torcida:** dois medidores que mudam a cada jogo conforme o resultado comparado ao esperado. Vencer um time mais forte vale mais; perder para um mais fraco pesa mais.
  - **Metas da temporada:** posição na liga, fase na copa nacional e na continental, e caixa positivo. Cada meta mostra se está no caminho, em risco, cumprida ou perdida.
  - **Demissão:**
    - durante a temporada, só se a diretoria despencar;
    - no fim da temporada, só se você ficar bem abaixo da meta da liga;
    - quem cumpre a meta da liga nunca é demitido no fim do ano.
  - **Propostas de emprego:** chegam no fim da temporada e às vezes no meio dela, quando sua reputação está alta. Quando demitido, você escolhe entre clubes menores e pode esperar semanas e procurar outras.
  - **Fim da temporada:** balanço com a reputação subindo ou caindo, mais a **sala de troféus** e o **histórico** de clubes.
- **Aba Tática** com campo de futebol: os titulares aparecem na formação escolhida, com a nota na posição e a energia; toque numa posição para trocar o jogador.
  - Prêmios em dinheiro por fase, renda de bilheteria maior nas fases finais, artilharia de cada copa e lista de campeões anteriores. Tudo fica em **Tabela → Copas**, e o Início mostra a sua situação em cada competição.
- 6 formações e 6 estilos de jogo, escalação manual ou automática
- Cartões, suspensões (3 amarelos ou vermelho), lesões, cansaço e moral
- Mercado com 2 janelas: comprar, vender, emprestar, pedir emprestado, agentes livres e propostas da IA
- Finanças: salários, bilheteria (com preço do ingresso ajustável), patrocínio e premiação
- Treino (foco e intensidade), evolução de jovens, declínio por idade, aposentadoria e garotos da base
- Contratos que vencem, renovação e dispensa
- Salvamento automático a cada rodada, mais 3 espaços manuais e backup em arquivo
- Banco editável: edite qualquer jogador no jogo, ou exporte e importe CSV (abre no Excel) e JSON

## Formato do CSV
Uma linha por jogador, com separador `;` (padrão do Excel em português):
```
nome;clube;posicao;idade;finalizacao;passe;defesa;forca;resistencia;goleiro;potencial
```
- Posições aceitas: GOL, ZAG, LAT, VOL, MEI, ATA. Também aceita GK, CB, ST, CAM etc.
- Atributos vão de 1 a 99.
- Cada clube precisa de pelo menos 14 jogadores, incluindo um goleiro.
- Linhas com o clube vazio viram jogadores sem clube.
- Para ver um exemplo, toque em **"Modelo CSV"** na tela inicial.

## Organização do código
```
index.html            página única do jogo
css/style.css         visual (pensado para celular)
js/main.js            liga telas e ações dos botões
js/storage.js         salvar e carregar
js/data/generator.js  banco fictício de exemplo
js/data/importer.js   importação e exportação de CSV e JSON
js/engine/            MOTOR DO JOGO (não depende da tela)
  ratings.js          overall por posição, valor e salário
  tactics.js          formações, estilos e escalação automática
  match.js            simulação da partida (constantes K = balanceamento)
  season.js           calendário, tabela, rodadas e fim de temporada
  market.js           transferências e IA do mercado
  finance.js          receitas e despesas
  evolution.js        treino, envelhecimento e base
js/ui/                telas
testes/               teste automático de balanceamento
ferramentas/          gerador dos ícones PNG
sw.js                 modo offline (aumente a VERSAO ao mudar arquivos)
```

## Teste automático
```
node testes/simular-temporadas.js 5
```
Simula 5 temporadas completas e confere se gols, pontos e finanças ficam realistas.
