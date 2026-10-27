/* APP DE PEDIDOS DOS VENDEDORES — TELA (fases 1 e 2: entrada, leitura e conferência) */
(function () {
  'use strict';

  const C = window.CONFIG;
  const TELAS_INTERNAS = ['tela-inicio', 'tela-paginas', 'tela-lendo', 'tela-erro', 'tela-criar', 'tela-conferencia', 'tela-pedidos', 'tela-envio', 'tela-solic'];
  const E = {
    token: null, usuario: null, liberadas: [], empresa: null, dados: {},
    pedido: null, arquivo: null, docUrl: null, docTexto: null, paginas: null
  };

  /* ---------------- utilidades ---------------- */
  const $ = s => document.querySelector(s);
  const esperar = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const soDigitos = s => String(s || '').replace(/\D/g, '');
  const moeda = n => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const arred = n => Math.round((Number(n) || 0) * 100) / 100;
  function lerNumero(v) {
    if (typeof v === 'number') return v;
    let s = String(v == null ? '' : v).trim().replace(/[R$\s]/g, '');
    if (!s) return 0;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    const n = Number(s);
    return isFinite(n) ? n : 0;
  }
  function fmtCnpj(d) {
    d = soDigitos(d);
    if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    return d;
  }
  function fmtData(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ' ' + m[4] + ':' + m[5] : ''}` : (s || '—');
  }
  function corClara(hex) {
    const n = parseInt(hex.slice(1), 16);
    const mix = c => Math.round(c + (255 - c) * 0.88);
    return `rgb(${mix(n >> 16)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
  }
  function avisar(msg, ms) {
    const el = $('#aviso-rodape');
    el.textContent = msg; el.classList.remove('escondido');
    clearTimeout(avisar.t); avisar.t = setTimeout(() => el.classList.add('escondido'), ms || 3800);
  }

  function mostrar(id) {
    document.querySelectorAll('.tela').forEach(t => t.classList.toggle('ativa', t.id === id));
    $('#topo').classList.toggle('escondido', TELAS_INTERNAS.indexOf(id) < 0);
    $('#nav-pedidos').classList.toggle('ativo', id === 'tela-pedidos' || id === 'tela-envio');
    $('#nav-novo').classList.toggle('ativo', ['tela-inicio', 'tela-paginas', 'tela-lendo', 'tela-criar'].indexOf(id) >= 0);
    $('#nav-solic').classList.toggle('ativo', id === 'tela-solic');
    window.scrollTo(0, 0);
  }

  function base64DeBytes(bytes) {
    let bin = '';
    const passo = 0x8000;
    for (let i = 0; i < bytes.length; i += passo) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + passo));
    return btoa(bin);
  }

  /* ---------------- servidor (Apps Script) ---------------- */
  async function chamar(emp, acao, extra) {
    let resp;
    try {
      resp = await fetch(emp.url, { method: 'POST', body: JSON.stringify(Object.assign({ acao, token: E.token }, extra || {})) });
    } catch (e) {
      throw new Error('Sem conexão com o servidor da ' + emp.curto + '. Verifique a internet e tente de novo.');
    }
    let j;
    try { j = await resp.json(); } catch (e) { throw new Error('O servidor da ' + emp.curto + ' respondeu de forma inesperada.'); }
    if (!j.ok) {
      if (/login expirou|Faça login/i.test(j.erro || '')) pedirLoginDeNovo();
      throw new Error(j.erro || 'Erro desconhecido.');
    }
    return j;
  }

  /* ---------------- abertura e login ---------------- */
  async function iniciar() {
    $('#logo-grupo').src = C.LOGO_GRUPO;
    $('#logo-grupo-login').src = C.LOGO_GRUPO;
    mostrar('tela-abertura-grupo');
    await esperar(C.SEGUNDOS_ABERTURA * 1000);
    mostrar('tela-login');
    prepararLoginGoogle();
  }

  function prepararLoginGoogle() {
    if (!window.google || !google.accounts || !google.accounts.id) { setTimeout(prepararLoginGoogle, 300); return; }
    google.accounts.id.initialize({ client_id: C.GOOGLE_CLIENT_ID, callback: aoLogar, auto_select: false });
    google.accounts.id.renderButton($('#botao-google'),
      { theme: 'outline', size: 'large', text: 'signin_with', locale: 'pt-BR', width: 280 });
  }

  function pedirLoginDeNovo() {
    avisar('Seu login expirou. Entre de novo com a conta Google para continuar.', 6000);
    try { google.accounts.id.prompt(); } catch (e) { /* ignore */ }
  }

  async function aoLogar(r) {
    // Renovação do login no meio do uso: só troca o token
    if (E.usuario) { E.token = r.credential; avisar('Login renovado. Pode continuar.'); return; }
    E.token = r.credential;
    $('#login-erro').textContent = 'Verificando acesso…';
    const res = await Promise.all(C.EMPRESAS.map(emp =>
      chamar(emp, 'entrar').then(j => ({ emp, j })).catch(err => ({ emp, err }))));
    E.liberadas = res.filter(x => x.j).map(x => Object.assign({}, x.emp, { info: x.j }));
    if (!E.liberadas.length) {
      const msg = res.map(x => x.err && x.err.message).filter(Boolean)[0];
      $('#login-erro').textContent = msg || 'Esta conta não tem acesso ao app.';
      E.token = null;
      return;
    }
    E.usuario = E.liberadas[0].info.usuario;
    $('#login-erro').textContent = '';
    if (E.usuario.aprovador) { $('#nav-solic').classList.remove('escondido'); contarSolicitacoes(); }
    if (E.liberadas.length === 1) entrarNaEmpresa(E.liberadas[0]);
    else mostrarEscolhaEmpresa();
  }

  function mostrarEscolhaEmpresa() {
    const lista = $('#lista-empresas');
    lista.innerHTML = '';
    E.liberadas.forEach(emp => {
      const b = document.createElement('button');
      b.innerHTML = `<img src="${esc(emp.logo)}" alt=""><strong>${esc(emp.nome)}</strong>`;
      b.onclick = () => entrarNaEmpresa(emp);
      lista.appendChild(b);
    });
    mostrar('tela-empresa');
  }

  async function entrarNaEmpresa(emp) {
    E.empresa = emp;
    document.documentElement.style.setProperty('--cor', emp.cor);
    document.documentElement.style.setProperty('--cor-clara', corClara(emp.cor));
    $('#logo-empresa-abertura').src = emp.logo;
    $('#carregando-dados').classList.add('escondido');
    mostrar('tela-abertura-empresa');
    const carga = carregarDados(emp);
    carga.catch(() => {});
    await esperar(C.SEGUNDOS_ABERTURA * 1000);
    if (!E.dados[emp.id]) $('#carregando-dados').classList.remove('escondido');
    try { await carga; }
    catch (e) {
      mostrarErro('Não consegui carregar os dados', e.message,
        [['Tentar de novo', () => entrarNaEmpresa(emp)], ['Trocar empresa', mostrarEscolhaEmpresa]]);
      montarTopo();
      return;
    }
    montarTopo();
    irInicio();
  }

  // Recarrega catálogo e clientes sem deixar a tela sem dados: os antigos valem até chegarem os novos
  function recarregarDados(emp) {
    carregarDados(emp, true).catch(() => { /* fica com os dados antigos */ });
  }

  async function carregarDados(emp, forcar) {
    if (E.dados[emp.id] && !forcar) return E.dados[emp.id];
    const j = await chamar(emp, 'dados');
    const d = { catalogo: j.catalogo || [], clientes: j.clientes || [], regras: j.regras || {}, ultima: j.ultimaAtualizacao };
    d.indProd = Busca.criarIndice(d.catalogo);
    // índice de clientes: usa nome curto + razão social
    d.indCli = Busca.criarIndice(d.clientes.map((c, i) => [i, c[0], c[1] + ' ' + c[2], '', 0, 1]));
    E.dados[emp.id] = d;
    return d;
  }

  function montarTopo() {
    const emp = E.empresa;
    $('#topo-logo img').src = emp.logo;
    $('#topo-nome').textContent = emp.nome;
    $('#topo-usuario').textContent = E.usuario ? E.usuario.nome : '';
    const d = E.dados[emp.id];
    const ultima = (d && d.ultima) || (emp.info && emp.info.ultimaAtualizacao);
    $('#topo-atualizacao').textContent = 'Dados atualizados em ' + fmtData(ultima);
  }

  function trocarEmpresa() {
    if (E.pedido && !confirm('Trocar de empresa descarta o pedido aberto. Continuar?')) return;
    E.pedido = null; E.lista = null;
    if (E.liberadas.length > 1) mostrarEscolhaEmpresa();
    else avisar('Sua conta só tem acesso à ' + E.empresa.curto + '.');
  }

  function sair() {
    try { google.accounts.id.disableAutoSelect(); } catch (e) { /* ignore */ }
    location.reload();
  }

  function irInicio() { E.pedido = null; $('#arquivo').value = ''; mostrar('tela-inicio'); }

  function mostrarErro(titulo, texto, botoes) {
    $('#erro-titulo').textContent = titulo;
    $('#erro-texto').textContent = texto;
    const area = $('#erro-botoes');
    area.innerHTML = '';
    (botoes || [['Voltar', irInicio]]).forEach(([rotulo, fn], i) => {
      const b = document.createElement('button');
      b.className = i === 0 ? 'primario' : 'secundario';
      b.textContent = rotulo; b.onclick = fn;
      area.appendChild(b);
    });
    mostrar('tela-erro');
  }

  /* ---------------- anexar arquivo ---------------- */
  function prepararAnexo() {
    $('#op-anexar').onclick = () => $('#arquivo').click();
    $('#arquivo').onchange = e => { const f = e.target.files[0]; if (f) tratarArquivo(f); };
    const zona = $('#tela-inicio');
    zona.addEventListener('dragover', e => { e.preventDefault(); $('#soltar').classList.add('sobre'); });
    zona.addEventListener('dragleave', () => $('#soltar').classList.remove('sobre'));
    zona.addEventListener('drop', e => {
      e.preventDefault(); $('#soltar').classList.remove('sobre');
      const arqs = e.dataTransfer.files;
      if (arqs.length > 1) { avisar('Envie um documento por vez.'); return; }
      if (arqs[0]) tratarArquivo(arqs[0]);
    });
  }

  async function tratarArquivo(file) {
    const nome = file.name.toLowerCase();
    E.arquivo = file; E.docTexto = null;
    if (E.docUrl) URL.revokeObjectURL(E.docUrl);
    E.docUrl = URL.createObjectURL(file);
    try {
      if (/\.pdf$/.test(nome) || file.type === 'application/pdf') return await abrirSeletorPdf(file);
      if (/\.(png|jpe?g|webp)$/.test(nome)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        return lerDocumento({ arquivo: { nome: file.name, tipo: file.type || 'image/jpeg', base64: base64DeBytes(bytes) } },
          { tipo: 'imagem' });
      }
      if (/\.(xlsx|xls|csv)$/.test(nome)) return await abrirSeletorPlanilha(file);
      avisar('Formato não aceito. Envie PDF, foto (JPG/PNG) ou planilha Excel.');
    } catch (e) {
      console.error(e);
      mostrarErro('Não consegui abrir o arquivo', 'O arquivo pode estar corrompido ou protegido por senha. (' + e.message + ')');
    }
  }

  /* Seletor de páginas do PDF */
  async function abrirSeletorPdf(file) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    const paginas = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      const tc = await pg.getTextContent();
      const texto = tc.items.map(x => x.str).join(' ');
      const cl = Paginas.classificarPagina(texto, i);
      paginas.push({ n: i, texto, marcada: cl.manter, motivo: cl.motivo });
    }
    E.paginas = { bytes, pdf, lista: paginas, tipo: 'pdf' };
    E.docTexto = paginas.map(p => '--- Página ' + p.n + ' ---\n' + p.texto).join('\n\n');
    if (pdf.numPages === 1) return enviarPaginas();        // 1 página: vai direto
    $('#paginas-todas').classList.remove('escondido');
    $('#grade-paginas').classList.remove('abas');

    $('#paginas-titulo').textContent = 'Escolha as páginas para enviar (' + pdf.numPages + ' páginas)';
    $('#paginas-explicacao').textContent = 'O app já marcou as páginas com dados do cliente e itens. ' +
      'Clique numa página para marcar ou desmarcar.';
    const grade = $('#grade-paginas');
    grade.innerHTML = '';
    paginas.forEach(p => {
      const div = document.createElement('div');
      div.className = 'pagina' + (p.marcada ? ' marcada' : '');
      div.innerHTML = `<span class="marca">${p.marcada ? '✓' : ''}</span><img alt="Página ${p.n}">` +
        `<div><strong>Página ${p.n}</strong></div><div class="motivo">${esc(p.motivo)}</div>`;
      div.onclick = () => {
        p.marcada = !p.marcada;
        div.classList.toggle('marcada', p.marcada);
        div.querySelector('.marca').textContent = p.marcada ? '✓' : '';
        atualizarBotaoPaginas();
      };
      grade.appendChild(div);
      p.el = div;
    });
    atualizarBotaoPaginas();
    mostrar('tela-paginas');
    // miniaturas, uma de cada vez
    for (const p of paginas) {
      try {
        const pg = await pdf.getPage(p.n);
        const vp1 = pg.getViewport({ scale: 1 });
        const vp = pg.getViewport({ scale: 340 / vp1.width });
        const canvas = document.createElement('canvas');
        canvas.width = vp.width; canvas.height = vp.height;
        await pg.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        p.el.querySelector('img').src = canvas.toDataURL('image/jpeg', 0.7);
      } catch (e) { console.error('miniatura', p.n, e); }
    }
  }

  function atualizarBotaoPaginas() {
    if (!E.paginas) return;
    const n = E.paginas.lista.filter(p => p.marcada).length;
    const b = $('#paginas-enviar');
    b.disabled = n === 0;
    b.textContent = E.paginas.tipo === 'planilha' ? 'Ler aba marcada' : `Ler ${n} página${n === 1 ? '' : 's'} marcada${n === 1 ? '' : 's'}`;
  }

  async function enviarPaginas() {
    const P = E.paginas;
    if (P.tipo === 'planilha') return enviarAba();
    const escolhidas = P.lista.filter(p => p.marcada).map(p => p.n - 1);
    if (!escolhidas.length) { avisar('Marque pelo menos uma página.'); return; }
    let bytes = P.bytes;
    if (escolhidas.length < P.lista.length) {
      const orig = await PDFLib.PDFDocument.load(P.bytes, { ignoreEncryption: true });
      const novo = await PDFLib.PDFDocument.create();
      const copias = await novo.copyPages(orig, escolhidas);
      copias.forEach(pg => novo.addPage(pg));
      bytes = await novo.save();
    }
    const detalhe = `Enviando ${escolhidas.length} de ${P.lista.length} página${P.lista.length === 1 ? '' : 's'}. Isso pode levar até 1 minuto.`;
    lerDocumento({ arquivo: { nome: E.arquivo.name, tipo: 'application/pdf', base64: base64DeBytes(bytes) },
                   paginasEnviadas: escolhidas.length, paginasTotal: P.lista.length },
                 { tipo: 'pdf', detalhe });
  }

  /* Seletor de abas da planilha */
  async function abrirSeletorPlanilha(file) {
    const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
    const abas = wb.SheetNames.map((nome, i) => {
      const csv = XLSX.utils.sheet_to_csv(wb.Sheets[nome], { FS: ';', blankrows: false, strip: true });
      return { n: i + 1, nome, csv, marcada: i === 0, motivo: '' };
    }).filter(a => a.csv.replace(/[;\s]/g, '').length > 0);
    if (!abas.length) { mostrarErro('Planilha vazia', 'Não encontrei dados nesta planilha.'); return; }
    abas.forEach((a, i) => { a.marcada = i === 0; });
    E.paginas = { tipo: 'planilha', lista: abas };
    if (abas.length === 1) return enviarAba();
    $('#paginas-todas').classList.add('escondido');
    $('#grade-paginas').classList.add('abas');
    $('#paginas-titulo').textContent = 'Esta planilha tem ' + abas.length + ' abas';
    $('#paginas-explicacao').textContent = 'Marque a aba que tem o pedido do cliente (a primeira já vem marcada).';
    const grade = $('#grade-paginas');
    grade.innerHTML = '';
    abas.forEach(a => {
      const div = document.createElement('div');
      div.className = 'pagina aba-planilha' + (a.marcada ? ' marcada' : '');
      div.innerHTML = `<span class="marca">${a.marcada ? '✓' : ''}</span><div style="padding-left:34px"><strong>${esc(a.nome)}</strong></div>` +
        `<pre>${esc(a.csv.split('\n').slice(0, 12).join('\n'))}</pre>`;
      div.onclick = () => {   // só uma aba por vez
        abas.forEach(x => { x.marcada = x === a; x.el.classList.toggle('marcada', x.marcada); x.el.querySelector('.marca').textContent = x.marcada ? '✓' : ''; });
        atualizarBotaoPaginas();
      };
      grade.appendChild(div);
      a.el = div;
    });
    atualizarBotaoPaginas();
    mostrar('tela-paginas');
  }

  function enviarAba() {
    const aba = E.paginas.lista.find(a => a.marcada);
    if (!aba) { avisar('Marque uma aba.'); return; }
    E.docTexto = aba.csv;
    lerDocumento({ texto: aba.csv, aba: aba.nome }, { tipo: 'planilha' });
  }

  /* ---------------- leitura ---------------- */
  async function lerDocumento(req, info) {
    $('#lendo-detalhe').textContent = info.detalhe || 'Isso pode levar até 1 minuto.';
    mostrar('tela-lendo');
    let j;
    try { j = await chamar(E.empresa, 'lerDocumento', req); }
    catch (e) {
      mostrarErro('Não consegui ler o documento', e.message,
        [['Tentar de novo', () => lerDocumento(req, info)], ['Montar em "Criar no app"', abrirCriar], ['Voltar', irInicio]]);
      return;
    }
    const v = j.empresa || {};
    if (v.situacao === 'outra_empresa') {
      mostrarErro('Documento de outra empresa', v.motivo,
        [['Voltar', irInicio]].concat(E.liberadas.length > 1 ? [['Trocar empresa', trocarEmpresa]] : []));
      return;
    }
    if (v.situacao === 'confirmar') {
      mostrarErro('Confirme a empresa', v.motivo,
        [['Sim, é da ' + E.empresa.curto, () => montarPedidoDoDocumento(j, info)], ['Não', irInicio]]);
      return;
    }
    montarPedidoDoDocumento(j, info);
  }

  function novaLinha(id, original, quantidade, preco, desconto) {
    const d = E.dados[E.empresa.id];
    const opcoes = original.descricao ? Busca.buscar(d.indProd, original.descricao, 8) : [];
    return {
      id, original, opcoes,
      produto: opcoes[0] ? opcoes[0].produto : null,
      nota: opcoes[0] ? opcoes[0].nota : 0,
      escolhaManual: false,
      quantidade: quantidade || 0, preco: preco || 0, desconto: desconto || 0,
      riscado: false, itemNovo: null, enviada: 0, emitir: quantidade || 0, cortado: false
    };
  }

  function montarPedidoDoDocumento(j, info) {
    const doc = j.documento || {};
    const itens = [], ignorados = [];
    (doc.itens || []).forEach((it, i) => {
      const q = Number(it.quantidade) || 0;
      let pu = Number(it.precoUnitario) || 0;
      if (!pu && it.precoTotal && q) pu = arred(it.precoTotal / q);
      const original = {
        codigo: it.codigoCliente || '', descricao: it.descricao || '', unidade: it.unidade || '',
        quantidade: q, preco: pu, total: Number(it.precoTotal) || 0, obs: it.observacao || ''
      };
      const linha = novaLinha('d' + i, original, q, pu, Number(it.descontoPercentual) || 0);
      itens.push(linha);   // "It. não fornecido": a observação é ignorada e o item vale normalmente
    });
    const cli = doc.cliente || {};
    E.pedido = {
      origem: info.tipo, arquivoNome: E.arquivo ? E.arquivo.name : '', leitor: j.leitor,
      documento: doc, itens, ignorados, avisos: (doc.avisos || []).slice(),
      cliente: null, clienteBling: null, clienteDoc: { nome: cli.nome || '', cnpj: soDigitos(cli.cnpj || cnpjClienteDoc(doc)) },
      emails: [], emailsExtras: [],
      campos: {
        numeroCliente: doc.numeroDocumento || '', data: doc.dataDocumento || '',
        comprador: doc.comprador || doc.solicitante || '', solicitante: doc.solicitante || '',
        unidade: cli.unidade || '', enderecoEntrega: '', enderecoDoc: cli.enderecoEntrega || cli.enderecoFaturamento || '',
        condicaoPagamento: doc.condicaoPagamento || '', prazoEntrega: doc.prazoEntrega || '',
        tipoFrete: doc.tipoFrete || '', frete: Number(doc.valorFrete) || 0, observacoes: doc.observacoes || ''
      }
    };
    identificarCliente();
    perguntarModo();
  }

  // Antes de conferir os itens: emitir agora (escolhe o que vai para o Bling) ou só salvar o pedido
  function perguntarModo() {
    mostrarErro('O que você vai fazer com este pedido?',
      'Emitir agora: você confere e escolhe o que vai para o Bling; o que for cortado ou diminuído fica pendente. ' +
      'Salvar pedido: você confere e tudo fica pendente na aba Pedidos.',
      [['Emitir agora', () => { E.pedido.modo = 'emitir'; abrirConferencia(); }],
       ['Salvar pedido', () => { E.pedido.modo = 'salvar'; abrirConferencia(); }],
       ['Cancelar', () => { if (confirm('Descartar este pedido?')) irInicio(); }]]);
  }

  // CNPJ do cliente: o que não é de nenhuma das duas empresas
  function cnpjClienteDoc(doc) {
    const nossos = C.EMPRESAS.map(e => e.cnpj);
    const lista = (doc.cnpjs || []).map(c => ({ cnpj: soDigitos(c.cnpj), papel: (c.papel || '').toLowerCase() }))
      .filter(c => c.cnpj.length === 14 && nossos.indexOf(c.cnpj) < 0);
    const pref = lista.find(c => /cliente|fatur/.test(c.papel)) || lista.find(c => !/fornec/.test(c.papel)) || lista[0];
    return pref ? pref.cnpj : '';
  }

  /* ---------------- cliente ---------------- */
  function identificarCliente() {
    const P = E.pedido, d = E.dados[E.empresa.id];
    const cnpj = P.clienteDoc.cnpj;
    P.clienteSugestoes = [];
    P.clienteSituacao = '';
    if (cnpj) {
      const exato = d.clientes.find(c => c[0] === cnpj);
      if (exato) { escolherCliente(exato, 'cadastrado'); return; }
      const mesmaRaiz = d.clientes.filter(c => c[0] && c[0].slice(0, 8) === cnpj.slice(0, 8));
      if (mesmaRaiz.length) {
        P.clienteSituacao = 'filial_nova';
        P.clienteSugestoes = mesmaRaiz;
        P.cliente = { cnpj, nome: P.clienteDoc.nome || mesmaRaiz[0][2], nomeCurto: mesmaRaiz[0][1], vendedor: mesmaRaiz[0][3],
                      emails: [], novo: true, filialDe: mesmaRaiz[0] };
        prepararEmails(); buscarNoBling(cnpj);
        return;
      }
    }
    const nome = [P.clienteDoc.nome, P.campos.unidade].filter(Boolean).join(' ');
    const sug = nome ? Busca.buscar(d.indCli, nome, 5).map(r => ({ reg: d.clientes[r.produto[0]], nota: r.nota })) : [];
    P.clienteSugestoes = sug.map(s => s.reg);
    P.clienteSituacao = cnpj ? 'cnpj_nao_cadastrado' : 'sem_cnpj';
    if (cnpj) { P.cliente = { cnpj, nome: P.clienteDoc.nome, emails: [], novo: true }; prepararEmails(); buscarNoBling(cnpj); }
  }

  function escolherCliente(reg, situacao) {
    const P = E.pedido;
    P.cliente = { cnpj: reg[0], nomeCurto: reg[1], nome: reg[2], vendedor: reg[3], emails: reg[4] || [], obs: reg[5] || '', novo: false };
    P.clienteSituacao = situacao || 'escolhido';
    prepararEmails();
    prepararVencimento(P);
    if (reg[0]) buscarNoBling(reg[0]);
  }

  /* ---------------- vencimento (regra do cliente na planilha de vencimentos) ---------------- */
  function regraDoCliente(P) {
    const d = E.dados[E.empresa.id], c = P && P.cliente;
    if (!c || !c.cnpj) return null;
    return d.regras[c.cnpj] || null;
  }
  function prepararVencimento(P) {
    const r = regraDoCliente(P);
    const calc = Vencimento.calcular(r, new Date());
    const ant = P.venc && P.venc.escolhido;
    const opcoes = calc.opcoes.map(Vencimento.iso);
    P.venc = { regra: r, calc, escolhido: opcoes.indexOf(ant) >= 0 ? ant : (calc.data ? Vencimento.iso(calc.data) : (ant || '')) };
  }
  function dataBR(isoTxt) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoTxt || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; }
  function htmlVencimento(P) {
    if (!P.venc) prepararVencimento(P);
    const v = P.venc, r = v.regra;
    const semana = d => ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(d + 'T12:00').getDay()];
    const forma = r && r.forma ? `<div class="cinza" style="font-size:12px">Forma de pagamento: ${esc(r.forma)} · Regra: ${esc(v.calc.descricao)}</div>` : '';
    if (v.calc.opcoes.length) {
      return `<div class="campo"><label>Vencimento</label><select data-venc>${v.calc.opcoes.map(Vencimento.iso).map(d =>
        `<option value="${d}" ${d === v.escolhido ? 'selected' : ''}>${dataBR(d)} (${semana(d)})</option>`).join('')}</select>${forma}</div>`;
    }
    return `<div class="campo ${v.escolhido ? '' : 'falta'}"><label>Vencimento</label><input type="date" data-venc value="${esc(v.escolhido)}">` +
      `<div class="dica">${esc(v.calc.descricao)}. Informe o vencimento.</div></div>`;
  }
  function ligarVencimento(raiz, P) {
    const el = raiz.querySelector('[data-venc]');
    if (el) el.onchange = el.oninput = () => { P.venc.escolhido = el.value; };
  }
  function vencimentoParaEnvio(P) {
    if (!P.venc || !P.venc.escolhido) return null;
    return { data: P.venc.escolhido, descricao: P.venc.calc.descricao, forma: P.venc.regra ? P.venc.regra.forma : '' };
  }

  // E-mails: todos os cadastrados do cliente, de todas as filiais (mesma raiz de CNPJ)
  function prepararEmails() {
    const P = E.pedido, d = E.dados[E.empresa.id];
    const lista = [];
    const raiz = P.cliente && P.cliente.cnpj ? P.cliente.cnpj.slice(0, 8) : null;
    if (raiz) d.clientes.filter(c => c[0] && c[0].slice(0, 8) === raiz).forEach(c => (c[4] || []).forEach(e => lista.push(e)));
    (P.cliente && P.cliente.emails || []).forEach(e => lista.push(e));
    if (P.clienteBling) (P.clienteBling.emails || []).forEach(e => lista.push(e.toLowerCase()));
    const unicos = Array.from(new Set(lista.map(e => e.toLowerCase())));
    const antes = new Map((P.emails || []).map(e => [e.email, e.marcado]));
    P.emails = unicos.map(e => ({ email: e, marcado: antes.has(e) ? antes.get(e) : true }));
  }

  async function buscarNoBling(cnpj) {
    const P = E.pedido;
    P.blingStatus = 'buscando';
    renderCliente();
    try {
      const j = await chamar(E.empresa, 'buscarClienteBling', { cnpj });
      if (E.pedido !== P) return;
      if (j.encontrado) {
        P.clienteBling = j.cliente;
        if (!P.campos.enderecoEntrega) P.campos.enderecoEntrega = j.cliente.endereco || '';
        P.blingStatus = 'ok';
      } else {
        P.blingStatus = j.aviso ? 'falhou' : 'nao_achou';
        if (j.aviso) P.blingAviso = j.aviso;
      }
    } catch (e) { P.blingStatus = 'falhou'; P.blingAviso = e.message; }
    if (E.pedido !== P) return;
    const reg = regraDoCliente(P);
    if (!P.campos.enderecoEntrega && reg && reg.endereco) { P.campos.enderecoEntrega = reg.endereco; P.enderecoDaPlanilha = true; }
    if (!P.campos.enderecoEntrega && P.campos.enderecoDoc) { P.campos.enderecoEntrega = P.campos.enderecoDoc; P.enderecoDoDocumento = true; }
    prepararEmails();
    renderCliente(); renderCampos();
  }

  /* ---------------- conferência ---------------- */
  function abrirConferencia() {
    const P = E.pedido;
    $('#conf-titulo').textContent = P.id ? 'Pedido nº ' + (P.numero || P.id) + (P.situacao ? ' — ' + P.situacao : '') : 'Conferir pedido';
    $('#conf-cancelar').textContent = P.id ? 'Voltar' : 'Descartar';
    if (!P.modo) P.modo = P.id ? 'editar' : 'salvar';
    $('#conf-salvar').classList.toggle('escondido', P.modo === 'emitir');
    $('#conf-continuar').classList.toggle('escondido', P.modo === 'salvar');
    $('#conf-continuar').textContent = P.modo === 'emitir' ? 'Enviar ao Bling' : 'Emitir agora';
    if (P.modo === 'emitir') $('#conf-titulo').textContent = 'Conferir e emitir agora';
    $('#conf-documento').classList.add('escondido');
    $('#conf-documento').innerHTML = '';
    $('#conf-ver-doc').classList.toggle('escondido', !E.docUrl && !E.docTexto);
    $('#conf-ver-doc').textContent = 'Ver documento';
    renderAvisos(); renderCliente(); renderCampos(); renderItens(); renderResumo();
    mostrar('tela-conferencia');
  }

  function renderAvisos() {
    const P = E.pedido;
    const html = [];
    if (P.avisos.length) html.push(`<div class="aviso"><strong>A leitura avisou:</strong> ${P.avisos.map(esc).join(' · ')}</div>`);
    const duvidas = P.itens.filter(l => !l.riscado && !l.itemNovo && !l.escolhaManual && (!l.produto || l.nota < 50)).length;
    if (duvidas) html.push(`<div class="aviso">${duvidas} item(ns) com pouca semelhança no cadastro (em amarelo). Confira o produto escolhido.</div>`);
    if (!P.itens.length) html.push('<div class="aviso erro">Nenhum item foi encontrado no documento. Você pode montar o pedido em "Criar no app".</div>');
    $('#conf-avisos').innerHTML = html.join('');
  }

  function renderCliente() {
    const P = E.pedido; if (!P) return;
    const el = $('#conf-cliente');
    const doc = P.clienteDoc;
    const docTxt = (doc.nome || doc.cnpj) ? `<div class="original">No documento: ${esc(doc.nome || '—')}${doc.cnpj ? ' · CNPJ ' + fmtCnpj(doc.cnpj) : ''}</div>` : '';
    let html = '<h3>Cliente</h3>';
    if (P.cliente) {
      const c = P.cliente;
      let etiqueta = '';
      if (P.clienteSituacao === 'cadastrado') etiqueta = '<span class="etiqueta">Cadastrado</span>';
      else if (P.clienteSituacao === 'filial_nova') etiqueta = '<span class="etiqueta amarela">Filial nova de ' + esc(c.filialDe[1]) + '</span>';
      else if (c.novo) etiqueta = '<span class="etiqueta amarela">Cliente novo: vai como solicitação para o Bernard</span>';
      let bling = '';
      if (P.blingStatus === 'buscando') bling = '<span class="cinza">Buscando endereço no Bling…</span>';
      else if (P.blingStatus === 'nao_achou') bling = '<span class="etiqueta amarela">Não encontrado no Bling</span>';
      else if (P.blingStatus === 'falhou') bling = '<span class="etiqueta amarela">' + esc(P.blingAviso || 'Bling indisponível') + '</span>';
      html += `<div class="cliente-escolhido"><div>
          <div class="nome">${esc(c.nomeCurto || c.nome || '—')} ${etiqueta}</div>
          <div class="cinza">${esc(c.nome || '')}${c.cnpj ? ' · CNPJ ' + fmtCnpj(c.cnpj) : ''}${c.vendedor ? ' · Vendedor do cadastro: ' + esc(c.vendedor) : ''}</div>
          ${docTxt}<div>${bling}</div>
        </div><button class="secundario pequeno" id="cli-trocar">Trocar cliente</button></div>`;
      html += '<div class="emails"><label class="cinza" style="display:block;margin-top:10px">E-mails para o pedido (todos os cadastrados, de todas as filiais):</label>';
      if (!P.emails.length) html += '<span class="cinza">Nenhum e-mail cadastrado. </span>';
      P.emails.forEach((e, i) => { html += `<label><input type="checkbox" data-email="${i}" ${e.marcado ? 'checked' : ''}> ${esc(e.email)}</label>`; });
      html += `<div style="display:flex;gap:6px;margin-top:6px;max-width:420px"><input type="text" id="email-novo" placeholder="Acrescentar outro e-mail"><button class="secundario pequeno" id="email-add">Acrescentar</button></div></div>`;
    } else {
      html += docTxt;
      html += '<div class="aviso">' + (P.clienteSituacao === 'sem_cnpj'
        ? 'O documento não mostra o CNPJ do cliente. Escolha o cliente abaixo.'
        : 'Não encontrei o cliente no cadastro. Escolha abaixo ou cadastre um cliente novo.') + '</div>';
      html += '<div id="cli-busca"></div>';
    }
    el.innerHTML = html;
    if (P.cliente) {
      $('#cli-trocar').onclick = () => { P.cliente = null; P.clienteBling = null; P.blingStatus = ''; P.emails = []; P.clienteSituacao = 'sem_cnpj'; renderCliente(); };
      el.querySelectorAll('[data-email]').forEach(cb => cb.onchange = () => { P.emails[+cb.dataset.email].marcado = cb.checked; });
      $('#email-add').onclick = () => {
        const v = $('#email-novo').value.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { avisar('E-mail inválido.'); return; }
        if (!P.emails.some(e => e.email === v)) { P.emails.push({ email: v, marcado: true, novo: true }); P.emailsExtras.push(v); }
        renderCliente();
      };
    } else {
      montarBuscaCliente($('#cli-busca'), P.clienteSugestoes, (reg, novo) => {
        escolherCliente(reg, novo ? 'novo' : 'escolhido');
        if (novo) P.cliente.novo = true;
        renderCliente();
      }, true);
    }
  }

  // Busca de cliente (conferência e "Criar no app")
  function montarBuscaCliente(alvo, sugestoesIniciais, aoEscolher, permitirNovo) {
    const d = E.dados[E.empresa.id];
    alvo.innerHTML = `<div class="auto" style="max-width:640px"><input type="text" placeholder="Digite o nome ou o CNPJ do cliente"></div>
      <div class="sug-cli" style="margin-top:8px"></div>
      ${permitirNovo ? '<button class="link" style="margin-top:6px" data-novo>+ Cadastrar cliente novo</button><div class="cli-novo escondido" style="margin-top:8px"></div>' : ''}`;
    const inp = alvo.querySelector('input'), sug = alvo.querySelector('.sug-cli');
    const desenhar = lista => {
      sug.innerHTML = lista.length ? lista.map((c, i) =>
        `<div class="opcao-produto" data-i="${i}"><span><strong>${esc(c[1])}</strong> <span class="cinza">${esc(c[2])}</span></span><span class="nota">${c[0] ? fmtCnpj(c[0]) : 'sem CNPJ'}</span></div>`).join('')
        : '<span class="cinza">Nenhum cliente parecido.</span>';
      sug.querySelectorAll('[data-i]').forEach(o => o.onclick = () => aoEscolher(lista[+o.dataset.i]));
    };
    desenhar(sugestoesIniciais.slice(0, 5));
    inp.oninput = () => {
      const t = inp.value.trim();
      const dig = soDigitos(t);
      if (dig.length >= 8) { desenhar(d.clientes.filter(c => c[0].indexOf(dig) === 0).slice(0, 8)); return; }
      desenhar(t ? Busca.buscar(d.indCli, t, 8).map(r => d.clientes[r.produto[0]]) : sugestoesIniciais.slice(0, 5));
    };
    if (permitirNovo) {
      alvo.querySelector('[data-novo]').onclick = () => {
        const box = alvo.querySelector('.cli-novo');
        box.classList.remove('escondido');
        const P = E.pedido;
        box.innerHTML = `<div class="campos"><div class="campo"><label>Nome do cliente</label><input type="text" id="cn-nome" value="${esc(P && P.clienteDoc ? P.clienteDoc.nome : '')}"></div>
          <div class="campo"><label>CNPJ</label><input type="text" id="cn-cnpj" value="${esc(P && P.clienteDoc ? fmtCnpj(P.clienteDoc.cnpj) : '')}"></div>
          <div class="campo"><label>&nbsp;</label><button class="primario" id="cn-ok">Usar cliente novo</button></div></div>
          <p class="cinza">O cadastro vai como solicitação para o Bernard aprovar.</p>`;
        box.querySelector('#cn-ok').onclick = () => {
          const nome = box.querySelector('#cn-nome').value.trim();
          const cnpj = soDigitos(box.querySelector('#cn-cnpj').value);
          if (!nome) { avisar('Informe o nome do cliente.'); return; }
          if (cnpj && cnpj.length !== 14 && cnpj.length !== 11) { avisar('CNPJ inválido.'); return; }
          aoEscolher([cnpj, nome, nome, '', [], ''], true);
        };
      };
    }
  }

  function campo(id, rotulo, valor, opc) {
    opc = opc || {};
    const falta = opc.obrigatorio && !String(valor || '').trim();
    const ctrl = opc.area
      ? `<textarea data-campo="${id}">${esc(valor)}</textarea>`
      : `<input type="text" data-campo="${id}" value="${esc(valor)}">`;
    return `<div class="campo ${opc.largo ? 'largo' : ''} ${falta ? 'falta' : ''}"><label>${rotulo}</label>${ctrl}` +
      `${falta ? '<div class="dica">' + esc(opc.dica || 'Falta no documento: preencha.') + '</div>' : ''}${opc.extra || ''}</div>`;
  }

  function renderCampos() {
    const P = E.pedido; if (!P) return;
    const c = P.campos;
    let origemEnd = '';
    if (P.clienteBling && c.enderecoEntrega === P.clienteBling.endereco) origemEnd = '<div class="cinza" style="font-size:12px">Endereço do cadastro do Bling. Pode alterar.</div>';
    else if (P.enderecoDaPlanilha) origemEnd = '<div class="cinza" style="font-size:12px">Endereço da planilha de cadastro (cliente não encontrado no Bling). Pode alterar.</div>';
    else if (P.enderecoDoDocumento) origemEnd = '<div class="cinza" style="font-size:12px">Endereço do documento (cliente não encontrado no Bling). Confira.</div>';
    const docEnd = c.enderecoDoc && c.enderecoDoc !== c.enderecoEntrega
      ? `<div class="original">No documento: ${esc(c.enderecoDoc)}</div>` : '';
    $('#conf-campos').innerHTML =
      campo('comprador', 'Comprador(a)', c.comprador, { obrigatorio: true, dica: 'Falta no documento: informe o comprador.' }) +
      campo('numeroCliente', 'Nº do pedido / OC do cliente', c.numeroCliente) +
      campo('data', 'Data do documento', c.data) +
      campo('unidade', 'Unidade / filial do cliente', c.unidade) +
      campo('condicaoPagamento', 'Condição de pagamento (do documento)', c.condicaoPagamento) +
      campo('prazoEntrega', 'Prazo de entrega', c.prazoEntrega) +
      campo('tipoFrete', 'Frete (CIF/FOB)', c.tipoFrete) +
      campo('frete', 'Valor do frete (R$)', moeda(c.frete)) +
      campo('enderecoEntrega', 'Endereço de entrega', c.enderecoEntrega, { area: true, largo: true, obrigatorio: true,
        dica: 'Informe o endereço de entrega.', extra: origemEnd + docEnd }) +
      campo('observacoes', 'Observações', c.observacoes, { area: true, largo: true }) +
      (P.modo === 'emitir' && P.cliente ? htmlVencimento(P) + htmlCaixaEmail(P) : '');
    ligarVencimento($('#conf-campos'), P);
    ligarCaixaEmail($('#conf-campos'), P);
    $('#conf-campos').querySelectorAll('[data-campo]').forEach(inp => {
      inp.oninput = () => {
        const k = inp.dataset.campo;
        c[k] = k === 'frete' ? lerNumero(inp.value) : inp.value;
        if (k === 'enderecoEntrega') P.enderecoDoDocumento = false;
        const box = inp.closest('.campo');
        if (box.classList.contains('falta') && inp.value.trim()) { box.classList.remove('falta'); const dc = box.querySelector('.dica'); if (dc) dc.remove(); }
        if (k === 'frete') renderResumo();
      };
    });
  }

  function totalLinha(l) { return arred(l.quantidade * l.preco * (1 - (l.desconto || 0) / 100)); }

  function htmlProduto(l) {
    if (l.itemNovo) {
      return `<div class="produto">${esc(l.itemNovo.descricao)} <span class="etiqueta amarela">Cadastro pendente</span>` +
        `<div class="det">Item novo. Referência: ${esc(l.itemNovo.referencia ? l.itemNovo.referencia[2] : '—')}</div></div>`;
    }
    if (!l.produto) return '<div class="produto erro">Nenhum produto parecido</div>';
    const p = l.produto;
    const desc = l.descricaoEditada ? `${esc(l.descricaoEditada)} <span class="etiqueta">descrição alterada</span>` : esc(p[2]);
    return `<div class="produto">${desc}<div class="det">${l.descricaoEditada ? 'Cadastro: ' + esc(p[2]) + ' · ' : ''}Cód. ${esc(p[1])} · ${esc(p[3])} · Bling R$ ${moeda(p[4])}` +
      `${l.escolhaManual ? ' · escolhido pelo vendedor' : ' · ' + l.nota + '% parecido'}</div></div>`;
  }

  // Quantidade que vai para o Bling agora (modo "Emitir agora")
  function qtdAgora(l) { return l.cortado ? 0 : Math.max(0, Math.min(Number(l.emitir) || 0, l.quantidade)); }
  function precoLiq(l) { return arred(l.preco * (1 - (l.desconto || 0) / 100)); }

  function renderItens() {
    const P = E.pedido;
    const emitir = P.modo === 'emitir';
    $('#conf-itens thead').innerHTML = emitir
      ? '<tr><th>#</th><th>Item do cliente</th><th>Produto do cadastro</th><th>Qtd. do pedido</th><th>Emitir agora</th><th>Un</th><th>Preço un.</th><th>Desc. %</th><th>Total agora</th><th></th></tr>'
      : '<tr><th>#</th><th>Item do cliente</th><th>Produto do cadastro</th><th>Qtd.</th><th>Un</th><th>Preço un.</th><th>Desc. %</th><th>Total</th><th></th></tr>';
    const tb = $('#conf-itens tbody');
    tb.innerHTML = P.itens.map((l, i) => {
      const o = l.original;
      const duvida = !l.riscado && !l.itemNovo && !l.escolhaManual && (!l.produto || l.nota < 50);
      const env = Number(l.enviada) || 0;
      const trava = env > 0 ? ' disabled title="Já enviado ao Bling"' : '';
      const pendente = arred(l.quantidade - qtdAgora(l));
      const classe = (emitir ? (l.cortado ? 'cortado' : '') : (l.riscado ? 'riscado' : '')) + (duvida ? ' duvida' : '');
      const colQtd = `<td><input class="num" data-campo="quantidade" value="${moeda(l.quantidade)}">${env > 0
          ? `<div class="cinza" style="font-size:12px">Já enviado: ${moeda(env)}<br>Pendente: ${moeda(Math.max(0, l.quantidade - env))}</div>` : ''}</td>`;
      const colAgora = emitir ? `<td><input class="num" data-campo="emitir" value="${moeda(qtdAgora(l))}" ${l.cortado ? 'disabled' : ''}>` +
          `${pendente > 0 ? `<div class="etiqueta amarela" style="margin:4px 0 0">Fica pendente: ${moeda(pendente)}</div>` : ''}</td>` : '';
      const total = emitir ? qtdAgora(l) * precoLiq(l) : totalLinha(l);
      const botao = emitir
        ? `<button class="secundario pequeno" data-acao="cortar">${l.cortado ? 'Desfazer' : 'Cortar'}</button>`
        : (env > 0 ? '' : `<button class="secundario pequeno" data-acao="riscar">${l.riscado ? 'Desfazer' : 'Remover'}</button>`);
      return `<tr data-i="${i}" class="${classe}">
        <td>${i + 1}</td>
        <td class="original"><div>${esc(o.descricao || '—')}</div>
          <div class="cod">${o.codigo ? 'Cód. cliente: ' + esc(o.codigo) + ' · ' : ''}${o.quantidade ? moeda(o.quantidade) + ' ' + esc(o.unidade) : ''}${o.preco ? ' × R$ ' + moeda(o.preco) : ''}</div></td>
        <td class="col-produto">${htmlProduto(l)}${env > 0 ? '' : '<button class="link" data-acao="trocar">Trocar</button> · <button class="link" data-acao="descricao">Editar descrição</button>'}</td>
        ${colQtd}${colAgora}
        <td>${esc((l.produto && l.produto[3]) || o.unidade || '')}</td>
        <td><input class="num" data-campo="preco" value="${moeda(l.preco)}"${trava}></td>
        <td><input class="num" data-campo="desconto" value="${moeda(l.desconto)}" style="min-width:56px"${trava}></td>
        <td class="num total">R$ ${moeda(total)}</td>
        <td>${botao}</td></tr>`;
    }).join('');
    tb.querySelectorAll('input[data-campo]').forEach(inp => {
      inp.oninput = () => {
        const tr = inp.closest('tr'), l = P.itens[+tr.dataset.i], campo = inp.dataset.campo;
        const antes = l.quantidade;
        l[campo] = lerNumero(inp.value);
        if (campo === 'quantidade' && l.enviada > 0 && l.quantidade < l.enviada) {
          avisar('Já foram enviados ' + moeda(l.enviada) + ' deste item. A quantidade não pode ser menor.');
        }
        // no modo emitir, se a quantidade do pedido mudar e o "emitir agora" estava cheio, acompanha
        if (emitir && campo === 'quantidade' && Math.abs((l.emitir || 0) - antes) < 1e-9) l.emitir = l.quantidade;
        tr.querySelector('.total').textContent = 'R$ ' + moeda(emitir ? qtdAgora(l) * precoLiq(l) : totalLinha(l));
        renderResumo();
      };
      inp.onblur = () => { inp.value = moeda(lerNumero(inp.value)); if (emitir) renderItens(); };
    });
    tb.querySelectorAll('[data-acao]').forEach(b => b.onclick = () => {
      const i = +b.closest('tr').dataset.i, l = P.itens[i];
      if (b.dataset.acao === 'riscar') { l.riscado = !l.riscado; renderItens(); renderResumo(); renderAvisos(); }
      else if (b.dataset.acao === 'cortar') { l.cortado = !l.cortado; if (!l.cortado && !(l.emitir > 0)) l.emitir = l.quantidade; renderItens(); renderResumo(); }
      else if (b.dataset.acao === 'descricao') abrirEditarDescricao(l, () => renderItens());
      else abrirTrocaProduto(l, () => { renderItens(); renderAvisos(); });
    });
  }

  // Descrição que vai no pedido/proposta para este item (o produto do cadastro continua ligado)
  function abrirEditarDescricao(l, aoMudar) {
    const atual = l.descricaoEditada || (l.produto ? l.produto[2] : (l.itemNovo ? l.itemNovo.descricao : l.original.descricao)) || '';
    const corpo = abrirJanela('Editar descrição do item',
      `<div class="original-destaque"><div class="cinza">Item do cliente:</div><strong>${esc(l.original.descricao || '')}</strong>` +
      `${l.produto ? `<div class="cinza" style="margin-top:6px">Produto do cadastro: ${esc(l.produto[2])}</div>` : ''}</div>
       <div class="campo"><label>Descrição no pedido</label><input type="text" id="ed-desc" value="${esc(atual)}"></div>
       <div class="botoes" style="margin-top:12px"><button class="primario" id="ed-ok">Salvar descrição</button>
       ${l.descricaoEditada ? '<button class="secundario" id="ed-volta">Voltar à descrição do cadastro</button>' : ''}</div>
       <p class="cinza">O item continua ligado ao mesmo produto do cadastro; só a descrição do pedido muda.</p>`);
    const inp = corpo.querySelector('#ed-desc'); inp.focus(); inp.select();
    corpo.querySelector('#ed-ok').onclick = () => {
      const v = inp.value.trim();
      if (!v) { avisar('A descrição não pode ficar vazia.'); return; }
      if (l.itemNovo) { l.itemNovo.descricao = v; l.descricaoEditada = null; }
      else l.descricaoEditada = (l.produto && v === l.produto[2]) ? null : v;
      fecharJanela(); aoMudar();
    };
    const volta = corpo.querySelector('#ed-volta');
    if (volta) volta.onclick = () => { l.descricaoEditada = null; fecharJanela(); aoMudar(); };
  }

  function renderResumo() {
    const P = E.pedido;
    const ativos = P.itens.filter(l => !l.riscado);
    const frete = P.campos.frete || 0;
    let blocos;
    if (P.modo === 'emitir') {
      const agora = ativos.reduce((s, l) => s + qtdAgora(l) * precoLiq(l), 0);
      const pend = ativos.reduce((s, l) => s + (l.quantidade - qtdAgora(l)) * precoLiq(l), 0);
      const nAgora = ativos.filter(l => qtdAgora(l) > 0).length;
      blocos = [['Itens para emitir agora', moeda(nAgora)], ['Total do pedido', 'R$ ' + moeda(agora + pend)],
                ['Fica pendente', 'R$ ' + moeda(pend)], ['Frete', 'R$ ' + moeda(frete)], ['Vai para o Bling agora', 'R$ ' + moeda(agora + frete)]];
      const b = $('#conf-continuar');
      b.textContent = nAgora ? `Enviar ${nAgora} item(ns) ao Bling` : 'Enviar ao Bling';
    } else {
      const somaQtd = ativos.reduce((s, l) => s + (l.quantidade || 0), 0);
      const bruto = ativos.reduce((s, l) => s + arred(l.quantidade * l.preco), 0);
      const total = ativos.reduce((s, l) => s + totalLinha(l), 0);
      blocos = [['Nº de itens', moeda(ativos.length)], ['Soma das qtdes', moeda(somaQtd)],
                ['Desconto dos itens', 'R$ ' + moeda(bruto - total)], ['Total dos itens', 'R$ ' + moeda(total)],
                ['Frete', 'R$ ' + moeda(frete)], ['Total do pedido', 'R$ ' + moeda(total + frete)]];
    }
    $('#conf-resumo').innerHTML = blocos.map(([r, v], i, a) =>
      `<div class="${i === a.length - 1 ? 'total' : ''}"><span>${r}</span><strong>${v}</strong></div>`).join('');
    const envios = P.envios || [];
    const pendente = ativos.reduce((s, l) => s + arred(Math.max(0, l.quantidade - (l.enviada || 0)) * precoLiq(l)), 0);
    $('#conf-saldo').innerHTML = envios.length
      ? '<h3>Já enviado ao Bling</h3>' + envios.map((e, k) => `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:4px 0">` +
          `<span>Entrega ${k + 1} · proposta nº ${esc(e.numeroBling || e.idBling)} — ${fmtData(e.data)} — R$ ${moeda(e.total)} <span class="cinza">(${esc(e.vendedor)})</span></span>` +
          `<button class="secundario pequeno" data-pdf="${k}">PDF</button><button class="secundario pequeno" data-email="${k}">${e.email ? 'E-mail enviado · reenviar' : 'Enviar e-mail'}</button></div>`).join('') +
        `<p style="margin-bottom:0"><strong>Pendente: R$ ${moeda(pendente)}</strong></p>`
      : '';
    $('#conf-saldo').classList.toggle('escondido', !envios.length);
    $('#conf-saldo').querySelectorAll('[data-pdf]').forEach(b => b.onclick = () => baixarPdfEntrega(P.id, +b.dataset.pdf));
    $('#conf-saldo').querySelectorAll('[data-email]').forEach(b => b.onclick = () => abrirEmail(P.id, +b.dataset.email));
  }

  /* Janela: trocar produto / item novo */
  function abrirJanela(titulo, html) {
    $('#janela-titulo').textContent = titulo;
    $('#janela-corpo').innerHTML = html;
    $('#janela').classList.remove('escondido');
    return $('#janela-corpo');
  }
  function fecharJanela() { $('#janela').classList.add('escondido'); $('#janela-corpo').innerHTML = ''; }

  function htmlOpcoes(lista) {
    return lista.map((r, i) => `<div class="opcao-produto" data-i="${i}"><span><strong>${esc(r.produto[2])}</strong>` +
      `<br><span class="cinza">Cód. ${esc(r.produto[1])} · ${esc(r.produto[3])} · R$ ${moeda(r.produto[4])}</span></span>` +
      `<span class="nota">${r.nota}%</span></div>`).join('') || '<div class="cinza" style="padding:8px">Nenhum produto parecido.</div>';
  }

  function abrirTrocaProduto(l, aoMudar) {
    const d = E.dados[E.empresa.id];
    const corpo = abrirJanela('Escolher produto do cadastro',
      `<div class="original-destaque"><div class="cinza">Item do cliente:</div><strong>${esc(l.original.descricao || '(sem descrição)')}</strong></div>
       <div id="tj-lista"></div>
       <button class="link" id="tj-mais" style="margin:8px 0">Ver mais 5 opções</button>
       <div class="campo" style="margin-top:8px"><label>Buscar outro produto</label><input type="text" id="tj-busca" placeholder="Digite parte da descrição"></div>
       <div id="tj-busca-res"></div>
       <div class="opcao-acao" id="tj-novo">+ Criar item novo com esta descrição</div>`);
    let mostrando = 3;
    const desenhar = () => {
      const lista = l.opcoes.slice(0, mostrando);
      corpo.querySelector('#tj-lista').innerHTML = htmlOpcoes(lista);
      corpo.querySelectorAll('#tj-lista [data-i]').forEach(o => o.onclick = () => escolher(lista[+o.dataset.i]));
      corpo.querySelector('#tj-mais').classList.toggle('escondido', mostrando >= l.opcoes.length);
    };
    const escolher = r => {
      l.produto = r.produto; l.nota = r.nota; l.itemNovo = null; l.escolhaManual = true; l.descricaoEditada = null;
      fecharJanela(); aoMudar();
    };
    desenhar();
    corpo.querySelector('#tj-mais').onclick = () => { mostrando = 8; desenhar(); };
    const busca = corpo.querySelector('#tj-busca');
    busca.oninput = () => {
      const res = busca.value.trim() ? Busca.buscar(d.indProd, busca.value, 8) : [];
      const alvo = corpo.querySelector('#tj-busca-res');
      alvo.innerHTML = busca.value.trim() ? htmlOpcoes(res) : '';
      alvo.querySelectorAll('[data-i]').forEach(o => o.onclick = () => escolher(res[+o.dataset.i]));
    };
    corpo.querySelector('#tj-novo').onclick = () => abrirItemNovo(l, aoMudar);
  }

  function abrirItemNovo(l, aoMudar) {
    const d = E.dados[E.empresa.id];
    const corpo = abrirJanela('Criar item novo',
      `<div class="campo"><label>Descrição do item novo</label><input type="text" id="in-desc" value="${esc(l.original.descricao)}"></div>
       <div class="campo" style="margin-top:10px"><label>Digite um item parecido do cadastro (referência para o NCM)</label>
         <input type="text" id="in-busca" placeholder="Ex.: torneira de bancada"></div>
       <div id="in-res"></div>
       <p class="cinza">O item vai como solicitação para o Bernard cadastrar. O pedido segue normalmente.</p>`);
    const busca = corpo.querySelector('#in-busca');
    busca.focus();
    busca.oninput = () => {
      const res = busca.value.trim() ? Busca.buscar(d.indProd, busca.value, 8) : [];
      const alvo = corpo.querySelector('#in-res');
      alvo.innerHTML = busca.value.trim() ? htmlOpcoes(res) : '';
      alvo.querySelectorAll('[data-i]').forEach(o => o.onclick = () => {
        const desc = corpo.querySelector('#in-desc').value.trim();
        if (!desc) { avisar('Informe a descrição do item novo.'); return; }
        l.itemNovo = { descricao: desc, referencia: res[+o.dataset.i].produto };
        l.produto = null; l.escolhaManual = true;
        fecharJanela(); aoMudar();
      });
    };
  }

  function alternarDocumento() {
    const aside = $('#conf-documento');
    const abrir = aside.classList.contains('escondido');
    aside.classList.toggle('escondido', !abrir);
    $('#conf-ver-doc').textContent = abrir ? 'Esconder documento' : 'Ver documento';
    if (abrir && !aside.innerHTML) {
      const f = E.arquivo;
      if (f && /pdf/i.test(f.type || f.name)) aside.innerHTML = `<iframe src="${E.docUrl}"></iframe>`;
      else if (f && /^image\//.test(f.type)) aside.innerHTML = `<img src="${E.docUrl}" alt="">`;
      else aside.innerHTML = `<pre>${esc(E.docTexto || '')}</pre>`;
    }
  }

  /* ---------------- salvar / continuar ---------------- */
  function pendencias() {
    const P = E.pedido, faltas = [];
    if (!P.cliente) faltas.push('escolha o cliente');
    if (!String(P.campos.comprador || '').trim()) faltas.push('informe o comprador');
    if (!String(P.campos.enderecoEntrega || '').trim()) faltas.push('informe o endereço de entrega');
    const ativos = P.itens.filter(l => !l.riscado);
    if (!ativos.length) faltas.push('o pedido não tem itens');
    if (P.modo === 'emitir') {
      if (!ativos.some(l => qtdAgora(l) > 0)) faltas.push('nenhum item para emitir agora (use "Salvar pedido" se nada vai agora)');
      if (!P.venc || !P.venc.escolhido) faltas.push('informe o vencimento');
    }
    ativos.forEach((l, i) => {
      if (!l.produto && !l.itemNovo) faltas.push(`item ${P.itens.indexOf(l) + 1}: escolha o produto ou crie item novo`);
      if (!(l.quantidade > 0)) faltas.push(`item ${P.itens.indexOf(l) + 1}: quantidade`);
      if (!(l.preco > 0)) faltas.push(`item ${P.itens.indexOf(l) + 1}: preço`);
    });
    return faltas;
  }

  // O que vai para o servidor (sem as listas de opções, que são refeitas ao abrir)
  function serializarPedido() {
    const P = E.pedido;
    return {
      id: P.id || null, origem: P.origem, arquivo: P.arquivoNome, leitor: P.leitor,
      cliente: P.cliente, clienteBling: P.clienteBling, clienteDoc: P.clienteDoc,
      emails: P.emails, emailsExtras: P.emailsExtras, campos: P.campos, avisos: P.avisos || [],
      itens: P.itens.map(l => ({ id: l.id, original: l.original, produto: l.produto, nota: l.nota,
        escolhaManual: l.escolhaManual, itemNovo: l.itemNovo, descricaoEditada: l.descricaoEditada || null, quantidade: l.quantidade, preco: l.preco,
        desconto: l.desconto, riscado: l.riscado, enviada: l.enviada || 0 }))
    };
  }

  function carregarPedidoSalvo(p) {
    const d = E.dados[E.empresa.id];
    E.arquivo = null; E.docTexto = null;
    if (E.docUrl) { URL.revokeObjectURL(E.docUrl); E.docUrl = null; }
    E.pedido = Object.assign({ avisos: [], emails: [], emailsExtras: [], clienteDoc: { nome: '', cnpj: '' } }, p, {
      itens: (p.itens || []).map(l => Object.assign({}, l, {
        opcoes: l.original && l.original.descricao ? Busca.buscar(d.indProd, l.original.descricao, 8) : [] })),
      avisos: []
    });
    E.pedido.clienteSituacao = E.pedido.cliente ? (E.pedido.cliente.novo ? 'novo' : 'cadastrado') : 'sem_cnpj';
    E.pedido.modo = 'editar';
    // e-mails: junta os do cadastro (inclusive os aprovados depois) sem perder os acrescentados à mão
    if (E.pedido.cliente) {
      const extras = (E.pedido.emails || []).filter(e => e.novo);
      prepararEmails();
      extras.forEach(e => { if (!E.pedido.emails.some(x => x.email === e.email)) E.pedido.emails.push(e); });
    }
    prepararVencimento(E.pedido);
    E.pedido.blingStatus = E.pedido.clienteBling ? 'ok' : '';
    return E.pedido;
  }

  async function salvarPedido() {
    const P = E.pedido;
    const r = await chamar(E.empresa, 'salvarPedido', { pedido: serializarPedido() });
    const salvo = r.pedido;
    P.id = salvo.id; P.envios = salvo.envios; P.situacao = salvo.situacao;
    salvo.itens.forEach((s, i) => { if (P.itens[i] && P.itens[i].id === s.id) P.itens[i].enviada = s.enviada; });
    // índice de controle: código do cliente -> produto
    const cnpj = P.cliente && P.cliente.cnpj;
    const linhas = cnpj ? P.itens.filter(l => !l.riscado && l.original && l.original.codigo && l.produto).map(l => ({
      cnpjCliente: cnpj, codigoCliente: l.original.codigo, descricaoCliente: l.original.descricao,
      idProduto: l.produto[0], codigoProduto: l.produto[1], descricaoProduto: l.produto[2] })) : [];
    if (linhas.length) chamar(E.empresa, 'salvarIndice', { linhas }).catch(e => console.warn('índice', e));
    E.listaDesatualizada = true;
    return salvo;
  }

  function prepararConferencia() {
    $('#conf-ver-doc').onclick = alternarDocumento;
    $('#conf-cancelar').onclick = () => {
      if (E.pedido && E.pedido.id) { if (confirm('Sair sem salvar as alterações?')) abrirPedidos(); }
      else if (confirm('Descartar este pedido?')) irInicio();
    };
    const acao = async (botao, depois) => {
      const f = pendencias();
      if (f.length) { avisar('Antes de continuar: ' + f.slice(0, 4).join('; ') + (f.length > 4 ? '…' : '.'), 7000); return; }
      const texto = botao.textContent; botao.disabled = true; botao.textContent = 'Salvando…';
      try { await salvarPedido(); depois(); }
      catch (e) { avisar('Não consegui salvar: ' + e.message, 7000); }
      finally { botao.disabled = false; botao.textContent = texto; }
    };
    // Salvar pedido: fica pendente na aba Pedidos
    $('#conf-salvar').onclick = () => acao($('#conf-salvar'), () => {
      avisar('Pedido salvo como pendente na aba Pedidos.');
      abrirPedidos();
    });
    // Pedido salvo reaberto: "Emitir agora" salva e abre a escolha do que vai para o Bling
    // Pedido novo no modo "Emitir agora": salva tudo e já envia o que foi escolhido (o resto fica pendente)
    $('#conf-continuar').onclick = () => {
      if (E.pedido.modo === 'emitir') emitirAgora();
      else acao($('#conf-continuar'), () => abrirEnvio());
    };
  }

  async function emitirAgora() {
    const P = E.pedido;
    const f = pendencias();
    if (f.length) { avisar('Antes de enviar: ' + f.slice(0, 4).join('; ') + (f.length > 4 ? '…' : '.'), 7000); return; }
    if (!(await prepararGmailSeNecessario(P))) return;
    const itens = [];
    P.itens.forEach((l, i) => { if (!l.riscado && qtdAgora(l) > 0) itens.push({ indice: i, quantidade: qtdAgora(l) }); });
    const agora = P.itens.filter(l => !l.riscado).reduce((s, l) => s + qtdAgora(l) * precoLiq(l), 0);
    const pend = P.itens.filter(l => !l.riscado).reduce((s, l) => s + (l.quantidade - qtdAgora(l)) * precoLiq(l), 0);
    const semCadastro = P.itens.filter(l => !l.riscado && qtdAgora(l) > 0 && l.itemNovo).length;
    if (!confirm(`Enviar ao Bling ${itens.length} item(ns), total R$ ${moeda(agora)}, vencimento ${dataBR(P.venc.escolhido)}?` +
      (pend > 0.004 ? `\n\nFica pendente na aba Pedidos: R$ ${moeda(pend)}.` : '') +
      (semCadastro ? `\n\nAtenção: ${semCadastro} item(ns) com cadastro pendente.` : '') + textoEmailConfirmacao(P))) return;
    const b = $('#conf-continuar'); b.disabled = true; b.textContent = 'Enviando…';
    try {
      const r = await chamar(E.empresa, 'salvarEEnviar', { pedido: serializarPedido(), itens, vencimento: vencimentoParaEnvio(P) });
      E.listaDesatualizada = true; E.pedido = null;
      const p = r.pedido;
      telaSucessoEnvio(r, querEmail(P));
    } catch (e) {
      if (/ficou salvo/.test(e.message)) {
        E.listaDesatualizada = true; E.pedido = null;
        mostrarErro('O Bling não aceitou o envio', e.message, [['Ver pedidos', abrirPedidos], ['Novo pedido', irInicio]]);
      } else avisar('Não consegui enviar: ' + e.message, 8000);
    } finally { b.disabled = false; if (E.pedido) renderResumo(); }
  }

  // Depois de criar a proposta no Bling: o e-mail ao cliente sai automaticamente (se o cliente tiver e-mail)
  async function telaSucessoEnvio(r, enviarEmail) {
    const p = r.pedido, k = (p.envios || []).length - 1;
    const base = `Pedido nº ${p.numero}: proposta comercial nº ${r.numeroBling || r.idBling} criada no Bling da ${E.empresa.curto}.` +
      (p.totalPendente > 0 ? ` Ficou pendente R$ ${moeda(p.totalPendente)} na aba Pedidos.` : ' Não ficou nada pendente.');
    const botoes = [['Logística', () => abrirLogistica(p, k)], ['Ver pedidos', abrirPedidos], ['Novo pedido', irInicio]];
    const para = (p.emails || []).filter(e => e.marcado).map(e => e.email);
    if (!para.length) {
      mostrarErro('Proposta enviada ao Bling', base + ' O cliente não tem e-mail cadastrado: o e-mail não foi enviado.', botoes);
      return;
    }
    if (enviarEmail === false) {
      mostrarErro('Proposta enviada ao Bling', base + ' O e-mail não foi enviado (opção desmarcada).',
        [['Enviar e-mail ao cliente', () => abrirEmail(p.id, k)]].concat(botoes));
      return;
    }
    mostrarErro('Proposta enviada ao Bling', base + ' Enviando o e-mail ao cliente…', botoes);
    try {
      const doc = await chamar(E.empresa, 'documentoEnvio', { id: p.id, entrega: k });
      const env = await enviarPeloGmail({ para: doc.para, cc: doc.cc, assunto: doc.assunto, texto: doc.texto, anexos: doc.anexos, logo: doc.logoBase64 });
      chamar(E.empresa, 'registrarEmail', { id: p.id, entrega: k, dados: { para: doc.para, cc: doc.cc, idGmail: env && env.id } }).catch(() => {});
      $('#erro-texto').textContent = base + ' E-mail enviado para ' + doc.para.join(', ') + (doc.cc.length ? ' (cópia: ' + doc.cc.join(', ') + ')' : '') + '.';
    } catch (e) {
      $('#erro-texto').textContent = base + ' Atenção: o e-mail NÃO foi enviado (' + e.message + ').';
      const b = document.createElement('button'); b.className = 'primario'; b.textContent = 'Tentar enviar o e-mail de novo';
      b.onclick = () => abrirEmail(p.id, k);
      $('#erro-botoes').prepend(b);
    }
  }

  // O Google só abre a autorização do Gmail a partir de um clique: pedimos antes de enviar ao Bling
  // Caixa "Enviar e-mail ao cliente" (marcada quando o cliente tem e-mail)
  function querEmail(P) { return P.enviarEmail !== false && (P.emails || []).some(e => e.marcado); }
  function htmlCaixaEmail(P) {
    const para = (P.emails || []).filter(e => e.marcado).map(e => e.email);
    if (!para.length) return '<div class="campo largo"><label>E-mail ao cliente</label><div class="cinza">Cliente sem e-mail cadastrado: o e-mail não será enviado.</div></div>';
    return `<div class="campo largo"><label>E-mail ao cliente</label><label style="display:flex;gap:8px;align-items:center;font-size:14px;color:var(--texto)">` +
      `<input type="checkbox" data-enviar-email ${P.enviarEmail === false ? '' : 'checked'} style="width:18px;height:18px">` +
      `Enviar o e-mail com o PDF ao cliente (${esc(para.join(', '))})</label></div>`;
  }
  function ligarCaixaEmail(raiz, P) {
    const cb = raiz.querySelector('[data-enviar-email]');
    if (cb) cb.onchange = () => { P.enviarEmail = cb.checked; };
  }

  async function prepararGmailSeNecessario(P) {
    const temEmail = querEmail(P);
    if (!temEmail || E.empresa.emailPeloServidor || (GM.token && Date.now() < GM.expira)) return true;
    try { await conectarGmail(false); return true; }
    catch (e) {
      return confirm('O Gmail não foi conectado (' + e.message + '). Enviar ao Bling mesmo assim, sem o e-mail ao cliente?');
    }
  }

  /* ---------------- PDF e e-mail pelo Gmail do vendedor ---------------- */
  const GM = { token: null, expira: 0 };

  function conectarGmail(forcar) {
    return new Promise((resolve, reject) => {
      if (!window.google || !google.accounts || !google.accounts.oauth2) { reject(new Error('O login do Google ainda não carregou. Tente de novo.')); return; }
      const cliente = google.accounts.oauth2.initTokenClient({
        client_id: C.GOOGLE_CLIENT_ID, scope: 'https://www.googleapis.com/auth/gmail.send',
        login_hint: E.usuario && E.usuario.email,
        callback: r => {
          if (r.error) { reject(new Error('O Gmail não foi conectado (' + r.error + ').')); return; }
          GM.token = r.access_token; GM.expira = Date.now() + ((Number(r.expires_in) || 3600) - 120) * 1000;
          resolve(GM.token);
        },
        error_callback: () => reject(new Error('A conexão com o Gmail foi cancelada.'))
      });
      cliente.requestAccessToken({ prompt: forcar ? 'consent' : '' });
    });
  }
  async function tokenGmail() { return (GM.token && Date.now() < GM.expira) ? GM.token : conectarGmail(false); }

  function b64utf8(texto) { return base64DeBytes(new TextEncoder().encode(texto)); }
  function quebrar76(b64) { return b64.replace(/.{1,76}/g, '$&\r\n'); }
  function htmlDoTexto(texto) {
    return texto.split(/\n\n+/).map(par => '<p>' + esc(par).replace(/\n/g, '<br>') + '</p>').join('');
  }

  function montarMime(o) {
    const lim1 = 'mix_' + Math.random().toString(36).slice(2), lim2 = 'rel_' + Math.random().toString(36).slice(2);
    const cab = (nome, v) => nome + ': ' + v + '\r\n';
    const enc = v => '=?UTF-8?B?' + b64utf8(v) + '?=';
    const html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">' +
      (o.logo ? '<p><img src="cid:logo_empresa" alt="" style="max-height:80px"></p>' : '') + htmlDoTexto(o.texto) + '</div>';
    let m = cab('To', o.para.join(', ')) + (o.cc.length ? cab('Cc', o.cc.join(', ')) : '') + cab('Subject', enc(o.assunto)) +
      cab('MIME-Version', '1.0') + cab('Content-Type', 'multipart/mixed; boundary="' + lim1 + '"') + '\r\n' +
      '--' + lim1 + '\r\n' + cab('Content-Type', 'multipart/related; boundary="' + lim2 + '"') + '\r\n' +
      '--' + lim2 + '\r\n' + cab('Content-Type', 'text/html; charset="UTF-8"') + cab('Content-Transfer-Encoding', 'base64') + '\r\n' +
      quebrar76(b64utf8(html)) + '\r\n';
    if (o.logo) {
      m += '--' + lim2 + '\r\n' + cab('Content-Type', 'image/png') + cab('Content-Transfer-Encoding', 'base64') +
        cab('Content-ID', '<logo_empresa>') + cab('Content-Disposition', 'inline; filename="logo.png"') + '\r\n' + quebrar76(o.logo) + '\r\n';
    }
    m += '--' + lim2 + '--\r\n';
    (o.anexos || [{ nome: o.nomeArquivo, base64: o.pdf }]).forEach(a => {
      m += '--' + lim1 + '\r\n' + cab('Content-Type', 'application/pdf; name="' + enc(a.nome) + '"') + cab('Content-Transfer-Encoding', 'base64') +
        cab('Content-Disposition', 'attachment; filename="' + enc(a.nome) + '"') + '\r\n' + quebrar76(a.base64) + '\r\n';
    });
    m += '--' + lim1 + '--';
    return btoa(m).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  async function enviarPeloGmail(o) {
    if (E.empresa.emailPeloServidor) {
      await chamar(E.empresa, 'enviarEmailEmpresa', { dados: { para: o.para, cc: o.cc, assunto: o.assunto, texto: o.texto, anexos: o.anexos, logo: o.logo } });
      return {};
    }
    const raw = montarMime(o);
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      const tok = tentativa === 1 ? await tokenGmail() : await conectarGmail(false);
      const resp = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw })
      });
      if (resp.ok) return resp.json();
      if (resp.status === 401 && tentativa === 1) { GM.token = null; continue; }
      let msg = 'O Gmail não enviou (código ' + resp.status + ').';
      try { const j = await resp.json(); if (j.error && j.error.message) msg += ' ' + j.error.message; } catch (e) { /* ignore */ }
      if (resp.status === 429 || /limit/i.test(msg)) msg = 'O limite diário de envio do seu Gmail foi atingido. Tente amanhã ou avise o Bernard.';
      throw new Error(msg);
    }
  }

  function baixarArquivo(base64, nome, tipo) {
    const bytes = Uint8Array.from(atob(base64), ch => ch.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
    const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  async function abrirEmail(id, k) {
    const corpo0 = abrirJanela('E-mail ao cliente', '<p class="cinza">Gerando o PDF do pedido…</p>');
    let doc;
    try { doc = await chamar(E.empresa, 'documentoEnvio', { id, entrega: k }); }
    catch (e) { corpo0.innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`; return; }
    const para = doc.para.map(e => ({ email: e, marcado: true }));
    const desenhar = () => {
      const corpo = abrirJanela('E-mail ao cliente — pedido nº ' + doc.numero, `
        <div class="campo"><label>Para</label><div class="emails" id="em-para">${para.map((e, i) =>
          `<label><input type="checkbox" data-i="${i}" ${e.marcado ? 'checked' : ''}> ${esc(e.email)}</label>`).join('') || '<span class="cinza">Nenhum e-mail cadastrado.</span>'}</div>
          <div style="display:flex;gap:6px;margin-top:6px"><input type="text" id="em-novo" placeholder="Acrescentar outro e-mail"><button class="secundario pequeno" id="em-add">Acrescentar</button></div></div>
        <div class="campo" style="margin-top:10px"><label>Cópia</label><div class="cinza">${doc.cc.map(esc).join(', ') || '—'}</div></div>
        <div class="campo" style="margin-top:10px"><label>Assunto</label><input type="text" id="em-assunto" value="${esc(doc.assunto)}"></div>
        <div class="campo" style="margin-top:10px"><label>Mensagem</label><textarea id="em-texto" style="min-height:190px">${esc(doc.texto)}</textarea></div>
        <div style="margin-top:10px">${doc.anexos.map((a, i) => `📎 <button class="link" data-anexo="${i}">${esc(a.nome)}</button>`).join('<br>')} <span class="cinza">(clique para baixar e conferir)</span></div>
        <div class="botoes" style="margin-top:14px"><button class="primario" id="em-enviar">${E.empresa.emailPeloServidor ? 'Enviar e-mail' : 'Enviar pelo meu Gmail'}</button><button class="secundario" id="em-fechar">Agora não</button></div>
        <p class="cinza" style="font-size:12px">${E.empresa.emailPeloServidor ? 'O e-mail sai pela conta da empresa (' + esc(E.empresa.emailRemetente || '') + ') e você recebe uma cópia.' : 'O e-mail sai da sua conta do Gmail e fica nos seus enviados. Na primeira vez, o Google pede para autorizar.'}</p>`);
      corpo.querySelectorAll('#em-para [data-i]').forEach(cb => cb.onchange = () => { para[+cb.dataset.i].marcado = cb.checked; });
      corpo.querySelectorAll('[data-anexo]').forEach(b => b.onclick = () => { const a = doc.anexos[+b.dataset.anexo]; baixarArquivo(a.base64, a.nome, 'application/pdf'); });
      corpo.querySelector('#em-fechar').onclick = fecharJanela;
      corpo.querySelector('#em-add').onclick = async () => {
        const v = corpo.querySelector('#em-novo').value.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { avisar('E-mail inválido.'); return; }
        doc.assunto = corpo.querySelector('#em-assunto').value; doc.texto = corpo.querySelector('#em-texto').value;
        if (!para.some(e => e.email === v)) para.push({ email: v, marcado: true });
        const gerente = E.usuario && E.usuario.papel === 'gerente';
        if (confirm('Salvar ' + v + ' no cadastro do cliente?' + (gerente ? '' : ' Vai como solicitação para o Bernard aprovar.'))) {
          chamar(E.empresa, 'solicitar', { tipo: 'e-mail', dados: { valor: v, idPedido: id } })
            .then(r => avisar(r.gravado ? 'E-mail salvo no cadastro do cliente.' : 'Solicitação enviada ao Bernard.'))
            .catch(e => avisar('Não consegui registrar a solicitação: ' + e.message, 6000));
        }
        desenhar();
      };
      corpo.querySelector('#em-enviar').onclick = async () => {
        const dest = para.filter(e => e.marcado).map(e => e.email);
        if (!dest.length) { avisar('Marque pelo menos um destinatário.'); return; }
        const b = corpo.querySelector('#em-enviar'); b.disabled = true; b.textContent = 'Enviando…';
        try {
          const r = await enviarPeloGmail({ para: dest, cc: doc.cc, assunto: corpo.querySelector('#em-assunto').value,
            texto: corpo.querySelector('#em-texto').value, anexos: doc.anexos, logo: doc.logoBase64 });
          chamar(E.empresa, 'registrarEmail', { id, entrega: k, dados: { para: dest, cc: doc.cc, idGmail: r && r.id } }).catch(() => {});
          fecharJanela(); avisar('E-mail enviado para ' + dest.join(', ') + '.', 5000);
        } catch (e) { avisar(e.message, 8000); b.disabled = false; b.textContent = E.empresa.emailPeloServidor ? 'Enviar e-mail' : 'Enviar pelo meu Gmail'; }
      };
    };
    desenhar();
  }

  async function baixarPdfEntrega(id, k) {
    try { const doc = await chamar(E.empresa, 'documentoEnvio', { id, entrega: k }); doc.anexos.forEach(x => baixarArquivo(x.base64, x.nome, 'application/pdf')); }
    catch (e) { avisar(e.message, 7000); }
  }

  function textoEmailConfirmacao(P) {
    const para = (P.emails || []).filter(e => e.marcado).map(e => e.email);
    if (para.length && P.enviarEmail === false) return '\n\nO e-mail ao cliente NÃO será enviado (opção desmarcada).';
    return para.length ? '\n\nO e-mail com o PDF vai automaticamente para: ' + para.join(', ') + '.' : '\n\nCliente sem e-mail cadastrado: o e-mail não será enviado.';
  }

  /* ---------------- envio ao Bling (completo ou parte) ---------------- */
  function abrirEnvio() {
    const P = E.pedido;
    const linhas = P.itens.filter(l => !l.riscado && (l.quantidade - (l.enviada || 0)) > 0.0001);
    if (!linhas.length) { avisar('Este pedido não tem nada pendente para enviar.'); abrirPedidos(); return; }
    E.envio = linhas.map(l => ({ l, marcado: true, q: arred(l.quantidade - (l.enviada || 0)) }));
    const c = P.cliente || {};
    $('#envio-cliente').innerHTML = `<strong>${esc(c.nomeCurto || c.nome || '')}</strong>` +
      `<span class="cinza"> · ${c.cnpj ? 'CNPJ ' + fmtCnpj(c.cnpj) + ' · ' : ''}${P.campos.numeroCliente ? 'OC ' + esc(P.campos.numeroCliente) + ' · ' : ''}${esc(P.id || '')}</span>` +
      (P.clienteBling && P.clienteBling.idBling ? '' : '<div class="aviso" style="margin-top:8px">O cliente não foi encontrado no cadastro do Bling. Sem o cadastro, o Bling não aceita o pedido: peça o cadastro ao Bernard.</div>');
    if (!P.venc) prepararVencimento(P);
    $('#envio-venc').innerHTML = htmlVencimento(P) + htmlCaixaEmail(P);
    ligarVencimento($('#envio-venc'), P);
    ligarCaixaEmail($('#envio-venc'), P);
    renderEnvio();
    mostrar('tela-envio');
  }

  function renderEnvio() {
    const tb = $('#envio-itens tbody');
    const pu = l => arred(l.preco * (1 - (l.desconto || 0) / 100));
    tb.innerHTML = E.envio.map((e, i) => {
      const l = e.l, pend = arred(l.quantidade - (l.enviada || 0));
      return `<tr data-i="${i}" class="${e.marcado ? '' : 'riscado'}">
        <td><input type="checkbox" data-marca ${e.marcado ? 'checked' : ''}></td>
        <td>${htmlProduto(l)}</td>
        <td class="num">${moeda(l.quantidade)}</td><td class="num">${moeda(l.enviada || 0)}</td><td class="num">${moeda(pend)}</td>
        <td><input class="num" data-q value="${moeda(e.q)}" ${e.marcado ? '' : 'disabled'}></td>
        <td class="num">R$ ${moeda(pu(l))}</td><td class="num total">R$ ${moeda(e.marcado ? e.q * pu(l) : 0)}</td></tr>`;
    }).join('');
    tb.querySelectorAll('[data-marca]').forEach(cb => cb.onchange = () => { E.envio[+cb.closest('tr').dataset.i].marcado = cb.checked; renderEnvio(); });
    tb.querySelectorAll('[data-q]').forEach(inp => {
      inp.oninput = () => {
        const e = E.envio[+inp.closest('tr').dataset.i];
        e.q = lerNumero(inp.value);
        inp.closest('tr').querySelector('.total').textContent = 'R$ ' + moeda(e.q * pu(e.l));
        resumoEnvio();
      };
      inp.onblur = () => { inp.value = moeda(lerNumero(inp.value)); };
    });
    resumoEnvio();
  }

  function resumoEnvio() {
    const pu = l => arred(l.preco * (1 - (l.desconto || 0) / 100));
    let agora = 0, fica = 0, n = 0;
    E.envio.forEach(e => {
      const pend = e.l.quantidade - (e.l.enviada || 0);
      const q = e.marcado ? Math.min(e.q, pend) : 0;
      if (q > 0) n++;
      agora += q * pu(e.l); fica += (pend - q) * pu(e.l);
    });
    $('#envio-resumo').innerHTML = `<div class="total"><span>Vai para o Bling agora</span><strong>R$ ${moeda(agora)}</strong></div>` +
      `<div><span>Itens</span><strong>${n}</strong></div><div><span>Fica pendente no pedido</span><strong>R$ ${moeda(fica)}</strong></div>`;
    $('#envio-enviar').disabled = n === 0;
    $('#envio-enviar').textContent = n ? `Enviar ${n} item(ns) ao Bling` : 'Enviar ao Bling';
  }

  async function enviarAoBling() {
    const P = E.pedido;
    const itens = [];
    for (const e of E.envio) {
      if (!e.marcado || !(e.q > 0)) continue;
      const pend = arred(e.l.quantidade - (e.l.enviada || 0));
      if (e.q > pend + 0.0001) { avisar('A quantidade a enviar é maior que o pendente em: ' + (e.l.produto ? e.l.produto[2] : e.l.original.descricao), 7000); return; }
      itens.push({ id: e.l.id, quantidade: e.q });
    }
    if (!itens.length) { avisar('Marque pelo menos um item.'); return; }
    if (!P.venc || !P.venc.escolhido) { avisar('Informe o vencimento.'); return; }
    if (!(await prepararGmailSeNecessario(P))) return;
    const semCadastro = E.envio.filter(e => e.marcado && e.l.itemNovo).length;
    const total = $('#envio-resumo .total strong').textContent;
    if (!confirm(`Enviar ao Bling ${itens.length} item(ns), total ${total}, vencimento ${dataBR(P.venc.escolhido)}?` +
      (semCadastro ? `\n\nAtenção: ${semCadastro} item(ns) com cadastro pendente.` : '') +
      '\n\nO que não for enviado fica pendente no pedido.' + textoEmailConfirmacao(P))) return;
    const b = $('#envio-enviar'); b.disabled = true; b.textContent = 'Enviando…';
    try {
      const r = await chamar(E.empresa, 'enviarBling', { id: P.id, itens, vencimento: vencimentoParaEnvio(P) });
      E.listaDesatualizada = true;
      const p = r.pedido;
      telaSucessoEnvio(r, querEmail(P));
      E.pedido = null;
    } catch (e) {
      avisar(e.message, 9000);
      b.disabled = false; resumoEnvio();
    }
  }

  /* ---------------- aba Pedidos ---------------- */
  const FILTRO_PADRAO = { situacao: 'pendentes', de: '', ate: '', cliente: '', min: '', max: '', ordem: 'espera' };
  E.filtro = Object.assign({}, FILTRO_PADRAO);

  async function abrirPedidos() {
    E.pedido = null;
    mostrar('tela-pedidos');
    $('#ped-lista').innerHTML = '<p class="cinza">Carregando pedidos…</p>';
    try {
      const j = await chamar(E.empresa, 'listarPedidos');
      E.lista = j.pedidos || []; E.veTodos = j.veTodos; E.listaDesatualizada = false;
      renderPedidos();
    } catch (e) {
      $('#ped-lista').innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`;
    }
  }

  function diasDesde(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    if (!m) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(+m[1], +m[2] - 1, +m[3]).getTime()) / 86400000));
  }

  function renderPedidos() {
    const f = E.filtro;
    const pendentes = ['Aguardando envio', 'Saldo a emitir', 'Saldo editado'];
    let lista = (E.lista || []).filter(p => {
      const sit = p['Situação'];
      if (f.situacao === 'pendentes' && pendentes.indexOf(sit) < 0) return false;
      if (f.situacao !== 'pendentes' && f.situacao !== 'todas' && sit !== f.situacao) return false;
      const dia = String(p['Criado em'] || '').slice(0, 10);
      if (f.de && dia < f.de) return false;
      if (f.ate && dia > f.ate) return false;
      if (f.cliente) {
        const alvo = Busca.normalizar(p['Cliente'] + ' ' + p['CNPJ'] + ' ' + p['Nº do pedido'] + ' ' + p['Nº OC do cliente']);
        if (Busca.normalizar(f.cliente).split(' ').some(t => alvo.indexOf(t) < 0)) return false;
      }
      const tot = Number(p['Total do pedido']) || 0;
      if (f.min !== '' && tot < lerNumero(f.min)) return false;
      if (f.max !== '' && tot > lerNumero(f.max)) return false;
      return true;
    });
    const ord = {
      espera: (a, b) => String(a['Criado em']).localeCompare(String(b['Criado em'])),
      recentes: (a, b) => String(b['Criado em']).localeCompare(String(a['Criado em'])),
      maior: (a, b) => (Number(b['Total do pedido']) || 0) - (Number(a['Total do pedido']) || 0),
      menor: (a, b) => (Number(a['Total do pedido']) || 0) - (Number(b['Total do pedido']) || 0)
    }[f.ordem];
    lista.sort(ord);
    const somaPend = lista.reduce((s, p) => s + (Number(p['Pendente']) || 0), 0);
    $('#ped-resumo').textContent = `${lista.length} pedido(s) · pendente R$ ${moeda(somaPend)}`;
    if (!lista.length) { $('#ped-lista').innerHTML = '<p class="cinza">Nenhum pedido com esses filtros.</p>'; return; }
    const etiq = s => ({ 'Aguardando envio': 'amarela', 'Saldo a emitir': 'amarela', 'Saldo editado': 'amarela', 'Cancelado': 'vermelha' }[s] || '');
    $('#ped-lista').innerHTML = `<div class="rolagem"><table class="grade"><thead><tr><th>Nº</th><th>Criado em</th><th>Cliente</th><th>OC do cliente</th>
      ${E.veTodos ? '<th>Vendedor</th>' : ''}<th>Total</th><th>Pendente</th><th>Situação</th><th>Espera</th><th>Bling</th><th></th></tr></thead><tbody>` +
      lista.map(p => {
        const sit = p['Situação'], pend = Number(p['Pendente']) || 0;
        const aberto = pendentes.indexOf(sit) >= 0;
        return `<tr data-id="${esc(p['ID'])}">
          <td><strong>${esc(p['Nº do pedido'])}</strong></td><td>${fmtData(p['Criado em'])}</td><td><strong>${esc(p['Cliente'])}</strong><div class="cinza" style="font-size:12px">${fmtCnpj(p['CNPJ'])}</div></td>
          <td>${esc(p['Nº OC do cliente'])}</td>${E.veTodos ? `<td>${esc(p['Vendedor'])}</td>` : ''}
          <td class="num">R$ ${moeda(p['Total do pedido'])}</td><td class="num">R$ ${moeda(pend)}</td>
          <td><span class="etiqueta ${etiq(sit)}">${esc(sit)}</span></td>
          <td>${aberto ? diasDesde(p['Criado em']) + ' dia(s)' : '—'}</td><td>${esc(p['Pedidos no Bling'] || '')}</td>
          <td style="white-space:nowrap">${aberto ? '<button class="primario pequeno" data-acao="enviar">Enviar</button> <button class="secundario pequeno" data-acao="abrir">Abrir / editar</button> <button class="link" data-acao="cancelar">Cancelar</button>'
                                               : '<button class="secundario pequeno" data-acao="abrir">Ver</button>'}${p['Pedidos no Bling'] ? ' <button class="secundario pequeno" data-acao="logistica">Logística</button>' : ''}</td></tr>`;
      }).join('') + '</tbody></table></div>';
    $('#ped-lista').querySelectorAll('[data-acao]').forEach(b => b.onclick = () => acaoPedido(b.closest('tr').dataset.id, b.dataset.acao));
  }

  async function acaoPedido(id, acao) {
    if (acao === 'cancelar') {
      const motivo = prompt('Cancelar o que está pendente neste pedido? Escreva o motivo (opcional):', '');
      if (motivo === null) return;
      try { await chamar(E.empresa, 'cancelarPedido', { id, motivo }); avisar('Pedido cancelado.'); abrirPedidos(); }
      catch (e) { avisar(e.message, 7000); }
      return;
    }
    try {
      const j = await chamar(E.empresa, 'abrirPedido', { id });
      if (acao === 'logistica') { abrirLogistica(j.pedido); return; }
      carregarPedidoSalvo(j.pedido);
      if (acao === 'enviar') abrirEnvio();
      else abrirConferencia();
    } catch (e) { avisar(e.message, 7000); }
  }

  function prepararPedidos() {
    const f = E.filtro;
    const campos = { 'ped-situacao': 'situacao', 'ped-de': 'de', 'ped-ate': 'ate', 'ped-cliente': 'cliente',
                     'ped-min': 'min', 'ped-max': 'max', 'ped-ordem': 'ordem' };
    Object.keys(campos).forEach(idc => {
      const el = document.getElementById(idc);
      el.value = f[campos[idc]];
      el.oninput = el.onchange = () => { f[campos[idc]] = el.value; renderPedidos(); };
    });
    $('#ped-limpar').onclick = () => { Object.assign(f, FILTRO_PADRAO); prepararPedidos(); renderPedidos(); };
    $('#ped-atualizar').onclick = abrirPedidos;
    $('#envio-voltar').onclick = () => abrirPedidos();
    $('#envio-enviar').onclick = enviarAoBling;
    $('#envio-todos').onclick = () => { E.envio.forEach(e => { e.marcado = true; e.q = arred(e.l.quantidade - (e.l.enviada || 0)); }); renderEnvio(); };
  }

  /* ---------------- criar no app ---------------- */
  const G = { linhas: [], cliente: null };

  function abrirCriar() {
    G.linhas = []; G.cliente = null;
    for (let i = 0; i < 5; i++) G.linhas.push({ descricao: '', produto: null, nota: 0, quantidade: 0, preco: 0 });
    renderClienteCriar();
    renderGrade();
    mostrar('tela-criar');
  }

  function renderClienteCriar() {
    const alvo = $('#criar-cliente');
    if (G.cliente) {
      alvo.innerHTML = `<div class="cliente-escolhido"><div><div class="nome">${esc(G.cliente[1])}${G.cliente.novo ? ' <span class="etiqueta amarela">Cliente novo</span>' : ''}</div>` +
        `<div class="cinza">${esc(G.cliente[2])}${G.cliente[0] ? ' · CNPJ ' + fmtCnpj(G.cliente[0]) : ''}</div></div>` +
        `<button class="secundario pequeno" id="cc-trocar">Trocar cliente</button></div>`;
      $('#cc-trocar').onclick = () => { G.cliente = null; renderClienteCriar(); };
    } else {
      montarBuscaCliente(alvo, [], (reg, novo) => { G.cliente = reg; if (novo) G.cliente.novo = true; renderClienteCriar(); }, true);
    }
  }

  function renderGrade() {
    const tb = $('#grade-criar tbody');
    tb.innerHTML = G.linhas.map((l, i) => `<tr data-i="${i}">
      <td>${i + 1}</td>
      <td><div class="auto"><input type="text" data-campo="descricao" value="${esc(l.produto ? l.produto[2] : l.descricao)}" placeholder="Digite a descrição">` +
      `<button class="seta" data-acao="seta" title="Ver lista">▾</button></div>` +
      `${l.itemNovo ? '<span class="etiqueta amarela">Item novo: cadastro pendente</span>' : ''}${l.produto ? `<div class="cinza" style="font-size:12px">Cód. ${esc(l.produto[1])} · ${esc(l.produto[3])}</div>` : ''}</td>
      <td><input class="num" data-campo="quantidade" value="${l.quantidade ? moeda(l.quantidade) : ''}"></td>
      <td><input class="num" data-campo="preco" value="${l.preco ? moeda(l.preco) : ''}"></td>
      <td class="num total">R$ ${moeda(l.quantidade * l.preco)}</td>
      <td><button class="link" data-acao="remover" title="Remover linha">✕</button></td></tr>`).join('');
    tb.querySelectorAll('tr').forEach(tr => ligarLinhaGrade(tr));
  }

  function ligarLinhaGrade(tr) {
    const i = +tr.dataset.i, l = G.linhas[i];
    const desc = tr.querySelector('[data-campo=descricao]');
    const cel = desc.closest('td');
    let lista = null, mostrando = 3, foco = -1, resultados = [];
    const fechar = () => { if (lista) { lista.remove(); lista = null; } };
    const abrir = completa => {
      clearTimeout(desc._fechaT);
      fechar();
      const t = desc.value.trim();
      if (!t) return;
      resultados = Busca.buscar(E.dados[E.empresa.id].indProd, t, 8);
      mostrando = completa ? Math.max(mostrando, 3) : 3;
      lista = document.createElement('div');
      lista.className = 'lista-opcoes';
      const desenhar = () => {
        const vis = resultados.slice(0, mostrando);
        lista.innerHTML = htmlOpcoes(vis) +
          (completa && mostrando < resultados.length ? '<div class="opcao-acao" data-mais>Ver mais 5 opções</div>' : '') +
          (completa ? '<div class="opcao-acao" data-novo>+ Criar item novo com esta descrição</div>' : '');
        lista.querySelectorAll('[data-i]').forEach(o => o.onmousedown = ev => { ev.preventDefault(); escolher(vis[+o.dataset.i]); });
        const mais = lista.querySelector('[data-mais]');
        if (mais) mais.onmousedown = ev => { ev.preventDefault(); mostrando = 8; desenhar(); };
        const novo = lista.querySelector('[data-novo]');
        if (novo) novo.onmousedown = ev => {
          ev.preventDefault(); fechar();
          const tmp = { original: { descricao: desc.value.trim() } };
          abrirItemNovo(tmp, () => { l.itemNovo = tmp.itemNovo; l.descricao = tmp.itemNovo.descricao; l.produto = null; renderGrade(); });
        };
      };
      desenhar();
      cel.appendChild(lista);
    };
    const escolher = r => {
      l.produto = r.produto; l.nota = r.nota; l.itemNovo = null; l.descricao = r.produto[2];
      if (!l.preco) l.preco = r.produto[4] || 0;
      fechar(); renderGrade();
      const prox = document.querySelector(`#grade-criar tr[data-i="${i}"] [data-campo=quantidade]`);
      if (prox) prox.focus();
    };
    desc.oninput = () => { l.descricao = desc.value; l.produto = null; l.itemNovo = null; clearTimeout(desc._t); desc._t = setTimeout(() => abrir(false), 150); };
    desc.onblur = () => { desc._fechaT = setTimeout(fechar, 150); };
    desc.onkeydown = ev => {
      if (!lista) return;
      const itens = lista.querySelectorAll('[data-i]');
      if (ev.key === 'ArrowDown') { foco = Math.min(itens.length - 1, foco + 1); }
      else if (ev.key === 'ArrowUp') { foco = Math.max(0, foco - 1); }
      else if (ev.key === 'Enter' && foco >= 0) { ev.preventDefault(); escolher(resultados[foco]); return; }
      else if (ev.key === 'Escape') { fechar(); return; }
      else return;
      ev.preventDefault();
      itens.forEach((o, k) => o.classList.toggle('foco', k === foco));
    };
    const seta = tr.querySelector('[data-acao=seta]');
    seta.onmousedown = ev => ev.preventDefault();
    seta.onclick = () => { desc.focus(); abrir(true); };
    tr.querySelectorAll('input.num').forEach(inp => {
      inp.oninput = () => { l[inp.dataset.campo] = lerNumero(inp.value); tr.querySelector('.total').textContent = 'R$ ' + moeda(l.quantidade * l.preco); };
      inp.onblur = () => { if (inp.value) inp.value = moeda(lerNumero(inp.value)); };
    });
    tr.querySelector('[data-acao=remover]').onclick = () => { G.linhas.splice(i, 1); if (!G.linhas.length) G.linhas.push({ descricao: '', produto: null, nota: 0, quantidade: 0, preco: 0 }); renderGrade(); };
  }

  // Colar linhas copiadas do Excel: descrição, quantidade, preço (em qualquer ordem de colunas)
  function colarNaGrade(ev) {
    const texto = (ev.clipboardData || window.clipboardData).getData('text');
    if (!texto || (texto.indexOf('\t') < 0 && texto.indexOf('\n') < 0)) return; // colagem simples: deixa o campo cuidar
    ev.preventDefault();
    const tr = ev.target.closest('tr');
    let inicio = tr ? +tr.dataset.i : G.linhas.length;
    const ind = E.dados[E.empresa.id].indProd;
    texto.replace(/\r/g, '').split('\n').filter(x => x.trim()).forEach(lin => {
      const cel = lin.split('\t').map(c => c.trim());
      const ehNum = c => /^[R$\s]*-?[\d.,]+$/.test(c) && /\d/.test(c);
      const textos = cel.filter(c => c && !ehNum(c));
      const nums = cel.filter(ehNum).map(lerNumero);
      const descricao = textos.sort((a, b) => b.length - a.length)[0] || '';
      if (!descricao) return;
      const r = Busca.buscar(ind, descricao, 1)[0];
      const linha = { descricao, produto: r ? r.produto : null, nota: r ? r.nota : 0, colado: true,
                      quantidade: nums[0] || 0, preco: nums.length > 1 ? nums[1] : (r ? r.produto[4] : 0) };
      if (inicio < G.linhas.length && !G.linhas[inicio].descricao && !G.linhas[inicio].produto) G.linhas[inicio] = linha;
      else G.linhas.splice(inicio, 0, linha);
      inicio++;
    });
    renderGrade();
    avisar('Linhas coladas. Confira o produto sugerido em cada linha.');
  }

  function conferirCriado() {
    const linhas = G.linhas.filter(l => (l.descricao || l.produto || l.itemNovo));
    if (!G.cliente) { avisar('Escolha o cliente.'); return; }
    if (!linhas.length) { avisar('Inclua pelo menos um item.'); return; }
    const itens = linhas.map((l, i) => {
      const original = { codigo: '', descricao: l.descricao || (l.produto && l.produto[2]) || '', unidade: l.produto ? l.produto[3] : '',
                         quantidade: l.quantidade, preco: l.preco, total: l.quantidade * l.preco, obs: '' };
      const n = novaLinha('c' + i, original, l.quantidade, l.preco, 0);
      if (l.produto) { n.produto = l.produto; n.nota = l.nota; n.escolhaManual = !l.colado; }
      if (l.itemNovo) { n.itemNovo = l.itemNovo; n.produto = null; n.escolhaManual = true; }
      return n;
    });
    E.arquivo = null; E.docTexto = null;
    if (E.docUrl) { URL.revokeObjectURL(E.docUrl); E.docUrl = null; }
    E.pedido = {
      origem: 'app', arquivoNome: '', leitor: null, documento: null, itens, ignorados: [], avisos: [],
      cliente: null, clienteBling: null, clienteDoc: { nome: '', cnpj: '' }, emails: [], emailsExtras: [],
      campos: { numeroCliente: '', data: '', comprador: '', solicitante: '', unidade: '', enderecoEntrega: '', enderecoDoc: '',
                condicaoPagamento: '', prazoEntrega: '', tipoFrete: '', frete: 0, observacoes: '' }
    };
    escolherCliente(G.cliente, G.cliente.novo ? 'novo' : 'escolhido');
    if (G.cliente.novo) E.pedido.cliente.novo = true;
    perguntarModo();
  }

  /* ---------------- logística: mensagem pronta para o grupo do WhatsApp ---------------- */
  function enderecoDoPedido(p) {
    return ((p.campos && p.campos.enderecoEntrega) || (p.clienteBling && p.clienteBling.endereco) || '').trim();
  }
  function linkMapa(L) {
    const q = L.lat != null ? `${L.lat.toFixed(6)},${L.lng.toFixed(6)}` : L.endereco;
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }
  function fmtQtd(q) { return (Number(q) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 }); }

  function textoLogistica(p, k, L, modelo) {
    const env = p.envios[k], c = p.cliente || {}, campos = p.campos || {};
    const unid = id => { const it = (p.itens || []).filter(x => x.id === id)[0]; return (it && ((it.produto && it.produto[3]) || (it.original && it.original.unidade))) || 'UN'; };
    const itens = (env.itens || []).map(i => ({ q: fmtQtd(i.quantidade), un: i.unidade || unid(i.id), d: String(i.descricao || '').trim() }));
    const cliente = c.nomeCurto || c.nome || '';
    const emp = E.empresa.curto, oc = campos.numeroCliente || '', quem = campos.comprador || '';
    const vend = env.vendedor || (p.criadoPor || {}).nome || '';
    const carga = L.cargaPesada ? 'Sim' : 'Não', veic = L.veiculo, link = linkMapa(L);
    const parcial = (p.envios.length > 1 || p.totalPendente > 0.004) ? ` · entrega ${k + 1}` : '';
    if (modelo === 2) {
      return [`🚚 Pedido ${p.numero} · ${emp}${parcial}`, `👤 ${cliente}`, `📍 ${L.endereco}`, `🗺️ ${link}`,
        `⚖️ Carga pesada: ${carga} · ${veic === 'Moto' ? '🏍️' : '🚗'} ${veic}`,
        `📦 ${itens.map(i => `${i.q} ${i.d}`).join(' · ')}`,
        `✍️ ${[quem ? 'Recebe: ' + quem : '', oc ? 'OC ' + oc : '', 'Vend.: ' + vend].filter(Boolean).join(' · ')}`].join('\n');
    }
    if (modelo === 3) {
      return [`*NOVA ENTREGA* 🚚`, `Pedido: ${p.numero} (${emp})${oc ? ' · OC ' + oc : ''}${parcial}`, '',
        `1️⃣ *Onde:* ${cliente}`, L.endereco, `Mapa: ${link}`, '',
        `2️⃣ *Como:* ${veic} · Carga pesada: ${carga}`, '',
        `3️⃣ *O quê:* ${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`, ...itens.map(i => `☐ ${i.q} ${i.un} – ${i.d}`), '',
        `4️⃣ *Quem recebe:* ${quem || '—'}`, `Vendedor: ${vend}`].join('\n');
    }
    return [`🚚 *ENTREGA – Pedido nº ${p.numero} – ${emp}*${parcial}`, '',
      `*Cliente:* ${cliente}`, `*Endereço:* ${L.endereco}`, `📍 *Localização:* ${link}`, '',
      `*Carga pesada:* ${carga}`, `*Veículo:* ${veic}`, '',
      `*Itens:*`, ...itens.map(i => `• ${i.q} ${i.un} – ${i.d}`), '',
      [quem ? `*Recebe:* ${quem}` : '', oc ? `*OC:* ${oc}` : ''].filter(Boolean).join(' · '), `*Vendedor:* ${vend}`].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
  }

  function carregarLeaflet() {
    if (window.L && window.L.map) return Promise.resolve();
    if (carregarLeaflet.p) return carregarLeaflet.p;
    carregarLeaflet.p = new Promise((ok, erro) => {
      const css = document.createElement('link'); css.rel = 'stylesheet';
      css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'; document.head.appendChild(css);
      const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      s.onload = ok; s.onerror = () => { carregarLeaflet.p = null; erro(new Error('Não consegui abrir o mapa. Verifique a internet.')); };
      document.head.appendChild(s);
    });
    return carregarLeaflet.p;
  }
  async function geocodificar(endereco) {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=' + encodeURIComponent(endereco));
    const j = await r.json(); return j && j[0] ? { lat: +j[0].lat, lng: +j[0].lon } : null;
  }
  async function enderecoDoPonto(lat, lng) {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&lat=${lat}&lon=${lng}`);
    const j = await r.json(), a = (j && j.address) || {};
    return [[a.road, a.house_number].filter(Boolean).join(', '), a.suburb || a.neighbourhood, [a.city || a.town, a.state_code || 'BA'].filter(Boolean).join('/')]
      .filter(Boolean).join(' – ') || (j && j.display_name) || '';
  }

  // Passo 1: confirma o endereço ou altera (mapa) · Passo 2: carga pesada e veículo · Passo 3: abre o WhatsApp
  function abrirLogistica(p, k) {
    if (!p.envios || !p.envios.length) { avisar('Este pedido ainda não foi enviado ao Bling.'); return; }
    if (k == null) k = p.envios.length - 1;
    const L = { endereco: enderecoDoPedido(p), lat: null, lng: null, alterado: false, cargaPesada: null, veiculo: '' };
    const escolherEntrega = p.envios.length > 1
      ? `<div class="campo"><label>Entrega</label><select id="lg-entrega">${p.envios.map((e, i) => `<option value="${i}" ${i === k ? 'selected' : ''}>Entrega ${i + 1} · ${fmtData(e.data)} · proposta ${esc(e.numeroBling || e.idBling)}</option>`).join('')}</select></div>` : '';
    const passo1 = () => {
      const corpo = abrirJanela('Logística — pedido nº ' + p.numero, `${escolherEntrega}
        <p style="margin-top:8px">Endereço de entrega:</p><p><strong>${esc(L.endereco || 'sem endereço no pedido')}</strong></p>
        <p>Confirma o endereço?</p>
        <div class="botoes"><button class="primario" id="lg-confirma" ${L.endereco ? '' : 'disabled'}>Confirmar endereço</button><button class="secundario" id="lg-altera">Alterar</button></div>`);
      const sel = corpo.querySelector('#lg-entrega'); if (sel) sel.onchange = () => { k = +sel.value; };
      corpo.querySelector('#lg-confirma').onclick = passo2;
      corpo.querySelector('#lg-altera').onclick = alterar;
    };
    const alterar = async () => {
      const corpo = abrirJanela('Alterar o local de entrega', `
        <div style="display:flex;gap:6px"><input type="text" id="lg-texto" value="${esc(L.endereco)}" placeholder="Escreva o endereço"><button class="secundario" id="lg-buscar">Buscar no mapa</button></div>
        <div id="lg-mapa" style="height:340px;margin-top:8px;border-radius:8px;border:1px solid var(--linha)"></div>
        <p class="cinza" style="font-size:12px">Arraste o marcador até o local certo. Use + e − (ou a roda do mouse) para aproximar ou afastar.</p>
        <div class="botoes"><button class="primario" id="lg-usar">Usar este local</button><button class="secundario" id="lg-voltar">Voltar</button></div>`);
      corpo.querySelector('#lg-voltar').onclick = passo1;
      try { await carregarLeaflet(); } catch (e) { corpo.querySelector('#lg-mapa').innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`; }
      let mapa = null, marca = null;
      const texto = corpo.querySelector('#lg-texto');
      const posicionar = (lat, lng, zoom) => {
        if (!window.L) return;
        if (!mapa) {
          mapa = window.L.map(corpo.querySelector('#lg-mapa')).setView([lat, lng], zoom || 16);
          window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa);
          marca = window.L.marker([lat, lng], { draggable: true }).addTo(mapa);
          marca.on('dragend', async () => {
            const g = marca.getLatLng(); L.lat = g.lat; L.lng = g.lng;
            try { const t = await enderecoDoPonto(g.lat, g.lng); if (t) texto.value = t; } catch (e) { /* fica o texto */ }
          });
        } else { mapa.setView([lat, lng], zoom || 16); marca.setLatLng([lat, lng]); }
        L.lat = lat; L.lng = lng;
      };
      const buscar = async () => {
        try { const g = await geocodificar(texto.value); if (g) posicionar(g.lat, g.lng); else avisar('Endereço não encontrado no mapa. Arraste o marcador.'); }
        catch (e) { avisar('Não consegui buscar no mapa agora.'); }
      };
      corpo.querySelector('#lg-buscar').onclick = buscar;
      posicionar(-12.9714, -38.5014, 12);              // Salvador
      if (texto.value.trim()) buscar();
      corpo.querySelector('#lg-usar').onclick = () => {
        if (!texto.value.trim()) { avisar('Escreva o endereço.'); return; }
        L.endereco = texto.value.trim(); L.alterado = true; passo2();
      };
    };
    const passo2 = () => {
      const corpo = abrirJanela('Logística — pedido nº ' + p.numero, `
        <p><strong>${esc(L.endereco)}</strong>${L.alterado ? ' <span class="etiqueta amarela">local alterado</span>' : ''}</p>
        <div class="campo"><label>Carga pesada?</label><div class="escolha" data-grupo="carga"><button data-v="sim">Sim</button><button data-v="nao">Não</button></div></div>
        <div class="campo" style="margin-top:10px"><label>Veículo</label><div class="escolha" data-grupo="veiculo"><button data-v="Moto">Moto</button><button data-v="Carro">Carro</button></div></div>
        <div class="campo" style="margin-top:10px"><label>Mensagem (pode ajustar)</label><textarea id="lg-msg" style="min-height:240px"></textarea></div>
        <div class="botoes" style="margin-top:12px"><button class="primario" id="lg-whats">Abrir no WhatsApp</button><button class="secundario" id="lg-voltar2">Voltar</button></div>
        <p class="cinza" style="font-size:12px">O WhatsApp Web abre com a mensagem pronta: é só escolher o grupo de logística e enviar.</p>`);
      const msg = corpo.querySelector('#lg-msg');
      const atualizar = () => {
        corpo.querySelectorAll('.escolha button').forEach(b => {
          const g = b.parentNode.dataset.grupo;
          b.classList.toggle('marcado', g === 'carga' ? (L.cargaPesada === (b.dataset.v === 'sim')) : L.veiculo === b.dataset.v);
        });
        if (L.cargaPesada !== null && L.veiculo) msg.value = textoLogistica(p, k, L, Number(C.MODELO_LOGISTICA) || 1);
      };
      corpo.querySelectorAll('.escolha button').forEach(b => b.onclick = () => {
        if (b.parentNode.dataset.grupo === 'carga') L.cargaPesada = b.dataset.v === 'sim'; else L.veiculo = b.dataset.v;
        atualizar();
      });
      corpo.querySelector('#lg-voltar2').onclick = passo1;
      corpo.querySelector('#lg-whats').onclick = () => {
        if (L.cargaPesada === null || !L.veiculo) { avisar('Marque carga pesada (sim ou não) e o veículo (moto ou carro).'); return; }
        const t = msg.value.trim();
        try { navigator.clipboard && navigator.clipboard.writeText(t).catch(() => {}); } catch (e) { /* só reforço */ }
        window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(t), '_blank');
        chamar(E.empresa, 'registrarLogistica', { id: p.id, entrega: k, dados: { endereco: L.endereco, link: linkMapa(L),
          cargaPesada: L.cargaPesada, veiculo: L.veiculo, alterado: L.alterado } }).catch(() => {});
        fecharJanela(); avisar('WhatsApp aberto: escolha o grupo de logística e envie.', 6000);
      };
      atualizar();
    };
    passo1();
  }

  /* ---------------- solicitações (só o Bernard): o que é, quem pede, Aceitar ou Recusar ---------------- */
  const NOME_TIPO = { 'e-mail': 'E-mail novo do cliente', 'cliente novo': 'Cliente novo', 'item novo': 'Item novo (sem cadastro)' };

  async function buscarSolicitacoes() {
    const res = await Promise.all(E.liberadas.map(emp => chamar(emp, 'listarSolicitacoes')
      .then(j => (j.solicitacoes || []).map(s => Object.assign(s, { emp })))
      .catch(() => [])));
    return [].concat.apply([], res).sort((a, b) => String(a.data).localeCompare(String(b.data)));
  }
  function mostrarContador(n) {
    const el = $('#nav-solic-n'); el.textContent = n; el.classList.toggle('escondido', !n);
  }
  async function contarSolicitacoes() {
    try { mostrarContador((await buscarSolicitacoes()).length); } catch (e) { /* sem contador */ }
  }

  async function abrirSolicitacoes() {
    E.pedido = null;
    mostrar('tela-solic');
    $('#solic-lista').innerHTML = '<p class="cinza">Carregando…</p>';
    E.solic = await buscarSolicitacoes();
    renderSolicitacoes();
  }

  function renderSolicitacoes() {
    const lista = E.solic || [];
    mostrarContador(lista.length);
    if (!lista.length) { $('#solic-lista').innerHTML = '<p class="cinza">Nenhuma solicitação pendente.</p>'; return; }
    const duas = E.liberadas.length > 1;
    $('#solic-lista').innerHTML = lista.map((s, i) => {
      const cli = s.cliente ? ` · cliente ${esc(s.cliente)}` : '';
      const ref = s.tipo === 'item novo' && s.extra && Array.isArray(s.extra.referencia)
        ? `<div class="quem">Parecido com: <strong>${esc(s.extra.referencia[2])}</strong> · cód. ${esc(s.extra.referencia[1])}</div>` : '';
      return `<div class="solic"><div>
        <div class="o-que"><strong>${esc(NOME_TIPO[s.tipo] || s.tipo)}:</strong> ${esc(s.valor)}${s.tipo !== 'cliente novo' ? cli : (s.cnpj ? ' · CNPJ ' + esc(fmtCnpj(s.cnpj)) : '')}${s.numero ? ' · pedido nº ' + esc(s.numero) : ''}</div>
        ${ref}<div class="quem">Pedido por <strong>${esc(s.vendedor)}</strong>${duas ? ' · ' + esc(s.emp.curto) : ''} · ${esc(fmtData(s.data))}</div>
      </div><div class="botoes"><button class="primario" data-aceitar="${i}">Aceitar</button><button class="secundario" data-recusar="${i}">Recusar</button></div></div>`;
    }).join('');
    $('#solic-lista').querySelectorAll('[data-aceitar]').forEach(b => b.onclick = () => aceitarSolicitacao(lista[+b.dataset.aceitar], b));
    $('#solic-lista').querySelectorAll('[data-recusar]').forEach(b => b.onclick = () => {
      if (confirm('Recusar esta solicitação?')) responderSolicitacao(lista[+b.dataset.recusar], false, null, b);
    });
  }

  async function responderSolicitacao(s, aceitar, produto, botao) {
    if (botao) botao.disabled = true;
    try {
      await chamar(s.emp, 'responderSolicitacao', { id: s.id, aceitar, produto });
      E.solic = E.solic.filter(x => x !== s);
      if (aceitar && s.tipo === 'e-mail') recarregarDados(s.emp);   // recarrega os e-mails do cliente
      renderSolicitacoes();
      avisar(aceitar ? 'Solicitação aceita.' : 'Solicitação recusada.');
    } catch (e) { if (botao) botao.disabled = false; avisar(e.message, 7000); }
  }

  async function aceitarSolicitacao(s, botao) {
    if (s.tipo === 'cliente novo') return cadastrarClienteNoPainel(s, botao);
    if (s.tipo === 'item novo') return cadastrarItemNoPainel(s, botao);
    responderSolicitacao(s, true, null, botao);
  }

  function campoForm(id, rotulo, valor, opc) {
    opc = opc || {};
    return `<div class="campo ${opc.largo ? 'largo' : ''}"><label>${rotulo}</label>` +
      (opc.opcoes ? `<select data-f="${id}">${opc.opcoes.map(o => `<option value="${esc(o[0])}" ${String(o[0]) === String(valor) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`
                  : `<input type="text" data-f="${id}" value="${esc(valor == null ? '' : valor)}" ${opc.lista ? `list="${opc.lista}"` : ''}>`) + '</div>';
  }
  function lerForm(corpo) { const o = {}; corpo.querySelectorAll('[data-f]').forEach(el => { o[el.dataset.f] = el.value.trim(); }); return o; }
  function porForm(corpo, dados) {
    Object.keys(dados).forEach(k => { const el = corpo.querySelector(`[data-f="${k}"]`); if (el && dados[k] !== '' && dados[k] != null) el.value = dados[k]; });
  }

  // Cliente novo: formulário preenchido com o pedido + consulta na Receita → "Cadastrar no Bling"
  function cadastrarClienteNoPainel(s, botao) {
    const v = { nome: s.valor, cnpj: s.cnpj ? fmtCnpj(s.cnpj) : '', vendedor: s.vendedor };
    const corpo = abrirJanela('Cadastrar cliente no Bling', `
      <div class="campos">
        ${campoForm('cnpj', 'CNPJ ou CPF', v.cnpj)}
        <div class="campo"><label>&nbsp;</label><button class="secundario" id="cc-receita">Buscar na Receita</button></div>
        ${campoForm('nome', 'Razão social', v.nome, { largo: true })}
        ${campoForm('fantasia', 'Nome fantasia', '')}
        ${campoForm('ie', 'Inscrição estadual (ou "isento")', '')}
        ${campoForm('email', 'E-mail do cliente', '')}
        ${campoForm('emailNf', 'E-mail para nota fiscal', '')}
        ${campoForm('telefone', 'Telefone', '')}
        ${campoForm('rua', 'Rua', '', { largo: true })}
        ${campoForm('numero', 'Número', '')}
        ${campoForm('complemento', 'Complemento', '')}
        ${campoForm('bairro', 'Bairro', '')}
        ${campoForm('cep', 'CEP', '')}
        ${campoForm('cidade', 'Cidade', '')}
        ${campoForm('uf', 'UF', '')}
        ${campoForm('vendedor', 'Vendedor', v.vendedor, { lista: 'cc-vendedores' })}
      </div>
      <datalist id="cc-vendedores"><option value="Gabriel Correia"><option value="Lucas Almeida"><option value="Paulo"><option value="Balcão"></datalist>
      <div id="cc-aviso" class="cinza" style="margin-top:8px"></div>
      <div class="botoes" style="margin-top:14px"><button class="primario" id="cc-ok">Cadastrar no Bling</button><button class="secundario" id="cc-fechar">Cancelar</button></div>`);
    const aviso = corpo.querySelector('#cc-aviso');
    const receita = async () => {
      const doc = soDigitos(corpo.querySelector('[data-f=cnpj]').value);
      if (doc.length !== 14) { aviso.textContent = 'A busca na Receita é só para CNPJ.'; return; }
      aviso.textContent = 'Buscando na Receita…';
      try {
        const r = await chamar(s.emp, 'consultarCnpj', { cnpj: doc });
        porForm(corpo, Object.assign({}, r.dados, { cnpj: fmtCnpj(doc) }));
        aviso.textContent = 'Dados da Receita' + (r.dados.situacao ? ' (situação: ' + r.dados.situacao + ')' : '') + '. Confira antes de cadastrar.';
      } catch (e) { aviso.textContent = e.message; }
    };
    corpo.querySelector('#cc-receita').onclick = receita;
    corpo.querySelector('#cc-fechar').onclick = fecharJanela;
    corpo.querySelector('#cc-ok').onclick = async () => {
      const c = lerForm(corpo);
      const doc = soDigitos(c.cnpj);
      if (doc.length !== 14 && doc.length !== 11) { avisar('CNPJ ou CPF inválido.'); return; }
      if (!c.nome) { avisar('Informe a razão social.'); return; }
      if (!confirm('Cadastrar ' + c.nome + ' no Bling da ' + s.emp.curto + '?')) return;
      const b = corpo.querySelector('#cc-ok'); b.disabled = true; b.textContent = 'Cadastrando…';
      try {
        await chamar(s.emp, 'responderSolicitacao', { id: s.id, aceitar: true, cadastro: Object.assign(c, { cnpj: doc }) });
        fecharJanela(); E.solic = E.solic.filter(x => x !== s); recarregarDados(s.emp);
        renderSolicitacoes(); avisar('Cliente cadastrado no Bling e ligado ao pedido.');
      } catch (e) { b.disabled = false; b.textContent = 'Cadastrar no Bling'; aviso.textContent = e.message; }
    };
    if (soDigitos(v.cnpj).length === 14) receita();
  }

  // Item novo: formulário do produto (código sugerido, NCM do item parecido) → "Cadastrar no Bling"
  async function cadastrarItemNoPainel(s, botao) {
    const corpo0 = abrirJanela('Cadastrar produto no Bling', '<p class="cinza">Preparando o cadastro…</p>');
    let d;
    try { d = (await chamar(s.emp, 'prepararCadastroItem', { id: s.id })).dados; }
    catch (e) { corpo0.innerHTML = `<div class="aviso erro">${esc(e.message)}</div>`; return; }
    const origens = [['0', '0 - Nacional'], ['1', '1 - Estrangeira (importação direta)'], ['2', '2 - Estrangeira (mercado interno)'],
      ['3', '3 - Nacional, importado acima de 40%'], ['4', '4 - Nacional (processo produtivo básico)'], ['5', '5 - Nacional, importado até 40%'],
      ['6', '6 - Estrangeira (importação direta, sem similar)'], ['7', '7 - Estrangeira (mercado interno, sem similar)'], ['8', '8 - Nacional, importado acima de 70%']];
    const corpo = abrirJanela('Cadastrar produto no Bling', `
      ${d.referencia ? `<p class="cinza">Parecido com: <strong>${esc(d.referencia[2])}</strong> · cód. ${esc(d.referencia[1])} (NCM, origem e marca vieram dele)</p>` : ''}
      <div class="campos">
        ${campoForm('descricao', 'Descrição', d.descricao, { largo: true })}
        ${campoForm('codigo', 'Código (sugerido)', d.codigo)}
        ${campoForm('unidade', 'Unidade', d.unidade)}
        ${campoForm('preco', 'Preço de venda (R$)', moeda(d.preco))}
        ${campoForm('ncm', 'NCM', d.ncm)}
        ${campoForm('origem', 'Origem', d.origem, { opcoes: origens })}
        ${campoForm('cest', 'CEST (se tiver)', d.cest)}
        ${campoForm('marca', 'Marca', d.marca)}
        ${campoForm('peso', 'Peso (kg)', '')}
        ${campoForm('gtin', 'Código de barras (GTIN)', '')}
      </div>
      <div id="ci-aviso" class="cinza" style="margin-top:8px"></div>
      <div class="botoes" style="margin-top:14px"><button class="primario" id="ci-ok">Cadastrar no Bling</button><button class="secundario" id="ci-fechar">Cancelar</button></div>
      <p style="margin-top:10px"><button class="link" id="ci-existente">O produto já existe no cadastro? Ligar a um produto existente</button></p>`);
    corpo.querySelector('#ci-fechar').onclick = fecharJanela;
    corpo.querySelector('#ci-existente').onclick = () => ligarItemExistente(s, botao);
    corpo.querySelector('#ci-ok').onclick = async () => {
      const c = lerForm(corpo);
      c.preco = lerNumero(c.preco); c.peso = lerNumero(c.peso);
      if (!c.descricao || !c.codigo) { avisar('Informe a descrição e o código.'); return; }
      if (soDigitos(c.ncm).length !== 8) { avisar('O NCM precisa ter 8 números.'); return; }
      if (!confirm('Cadastrar "' + c.descricao + '" (cód. ' + c.codigo + ') no Bling da ' + s.emp.curto + '?')) return;
      const b = corpo.querySelector('#ci-ok'); b.disabled = true; b.textContent = 'Cadastrando…';
      try {
        await chamar(s.emp, 'responderSolicitacao', { id: s.id, aceitar: true, cadastro: c });
        fecharJanela(); E.solic = E.solic.filter(x => x !== s); recarregarDados(s.emp);
        renderSolicitacoes(); avisar('Produto cadastrado no Bling, no catálogo do app e trocado no pedido.');
      } catch (e) { b.disabled = false; b.textContent = 'Cadastrar no Bling'; corpo.querySelector('#ci-aviso').textContent = e.message; }
    };
  }

  // Alternativa: o produto já existe — escolher no catálogo
  async function ligarItemExistente(s, botao) {
    let d;
    try { d = await carregarDados(s.emp); } catch (e) { avisar(e.message, 6000); return; }
    const corpo = abrirJanela('Ligar o item novo a um produto cadastrado', `
      <p>Item novo: <strong>${esc(s.valor)}</strong></p>
      <input type="text" id="sl-busca" value="${esc(s.valor)}" placeholder="Buscar no cadastro">
      <div id="sl-res" style="margin-top:8px"></div>`);
    const desenhar = () => {
      const t = corpo.querySelector('#sl-busca').value.trim();
      const res = t ? Busca.buscar(d.indProd, t, 8) : [];
      corpo.querySelector('#sl-res').innerHTML = res.map((r, i) =>
        `<div class="opcao-produto"><button class="link" data-p="${i}">${esc(r.produto[2])}</button> <span class="cinza">Cód. ${esc(r.produto[1])} · ${esc(r.produto[3])}</span></div>`).join('') || '<p class="cinza">Nada encontrado.</p>';
      corpo.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
        const p = res[+b.dataset.p].produto;
        if (!confirm('Ligar "' + s.valor + '" a "' + p[2] + '" (cód. ' + p[1] + ')?')) return;
        fecharJanela(); responderSolicitacao(s, true, p, botao);
      });
    };
    corpo.querySelector('#sl-busca').oninput = desenhar;
    desenhar();
  }

  /* ---------------- ligações ---------------- */
  function ligar() {
    $('#topo-logo').onclick = trocarEmpresa;
    $('#topo-trocar').onclick = trocarEmpresa;
    $('#topo-sair').onclick = sair;
    $('#op-criar').onclick = abrirCriar;
    $('#nav-novo').onclick = () => { if (!E.pedido || confirm('Sair deste pedido sem salvar?')) irInicio(); };
    $('#nav-pedidos').onclick = () => { if (!E.pedido || confirm('Sair deste pedido sem salvar?')) abrirPedidos(); };
    $('#nav-solic').onclick = () => { if (!E.pedido || confirm('Sair deste pedido sem salvar?')) abrirSolicitacoes(); };
    $('#paginas-todas').onclick = () => {
      if (!E.paginas || E.paginas.tipo !== 'pdf') return;
      E.paginas.lista.forEach(p => { p.marcada = true; p.el.classList.add('marcada'); p.el.querySelector('.marca').textContent = '✓'; });
      atualizarBotaoPaginas();
    };
    $('#paginas-cancelar').onclick = irInicio;
    $('#paginas-enviar').onclick = () => enviarPaginas().catch(e => mostrarErro('Não consegui preparar as páginas', e.message));
    $('#janela-fechar').onclick = fecharJanela;
    $('#janela').onclick = ev => { if (ev.target.id === 'janela') fecharJanela(); };
    $('#criar-cancelar').onclick = irInicio;
    $('#criar-conferir').onclick = conferirCriado;
    $('#criar-linha').onclick = () => { G.linhas.push({ descricao: '', produto: null, nota: 0, quantidade: 0, preco: 0 }); renderGrade(); };
    $('#grade-criar').addEventListener('paste', colarNaGrade);
    window.addEventListener('beforeunload', ev => { if (E.pedido) { ev.preventDefault(); ev.returnValue = ''; } });
    prepararAnexo();
    prepararConferencia();
    prepararPedidos();
  }

  ligar();
  iniciar();
})();
