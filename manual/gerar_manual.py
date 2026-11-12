# AVISO DE PROVENIÊNCIA — Gerado no ambiente da Prime Holding.
# Modelo: Claude Opus 5.5 (claude-opus-5-5, Claude Code)
# Solicitante: 1.home.automation.technology@gmail.com
# Este aviso é obrigatório e não deve ser removido.
"""Gera manual/Manual-do-Dono-Barbearia-Prime.pdf (HTML impresso pelo Chrome headless).

Uso: python3 manual/gerar_manual.py
As fotos ficam em manual/prints/ (telas do painel do dono).
"""
import subprocess
import tempfile
from pathlib import Path

AQUI = Path(__file__).resolve().parent
PRINTS = AQUI / "prints"
SAIDA = AQUI / "Manual-do-Dono-Barbearia-Prime.pdf"
SITE = "barbearia-prime.pages.dev"


def foto(nome: str, legenda: str) -> str:
    return f'<figure><img src="{(PRINTS / nome).as_uri()}"><figcaption>{legenda}</figcaption></figure>'


CSS = """
@page { size: A4; margin: 18mm 16mm 18mm 16mm;
  @bottom-center { content: "Barbearia Prime · Manual do dono · página " counter(page); font-size: 8pt; color: #888; } }
@page :first { @bottom-center { content: none; } }
body { font-family: "DejaVu Sans", Arial, sans-serif; font-size: 10.5pt; color: #111; line-height: 1.45; }
.capa { text-align: center; padding-top: 55mm; page-break-after: always; }
.capa img { width: 120mm; border-radius: 6mm; }
.capa h1 { font-size: 26pt; margin: 14mm 0 2mm; letter-spacing: .5px; }
.capa p { color: #555; font-size: 12pt; margin: 1mm 0; }
h2 { font-size: 15pt; border-bottom: 2px solid #111; padding-bottom: 2mm; margin-top: 9mm; page-break-after: avoid; }
h3 { font-size: 11.5pt; margin: 5mm 0 1.5mm; page-break-after: avoid; }
p { margin: 1.5mm 0; }
ul, ol { margin: 1mm 0 2mm 5mm; padding-left: 4mm; }
li { margin: .8mm 0; }
figure { margin: 3mm 0 4mm; page-break-inside: avoid; text-align: center; }
figure img { width: 100%; border: 1px solid #ccc; border-radius: 2mm; }
figcaption { font-size: 8.5pt; color: #666; margin-top: 1mm; }
.dica { background: #f3f3f3; border-left: 4px solid #111; padding: 2.5mm 3.5mm; margin: 3mm 0; page-break-inside: avoid; }
.alerta { background: #fff4e5; border-left: 4px solid #d97706; padding: 2.5mm 3.5mm; margin: 3mm 0; page-break-inside: avoid; }
.indice li { margin: 1.2mm 0; }
table { border-collapse: collapse; width: 100%; font-size: 9.5pt; margin: 2mm 0 4mm; page-break-inside: avoid; }
td, th { border: 1px solid #ccc; padding: 1.8mm 2.5mm; vertical-align: top; text-align: left; }
th { background: #111; color: #fff; }
.quebra { page-break-before: always; }
b { font-weight: bold; }
"""

HTML_TXT = f"""
<html><head><meta charset="utf-8"><style>{CSS}</style></head><body>

<div class="capa">
  <img src="{(PRINTS / 'logo.jpg').as_uri()}">
  <h1>Manual do Dono</h1>
  <p>Tudo o que você pode fazer no sistema da barbearia</p>
  <p style="margin-top:10mm"><b>{SITE}</b></p>
</div>

<h2>Sumário</h2>
<ol class="indice">
  <li>Como entrar e instalar no celular</li>
  <li>Painel</li>
  <li>Agenda: marcar, confirmar, concluir, cancelar e bloquear</li>
  <li>Folgas e feriados</li>
  <li>Serviços</li>
  <li>Planos mensais (link todo mês ou cartão recorrente)</li>
  <li>Assinaturas e importação dos clientes antigos</li>
  <li>Clientes</li>
  <li>Financeiro</li>
  <li>Configurações</li>
  <li>O que o sistema faz sozinho (mensagens automáticas)</li>
  <li>O que o cliente consegue fazer</li>
  <li>Dúvidas rápidas</li>
</ol>

<h2>1. Como entrar e instalar no celular</h2>
<ul>
  <li>Abra <b>{SITE}/login</b> e entre com o seu usuário (ex.: <b>genilton</b>) ou e-mail e a sua senha. O 👁 no campo de senha mostra o que você digitou.</li>
  <li>Como dono, você cai direto no <b>painel</b>. No celular, o menu fica embaixo; o que não cabe está em <b>Mais</b>.</li>
  <li><b>Instalar como app:</b> no Chrome do celular, toque em ⋮ → <b>Adicionar à tela inicial</b>. Fica com o ícone da barbearia.</li>
  <li><b>Tema:</b> o botão 🌙 no topo deixa a tela escura; o ☀️ volta para o branco. Fica salvo no aparelho.</li>
  <li><b>Sininho 🔔:</b> mostra os avisos (novo agendamento, pagamento recebido, atraso…). Toque em <b>Ativar</b> para receber também como notificação no celular.</li>
</ul>
<div class="dica"><b>Link para os clientes:</b> mande só <b>{SITE}</b>. Ele abre no cadastro, e quem não quiser se cadastrar tem a opção de marcar só com nome e telefone.</div>

<h2>2. Painel</h2>
<p>Resumo do dia: quantos horários tem hoje, assinaturas ativas, as que estão vencendo, as vencidas e a receita mensal das assinaturas. Embaixo, a <b>agenda de hoje</b> e o que precisa de atenção.</p>
{foto('painel.jpg', 'Painel do dono')}

<h2 class="quebra">3. Agenda</h2>
<p>Mostra o dia em uma grade, do horário de abrir ao de fechar. Use <b>‹ Hoje ›</b> para trocar de dia. Cada horário aparece como <b>marcado</b>, <b>Livre</b>, <b>🍽 Almoço</b> ou <b>⛔ Bloqueado</b>.</p>
{foto('agenda.jpg', 'Agenda do dia, com almoço e horários livres')}

<h3>Marcar um horário para o cliente</h3>
<ol>
  <li>Toque em <b>+ Marcar horário</b> (ou em um horário <b>Livre</b>).</li>
  <li><b>Cliente:</b> busque pelo nome ou telefone. Se a pessoa não tem cadastro, toque em <b>+ Cliente sem cadastro</b> e ponha nome e WhatsApp.</li>
  <li><b>Serviços:</b> toque em um ou mais. Se o cliente tem plano, aparece quantos créditos ainda tem.</li>
  <li><b>Como vai ser pago:</b> <b>Crédito do plano</b> (desconta do plano) ou <b>Avulso</b> (paga no balcão).</li>
  <li><b>Dia e horário:</b> toque no horário. Pronto — o cliente recebe a confirmação no WhatsApp.</li>
</ol>
{foto('marcar.jpg', 'Janela "Marcar horário"')}
<div class="dica">Os horários livres seguem o <b>tempo de cada serviço</b>: Barba (30 min) oferece 8:00, 8:30, 9:00…; Corte (40 min) oferece 8:00, 8:40, 9:20… O almoço e os bloqueios ficam de fora sozinhos.</div>

<h3>Depois do atendimento</h3>
<ul>
  <li><b>Confirmar:</b> marca que o cliente confirmou que vem.</li>
  <li><b>Concluir:</b> o atendimento aconteceu. Se for avulso, o sistema pergunta <b>"Pagou como?"</b> — 💵 Dinheiro, Pix ou 💳 Cartão. Isso deixa o relatório certo (a taxa da maquininha é descontada em Pix e cartão).</li>
  <li><b>Não compareceu:</b> o cliente faltou.</li>
  <li><b>Cancelar:</b> o horário sai da agenda, o cliente é avisado no WhatsApp e, se usou crédito do plano, o crédito volta.</li>
</ul>
<div class="alerta"><b>Esqueceu de marcar?</b> Os horários de dias anteriores que ficaram sem "Concluir" viram <b>concluído sozinho</b> na manhã seguinte, e você recebe um aviso. Se alguém faltou, abra a agenda daquele dia e toque em <b>Não compareceu</b>.</div>

<h3>Bloquear horários</h3>
<ul>
  <li><b>Bloquear</b> ao lado de um horário livre: some para os clientes (ex.: compromisso). Toque em <b>desbloquear</b> para liberar.</li>
  <li><b>⛔ Bloquear o dia todo:</b> ninguém consegue marcar nesse dia. Os horários já marcados continuam.</li>
  <li>O <b>almoço</b> é configurado uma vez em Configurações e vale para todos os dias.</li>
</ul>

<h2 class="quebra">4. Folgas e feriados</h2>
<p>Aqui você fecha a barbearia em feriados, férias, consulta médica, folga ou qualquer outro motivo. Os horários somem da agenda dos clientes e, com antecedência, <b>todos os clientes recebem no WhatsApp</b> o aviso de que a barbearia vai estar fechada, para marcarem antes. <b>O motivo nunca aparece para o cliente.</b></p>
{foto('feriados.jpg', 'Folgas e feriados')}
<ul>
  <li><b>Feriados nacionais:</b> a lista dos próximos 12 meses se atualiza sozinha todo ano (inclui Carnaval, Sexta-feira Santa e Corpus Christi, que mudam de data). Toque em <b>Fechar</b> nos que a barbearia não abre.</li>
  <li><b>Fechar todo ano:</b> marque e o sistema fecha e avisa sozinho nos próximos anos (ex.: Natal).</li>
  <li><b>Avisar os clientes X dias antes:</b> escolha de 2 a 15 dias (padrão: 5).</li>
  <li><b>Fechar por outro motivo:</b> escolha Férias, Consulta médica, Folga, Evento ou Outro. Dá para fechar <b>vários dias</b> (De / Até) ou <b>só uma parte do dia</b> (ex.: das 14:00 às 18:00).</li>
  <li><b>Reabrir:</b> libera os horários de novo. Se os clientes já foram avisados, lembre de avisar que vai abrir.</li>
</ul>
<div class="dica"><b>Exemplo do aviso:</b> "📅 No dia 20/11 (sexta), a barbearia vai estar fechada. Quer cortar antes? Garanta seu horário agora…"</div>

<h2>5. Serviços</h2>
<p>Cadastre cada serviço com <b>nome</b>, <b>preço</b> e <b>duração em minutos</b>. A duração define os horários oferecidos na agenda. Use <b>+ Novo serviço</b> para adicionar, <b>Editar</b> para mudar e desative o que não oferece mais.</p>

<h2 class="quebra">6. Planos mensais</h2>
<p>Crie os planos com nome, descrição, valor por mês e os <b>serviços incluídos por mês</b> (ex.: 4 cortes). Cada plano aparece com a logo para os clientes.</p>
{foto('planos.jpg', 'Planos mensais')}
<h3>Como cobrar cada plano — você escolhe</h3>
<table>
  <tr><th>🔗 Link todo mês</th><th>💳 Cartão recorrente</th></tr>
  <tr>
    <td>O sistema manda o link de pagamento (Pix ou cartão) no WhatsApp do cliente todo mês. Quando ele paga, o sistema <b>fica sabendo sozinho</b> e confirma. <b>100% automático.</b></td>
    <td>Igual à maquininha: o cliente põe o cartão uma vez e a InfinitePay desconta sozinha todo mês. A InfinitePay <b>não avisa o sistema</b>, então você dá dois toques (veja abaixo).</td>
  </tr>
</table>
<h3>Cartão recorrente — passo a passo</h3>
<ol>
  <li>No app da InfinitePay: <b>Vendas → Planos e Recorrência → Planos e cobranças</b> → toque no plano com o mesmo valor → <b>copiar link</b>.</li>
  <li>No sistema: <b>Planos → Editar</b> → em "Como cobrar este plano" escolha <b>💳 Cartão recorrente</b> e cole o link.</li>
  <li>Quando um cliente novo assinar, confira no app da InfinitePay e toque em <b>Confirmar pagamento</b> em Assinaturas (só no 1º mês).</li>
  <li>Se o app da InfinitePay mostrar uma cobrança <b>recusada</b>, toque em <b>Cartão recusado</b>. O cliente recebe o aviso 🚨 com o link para cadastrar o cartão de novo.</li>
</ol>
<div class="alerta">Se cancelar um plano no cartão, <b>cancele também a recorrência no app da InfinitePay</b> — senão o cartão continua sendo cobrado. O sistema te lembra no WhatsApp.</div>

<h2 class="quebra">7. Assinaturas</h2>
<p>Lista de quem assina, com a situação de cada um: <b>em dia</b>, <b>vencendo</b>, <b>em atraso</b>, <b>vencido</b> ou <b>cancelado</b>, e a data do vencimento. Aqui você também <b>cancela</b> uma assinatura e, nos planos no cartão, usa <b>Confirmar pagamento</b> e <b>Cartão recusado</b>.</p>
<h3>Importar do sistema antigo (clientes que já pagam)</h3>
<p>Toque em <b>+ Importar do sistema antigo</b> e cadastre um cliente por vez:</p>
<ol>
  <li>Nome e WhatsApp (só números, ex.: 31995012927).</li>
  <li>Plano.</li>
  <li>Quantos serviços ele <b>já usou</b> neste mês.</li>
  <li>A mensalidade deste mês: <b>💳 Cartão recorrente</b> (já desconta na InfinitePay), <b>✅ Já pagou</b> ou <b>⏳ Não pagou</b>.</li>
  <li>A data: próximo vencimento (ou o vencimento em aberto).</li>
</ol>
<p>Antes de salvar, a tela mostra o que vai acontecer. A partir daí, a cobrança e os avisos seguem sozinhos.</p>
{foto('importar.jpg', 'Importar do sistema antigo')}

<h2>8. Clientes</h2>
<p>Todos os clientes, com telefone e plano. Telefone em <b>amarelo</b> está fora do padrão: toque nele para corrigir. Quem veio do sistema antigo aparece com a marca <b>sem app</b> e recebe tudo pelo WhatsApp.</p>

<h2 class="quebra">9. Financeiro</h2>
<p>Escolha <b>Semana, Mês ou Ano</b> e ande com ‹ ›. Mostra:</p>
<ul>
  <li><b>Entradas</b> (mensalidades + avulsos), <b>Saídas</b> e <b>Lucro</b>. Se as taxas estiverem preenchidas em Configurações, aparece também o <b>líquido</b> (o que cai na conta).</li>
  <li>Gráfico por dia/mês, mensalidades por plano, avulsos por serviço, serviços feitos pelo plano e <b>Cancelamentos</b>.</li>
  <li><b>Saídas:</b> toque em <b>+ Adicionar saída</b> (aluguel, energia, água, produtos…). Marque <b>Repete todo mês</b> nas fixas.</li>
  <li><b>⬇ Baixar PDF</b> (com a logo) ou <b>⬇ Baixar CSV</b> (abre no Excel).</li>
</ul>
{foto('financeiro.jpg', 'Financeiro')}
<div class="dica">Avulsos só entram quando o horário está <b>Concluído</b>. Mensalidades entram no dia em que são pagas.</div>

<h2 class="quebra">10. Configurações</h2>
{foto('config1.jpg', 'Pagamentos, WhatsApp da barbearia e dados')}
<ul>
  <li><b>Pagamentos (InfinitePay):</b> mostra a conta conectada. É por ela que saem os links de mensalidade.</li>
  <li><b>WhatsApp da barbearia:</b> os avisos saem deste número. Para conectar pelo celular: <b>Só pelo celular → Gerar código</b> e digite o código no WhatsApp em <b>Aparelhos conectados → Conectar com número de telefone</b>.</li>
  <li><b>Dados da barbearia:</b> nome e telefone (só números).</li>
  <li><b>Quando um cliente cancela o plano:</b> a oferta que vai na mensagem para tentar manter o cliente (ex.: "10% de desconto").</li>
  <li><b>Taxas da InfinitePay</b> 🔒 (só você vê): % no Pix e no cartão, para o Financeiro mostrar o líquido.</li>
  <li><b>Almoço:</b> pausa de todo dia (ex.: 12:00 às 13:00).</li>
  <li><b>Horário de funcionamento:</b> marque os dias que abre e o horário de cada um.</li>
</ul>
{foto('config2.jpg', 'Taxas, almoço e horário de funcionamento')}
<p>Toque em <b>Salvar</b> no fim da página.</p>

<h2 class="quebra">11. O que o sistema faz sozinho</h2>
<table>
  <tr><th>Quando</th><th>O cliente recebe no WhatsApp</th></tr>
  <tr><td>Horário marcado (por ele, por você ou sem cadastro)</td><td>✂️ Confirmação com serviço, dia, hora e valor</td></tr>
  <tr><td>24 h antes do horário</td><td>⏰ Lembrete "amanhã às 10:00 você tem Corte"</td></tr>
  <tr><td>Você cancelou o horário</td><td>Aviso do cancelamento (e que o crédito voltou)</td></tr>
  <tr><td>5 dias antes do vencimento (link todo mês)</td><td>Link de pagamento Pix/cartão</td></tr>
  <tr><td>Véspera do vencimento</td><td>⏰ Lembrete com o link</td></tr>
  <tr><td>Pagou</td><td>✅ Pagamento confirmado</td></tr>
  <tr><td>Não pagou no vencimento</td><td>🚨 Em atraso (e você também é avisado); lembrete a cada 3 dias; com 10 dias o plano vence</td></tr>
  <tr><td>Cartão recorrente</td><td>⏰ Véspera da cobrança · 🚨 Cartão recusado · ✅ Confirmado</td></tr>
  <tr><td>Cancelou o plano</td><td>Mensagem perguntando o motivo, com a sua oferta</td></tr>
  <tr><td>Feriado / folga / férias</td><td>📅 Aviso com antecedência (sem o motivo)</td></tr>
  <tr><td>Importado do sistema antigo</td><td>Boas-vindas ao sistema novo</td></tr>
</table>
<p>Se um número não tiver WhatsApp ou a mensagem não sair, você recebe <b>📵 WhatsApp não enviado</b> no sininho — é só corrigir o telefone em Clientes.</p>

<h2>12. O que o cliente consegue fazer</h2>
<ul>
  <li><b>Criar conta</b> com nome, usuário, telefone e senha — ou <b>marcar sem cadastro</b>, só com nome e telefone.</li>
  <li>Marcar horário escolhendo serviço, dia e hora (já usa o crédito do plano sozinho).</li>
  <li>Desmarcar pelo app até <b>2 horas antes</b>.</li>
  <li>Ver e assinar planos, pagar a mensalidade, ver os créditos do mês, fazer upgrade (paga só a diferença) e cancelar o plano.</li>
</ul>

<h2>13. Dúvidas rápidas</h2>
<ul>
  <li><b>Os avisos pararam de chegar?</b> Veja em Configurações se o WhatsApp da barbearia está <b>✓ Conectado</b>. Se não estiver, conecte de novo com o código.</li>
  <li><b>Telefone:</b> sempre só números, com DDD e o 9 (ex.: 31995012927).</li>
  <li><b>Cliente quer mudar de horário:</b> cancele e marque de novo (ele é avisado nas duas vezes). Algo diferente do esperado? Fale com o suporte do sistema.</li>
</ul>

</body></html>
"""

if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as tmp:
        pagina = Path(tmp) / "manual.html"
        pagina.write_text(HTML_TXT, encoding="utf-8")
        subprocess.run(
            [
                "google-chrome", "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                f"--user-data-dir={tmp}/perfil", "--allow-file-access-from-files",
                f"--print-to-pdf={SAIDA}", pagina.as_uri(),
            ],
            check=True, capture_output=True, timeout=120,
        )
    print(SAIDA)
