/* Life Laboral — comportamento do site estático
   Sem dependências externas. Tudo degrada bem se o JS falhar. */
(function () {
  'use strict';

  var reduzirMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- Menu mobile ---------------- */
  function iniciarMenu() {
    var nav = document.querySelector('.nav');
    var botao = document.querySelector('.nav__botao-menu');
    var gaveta = document.getElementById('menu-principal');
    if (!nav || !botao || !gaveta) return;

    var fechar = function () {
      gaveta.classList.remove('esta-aberto');
      botao.setAttribute('aria-expanded', 'false');
    };

    botao.addEventListener('click', function () {
      var aberto = gaveta.classList.toggle('esta-aberto');
      botao.setAttribute('aria-expanded', String(aberto));
    });

    gaveta.addEventListener('click', function (e) {
      if (e.target.closest('a')) fechar();
    });

    // toque fora da barra fecha a gaveta
    document.addEventListener('click', function (e) {
      if (gaveta.classList.contains('esta-aberto') && !nav.contains(e.target)) fechar();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && gaveta.classList.contains('esta-aberto')) {
        fechar();
        botao.focus();
      }
    });

    // virou para a largura de computador: a gaveta não pode voltar aberta
    var computador = window.matchMedia('(min-width: 961px)');
    if (computador.addEventListener) computador.addEventListener('change', fechar);
  }

  /* ---------------- Sombra da barra fixa ---------------- */
  function iniciarBarraFixa() {
    var nav = document.querySelector('.nav');
    if (!nav) return;
    var atualizar = function () {
      nav.classList.toggle('esta-fixa', window.scrollY > 4 && nav.getBoundingClientRect().top <= 0);
    };
    atualizar();
    window.addEventListener('scroll', atualizar, { passive: true });
  }

  /* ---------------- Animações de entrada ---------------- */
  function iniciarRevelacao() {
    var alvos = document.querySelectorAll('.revelar');
    if (!alvos.length) return;

    if (reduzirMovimento || !('IntersectionObserver' in window)) {
      alvos.forEach(function (el) { el.classList.add('visivel'); });
      return;
    }

    var observador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        if (entrada.isIntersecting) {
          entrada.target.classList.add('visivel');
          observador.unobserve(entrada.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    alvos.forEach(function (el) { observador.observe(el); });
  }

  /* ---------------- Contadores ---------------- */
  function animarNumero(el) {
    var destino = parseFloat(el.getAttribute('data-valor') || '0');
    var sufixo = el.getAttribute('data-sufixo') || '';
    var duracao = 1600;

    if (reduzirMovimento) {
      el.textContent = destino + sufixo;
      return;
    }

    var inicio = null;
    function passo(agora) {
      if (inicio === null) inicio = agora;
      var progresso = Math.min((agora - inicio) / duracao, 1);
      var suave = 1 - Math.pow(1 - progresso, 3);          // easeOutCubic
      el.textContent = Math.round(destino * suave) + sufixo;
      if (progresso < 1) requestAnimationFrame(passo);
    }
    requestAnimationFrame(passo);
  }

  function iniciarContadores() {
    var numeros = document.querySelectorAll('[data-valor]');
    if (!numeros.length) return;

    if (!('IntersectionObserver' in window)) {
      numeros.forEach(animarNumero);
      return;
    }

    var observador = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        if (entrada.isIntersecting) {
          animarNumero(entrada.target);
          observador.unobserve(entrada.target);
        }
      });
    }, { threshold: 0.4 });

    numeros.forEach(function (el) { observador.observe(el); });
  }

  /* ---------------- Voltar ao topo ---------------- */
  function iniciarVoltarTopo() {
    var botao = document.querySelector('.voltar-topo');
    if (!botao) return;
    var atualizar = function () {
      botao.classList.toggle('aparece', window.scrollY > 600);
    };
    atualizar();
    window.addEventListener('scroll', atualizar, { passive: true });
    botao.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduzirMovimento ? 'auto' : 'smooth' });
    });
  }

  /* ---------------- Formulário de contato ----------------
     Envia para /api/contato (painel do site), que guarda o contato e o
     repassa ao ANT como lead. Depois, a pessoa pode seguir no WhatsApp.
     Se o envio falhar, o WhatsApp e o e-mail continuam como saída.       */
  function iniciarFormulario() {
    var abertoEm = Date.now();
    var utm = {};
    try {
      var busca = new URLSearchParams(window.location.search);
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function (k) {
        if (busca.get(k)) utm[k] = busca.get(k).slice(0, 100);
      });
    } catch (e) { /* navegador antigo: segue sem UTM */ }

    document.querySelectorAll('[data-formulario-contato]').forEach(function (form) {
      var retorno = form.querySelector('.form-retorno');
      var botao = form.querySelector('button[type="submit"]');
      var endpoint = form.getAttribute('data-endpoint') || '/api/contato';
      var whats = form.getAttribute('data-whatsapp') || '';
      var email = form.getAttribute('data-email') || '';
      var cnpj = form.querySelector('[name="cnpj"]');

      function erroDe(campo) { return campo.querySelector('.campo__erro'); }

      function marcar(campo, ok, texto) {
        var entrada = campo.querySelector('input, textarea, select');
        campo.classList.toggle('tem-erro', !ok);
        entrada.setAttribute('aria-invalid', String(!ok));
        var erro = erroDe(campo);
        if (erro) {
          if (texto) erro.textContent = texto;
          if (!ok) entrada.setAttribute('aria-describedby', erro.id);
          else entrada.removeAttribute('aria-describedby');
        }
        return ok;
      }

      function validarCampo(campo) {
        var entrada = campo.querySelector('input, textarea, select');
        if (!entrada || !erroDe(campo)) return true;
        var valor = entrada.value.trim();
        if (!entrada.required && !valor) return marcar(campo, true);
        var ok = entrada.checkValidity() && valor !== '';
        if (ok && entrada.name === 'whatsapp') ok = valor.replace(/\D/g, '').length >= 10;
        if (ok && entrada.name === 'cnpj') ok = cnpjValido(valor);
        return marcar(campo, ok);
      }

      function campos() {
        return Array.prototype.slice.call(form.querySelectorAll('.campo')).filter(function (c) {
          return !c.classList.contains('campo-isca');
        });
      }

      /* A mensagem de erro que aparece ao sair do campo empurra o botão para baixo. Se isso
         acontece entre apertar e soltar o mouse no "Enviar", o clique se perde: com o botão
         do mouse (ou o dedo) apertado, a validação espera o clique terminar. */
      var apertado = false, adiados = [];
      document.addEventListener('pointerdown', function () { apertado = true; }, true);
      document.addEventListener('pointerup', function () {
        apertado = false;
        setTimeout(function () {
          adiados.splice(0).forEach(function (c) { validarCampo(c); });
        }, 0);
      }, true);

      campos().forEach(function (campo) {
        var entrada = campo.querySelector('input, textarea, select');
        if (!entrada) return;
        entrada.addEventListener('blur', function () {
          if (apertado) { if (adiados.indexOf(campo) < 0) adiados.push(campo); } else validarCampo(campo);
        });
        entrada.addEventListener('input', function () {
          if (campo.classList.contains('tem-erro')) validarCampo(campo);
        });
      });

      if (cnpj) {
        cnpj.addEventListener('input', function () {
          var c = cnpj.value.replace(/[^0-9A-Za-z]/g, '').toUpperCase().slice(0, 14);
          var m = c.slice(0, 2);
          if (c.length > 2) m += '.' + c.slice(2, 5);
          if (c.length > 5) m += '.' + c.slice(5, 8);
          if (c.length > 8) m += '/' + c.slice(8, 12);
          if (c.length > 12) m += '-' + c.slice(12);
          if (m !== cnpj.value) cnpj.value = m;
        });
      }

      function textoWhatsApp(d) {
        return 'Olá! Sou ' + d.nome + ', da empresa ' + d.empresa + '. Acabei de enviar uma mensagem pelo site:\n\n' + d.mensagem;
      }

      function mostrar(tipo, titulo, texto, acao) {
        if (!retorno) return;
        retorno.innerHTML = '';
        retorno.classList.add('aparece');
        retorno.classList.toggle('is-erro', tipo === 'erro');
        var forte = document.createElement('strong');
        forte.textContent = titulo;
        retorno.appendChild(forte);
        retorno.appendChild(document.createTextNode(texto));
        if (acao) {
          var a = document.createElement('a');
          a.className = 'botao ' + (acao.classe || '');
          a.href = acao.href;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = acao.rotulo;
          retorno.appendChild(document.createElement('br'));
          retorno.appendChild(a);
        }
        retorno.focus({ preventScroll: true });
        retorno.scrollIntoView({ block: 'nearest', behavior: reduzirMovimento ? 'auto' : 'smooth' });
      }

      function linkWhatsApp(d) {
        return whats ? 'https://wa.me/' + whats + '?text=' + encodeURIComponent(textoWhatsApp(d)) : '';
      }

      function falhou(d, mensagem) {
        var link = linkWhatsApp(d);
        mostrar('erro', 'Não conseguimos enviar agora.',
          (mensagem || 'Tente de novo em instantes') + (link ? '. Se preferir, fale com a gente pelo WhatsApp.' : '. Se preferir, escreva para ' + email + '.'),
          link ? { href: link, rotulo: 'Enviar pelo WhatsApp', classe: 'botao--whatsapp' } : null);
      }

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (form.getAttribute('aria-busy') === 'true') return;
        var valido = campos().map(validarCampo).every(Boolean);
        if (!valido) {
          var primeiro = form.querySelector('.tem-erro input, .tem-erro textarea, .tem-erro select');
          if (primeiro) primeiro.focus();
          return;
        }

        var fd = new FormData(form);
        var d = {};
        fd.forEach(function (valor, chave) { d[chave] = String(valor).trim(); });
        d.t = Date.now() - abertoEm;
        d.pagina = window.location.pathname;
        d.utm = utm;

        form.setAttribute('aria-busy', 'true');
        if (botao) { botao.disabled = true; botao.dataset.rotulo = botao.textContent; botao.textContent = 'Enviando…'; }

        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(d),
          credentials: 'same-origin'
        })
          .then(function (r) {
            return r.json().catch(function () { return { ok: false }; }).then(function (j) { return { r: r, j: j }; });
          })
          .then(function (res) {
            var j = res.j || {};
            if (res.r.ok && j.ok) {
              var link = linkWhatsApp(d);
              mostrar('ok', 'Recebemos sua mensagem!',
                'A equipe da Life Laboral vai responder em breve pelo WhatsApp ou e-mail informados.' +
                (link ? ' Se quiser adiantar a conversa, continue pelo WhatsApp.' : ''),
                link ? { href: link, rotulo: 'Continuar no WhatsApp', classe: 'botao--whatsapp' } : null);
              form.reset();
              campos().forEach(function (c) { marcar(c, true); });
              return;
            }
            if (j.erros) {
              var primeiro = null;
              Object.keys(j.erros).forEach(function (nome) {
                var entrada = form.querySelector('[name="' + nome + '"]');
                var campo = entrada && entrada.closest('.campo');
                if (campo) { marcar(campo, false, j.erros[nome]); primeiro = primeiro || entrada; }
              });
              if (retorno) { retorno.classList.remove('aparece'); }
              if (primeiro) primeiro.focus();
              return;
            }
            falhou(d, j.mensagem);
          })
          .catch(function () { falhou(d); })
          .then(function () {
            form.removeAttribute('aria-busy');
            if (botao) { botao.disabled = false; botao.textContent = botao.dataset.rotulo || 'Enviar mensagem'; }
          });
      });
    });
  }

  /* CNPJ numérico ou alfanumérico: 12 caracteres e 2 dígitos verificadores. */
  function cnpjValido(texto) {
    var c = String(texto || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(c) || /^(.)\1+$/.test(c)) return false;
    function dv(base) {
      var soma = 0, peso = base.length - 7;
      for (var i = 0; i < base.length; i++) {
        soma += (base.charCodeAt(i) - 48) * peso;
        peso = peso === 2 ? 9 : peso - 1;
      }
      var resto = soma % 11;
      return resto < 2 ? '0' : String(11 - resto);
    }
    var d1 = dv(c.slice(0, 12));
    return c.slice(12) === d1 + dv(c.slice(0, 12) + d1);
  }

  /* ---------------- Início ---------------- */
  function iniciar() {
    iniciarMenu();
    iniciarBarraFixa();
    iniciarRevelacao();
    iniciarContadores();
    iniciarVoltarTopo();
    iniciarFormulario();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
