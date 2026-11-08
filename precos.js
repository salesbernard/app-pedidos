/* ABA PREÇOS — últimos preços de venda e de compra de cada item, a partir das notas fiscais da empresa.
 * Só leitura. Os dados vêm do servidor (ação "precos"), que lê o ITENS_PRECOS.csv gravado
 * pelo coletor ao lado do índice de notas.
 *
 * Duas buscas independentes na mesma página: Vendas e Compras. Compra e venda não se ligam por
 * código (o de venda é o interno do Bling, o de compra é o do fornecedor), por isso cada lado
 * busca nas suas próprias descrições. Cada palavra digitada precisa aparecer em qualquer posição
 * da descrição, sem diferenciar acento nem maiúscula. Ao expandir um item aparecem os últimos 5
 * preços com data e cliente/fornecedor. Devoluções e notas canceladas não entram.
 *
 * Funções puras em window.Precos (e module.exports no Node, para testes).
 */
(function (raiz) {
  'use strict';

  const LADOS = { V: 'vendas', C: 'compras' };   // DV/DC (devoluções) ficam de fora
  const MAX_RESULTADOS = 40;
  const ULTIMOS = 5;

  function normalizar(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/\s+/g, ' ').trim();
  }
  const palavras = termo => normalizar(termo).split(' ').filter(Boolean);
  const contemTodas = (txt, ps) => ps.every(p => txt.indexOf(p) >= 0);
  const maisRecente = (a, b) => (b.data > a.data) - (b.data < a.data) || (Number(b.nf) || 0) - (Number(a.nf) || 0);

  // dados do servidor → { vendas: [itens], compras: [itens] }; item = { texto, norm, linhas (mais recente primeiro) }
  function preparar(j) {
    const partes = j.partes || [], descs = j.descricoes || [];
    const lados = { vendas: new Map(), compras: new Map() };
    (j.linhas || []).forEach(l => {
      const lado = LADOS[l[0]];
      if (!lado || descs[l[4]] == null) return;
      const m = lados[lado];
      if (!m.has(l[4])) m.set(l[4], { texto: descs[l[4]], norm: normalizar(descs[l[4]]), linhas: [] });
      const p = partes[l[3]] || ['', ''];
      m.get(l[4]).linhas.push({ nf: l[1], data: l[2], parte: p[0], cnpj: p[1], codigo: l[5], unid: l[6], qtd: l[7], unit: l[8] });
    });
    const lista = m => Array.from(m.values()).map(it => {
      it.linhas.sort(maisRecente);
      it.ultima = it.linhas.length ? it.linhas[0].data : '';
      return it;
    });
    return { vendas: lista(lados.vendas), compras: lista(lados.compras), atualizado: j.atualizado || '' };
  }

  // itens do lado que contêm todas as palavras; os vendidos/comprados mais recentemente primeiro
  function buscar(itens, termo, limite) {
    const ps = palavras(termo);
    if (!ps.length) return [];
    return itens.filter(it => contemTodas(it.norm, ps))
      .sort((a, b) => (b.ultima > a.ultima) - (b.ultima < a.ultima) || a.texto.localeCompare(b.texto))
      .slice(0, limite || MAX_RESULTADOS);
  }

  const api = { normalizar, preparar, buscar, ULTIMOS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  raiz.Precos = api;

  /* ---------------- tela (só no navegador) ---------------- */
  if (typeof document === 'undefined') return;

  const T = { base: {}, carregando: {}, termo: { vendas: '', compras: '' }, app: null };
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // 2 casas (ex.: R$ 13,20); só abaixo de R$ 1 mostra até 4, para não sumir o centavo fracionado
  const moeda = n => { n = Number(n) || 0; return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 }); };
  const qtd = n => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  const dataBR = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (s || '—'); };
  const dataHoraBR = s => { const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s || ''); return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ' às ' + m[4] + ':' + m[5] : ''}` : ''; };
  const ROTULO = { vendas: { parte: 'Cliente', vazio: 'vendido', acao: 'venda', acoes: 'vendas' },
                   compras: { parte: 'Fornecedor', vazio: 'comprado', acao: 'compra', acoes: 'compras' } };

  // chamado pelo app.js: app = { chamar(acao), empresa(), mostrar(id) }
  raiz.Precos.abrir = function (app) {
    T.app = app;
    app.mostrar('tela-precos');
    ['vendas', 'compras'].forEach(l => { $('#precos-busca-' + l).value = T.termo[l]; });
    carregar(app.empresa()).then(() => {
      desenhar('vendas'); desenhar('compras');
      if (matchMedia('(min-width: 900px)').matches) setTimeout(() => $('#precos-busca-vendas').focus(), 50);
    });
  };

  async function carregar(emp, forcar) {
    if (T.base[emp.id] && !forcar) { mostrarInfo(); return T.base[emp.id]; }
    if (!T.carregando[emp.id]) {
      $('#precos-info').textContent = 'Carregando as notas da ' + emp.curto + '...';
      T.carregando[emp.id] = T.app.chamar('precos').then(j => {
        T.base[emp.id] = preparar(j);
        mostrarInfo();
        return T.base[emp.id];
      }).catch(e => {
        $('#precos-info').innerHTML = '<span class="erro">' + esc(e.message) + '</span>';
        throw e;
      }).finally(() => { T.carregando[emp.id] = null; });
    }
    return T.carregando[emp.id].catch(() => null);
  }

  function baseAtual() { return T.app && T.base[T.app.empresa().id]; }

  function mostrarInfo() {
    const b = baseAtual();
    if (!b) return;
    $('#precos-info').textContent = 'Últimos preços das notas fiscais' + (b.atualizado ? ` · atualizado em ${dataHoraBR(b.atualizado)}` : '');
  }

  function desenhar(lado) {
    const base = baseAtual();
    const lista = $('#precos-lista-' + lado), cont = $('#precos-cont-' + lado);
    const R = ROTULO[lado];
    if (!base) { lista.innerHTML = ''; cont.textContent = ''; return; }
    const termo = T.termo[lado].trim();
    if (!termo) {
      cont.textContent = `${base[lado].length.toLocaleString('pt-BR')} itens`;
      lista.innerHTML = `<p class="cinza precos-vazio">Digite uma palavra da descrição para ver os preços de ${R.acao}.</p>`;
      return;
    }
    const achados = buscar(base[lado], termo);
    cont.textContent = achados.length >= MAX_RESULTADOS ? `${MAX_RESULTADOS}+ itens` : `${achados.length} ${achados.length === 1 ? 'item' : 'itens'}`;
    if (!achados.length) { lista.innerHTML = `<p class="cinza precos-vazio">Nenhum item ${R.vazio} com “${esc(termo)}”.</p>`; return; }
    lista.innerHTML = achados.map((it, k) => {
      const u = it.linhas[0];
      return `<div class="precos-item" data-k="${k}">
        <button class="precos-cab" aria-expanded="false">
          <span class="precos-desc">${esc(it.texto)}</span>
          <span class="precos-resumo"><strong>${moeda(u.unit)}</strong><span class="cinza">${dataBR(u.data)}</span></span>
          <span class="precos-seta" aria-hidden="true"></span>
        </button>
        <div class="precos-detalhe escondido"></div>
      </div>`;
    }).join('') + (achados.length >= MAX_RESULTADOS ? '<p class="cinza peq precos-mais">Digite mais uma palavra para filtrar.</p>' : '');
    lista.querySelectorAll('.precos-item').forEach(el => {
      el.querySelector('.precos-cab').onclick = () => alternar(el, achados[Number(el.dataset.k)], lado);
    });
  }

  function alternar(el, it, lado) {
    const det = el.querySelector('.precos-detalhe'), cab = el.querySelector('.precos-cab');
    const abrir = det.classList.contains('escondido');
    if (abrir && !det.innerHTML) det.innerHTML = detalhe(it, lado);
    det.classList.toggle('escondido', !abrir);
    el.classList.toggle('aberto', abrir);
    cab.setAttribute('aria-expanded', String(abrir));
  }

  function detalhe(it, lado) {
    const R = ROTULO[lado], ult = it.linhas.slice(0, ULTIMOS);
    const codigo = it.linhas[0].codigo;
    return `<table class="precos-tab"><thead><tr><th>Data</th><th class="num">Valor unit.</th><th>${R.parte}</th></tr></thead><tbody>` +
      ult.map(l => `<tr>
        <td>${dataBR(l.data)}</td>
        <td class="num forte">${moeda(l.unit)}<div class="cinza peq">${qtd(l.qtd)} ${esc(l.unid)}</div></td>
        <td>${esc(l.parte)}</td>
      </tr>`).join('') + '</tbody></table>' +
      `<p class="cinza peq precos-rodape">${it.linhas.length > ULTIMOS ? `Últimas ${ULTIMOS} de ${it.linhas.length} ${R.acoes}` : `${it.linhas.length} ${it.linhas.length === 1 ? R.acao : R.acoes}`}${codigo ? ` · código ${esc(codigo)}` : ''}</p>`;
  }

  function ligar() {
    ['vendas', 'compras'].forEach(lado => {
      let t;
      $('#precos-busca-' + lado).addEventListener('input', ev => {
        T.termo[lado] = ev.target.value;
        clearTimeout(t); t = setTimeout(() => desenhar(lado), 120);
      });
      $('#precos-limpar-' + lado).onclick = () => {
        T.termo[lado] = ''; $('#precos-busca-' + lado).value = ''; desenhar(lado); $('#precos-busca-' + lado).focus();
      };
    });
    $('#precos-atualizar').onclick = () => carregar(T.app.empresa(), true).then(() => { desenhar('vendas'); desenhar('compras'); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ligar); else ligar();
})(typeof window !== 'undefined' ? window : globalThis);
