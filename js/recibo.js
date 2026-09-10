// ============================================================================
//  recibo.js — Comprovante de venda (imprimir / salvar em PDF)
// ----------------------------------------------------------------------------
//  Sem biblioteca de PDF: monta o comprovante num bloco escondido e chama
//  window.print(). O "Salvar como PDF" do próprio navegador gera o arquivo —
//  é o mesmo caminho que o Relatórios já usa.
//
//  Isto NÃO é nota fiscal: nota fiscal é emitida pela SEFAZ (NF-e) ou pela
//  prefeitura (NFS-e), exige certificado digital A1 e cadastro fiscal. Este
//  documento é o recibo que o cliente leva — por isso o rodapé diz isso.
// ============================================================================

import { el } from "./ui.js";
import { formatBRL, formatDate } from "./money.js";
import { formatDocumento } from "./regras.js";

function fmtQtd(n) {
  return Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function linha(rotulo, valor) {
  return el("div", { class: "recibo__linha" },
    el("span", { class: "recibo__rot" }, rotulo),
    el("span", { class: "recibo__val" }, valor));
}

// dados: { numero, data, empresa, empresaDoc, cliente, clienteDoc,
//          descricao, totalCents, itens: [{ product_name, qty, unit_price_cents }] }
export function imprimirRecibo(dados) {
  document.getElementById("recibo")?.remove();

  const itens = dados.itens || [];
  const corpo = itens.length
    ? el("table", { class: "recibo__itens" },
        el("thead", {}, el("tr", {},
          el("th", {}, "Item"),
          el("th", { class: "recibo__num" }, "Qtd"),
          el("th", { class: "recibo__num" }, "Unit."),
          el("th", { class: "recibo__num" }, "Total"))),
        el("tbody", {}, ...itens.map((it) => el("tr", {},
          el("td", {}, it.product_name || "Produto"),
          el("td", { class: "recibo__num" }, fmtQtd(it.qty)),
          el("td", { class: "recibo__num" }, formatBRL(it.unit_price_cents)),
          el("td", { class: "recibo__num" }, formatBRL(Math.round(Number(it.qty) * Number(it.unit_price_cents)))))))
      )
    : linha("Referente a", dados.descricao || "Venda");

  const bloco = el("div", { id: "recibo" },
    el("header", { class: "recibo__head" },
      el("h1", {}, "Comprovante"),
      el("div", { class: "recibo__emissor" },
        el("strong", {}, dados.empresa || ""),
        dados.empresaDoc ? el("span", {}, "CNPJ/CPF " + formatDocumento(dados.empresaDoc)) : null)
    ),
    linha("Nº", dados.numero),
    linha("Data", formatDate(dados.data)),
    linha("Cliente", dados.cliente || "Consumidor não identificado"),
    dados.clienteDoc ? linha("CPF/CNPJ", formatDocumento(dados.clienteDoc)) : null,
    itens.length && dados.descricao ? linha("Referente a", dados.descricao) : null,
    corpo,
    el("div", { class: "recibo__total" },
      el("span", {}, "Total"),
      el("strong", {}, formatBRL(dados.totalCents))),
    el("div", { class: "recibo__assina" },
      el("span", { class: "recibo__rubrica" }, ""),
      el("span", {}, dados.empresa || "")),
    el("p", { class: "recibo__aviso" },
      "Documento sem valor fiscal. Não substitui nota fiscal.")
  );

  document.body.append(bloco);
  document.body.classList.add("imprimindo-recibo");
  // afterprint dispara tanto no "imprimir" quanto no "cancelar" do diálogo.
  window.addEventListener("afterprint", () => {
    document.body.classList.remove("imprimindo-recibo");
    bloco.remove();
  }, { once: true });
  window.print();
}
