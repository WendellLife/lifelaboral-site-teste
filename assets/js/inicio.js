/* Todas as páginas: menu do celular. Página inicial: fusão das marcas e cartões de serviço que escolhem o
   serviço no formulário. Contato: ?servico=<valor> (botões "Quero contratar" da página Serviços) faz o mesmo. */
(function () {
  'use strict';
  var botao = document.querySelector('.menu'), menu = document.getElementById('menu');
  if (botao && menu) {
    botao.addEventListener('click', function () {
      var aberto = menu.classList.toggle('open');
      botao.setAttribute('aria-expanded', String(aberto));
      botao.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
    });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        menu.classList.remove('open');
        botao.setAttribute('aria-expanded', 'false');
        botao.setAttribute('aria-label', 'Abrir menu');
      });
    });
  }

  /* Life Laboral + Universo FX: a fusão começa quando a faixa aparece na tela (uma vez). */
  var fusao = document.querySelector('[data-fusao]');
  if (fusao && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if ('IntersectionObserver' in window) {
      fusao.classList.add('fusao-pronta');
      var obs = new IntersectionObserver(function (entradas) {
        entradas.forEach(function (e) {
          if (e.isIntersecting) { fusao.classList.add('em-vista'); obs.disconnect(); }
        });
      }, { threshold: 0.6 });
      obs.observe(fusao);
    }
  }

  var servico = document.getElementById('f-servico'), mensagem = document.getElementById('f-mensagem');
  var preenchida = '';
  function escolher(valor, texto) {
    if (servico) servico.value = valor;
    if (mensagem && texto && (!mensagem.value.trim() || mensagem.value === preenchida)) {
      // minúscula só na primeira letra de palavra comum: "Exames ocupacionais" → "exames…", "PGR" fica "PGR"
      var t = /^[A-ZÀ-Ú][a-zà-ú]/.test(texto) ? texto.charAt(0).toLowerCase() + texto.slice(1) : texto;
      preenchida = 'Gostaria de uma proposta para ' + t + '.';
      mensagem.value = preenchida;
    }
  }
  var pedido = /[?&]servico=([a-z]+)/.exec(location.search);
  if (pedido && servico) {
    var opcao = servico.querySelector('option[value="' + pedido[1] + '"]');
    if (opcao) escolher(pedido[1], opcao.textContent);
  }
  document.querySelectorAll('[data-service]').forEach(function (a) {
    a.addEventListener('click', function () {
      escolher(a.getAttribute('data-service'), a.getAttribute('data-service-texto'));
    });
  });
})();
