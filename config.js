/* CONFIGURAÇÃO DO APP — preencher na instalação (Bernard + Claude, no 1º teste) */
window.CONFIG = {
  // ID do cliente OAuth do login Google (Google Cloud > APIs e serviços > Credenciais)
  GOOGLE_CLIENT_ID: '544803331094-0v2e9nl7jqdalb8kdtjgifb8n0lsth5a.apps.googleusercontent.com',

  // Endereço (URL) do App da Web de cada empresa, terminado em /exec
  EMPRESAS: [
    { id: 'montevideu', nome: 'Comercial Montevideu', curto: 'Montevideu', cnpj: '47563591000179',
      url: 'https://script.google.com/macros/s/AKfycbxHZzTiaxcWWmwaIcbd5VFe2BCh9nzYG0Egwnx2aQvKllIL_ZCJNm4qu0tpMimLKE9y/exec',
      logo: 'img/montevideu_3d.png', cor: '#0B63B8', corEscura: '#07375D', destaque: '#FECF04', fundo: '#EEF4FA' },
    { id: 'dom', nome: 'DOM Multicomércio', curto: 'DOM', cnpj: '61265684000148',
      url: 'https://script.google.com/macros/s/AKfycbxxMdt93kx_PNh28ca3LMqEtydm_cjeVUJIyjt0NY0yIUc9xzVxZj1OkrIBYIYSSblu/exec',
      logo: 'img/dom_3d.png', cor: '#D71F16', corEscura: '#6F1110', destaque: '#6F1110', fundo: '#FBF1F0', emailPeloServidor: true, emailRemetente: 'ffiscaldom@gmail.com' }
  ],
  LOGO_GRUPO: 'img/montevi_group.png',
  // Botões de Logística (mensagem para o grupo do WhatsApp): false = desligado (decisão do Bernard em 09/11/2026); true = volta a aparecer
  LOGISTICA_ATIVA: false,
  // Modelo da mensagem de logística no WhatsApp (1, 2 ou 3)
  MODELO_LOGISTICA: 1,
  SEGUNDOS_ABERTURA: 3
};
