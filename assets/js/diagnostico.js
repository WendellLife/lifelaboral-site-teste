/* Diagnóstico de SST da página inicial.
   O método (perguntas, pontos, riscos, multas) vem do ANT e está embutido na página
   (<script id="metodo-diagnostico">, gerado por gerar.py). O resultado aparece na hora;
   o servidor (painel/diagnosticos.py) recalcula a pontuação e repassa ao ANT.            */
(function () {
  'use strict';

  var raiz = document.querySelector('[data-diagnostico]');
  var dadosEl = document.getElementById('metodo-diagnostico');
  if (!raiz || !dadosEl) return;

  var M;
  try { M = JSON.parse(dadosEl.textContent); } catch (e) { return; }

  var endpoint = raiz.getAttribute('data-endpoint') || '/api/diagnostico';
  var whats = raiz.getAttribute('data-whatsapp') || '';
  var reduzir = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var telas = {
    intro: raiz.querySelector('[data-diag-tela="intro"]'),
    quiz: raiz.querySelector('[data-diag-tela="quiz"]'),
    resultado: raiz.querySelector('[data-diag-tela="resultado"]')
  };
  var P = M.perguntas;
  var estado = { indices: [], atual: 0, inicio: 0, uid: '', enviado: false, contato: null };
  var utm = {};
  try {
    var busca = new URLSearchParams(window.location.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function (k) {
      if (busca.get(k)) utm[k] = busca.get(k).slice(0, 100);
    });
  } catch (e) { /* navegador antigo: segue sem UTM */ }

  /* ---------------- utilidades ---------------- */
  function el(tag, attrs, filhos) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'texto') n.textContent = attrs[k];
      else if (k === 'classe') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (filhos || []).forEach(function (f) { if (f) n.appendChild(typeof f === 'string' ? document.createTextNode(f) : f); });
    return n;
  }

  function moeda(v) {
    try { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
    catch (e) { return 'R$ ' + v.toFixed(2).replace('.', ','); }
  }

  function mostrar(nome) {
    Object.keys(telas).forEach(function (k) { telas[k].hidden = k !== nome; });
    var t = telas[nome];
    t.classList.remove('diag__entra');
    void t.offsetWidth; // reinicia a animação de entrada
    t.classList.add('diag__entra');
    var topo = raiz.getBoundingClientRect().top;
    if (topo < 0 || topo > window.innerHeight * 0.6) {
      raiz.scrollIntoView({ block: 'start', behavior: reduzir ? 'auto' : 'smooth' });
    }
  }

  function focar(n) {
    if (!n) return;
    n.setAttribute('tabindex', '-1');
    n.focus({ preventScroll: true });
  }

  function postar(caminho, corpo) {
    return fetch(caminho, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(corpo),
      credentials: 'same-origin'
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false }; }).then(function (j) { return { r: r, j: j || {} }; });
    });
  }

  /* ---------------- cálculo (as mesmas regras do ANT e do painel) ---------------- */
  function calcular(indices) {
    var respostas = P.map(function (p, i) {
      var o = p.opcoes[indices[i]];
      return { chave: p.chave, pergunta: p.texto, resposta: o.rotulo, pontos: o.pontos, servicos: o.servicos, riscos: o.riscos };
    });
    var pontos = respostas.reduce(function (s, r) { return s + r.pontos; }, 0);
    var nivel = 'BAIXA';
    if (pontos >= M.pontuacao_maxima * M.faixas.ALTA.a_partir_de) nivel = 'ALTA';
    else if (pontos >= M.pontuacao_maxima * M.faixas.MEDIA.a_partir_de) nivel = 'MEDIA';

    var codigos = [];
    respostas.forEach(function (r) {
      r.riscos.forEach(function (c) { if (M.riscos[c] && codigos.indexOf(c) < 0) codigos.push(c); });
    });
    var riscos = codigos.map(function (c, ordem) { return { c: c, r: M.riscos[c], o: ordem }; })
      .sort(function (a, b) {
        var ga = a.r.gravidade === 'alta' ? 0 : 1, gb = b.r.gravidade === 'alta' ? 0 : 1;
        return ga - gb || a.o - b.o;
      })
      .map(function (x) { return x.r; });

    var contagem = {}, ordem = [];
    respostas.forEach(function (r) {
      var peso = r.chave === 'prioridade' ? 100 : 1;
      r.servicos.forEach(function (c) {
        if (!(c in contagem)) { contagem[c] = 0; ordem.push(c); }
        contagem[c] += peso;
      });
    });
    var servicos = ordem.map(function (c, i) { return { c: c, i: i }; })
      .sort(function (a, b) { return contagem[b.c] - contagem[a.c] || a.i - b.i; })
      .filter(function (x) { return M.servicos[x.c]; })
      .map(function (x) { return M.servicos[x.c]; });

    var comMulta = riscos.filter(function (r) { return r.minimo !== null; });
    return {
      respostas: respostas, pontos: pontos, nivel: nivel, faixa: M.faixas[nivel], riscos: riscos, servicos: servicos,
      minimo: comMulta.reduce(function (s, r) { return s + r.minimo; }, 0),
      maximo: comMulta.reduce(function (s, r) { return s + r.maximo; }, 0),
      comMulta: comMulta.length,
      altos: riscos.filter(function (r) { return r.gravidade === 'alta'; }).length
    };
  }

  function resumo(res) {
    var r = {};
    res.respostas.forEach(function (x) { r[x.chave] = x.resposta; });
    var c = estado.contato || {};
    var linhas = ['Diagnóstico de SST · Life Laboral'];
    if (c.empresa || c.nome) linhas.push('Empresa: ' + [c.empresa, c.nome].filter(Boolean).join(' · '));
    var perfil = [r.trabalhadores ? r.trabalhadores + ' trabalhadores' : '', r.operacao,
      r.unidades ? 'unidades: ' + r.unidades.toLowerCase() : ''].filter(Boolean);
    linhas.push('Perfil: ' + perfil.join(' · '));
    linhas.push('Resultado: ' + res.faixa.rotulo + ' (' + res.pontos + ' de ' + M.pontuacao_maxima + ' pontos)');
    if (res.comMulta) linhas.push('Exposição estimada em multas: ' + moeda(res.minimo) + ' a ' + moeda(res.maximo));
    if (res.riscos.length) {
      linhas.push('', 'O que está inadequado (' + res.riscos.length + '):');
      res.riscos.forEach(function (x, i) { linhas.push((i + 1) + '. ' + x.titulo + ' (' + x.norma + ')'); });
    }
    if (res.servicos.length) {
      linhas.push('', 'Serviços indicados: ' + res.servicos.slice(0, 5).map(function (s) { return s.titulo; }).join(', '));
    }
    linhas.push('', 'Quero eliminar esses riscos. Podem me passar o plano de regularização?');
    return linhas.join('\n');
  }

  function linkWhatsApp(res) {
    return 'https://wa.me/' + whats + '?text=' + encodeURIComponent(resumo(res));
  }

  /* ---------------- perguntas ---------------- */
  function blocoNumero(bloco) {
    var blocos = [];
    P.forEach(function (p) { if (blocos.indexOf(p.bloco) < 0) blocos.push(p.bloco); });
    return { n: blocos.indexOf(bloco) + 1, total: blocos.length };
  }

  function pergunta(i) {
    estado.atual = i;
    var p = P[i];
    var b = blocoNumero(p.bloco);
    var t = telas.quiz;
    t.innerHTML = '';
    var barra = el('span');
    barra.style.transform = 'scaleX(' + (i / P.length) + ')';
    var titulo = el('h3', { classe: 'diag__pergunta', id: 'diag-pergunta', texto: p.texto });
    var opcoes = el('div', { classe: 'diag__opcoes', role: 'group', 'aria-labelledby': 'diag-pergunta' });
    p.opcoes.forEach(function (o, k) {
      var botao = el('button', { type: 'button', classe: 'diag__opcao', 'aria-pressed': String(estado.indices[i] === k), texto: o.rotulo });
      botao.addEventListener('click', function () { escolher(i, k, botao); });
      opcoes.appendChild(botao);
    });
    var rodape = el('div', { classe: 'diag__rodape' });
    if (i > 0) {
      var voltar = el('button', { type: 'button', classe: 'diag__voltar', texto: '← Voltar à pergunta anterior' });
      voltar.addEventListener('click', function () { pergunta(i - 1); });
      rodape.appendChild(voltar);
    } else {
      rodape.appendChild(el('span'));
    }
    rodape.appendChild(el('span', { classe: 'diag__sigilo', texto: 'Sigiloso' }));
    t.appendChild(el('div', { classe: 'diag__topo' }, [
      el('span', { classe: 'diag__bloco', texto: String(b.n).padStart(2, '0') + ' · ' + p.bloco }),
      el('span', { texto: 'Pergunta ' + (i + 1) + ' de ' + P.length })
    ]));
    t.appendChild(el('div', { classe: 'diag__barra', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(P.length),
      'aria-valuenow': String(i), 'aria-label': 'Progresso do diagnóstico' }, [barra]));
    t.appendChild(titulo);
    if (p.ajuda) t.appendChild(el('p', { classe: 'diag__ajuda', texto: p.ajuda }));
    t.appendChild(opcoes);
    t.appendChild(rodape);
    mostrar('quiz');
    focar(titulo);
  }

  var trava = false;
  function escolher(i, k, botao) {
    if (trava) return;
    trava = true;
    estado.indices[i] = k;
    botao.parentNode.querySelectorAll('.diag__opcao').forEach(function (b) { b.setAttribute('aria-pressed', String(b === botao)); });
    setTimeout(function () {
      trava = false;
      if (i + 1 < P.length) pergunta(i + 1);
      else concluir();
    }, reduzir ? 60 : 220);
  }

  /* ---------------- resultado ---------------- */
  function concluir() {
    var res = calcular(estado.indices);
    resultado(res);
    var corpo = { respostas: estado.indices.slice(0, P.length), t: Date.now() - estado.inicio, website: '',
      pagina: window.location.pathname, utm: utm };
    postar(endpoint, corpo).then(function (x) {
      if (x.r.ok && x.j.ok) { estado.uid = x.j.uid || ''; estado.enviado = true; }
    }).catch(function () { /* o contato reenvia as respostas */ });
  }

  function medidor(res) {
    var pct = Math.min(100, Math.round(res.pontos / M.pontuacao_maxima * 100));
    var marca = el('span', { classe: 'diag__medidor-marca' });
    marca.style.left = pct + '%';
    return el('div', { classe: 'diag__medidor' }, [
      el('span', { texto: '0' }),
      el('div', { classe: 'diag__medidor-valor', 'aria-hidden': 'true' }, [el('div', { classe: 'diag__medidor-trilho' }), marca]),
      el('span', { texto: String(M.pontuacao_maxima) })
    ]);
  }

  function botaoWhatsApp(res, rotulo, extra) {
    var a = el('a', { classe: 'botao botao--whatsapp ' + (extra || ''), href: linkWhatsApp(res), target: '_blank', rel: 'noopener', texto: rotulo });
    a.addEventListener('click', function () {
      a.href = linkWhatsApp(res); // o resumo leva o nome e a empresa, se já informados
      if (estado.uid) postar(endpoint + '/whatsapp', { uid: estado.uid }).catch(function () {});
    });
    return a;
  }

  function resultado(res) {
    var t = telas.resultado;
    t.innerHTML = '';
    var titulo = el('h2', { id: 'diag-resultado', texto: res.faixa.titulo });
    t.appendChild(el('span', { classe: 'diag__nivel diag__nivel--' + res.nivel, texto: res.faixa.rotulo }));
    t.appendChild(titulo);
    t.appendChild(el('p', { texto: res.faixa.mensagem }));
    t.appendChild(medidor(res));
    t.appendChild(el('p', { classe: 'diag__sigilo', texto: res.pontos + ' de ' + M.pontuacao_maxima + ' pontos de exposição' }));

    var lista = el('dl', { classe: 'diag__respostas' });
    res.respostas.forEach(function (r) {
      lista.appendChild(el('dt', { texto: r.pergunta }));
      lista.appendChild(el('dd', { texto: r.resposta }));
    });
    t.appendChild(el('details', {}, [el('summary', { texto: 'Ver as ' + res.respostas.length + ' respostas' }), lista]));

    if (res.riscos.length) {
      var multas = el('div', { classe: 'diag__multas' }, [el('p', { classe: 'rotulo', texto: 'Exposição estimada em multas' })]);
      if (res.comMulta) {
        multas.appendChild(el('p', { classe: 'diag__faixa' }, [moeda(res.minimo), el('small', { texto: 'a' }), moeda(res.maximo)]));
      } else {
        multas.appendChild(el('p', { classe: 'diag__faixa', texto: 'Riscos sem multa fixa, com custo em afastamentos e condenações' }));
      }
      multas.appendChild(el('p', { texto: res.riscos.length + (res.riscos.length === 1 ? ' risco identificado' : ' riscos identificados') +
        (res.altos ? ', ' + res.altos + ' de gravidade alta' : '') +
        '. Soma das multas de referência de cada risco, considerando uma autuação por item.' }));
      multas.appendChild(el('div', { classe: 'diag__acoes' }, [botaoWhatsApp(res, 'Quero eliminar esses riscos')]));
      t.appendChild(multas);

      t.appendChild(el('h3', { texto: 'Riscos identificados pelas suas respostas' }));
      var ul = el('ul', { classe: 'diag__riscos' });
      res.riscos.forEach(function (r) {
        var alta = r.gravidade === 'alta';
        var multa = null;
        if (r.minimo !== null) {
          multa = el('span', {}, r.minimo === r.maximo
            ? ['Multa de ', el('strong', { texto: moeda(r.minimo) }), ' · ' + r.unidade]
            : ['Multa de ', el('strong', { texto: moeda(r.minimo) }), ' a ', el('strong', { texto: moeda(r.maximo) }), ' · ' + r.unidade]);
        }
        var servico = M.servicos[r.servico];
        ul.appendChild(el('li', { classe: 'diag__risco' + (alta ? ' diag__risco--alta' : '') }, [
          el('div', { classe: 'diag__risco-cab' }, [
            el('div', {}, [el('div', { classe: 'diag__risco-titulo', texto: r.titulo }), el('div', { classe: 'diag__norma', texto: r.norma })]),
            el('span', { classe: 'diag__gravidade', texto: 'Gravidade ' + (alta ? 'alta' : 'média') })
          ]),
          el('p', { texto: r.impacto }),
          el('div', { classe: 'diag__risco-pe' }, [multa || el('span'), servico ? el('span', { classe: 'diag__resolve', texto: 'Resolve: ' + servico.titulo }) : null])
        ]));
      });
      t.appendChild(ul);
      t.appendChild(el('p', { classe: 'diag__fonte', texto: M.fonte_multas }));
    } else {
      t.appendChild(el('div', { classe: 'diag__multas' }, [
        el('p', {}, [el('strong', { texto: 'Nenhum risco crítico apontado pelas respostas.' }),
          ' O próximo ganho costuma estar em indicadores, FAP e prevenção de afastamentos.'])
      ]));
    }

    if (res.servicos.length) {
      t.appendChild(el('h3', { texto: 'Serviços indicados' }));
      var sl = el('ol', { classe: 'diag__servicos' });
      res.servicos.forEach(function (s, i) {
        sl.appendChild(el('li', { classe: 'diag__servico' }, [
          el('b', { texto: String(i + 1).padStart(2, '0') }),
          el('div', {}, [el('strong', { texto: s.titulo }), el('div', { texto: s.motivo })])
        ]));
      });
      t.appendChild(sl);
    }

    t.appendChild(formularioContato(res));
    mostrar('resultado');
    focar(titulo);
  }

  /* ---------------- contato depois do resultado ---------------- */
  function campo(id, rotulo, tipo, extra, obrigatorio) {
    var entrada = el('input', Object.assign({ id: id, name: id.replace('dc-', ''), type: tipo }, extra || {}));
    if (obrigatorio) entrada.required = true;
    var erro = el('span', { classe: 'campo__erro', id: id + '-erro' });
    return el('div', { classe: 'campo' }, [
      el('label', { for: id }, obrigatorio ? [rotulo + ' ', el('span', { classe: 'obrigatorio', 'aria-hidden': 'true', texto: '*' })]
        : [rotulo + ' ', el('span', { classe: 'opcional', texto: '(opcional)' })]),
      entrada, erro
    ]);
  }

  function marcar(form, nome, msg) {
    var entrada = form.querySelector('[name="' + nome + '"]');
    if (!entrada) return null;
    var c = entrada.closest('.campo');
    var erro = c.querySelector('.campo__erro');
    c.classList.toggle('tem-erro', !!msg);
    entrada.setAttribute('aria-invalid', String(!!msg));
    if (msg) { erro.textContent = msg; entrada.setAttribute('aria-describedby', erro.id); }
    else entrada.removeAttribute('aria-describedby');
    return entrada;
  }

  function validar(form) {
    var d = {};
    ['nome', 'empresa', 'telefone', 'email'].forEach(function (k) { d[k] = form.querySelector('[name="' + k + '"]').value.trim(); });
    var erros = {};
    if (d.nome.length < 2) erros.nome = 'Informe o seu nome.';
    var tel = d.telefone.replace(/\D/g, '');
    if (d.telefone && (tel.length < 10 || tel.length > 13)) erros.telefone = 'Informe o telefone com DDD.';
    if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) erros.email = 'Informe um e-mail válido.';
    if (!d.telefone && !d.email) erros.telefone = 'Informe um telefone ou um e-mail para retornarmos.';
    return { d: d, erros: erros };
  }

  function formularioContato(res) {
    var caixa = el('div', { classe: 'diag__contato', id: 'diag-contato' });
    var form = el('form', { novalidate: '' });
    caixa.appendChild(el('h3', { texto: 'Receba o plano para eliminar esses riscos' }));
    caixa.appendChild(el('p', {}, ['A equipe técnica analisa as respostas e retorna em até ',
      el('strong', { texto: res.faixa.prazo }), ' com as prioridades, o que resolver primeiro e quanto custa regularizar. Sem compromisso.']));
    var duplos1 = el('div', { classe: 'campos-duplos' }, [
      campo('dc-nome', 'Nome', 'text', { autocomplete: 'name', maxlength: '150' }, true),
      campo('dc-empresa', 'Empresa', 'text', { autocomplete: 'organization', maxlength: '200' }, false)
    ]);
    var duplos2 = el('div', { classe: 'campos-duplos' }, [
      campo('dc-telefone', 'Telefone ou WhatsApp', 'tel', { autocomplete: 'tel', inputmode: 'tel', maxlength: '20', placeholder: '(11) 90000-0000' }, false),
      campo('dc-email', 'E-mail', 'email', { autocomplete: 'email', maxlength: '254', placeholder: 'nome@empresa.com.br' }, false)
    ]);
    var isca = el('div', { classe: 'campo-isca', 'aria-hidden': 'true' }, [
      el('label', { for: 'dc-website', texto: 'Não preencha este campo' }),
      el('input', { id: 'dc-website', name: 'website', type: 'text', tabindex: '-1', autocomplete: 'off' })
    ]);
    var enviar = el('button', { classe: 'botao', type: 'submit', texto: 'Quero o plano de regularização' });
    var refazer = el('button', { classe: 'diag__refazer', type: 'button', texto: 'Refazer o diagnóstico' });
    refazer.addEventListener('click', reiniciar);
    var retorno = el('div', { classe: 'form-retorno', role: 'status', 'aria-live': 'polite', tabindex: '-1' });
    form.appendChild(duplos1);
    form.appendChild(duplos2);
    form.appendChild(el('p', { classe: 'diag__sigilo', texto: 'Informe ao menos um telefone ou um e-mail.' }));
    form.appendChild(isca);
    form.appendChild(el('div', { classe: 'diag__acoes' }, [enviar, botaoWhatsApp(res, 'Prefiro o WhatsApp'), refazer]));
    form.appendChild(retorno);
    caixa.appendChild(form);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.getAttribute('aria-busy') === 'true') return;
      var v = validar(form);
      ['nome', 'telefone', 'email'].forEach(function (k) { marcar(form, k, v.erros[k]); });
      var chaves = Object.keys(v.erros);
      if (chaves.length) { var p = form.querySelector('[name="' + chaves[0] + '"]'); if (p) p.focus(); return; }
      form.setAttribute('aria-busy', 'true');
      enviar.disabled = true;
      enviar.textContent = 'Enviando…';
      var corpo = Object.assign({ uid: estado.uid, respostas: estado.indices.slice(0, P.length), website: form.website.value,
        pagina: window.location.pathname, utm: utm }, v.d);
      postar(endpoint + '/contato', corpo).then(function (x) {
        if (x.r.ok && x.j.ok) {
          estado.contato = v.d;
          concluido(caixa, res);
          return;
        }
        if (x.j.erros) {
          var primeiro = null;
          Object.keys(x.j.erros).forEach(function (k) { primeiro = marcar(form, k, x.j.erros[k]) || primeiro; });
          if (primeiro) primeiro.focus();
          return;
        }
        falha(retorno, x.j.mensagem);
      }).catch(function () { falha(retorno); }).then(function () {
        form.removeAttribute('aria-busy');
        enviar.disabled = false;
        enviar.textContent = 'Quero o plano de regularização';
      });
    });
    return caixa;
  }

  function falha(retorno, msg) {
    retorno.className = 'form-retorno aparece is-erro';
    retorno.textContent = (msg || 'Não conseguimos enviar agora') + '. Tente de novo ou fale com a gente pelo WhatsApp.';
    retorno.focus({ preventScroll: true });
  }

  function concluido(caixa, res) {
    caixa.innerHTML = '';
    var titulo = el('h3', { texto: 'Recebemos seu contato' });
    caixa.appendChild(titulo);
    caixa.appendChild(el('p', {}, ['A equipe técnica fala com você em até ', el('strong', { texto: res.faixa.prazo }),
      ' com a leitura destes riscos e o plano para eliminá-los.']));
    var refazer = el('button', { classe: 'diag__refazer', type: 'button', texto: 'Refazer o diagnóstico' });
    refazer.addEventListener('click', reiniciar);
    caixa.appendChild(el('div', { classe: 'diag__acoes' }, [botaoWhatsApp(res, 'Adiantar pelo WhatsApp'), refazer]));
    focar(titulo);
  }

  function reiniciar() {
    estado = { indices: [], atual: 0, inicio: Date.now(), uid: '', enviado: false, contato: null };
    pergunta(0);
  }

  raiz.querySelector('[data-diag-comecar]').addEventListener('click', function () {
    estado.inicio = Date.now();
    pergunta(0);
  });
})();
