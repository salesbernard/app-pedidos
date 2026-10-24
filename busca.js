/* Busca de produtos por DESCRIÇÃO (nunca por código).
 * Funciona no navegador (window.Busca) e no Node (module.exports) para testes.
 * Produto: [id, codigo, descricao, unidade, preco, ativo]
 */
(function (raiz) {
  'use strict';

  const PARADAS = new Set(('de da do das dos p para pra com c e em a o ou tipo ref referencia ' +
    'na no nas nos por x/ cor marca modelo und un unid unidade pc pç peca pcs').split(' '));

  // Abreviações e variações comuns em pedidos de material de construção
  const SINONIMOS = {
    torn: 'torneira', tor: 'torneira', toneira: 'torneira', reg: 'registro', regist: 'registro',
    sold: 'soldavel', sd: 'soldavel', sol: 'soldavel', esg: 'esgoto', joel: 'joelho', jlh: 'joelho',
    acab: 'acabamento', acabamneto: 'acabamento', cx: 'caixa', tb: 'tubo', tub: 'tubo', lamp: 'lampada',
    disj: 'disjuntor', disjuntores: 'disjuntor', dijuntore: 'disjuntor', tomadas: 'tomada', placas: 'placa',
    paineis: 'painel', lampadas: 'lampada', parafusos: 'parafuso', parasufo: 'parafuso', buchas: 'bucha',
    valvulas: 'valvula', luvas: 'luva', joelhos: 'joelho', tubos: 'tubo', torneiras: 'torneira',
    asnfonado: 'sanfonado', sanf: 'sanfonado', flex: 'flexivel', flexivel: 'flexivel', silic: 'silicone',
    acentico: 'acetico', acetinado: 'acetico', acetico: 'acetico', galv: 'galvanizado', aco: 'aco',
    inox: 'inox', br: 'branco', bco: 'branco', branca: 'branco', pto: 'preto', preta: 'preto',
    cinz: 'cinza', crom: 'cromado', cromada: 'cromado', amarela: 'amarelo', vermelha: 'vermelho',
    lts: 'l', lt: 'l', litro: 'l', litros: 'l', ml: 'ml', kgs: 'kg', quilo: 'kg', mts: 'm', mt: 'm',
    metro: 'm', metros: 'm', mm: 'mm', cm: 'cm', pol: 'pol', polegada: 'pol', polegadas: 'pol',
    sc: 'saco', sacos: 'saco', gl: 'galao', galoes: 'galao', cola: 'adesivo'
  };

  function semAcento(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function normalizar(s) {
    let t = semAcento(s).toLowerCase();
    t = t.replace(/½/g, ' 1/2 ').replace(/¼/g, ' 1/4 ').replace(/¾/g, ' 3/4 ').replace(/⁄/g, '/');
    t = t.replace(/(\d)\s*(''|"|”|“|pol\b)/g, '$1 pol ');   // 1/2" -> 1/2 pol
    t = t.replace(/(\d),(\d)/g, '$1.$2');                     // 2,5 -> 2.5
    t = t.replace(/(\d)\s*[oº°]\b/g, '$1 graus');             // 45º -> 45 graus
    t = t.replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2'); // 25mm -> 25 mm
    t = t.replace(/[^a-z0-9./ ]+/g, ' ').replace(/(^|\s)[./]+|[./]+(\s|$)/g, ' ');
    return t.replace(/\s+/g, ' ').trim();
  }

  function tokens(s) {
    const out = [];
    for (let w of normalizar(s).split(' ')) {
      if (!w) continue;
      if (SINONIMOS[w]) w = SINONIMOS[w];
      if (PARADAS.has(w)) continue;
      if (w.length > 4 && w.endsWith('s') && !/\d/.test(w)) w = w.slice(0, -1); // plural simples
      out.push(w);
    }
    return out;
  }

  function trigramas(w) {
    const p = '  ' + w + ' ';
    const s = new Set();
    for (let i = 0; i < p.length - 2; i++) s.add(p.substr(i, 3));
    return s;
  }

  function dice(a, b) {
    let comum = 0;
    a.forEach(x => { if (b.has(x)) comum++; });
    return (2 * comum) / (a.size + b.size);
  }

  const ehNumero = w => /\d/.test(w);

  function criarIndice(produtos) {
    const docs = [];
    const inv = new Map();      // token -> [indices]
    const df = new Map();
    produtos.forEach((p, i) => {
      if (p[5] === 0 || p[5] === false) return; // inativo
      const tk = Array.from(new Set(tokens(p[2])));
      docs.push({ i, p, tk, set: new Set(tk) });
      tk.forEach(t => {
        df.set(t, (df.get(t) || 0) + 1);
        if (!inv.has(t)) inv.set(t, []);
        inv.get(t).push(docs.length - 1);
      });
    });
    const N = docs.length || 1;
    const idf = t => Math.log(1 + N / (df.get(t) || 0.5));
    const vocab = Array.from(inv.keys()).filter(t => !ehNumero(t) && t.length >= 4);
    const triVocab = new Map(vocab.map(t => [t, trigramas(t)]));
    return { docs, inv, idf, vocab, triVocab, N };
  }

  // Para palavras com erro de digitação: acha palavras parecidas do cadastro
  function parecidas(ind, t) {
    if (ehNumero(t) || t.length < 4) return [];
    const tri = trigramas(t);
    const res = [];
    for (const [v, tv] of ind.triVocab) {
      if (v === t) continue;
      if (v.startsWith(t) || t.startsWith(v)) { res.push([v, 0.85]); continue; }
      const d = dice(tri, tv);
      if (d >= 0.62) res.push([v, d]);
    }
    return res.sort((a, b) => b[1] - a[1]).slice(0, 4);
  }

  function buscar(ind, texto, limite) {
    limite = limite || 8;
    const q = Array.from(new Set(tokens(texto)));
    if (!q.length) return [];
    const pontos = new Map(); // docIdx -> pontuação
    let pesoTotal = 0;
    // números que nem existem no cadastro (ex.: referência do fabricante) não penalizam
    const numsQ = q.filter(t => ehNumero(t) && ind.inv.has(t));

    q.forEach((t, pos) => {
      const variantes = [[t, 1]];
      if (!ind.inv.has(t)) parecidas(ind, t).forEach(v => variantes.push(v));
      // primeiras palavras (geralmente o nome do item) pesam mais
      const pesoPos = pos === 0 ? 1.6 : pos === 1 ? 1.3 : pos === 2 ? 1.15 : 1;
      const pesoNum = ehNumero(t) ? 1.3 : 1;
      let w = ind.idf(t) * pesoPos * pesoNum;
      // palavra que não existe em nenhum produto (nem parecida) quase não pesa
      if (variantes.length === 1 && !ind.inv.has(t)) w *= 0.15;
      pesoTotal += w;
      variantes.forEach(([v, fator]) => {
        const lista = ind.inv.get(v);
        if (!lista) return;
        const wv = ind.idf(v) * pesoPos * pesoNum * fator;
        lista.forEach(d => pontos.set(d, (pontos.get(d) || 0) + Math.min(wv, w * 1.2)));
      });
    });

    const res = [];
    pontos.forEach((s, d) => {
      const doc = ind.docs[d];
      let score = s / pesoTotal;
      // números do pedido (medidas) que faltam no produto: penaliza
      const numsP = doc.tk.filter(ehNumero);
      const faltam = numsQ.filter(n => !doc.set.has(n)).length;
      if (numsQ.length) score -= 0.12 * faltam;
      // números do produto que não estão no pedido (medida diferente): penaliza leve
      const sobram = numsP.filter(n => !q.includes(n)).length;
      const qTemNumero = q.some(ehNumero);
      score -= (qTemNumero ? 0.09 : 0.03) * Math.min(sobram, 3);
      // primeira palavra do produto igual à primeira do pedido: bônus
      if (doc.tk[0] && doc.tk[0] === q[0]) score += 0.08;
      // produtos muito longos com pouca coisa em comum: leve penalidade
      score -= 0.01 * Math.max(0, doc.tk.length - q.length - 4);
      res.push({ produto: doc.p, nota: Math.max(0, Math.min(1, score)) });
    });
    res.sort((a, b) => b.nota - a.nota || a.produto[2].length - b.produto[2].length);
    return res.slice(0, limite).map(r => ({ produto: r.produto, nota: Math.round(r.nota * 100) }));
  }

  const Busca = { normalizar, tokens, criarIndice, buscar };
  if (typeof module !== 'undefined' && module.exports) module.exports = Busca;
  else raiz.Busca = Busca;
})(typeof window !== 'undefined' ? window : globalThis);
