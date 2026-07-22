// A área logada do aluno (dashboard/treinos/ranking/indicação/perfil) só
// funciona de verdade dentro do app nativo (Capacitor) — no navegador comum
// mostra o convite pra baixar o app. webDir do capacitor.config.json é a
// mesma pasta "frontend" servida no navegador, então a distinção tem que
// ser em runtime, não em build. Roda cedo, igual theme.js, pra não piscar
// o conteúdo errado antes de esconder (marca <html> antes do <body> pintar).
(function () {
  var isNativo = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  document.documentElement.setAttribute('data-client', isNativo ? 'native' : 'web');
})();
