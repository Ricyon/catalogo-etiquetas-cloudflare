# PUBLICAR NO CLOUDFLARE

## Antes do deploy

Confirme:

1. A planilha está em:
   **Compartilhar → Acesso geral → Qualquer pessoa com o link → Leitor**
2. As fotos do Drive usadas em `Imagem 1` e `Imagem 2` também permitem acesso por link.

Não é necessário alterar a planilha.

## Caminho recomendado: GitHub → Cloudflare

### 1. Extraia o ZIP

Abra a pasta:

`catalogo-etiquetas-cloudflare`

### 2. Crie um repositório no GitHub

Sugestão:

`catalogo-etiquetas`

Envie o CONTEÚDO da pasta para a raiz do repositório.

Na raiz devem aparecer:

- `wrangler.jsonc`
- `package.json`
- `src`
- `public`

### 3. Cloudflare

No painel:

**Workers & Pages → Create → Import a repository**

Escolha o repositório criado.

O arquivo `wrangler.jsonc` já traz a configuração do Worker e dos arquivos estáticos.

### 4. Deploy

Sugestão de nome:

`catalogo-etiquetas`

O endereço ficará parecido com:

`https://catalogo-etiquetas.SEUSUBDOMINIO.workers.dev`

### 5. Faça três testes

Primeiro:

`https://SEU-ENDERECO.workers.dev/api/health`

Depois:

`https://SEU-ENDERECO.workers.dev/api/catalogo`

Por último:

`https://SEU-ENDERECO.workers.dev`

## Se /api/catalogo informar que não consegue ler a planilha

O site está correto, mas o Google Sheets não está permitindo a consulta anônima.

Confirme o compartilhamento da planilha.

## Se os cards aparecerem mas as fotos não

Teste uma foto no próprio catálogo.

O Worker usa o ID de arquivo já existente nos links das colunas `Imagem 1` e `Imagem 2`.

Confirme que os arquivos do Drive permitem:

**Qualquer pessoa com o link → Leitor**

Não é necessário gerar novos links depois de alterar a permissão.

## Internet ruim

O primeiro acesso é o mais pesado porque precisa baixar a interface.

Depois disso:

- interface fica em cache;
- catálogo fica salvo no navegador;
- imagens já vistas ficam no cache do navegador/Cloudflare;
- imagens fora da tela não são carregadas;
- o site abre mesmo quando a atualização da planilha demora.

## Atualizar o catálogo

Cadastrar ou alterar itens no Google Sheets não exige novo deploy.

O botão `↻` força a atualização.

Novo deploy só é necessário quando você alterar HTML, CSS, JavaScript ou o Worker.
