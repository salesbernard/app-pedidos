/* ABA PREÇOS — últimas compras e vendas de cada item, a partir das notas fiscais da empresa.
 * Só leitura. Os dados vêm do servidor (ação "precos"), que lê o ITENS_PRECOS.csv gravado
 * pelo coletor ao lado do índice de notas.
 *
 * Busca: cada palavra digitada precisa aparecer em qualquer posição da descrição, sem
 * diferenciar acento nem maiúscula. Compra e venda não se ligam por código (o de venda é o
 * interno do Bling, o de compra é o do fornecedor): o painel mostra as do item escolhido e,
 * do lado que ele não tiver, as encontradas pela mesma palavra.
 *
 * Funções puras em window.Precos (e module.exports no Node, para testes).
 */
(function (raiz) {
  'use strict';

  const TIPOS = {
    C: 'Compra', V: 'Venda', DV: 'Devolução de venda', DC: 'Devolução de compra'
  };
  const LADO = { C: 'compras', DC: 'compras', V: 'vendas', DV: 'vendas' };
  const MAX_RESULTADOS = 60;
  const MAX_LINHAS = 10;

  function normalizar(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/\s+/g, ' ').trim();
  }
  const palavras = termo => normalizar(termo).split(' ').filter(Boolean);
  const contemTodas = (txt, ps) => ps.every(p => txt.indexOf(p) >= 0);

  // dados do servidor → estrutura de busca
  function preparar(j) {
    const descs = (j.descricoes || []).map((d, i) => ({
      i, texto: d, norm: normalizar(d), compras: 0, vendas: 0, devol: 0, ultima: ''
    }));
    const linhas = (j.linhas || []).map(l => ({
      tipo: l[0], nf: l[1], data: l[2], parte: (j.partes[l[3]] || ['', ''])[0], cnpj: (j.partes[l[3]] || ['', ''])[1],
      desc: l[4], codigo: l[5], unid: l[6], qtd: l[7], unit: l[8]
    }));
    linhas.forEach(l => {
      const d = descs[l.desc];
      if (!d) return;
      if (l.tipo === 'C') d.compras++;
      else if (l.tipo === 'V') d.vendas++;
      else d.devol++;
      if (l.data > d.ultima) d.ultima = l.data;
    });
    // mais recente primeiro (data, depois nº da nota)
    linhas.sort((a, b) => (b.data > a.data) - (b.data < a.data) || (Number(b.nf) || 0) - (Number(a.nf) || 0));
    return { descs, linhas, atualizado: j.atualizado || '' };
  }

  // descrições que contêm todas as palavras; as mais recentes primeiro
  function buscar(base, termo, limite) {
    const ps = palavras(termo);
    if (!ps.length) return [];
    const achados = base.descs.filter(d => contemTodas(d.norm, ps));
    achados.sort((a, b) => (b.ultima > a.ultima) - (b.ultima < a.ultima) || a.texto.localeCompare(b.texto));
    return achados.slice(0, limite || MAX_RESULTADOS);
  }

  // histórico do item escolhido; o lado sem nenhuma linha usa as encontradas pela palavra
  function historico(base, iDesc, termo, max) {
    max = max || MAX_LINHAS;
    const ps = palavras(termo);
    const doItem = base.linhas.filter(l => l.desc === iDesc);
    const pelaPalavra = lado => base.linhas.filter(l => LADO[l.tipo] === lado && l.tipo.length === 1 &&
      contemTodas(base.descs[l.desc].norm, ps));
    const lado = nome => {
      const principais = doItem.filter(l => LADO[l.tipo] === nome && l.tipo.length === 1);
      const devolucoes = doItem.filter(l => LADO[l.tipo] === nome && l.tipo.length === 2);
      if (principais.length || devolucoes.length || !ps.length)
        return { linhas: principais.slice(0, max), total: principais.length, devolucoes: devolucoes.slice(0, max), pelaPalavra: false };
      const outras = pelaPalavra(nome);
      return { linhas: outras.slice(0, max), total: outras.length, devolucoes: [], pelaPalavra: true };
    };
    return { compras: lado('compras'), vendas: lado('vendas') };
  }

  const api = { TIPOS, normalizar, preparar, buscar, historico };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  raiz.Precos = api;

  /* ---------------- tela (só no navegador) ---------------- */
  if (typeof document === 'undefined') return;

  const T = { base: {}, carregando: {}, termo: '', escolhido: null, app: null };
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const moeda = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const qtd = n => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  const dataBR = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : (s || '—'); };
  const dataHoraBR = s => { const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s || ''); return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ' ' + m[4] + ':' + m[5] : ''}` : ''; };

  // chamado pelo app.js: app = { chamar(acao), empresa(), mostrar(id) }
  raiz.Precos.abrir = function (app) {
    T.app = app;
    app.mostrar('tela-precos');
    const emp = app.empresa();
    $('#precos-busca').value = T.termo;
    fecharPainel();
    carregar(emp).then(() => { desenharLista(); setTimeout(() => $('#precos-busca').focus(), 50); });
  };

  async function carregar(emp, forcar) {
    if (T.base[emp.id] && !forcar) return T.base[emp.id];
    if (!T.carregando[emp.id]) {
      $('#precos-info').textContent = 'Carregando as notas da ' + emp.curto + '...';
      T.carregando[emp.id] = T.app.chamar('precos').then(j => {
        T.base[emp.id] = preparar(j);
        return T.base[emp.id];
      }).catch(e => {
        $('#precos-info').innerHTML = '<span class="erro">' + esc(e.message) + '</span>';
        throw e;
      }).finally(() => { T.carregando[emp.id] = null; });
    }
    return T.carregando[emp.id].catch(() => null);
  }

  function baseAtual() { return T.app && T.base[T.app.empresa().id]; }

  function desenharLista() {
    const base = baseAtual();
    const lista = $('#precos-lista');
    if (!base) { lista.innerHTML = ''; return; }
    const info = `${base.descs.length.toLocaleString('pt-BR')} itens das notas` +
      (base.atualizado ? ` · atualizado em ${dataHoraBR(base.atualizado)}` : '');
    const termo = T.termo.trim();
    if (!termo) {
      $('#precos-info').textContent = info;
      lista.innerHTML = '<p class="cinza precos-vazio">Digite uma palavra da descrição, por exemplo <b>joelho</b> ou <b>chamex</b>.</p>';
      return;
    }
    const achados = buscar(base, termo);
    $('#precos-info').textContent = achados.length
      ? (achados.length >= MAX_RESULTADOS ? `Mostrando os ${MAX_RESULTADOS} mais recentes. Digite mais uma palavra para filtrar.` : `${achados.length} ${achados.length === 1 ? 'item encontrado' : 'itens encontrados'}`)
      : info;
    if (!achados.length) { lista.innerHTML = '<p class="cinza precos-vazio">Nenhum item com “' + esc(termo) + '” nas notas.</p>'; return; }
    lista.innerHTML = achados.map(d => `
      <button class="precos-item" data-i="${d.i}">
        <span class="precos-desc">${esc(d.texto)}</span>
        <span class="precos-selos">
          ${d.vendas ? `<span class="selo venda">${d.vendas} venda${d.vendas > 1 ? 's' : ''}</span>` : ''}
          ${d.compras ? `<span class="selo compra">${d.compras} compra${d.compras > 1 ? 's' : ''}</span>` : ''}
          ${d.devol ? `<span class="selo devol">${d.devol} devol.</span>` : ''}
          <span class="cinza">${dataBR(d.ultima)}</span>
        </span>
      </button>`).join('');
    lista.querySelectorAll('.precos-item').forEach(b => { b.onclick = () => abrirPainel(Number(b.dataset.i)); });
  }

  function tabela(linhas, mostrarDesc, rotuloParte) {
    if (!linhas.length) return '';
    return `<table class="precos-tab"><thead><tr><th>Data</th><th class="num">Qtd</th><th class="num">Valor unit.</th><th>${rotuloParte}</th></tr></thead><tbody>` +
      linhas.map(l => `<tr>
        <td>${dataBR(l.data)}<div class="cinza peq">NF ${esc(l.nf)}</div></td>
        <td class="num">${qtd(l.qtd)}<div class="cinza peq">${esc(l.unid)}</div></td>
        <td class="num forte">${moeda(l.unit)}</td>
        <td>${esc(l.parte)}${mostrarDesc ? `<div class="cinza peq">${esc(baseAtual().descs[l.desc].texto)}</div>` : ''}</td>
      </tr>`).join('') + '</tbody></table>';
  }

  function secao(titulo, lado, rotuloParte, tipoDevol) {
    let h = `<section class="precos-secao"><h4>${titulo}${lado.total > lado.linhas.length ? ` <span class="cinza">(últimas ${lado.linhas.length} de ${lado.total})</span>` : ''}</h4>`;
    if (lado.pelaPalavra && lado.linhas.length)
      h += `<p class="cinza peq">Este item não tem ${titulo.toLowerCase()} com a mesma descrição. Abaixo, as ${titulo.toLowerCase()} encontradas por “${esc(T.termo.trim())}”.</p>`;
    h += lado.linhas.length ? tabela(lado.linhas, lado.pelaPalavra, rotuloParte) : `<p class="cinza">Nenhuma ${titulo.toLowerCase().replace(/s$/, '')} encontrada.</p>`;
    const nd = lado.devolucoes.length;
    if (nd) h += `<details class="precos-devol"><summary>${nd} ${nd === 1 ? 'devolução' : 'devoluções'} ${tipoDevol} (fora da lista acima)</summary>${tabela(lado.devolucoes, false, rotuloParte)}</details>`;
    return h + '</section>';
  }

  function abrirPainel(iDesc) {
    const base = baseAtual();
    if (!base) return;
    T.escolhido = iDesc;
    const h = historico(base, iDesc, T.termo);
    $('#precos-painel-titulo').textContent = base.descs[iDesc].texto;
    const codigo = (base.linhas.find(l => l.desc === iDesc) || {}).codigo;
    $('#precos-painel-sub').textContent = codigo ? 'Código ' + codigo : '';
    $('#precos-painel-corpo').innerHTML =
      secao('Vendas', h.vendas, 'Cliente', 'de venda') +
      secao('Compras', h.compras, 'Fornecedor', 'de compra');
    $('#precos-painel').classList.remove('escondido');
    document.body.classList.add('sem-rolagem');
    requestAnimationFrame(() => $('#precos-painel').classList.add('aberto'));
  }

  function fecharPainel() {
    const p = $('#precos-painel');
    if (!p) return;
    p.classList.remove('aberto');
    document.body.classList.remove('sem-rolagem');
    T.escolhido = null;
    setTimeout(() => { if (!p.classList.contains('aberto')) p.classList.add('escondido'); }, 220);
  }

  function ligar() {
    let t;
    $('#precos-busca').addEventListener('input', ev => {
      T.termo = ev.target.value;
      clearTimeout(t); t = setTimeout(desenharLista, 120);
    });
    $('#precos-limpar').onclick = () => { T.termo = ''; $('#precos-busca').value = ''; desenharLista(); $('#precos-busca').focus(); };
    $('#precos-atualizar').onclick = () => { const emp = T.app.empresa(); carregar(emp, true).then(desenharLista); };
    $('#precos-painel-fechar').onclick = fecharPainel;
    $('#precos-painel').onclick = ev => { if (ev.target.id === 'precos-painel') fecharPainel(); };
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && T.escolhido != null) fecharPainel(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligar); else ligar();
})(typeof window !== 'undefined' ? window : globalThis);
