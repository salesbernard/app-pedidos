/* Vencimento pela regra do cliente (planilha de cadastro e vencimentos → VENCIMENTOS.csv)
 * Tipos: "À vista" · "Dias corridos" (data + prazo) · "Dias úteis" (data + prazo; se cair em fim de semana
 * ou feriado, vai para o próximo dia útil) · "Data fixa (dias do mês)" (1º dia da lista depois do prazo;
 * se cair em fim de semana ou feriado, vai para o próximo dia útil).
 * Regra: { forma, tipo, prazo, dias }  ex.: { tipo: 'Data fixa (dias do mês)', prazo: 30, dias: '10, 20 ou 30 (1º após 30 dias)' }
 */
(function (raiz) {
  'use strict';

  function pascoa(ano) {   // algoritmo de Meeus
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4,
          f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
          i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
          mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(ano, mes - 1, dia);
  }
  const cacheFeriados = {};
  // Feriados nacionais + Carnaval + Corpus Christi + 2 de Julho (BA) + 8 de dezembro (Salvador)
  function feriados(ano) {
    if (cacheFeriados[ano]) return cacheFeriados[ano];
    const fixos = ['01-01', '04-21', '05-01', '07-02', '09-07', '10-12', '11-02', '11-15', '11-20', '12-08', '12-25'];
    const s = new Set(fixos.map(md => ano + '-' + md));
    const p = pascoa(ano);
    [-48, -47, -2, 60].forEach(dd => s.add(iso(somarDias(p, dd))));   // carnaval (seg e ter), sexta santa, corpus christi
    cacheFeriados[ano] = s;
    return s;
  }
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function somarDias(d, n) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; }
  function ehUtil(d) { const ds = d.getDay(); return ds !== 0 && ds !== 6 && !feriados(d.getFullYear()).has(iso(d)); }
  function proximoUtil(d) { let x = d; while (!ehUtil(x)) x = somarDias(x, 1); return x; }
  function ultimoDiaMes(ano, mes) { return new Date(ano, mes + 1, 0).getDate(); }

  function diasDaLista(texto) {
    const antes = String(texto || '').split('(')[0];
    return (antes.match(/\d{1,2}/g) || []).map(Number).filter(n => n >= 1 && n <= 31).sort((a, b) => a - b);
  }

  // Próximas datas fixas a partir de "limite" (inclusive), já ajustadas para dia útil
  function datasFixas(limite, dias, quantas) {
    const out = [];
    let ano = limite.getFullYear(), mes = limite.getMonth();
    for (let volta = 0; out.length < quantas && volta < 24; volta++) {
      dias.forEach(dia => {
        if (out.length >= quantas) return;
        const d = new Date(ano, mes, Math.min(dia, ultimoDiaMes(ano, mes)));
        if (d >= limite) {
          const ajustada = proximoUtil(d);
          if (!out.some(x => iso(x) === iso(ajustada))) out.push(ajustada);
        }
      });
      mes++; if (mes > 11) { mes = 0; ano++; }
    }
    return out;
  }

  function calcular(regra, dataBase) {
    const base = dataBase ? new Date(dataBase.getFullYear(), dataBase.getMonth(), dataBase.getDate()) : new Date();
    if (!regra || !regra.tipo) return { data: null, opcoes: [], descricao: 'Sem regra cadastrada para este cliente' };
    const tipo = String(regra.tipo).toLowerCase();
    const prazo = Number(regra.prazo) || 0;
    if (/vista/.test(tipo)) return { data: base, opcoes: [base], descricao: 'À vista' };
    if (/corridos/.test(tipo)) {
      const d = somarDias(base, prazo);
      return { data: d, opcoes: [d], descricao: prazo + ' dias corridos' };
    }
    if (/teis/.test(tipo)) {
      const d = proximoUtil(somarDias(base, prazo));
      return { data: d, opcoes: [d], descricao: prazo + ' dias, em dia útil' };
    }
    if (/fixa/.test(tipo)) {
      const dias = diasDaLista(regra.dias);
      if (!dias.length) return { data: null, opcoes: [], descricao: 'Regra de data fixa sem os dias do mês' };
      const opcoes = datasFixas(somarDias(base, prazo), dias, 3);
      return { data: opcoes[0], opcoes, descricao: 'Dias ' + dias.join(', ') + ', 1º após ' + prazo + ' dias' };
    }
    return { data: null, opcoes: [], descricao: 'Regra não reconhecida: ' + regra.tipo };
  }

  const Vencimento = { calcular, iso, ehUtil, feriados };
  if (typeof module !== 'undefined' && module.exports) module.exports = Vencimento;
  else raiz.Vencimento = Vencimento;
})(typeof window !== 'undefined' ? window : globalThis);
