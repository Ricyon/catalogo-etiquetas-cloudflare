# Catálogo de Etiquetas — Cloudflare Workers

Versão do Catálogo de Etiquetas preparada para substituir a interface hospedada no Google Apps Script.

## Base configurada

Google Sheets ID:

`10q1f5tMWkl7r5ycvQQZDQyEKMjf9-CgjLh9BD42caxE`

Aba:

`Base etiquetas`

Colunas lidas automaticamente:

- Material
- Descrição
- UM
- Data
- Responsável
- Imagem 1
- Imagem 2

O aplicativo não depende da aba `Geral`. A aba `Base etiquetas` é a fonte do site.

## Comportamento mantido

- Pesquisa por código ou descrição.
- Pesquisa exata por código abre o material diretamente.
- Catálogo em cards.
- O card usa somente `Imagem 1`.
- A página de detalhes mostra `Imagem 1` e `Imagem 2`.
- Clique/toque abre a imagem ampliada.
- Dados adicionais: UM, data e responsável.
- A planilha pode continuar sendo atualizada sem novo deploy.

## Otimização para internet ruim

O projeto foi desenhado especificamente para isso:

1. HTML/CSS/JS puro, sem frameworks e sem fontes externas.
2. Arquivos estáticos entregues pela rede da Cloudflare.
3. Consulta do Google Sheets feita pelo Worker no servidor; o navegador não abre `script.google.com`.
4. Cache do catálogo no edge da Cloudflare.
5. Última base válida salva no navegador.
6. Uma cópia inicial dos dados atuais está incluída como fallback.
7. Service Worker mantém a interface disponível após o primeiro acesso.
8. Cards são renderizados em lotes de 32.
9. Fotos só começam a baixar quando chegam perto da área visível.
10. Cards pedem miniaturas menores; detalhes e ampliação pedem tamanhos maiores.
11. As fotos passam por `/img/...` no próprio domínio do Cloudflare e ficam cacheadas.

## Importante sobre a planilha

Para a arquitetura sem credenciais funcionar, a planilha precisa permitir leitura sem login:

**Compartilhar → Acesso geral → Qualquer pessoa com o link → Leitor**

Se a política da empresa impedir isso, o frontend continua correto, mas o backend deverá ser trocado por uma versão autenticada.

## Importante sobre as fotos

Os arquivos do Google Drive usados nas colunas `Imagem 1` e `Imagem 2` precisam estar acessíveis por link.

O navegador NÃO abre o link do Drive diretamente. O Worker busca a miniatura e a entrega em `/img/...`, evitando os problemas de conta Google nos computadores da empresa.

## Estrutura

```text
catalogo-etiquetas-cloudflare/
├─ src/
│  └─ index.js
├─ public/
│  ├─ index.html
│  ├─ styles.css
│  ├─ app.js
│  ├─ bootstrap.js
│  ├─ sw.js
│  ├─ manifest.webmanifest
│  └─ robots.txt
├─ wrangler.jsonc
├─ package.json
├─ README.md
└─ PUBLICAR-CLOUDFLARE.md
```

## Rotas de teste

Depois do deploy:

`/api/health`

Deve retornar `success: true`.

`/api/catalogo`

Deve retornar os materiais cadastrados.

A página inicial fica em `/`.

## Atualizações

Alterações feitas na planilha aparecem no catálogo sem publicar o código novamente.

O cache normal do catálogo é de 120 segundos. O botão `↻` força uma leitura nova.

As imagens têm cache longo porque os links/IDs do Drive normalmente mudam quando o arquivo é substituído.
