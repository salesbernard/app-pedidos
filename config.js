/* CONFIGURAÇÃO DO APP — preencher na instalação (Bernard + Claude, no 1º teste) */
window.CONFIG = {
  // ID do cliente OAuth do login Google (Google Cloud > APIs e serviços > Credenciais)
  GOOGLE_CLIENT_ID: '544803331094-0v2e9nl7jqdalb8kdtjgifb8n0lsth5a.apps.googleusercontent.com',

  // Endereço (URL) do App da Web de cada empresa, terminado em /exec
  EMPRESAS: [
    { id: 'montevideu', nome: 'Comercial Montevideu', curto: 'Montevideu', cnpj: '47563591000179',
      url: 'https://script.google.com/macros/s/AKfycbxHZzTiaxcWWmwaIcbd5VFe2BCh9nzYG0Egwnx2aQvKllIL_ZCJNm4qu0tpMimLKE9y/exec',
      logo: 'img/montevideu_3d.png', cor: '#1F5C6B' },
    { id: 'dom', nome: 'DOM Multicomércio', curto: 'DOM', cnpj: '61265684000148',
      url: 'COLAR_AQUI_A_URL_DO_APPS_SCRIPT_DOM',
      logo: 'img/dom_3d.png', cor: '#B3262B' }
  ],
  LOGO_GRUPO: 'img/montevi_group.png',
  // Modelo da mensagem de logística no WhatsApp (1, 2 ou 3)
  MODELO_LOGISTICA: 1,
  SEGUNDOS_ABERTURA: 3
};
