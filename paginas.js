/* Sugestão de quais páginas do PDF enviar para a leitura.
 * Mantém: páginas com itens, valores ou dados do cliente; páginas sem texto (escaneadas); a 1ª página.
 * Corta: páginas só com cláusulas, condições gerais, comunicados e termos.
 * O vendedor sempre pode marcar ou desmarcar qualquer página.
 */
(function (raiz) {
  'use strict';
  function classificarPagina(texto, numero) {
    const t = String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    const semEspaco = t.replace(/\s/g, '');
    if (semEspaco.length < 40) return { manter: true, motivo: 'Página sem texto (escaneada): enviada' };
    const dinheiro = (t.match(/\b\d{1,3}(\.\d{3})*,\d{2,4}\b|\b\d{1,3}(,\d{3})*\.\d{2}\b/g) || []).length;
    const cabecalhoTabela = /\b(QTD|QTDE|QTD\.|QUANT|QUANTID|QUANTIDADE|QT\.)/.test(t) &&
                            /(DESCRI|PRODUTO|MATERIA|\bITEM\b)/.test(t);
    const unidades = (t.match(/\b(UN|UND|UNID|UNIDADE|PC|PCS|PEC|PECA|KG|SC|M2|MT|LT|CX|PE|BD|TB|GL)\b/g) || []).length;
    const temCnpj = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/.test(t);
    const juridico = (t.match(/(CONDICOES GERAIS|CLAUSULA|CONTRATAD[AO]|CONTRATANTE|COMUNICADO|PROPRIETARIO E CONFIDENCIAL|CODIGO DE CONDUTA|ANTICORRUP|LEI N|FORO DA COMARCA|PREZADO FORNECEDOR|INSTRUMENTO DE CONTRATACAO)/g) || []).length;

    if (cabecalhoTabela && (dinheiro >= 1 || unidades >= 1)) return { manter: true, motivo: 'Tem itens' };
    if (dinheiro >= 2 && unidades >= 1) return { manter: true, motivo: 'Tem itens e valores' };
    if (numero === 1) return { manter: true, motivo: '1ª página (dados do cliente)' };
    if (juridico >= 2 && dinheiro < 2) return { manter: false, motivo: 'Só cláusulas e condições: cortada' };
    if (temCnpj) return { manter: true, motivo: 'Tem dados do cliente' };
    if (dinheiro === 0 && unidades === 0) return { manter: false, motivo: 'Sem itens nem valores: cortada' };
    return { manter: true, motivo: 'Na dúvida: enviada' };
  }
  const Paginas = { classificarPagina };
  if (typeof module !== 'undefined' && module.exports) module.exports = Paginas;
  else raiz.Paginas = Paginas;
})(typeof window !== 'undefined' ? window : globalThis);
