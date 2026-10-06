/**
 * Migra a planilha atual do Catálogo de Etiquetas para Catálogo de Insumos.
 * Execute apenas uma vez no Apps Script vinculado à planilha.
 */
function migrarCatalogoParaInsumos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // O site usa o ID da planilha, então renomear o arquivo não altera a integração.
  ss.rename('Catálogo de Insumos | Suprimentos');

  const nomesPossiveis = ['Base Etiquetas', 'Base etiquetas', 'Base Materiais', 'Base materiais'];
  let sheet = null;

  for (const nome of nomesPossiveis) {
    sheet = ss.getSheetByName(nome);
    if (sheet) break;
  }

  if (!sheet) {
    throw new Error('Não encontrei a aba Base Etiquetas/Base Materiais.');
  }

  if (sheet.getName() !== 'Base Materiais') {
    sheet.setName('Base Materiais');
  }

  // Garante a coluna Categoria imediatamente após Descrição.
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]
    .map(v => String(v || '').trim());

  let categoriaCol = headers.findIndex(h => normalizar_(h) === 'categoria') + 1;

  if (!categoriaCol) {
    const descricaoCol = headers.findIndex(h => normalizar_(h) === 'descricao') + 1;
    if (!descricaoCol) throw new Error('Não encontrei a coluna Descrição.');

    sheet.insertColumnAfter(descricaoCol);
    categoriaCol = descricaoCol + 1;
    sheet.getRange(1, categoriaCol).setValue('Categoria');
  }

  // Padroniza cabeçalhos esperados sem alterar os dados.
  const cabecalhos = ['Material', 'Descrição', 'Categoria', 'UM', 'Data', 'Responsável', 'Imagem 1', 'Imagem 2'];
  const totalCols = Math.max(sheet.getLastColumn(), cabecalhos.length);
  sheet.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]);

  const lastRow = Math.max(sheet.getLastRow(), 1);

  // Preenche Etiquetas somente nas linhas que possuem Material e Categoria vazia.
  if (lastRow > 1) {
    const materiais = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    const categorias = sheet.getRange(2, 3, lastRow - 1, 1).getDisplayValues();

    const saida = categorias.map((linha, i) => {
      const material = String(materiais[i][0] || '').trim();
      const categoria = String(linha[0] || '').trim();
      return [material && !categoria ? 'Etiquetas' : categoria];
    });

    sheet.getRange(2, 3, saida.length, 1).setValues(saida);

    // Lista sugerida com aviso, sem impedir novas categorias futuramente.
    const categoriasPermitidas = [
      'Etiquetas',
      'Elásticos',
      'Linhas',
      'Fios',
      'Fitas',
      'Botões',
      'Zíperes',
      'Embalagens',
      'Outros'
    ];

    const regra = SpreadsheetApp.newDataValidation()
      .requireValueInList(categoriasPermitidas, true)
      .setAllowInvalid(true)
      .setHelpText('Selecione uma categoria ou digite uma nova quando necessário.')
      .build();

    sheet.getRange(2, 3, Math.max(lastRow - 1, 1), 1).setDataValidation(regra);
  }

  // Visual corporativo e legível.
  const header = sheet.getRange(1, 1, 1, 8);
  header
    .setBackground('#00549F')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 30);

  const widths = [125, 360, 140, 80, 110, 160, 360, 360];
  widths.forEach((width, index) => sheet.setColumnWidth(index + 1, width));

  if (lastRow > 1) {
    const body = sheet.getRange(2, 1, lastRow - 1, 8);
    body.setVerticalAlignment('middle');

    sheet.getRange(2, 2, lastRow - 1, 1).setWrap(true);
    sheet.getRange(2, 7, lastRow - 1, 2).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
    sheet.getRange(2, 5, lastRow - 1, 1).setNumberFormat('dd/MM/yyyy');

    // Bandas suaves, preservando fórmulas e valores.
    for (let row = 2; row <= lastRow; row++) {
      const bg = row % 2 === 0 ? '#EAF4FA' : '#FFFFFF';
      sheet.getRange(row, 1, 1, 8).setBackground(bg);
    }
  }

  // Filtro de consulta.
  if (sheet.getFilter()) sheet.getFilter().remove();
  if (lastRow >= 1) {
    sheet.getRange(1, 1, Math.max(lastRow, 2), 8).createFilter();
  }

  SpreadsheetApp.flush();

  SpreadsheetApp.getUi().alert(
    'Migração concluída',
    'A planilha foi renomeada para "Catálogo de Insumos | Suprimentos" e a aba agora é "Base Materiais". Os materiais atuais foram classificados como Etiquetas.',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function normalizar_(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
