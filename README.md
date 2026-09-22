# Netos · guia do adulto e álbum falante

App web (PWA) para acompanhar o desenvolvimento das crianças da família e, para as de 2 anos, um álbum de fotos com a voz de cada parente. Sem framework, sem servidor de dados: tudo fica salvo no próprio aparelho.

## O que tem

- **Perfis por criança** com data de nascimento. A faixa etária define o conteúdo:
  - **Bebê (0 a 14 meses)**: 7 atividades de colo e chão, marcos de 2 e 4 meses (CDC 2022), diário. Álbum bloqueado: nenhuma tela antes dos 2 anos (SBP, OMS, AAP).
  - **Faixa dos 2 anos (15 a 42 meses)**: 15 atividades de 10 minutos em 5 domínios, marcos de 24 e 30 meses, diário, e acesso ao álbum falante.
- **Guia do adulto**: sugestão do dia (prioriza o domínio menos praticado), roteiro passo a passo, o que observar, palavras para repetir, marcos com checklist, diário de palavras novas e momentos. Os textos usam "ela" ou "ele" conforme o cadastro.
- **Álbum falante** (uso conjunto, criança de 2 anos com adulto): fotos reais da família com a voz gravada de cada pessoa. Sem pontuação, sem prêmio, sem autoplay. Encerra sozinho depois de 5 a 15 minutos (padrão 8) com uma sugestão de brincadeira física. Sair exige segurar o botão por 2 segundos; configurar exige segurar a engrenagem.
- **Quebra-cabeça** (dentro do álbum, mesma sessão e mesmo limite): a foto tocada por último vira um quebra-cabeça de 2, 3 ou 4 peças grandes, com encaixe generoso. Ao completar, toca a voz da pessoa. Sem pontos, sem tempo, sem confete. O número de peças é definido pelo adulto na configuração. O guia também traz a versão física, com foto impressa em papelão, que é a mais indicada aos 2 anos.
- **Jogo de cores** (dentro do álbum, mesma sessão): "Cadê o vermelho?" com 2 ou 3 bolas grandes de cor. A pergunta fica escrita em letras grandes para o adulto ler em voz alta, com voz sintética de apoio. Acerto: a tela inteira vira aquela cor com o nome. Erro: a cor certa pulsa, sem "não". Oito rodadas e encerra, sugerindo procurar cores de verdade pela casa. Começa com vermelho, azul e amarelo; o adulto pode ativar verde, laranja e roxo.
- **Jogo de contar** (dentro do álbum, mesma sessão): "Vamos contar!" com 1 a 3 objetos grandes (a foto tocada por último vira o objeto: "dois vovôs"). A criança toca um por vez e cada toque diz o número seguinte e marca o objeto. No fim aparece o algarismo grande com o nome e toca a voz da pessoa. Sem "quantos?", porque a noção de quantidade só vem depois dos 3 anos. O adulto pode subir o limite para 5.
- **Jogo de formas** (dentro do álbum, mesma sessão): caixa de encaixe digital. Buracos em silhueta e peças coloridas para arrastar até o buraco certo, com encaixe generoso. No buraco errado a peça volta e o certo pulsa. O nome da forma é dito ao encaixar, não antes. Começa com círculo e quadrado; o adulto pode ativar triângulo e estrela. Seis rodadas e encerra sugerindo a caixa de sapato com furos, que está no guia.
- **Backup**: exporta e importa um arquivo JSON com fotos, vozes, marcos e diário de todas as crianças.

Perfis iniciais já cadastrados com datas **aproximadas** (ajuste em "Gerenciar crianças"): Nicole e Luca (2 anos), Aurelinho, Felipe e Laura (2 meses).

## Como abrir

### No Mac, para testar
```bash
cd ~/Desktop/NICOLE && python3 -m http.server 8765
```
Depois abra http://localhost:8765 no navegador.

### No celular ou tablet (recomendado)
A gravação de voz e o modo "instalado" exigem HTTPS. Duas opções gratuitas:

1. **Netlify Drop** (mais simples): acesse app.netlify.com/drop e arraste a pasta NICOLE inteira. Ele devolve um endereço https. Abra no celular, toque em "Compartilhar" e depois "Adicionar à Tela de Início" (iPhone) ou no menu do Chrome "Instalar app" (Android).
2. **GitHub Pages**: crie um repositório, envie os arquivos e ative Pages nas configurações.

Depois de instalado, o app funciona sem internet.

### Só na rede de casa
Rode o servidor no Mac e abra no celular pelo IP do Mac (ex.: http://192.168.0.10:8765). Funciona para o guia, mas o microfone não grava sem HTTPS.

## Arquivos
- `index.html`: todas as telas.
- `app.js`: navegação, perfis, banco local (IndexedDB para fotos e áudio, localStorage para o resto), gravação, sessão, backup.
- `content.js`: atividades, marcos, dicas e faixas etárias. Para editar ou adicionar conteúdo, mexa só aqui.
- `styles.css`, `manifest.json`, `sw.js`, `icons/`: visual, instalação e uso offline.

## Base das recomendações
- Sociedade Brasileira de Pediatria, Manual de Orientação "Menos telas, mais saúde" (2019).
- OMS, "Guidelines on physical activity, sedentary behaviour and sleep for children under 5" (2019).
- AAP, "Media and Young Minds" (2016).
- CDC, "Learn the Signs. Act Early", marcos revisados em 2022.
