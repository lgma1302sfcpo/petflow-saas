import Link from "next/link";
import type { Metadata } from "next";
import { BarChart3,CalendarDays,CircleDollarSign,PackageSearch,PawPrint,ReceiptText,ShieldCheck,ShoppingCart,Users,Warehouse } from "lucide-react";

export const metadata: Metadata = {
  title: "Como funciona",
  description: "Conheça as telas do PetFlow e veja como sua loja recebe o primeiro acesso.",
};

const features: Array<[string,string,typeof ShoppingCart]> = [
  ["Vendas (PDV)", "Busca por nome, código ou código de barras, carrinho rápido, pagamento dividido e venda a granel. Funciona até offline, sincronizando quando a internet voltar.", ShoppingCart],
  ["Estoque", "Saldo por loja, movimentações auditadas e alerta automático de estoque baixo.", Warehouse],
  ["Produtos", "Cadastro com código interno, SKU, categoria, marca e preço, disponível em uma ou várias lojas.", PackageSearch],
  ["Clientes e pets", "Histórico de compras, pets cadastrados e filtro de quem não compra há um tempo, pra você reativar contato.", Users],
  ["Caixa", "Abertura, sangria, suprimento e fechamento por operador, com conferência de vendas e pagamentos.", ReceiptText],
  ["Financeiro", "Contas a pagar e receber por categoria, com vencimentos e saldo projetado.", CircleDollarSign],
  ["Banho e tosa", "Agenda por profissional, serviços com comissão configurável e lembrete por WhatsApp.", CalendarDays],
  ["Relatórios", "Faturamento, lucro estimado, produtos mais vendidos, comparação entre lojas e exportação em CSV.", BarChart3],
  ["Equipe e permissões", "Cada funcionário só acessa o que precisa; toda ação fica registrada na auditoria.", ShieldCheck],
];

const shots: Array<[string,string,string]> = [
  ["/marketing/dashboard.png", "Painel da loja", "Faturamento, vendas do dia e alertas de estoque, tudo em um lugar só."],
  ["/marketing/pdv.png", "Venda rápida", "PDV enxuto: busca, carrinho e pagamento sem trocar de tela."],
  ["/marketing/clientes.png", "Clientes e pets", "Histórico, pets cadastrados e filtro de clientes inativos."],
  ["/marketing/banho-e-tosa.png", "Banho e tosa", "Agenda semanal por profissional com status de cada atendimento."],
  ["/marketing/financeiro.png", "Financeiro", "Contas a pagar e receber com vencimentos organizados."],
];

const steps: Array<[string,string]> = [
  ["Você recebe o acesso", "O responsável pela sua loja recebe o endereço do sistema, o identificador da empresa, um usuário administrador e uma senha temporária."],
  ["Você entra e troca a senha", "Acesse a tela de login com esses três dados e defina uma senha nova, só sua."],
  ["Você configura sua loja", "Dados e identidade visual do pet shop, filiais, funcionários e permissões, produtos e estoque, serviços e profissionais, clientes e pets, meios de pagamento e regras operacionais — no seu ritmo."],
];

export default function ComoFuncionaPage() {
  return <>
    <nav className="marketing-nav" style={{background:"var(--sidebar-bg)"}}>
      <span className="brand" style={{color:"white"}}><span className="brand-mark"><PawPrint size={20}/></span>PetFlow</span>
      <Link className="button button-primary" href="/login">Entrar</Link>
    </nav>
    <header className="marketing-hero">
      <span className="eyebrow" style={{color:"var(--accent)"}}>Como funciona</span>
      <h1 className="display">Tudo que sua loja precisa, numa tela só.</h1>
      <p>O PetFlow reúne vendas, estoque, caixa, financeiro, banho e tosa e relatórios de cada pet shop — com dados isolados por empresa e acesso controlado por funcionário.</p>
      <Link className="button button-primary" href="/login">Acessar minha loja</Link>
    </header>

    <section className="marketing-section">
      <div className="section-head"><span className="eyebrow">O que tem no sistema</span><h2 className="display" style={{fontSize:"2rem"}}>Um módulo pra cada parte do dia a dia</h2><p>Ative só o que sua loja usa — os módulos contratados vêm habilitados desde o primeiro acesso.</p></div>
      <div className="feature-grid">
        {features.map(([title,description,Icon])=><article className="card feature-card" key={title}><span className="quick-icon"><Icon size={19}/></span><h3>{title}</h3><p>{description}</p></article>)}
      </div>
    </section>

    <section className="marketing-section" style={{background:"var(--surface)"}}>
      <div className="section-head"><span className="eyebrow">Telas do sistema</span><h2 className="display" style={{fontSize:"2rem"}}>Veja como é por dentro</h2><p>Capturas reais das principais telas, com dados de exemplo.</p></div>
      <div className="shot-grid">
        {shots.map(([src,title,description])=><figure className="shot-card" key={src}><img src={src} alt={`Tela de ${title}`}/><figcaption>{title}<br/><span style={{fontWeight:400,color:"var(--muted)",fontSize:".8rem"}}>{description}</span></figcaption></figure>)}
      </div>
    </section>

    <section className="marketing-section">
      <div className="section-head"><span className="eyebrow">Primeiro acesso</span><h2 className="display" style={{fontSize:"2rem"}}>Como entrar pela primeira vez</h2><p>Sem e-mail de funcionário obrigatório: só empresa, usuário e senha.</p></div>
      <div className="step-list">
        {steps.map(([title,description],index)=><div className="step-item card" key={title}><span className="step-number">{index+1}</span><div><strong>{title}</strong><span>{description}</span></div></div>)}
      </div>
    </section>

    <section className="marketing-cta">
      <span className="eyebrow">Pronto pra começar?</span>
      <h2 className="display" style={{fontSize:"2rem",margin:"10px 0"}}>Entre com os dados da sua loja</h2>
      <p>Empresa, usuário e senha que você recebeu do administrador da plataforma.</p>
      <Link className="button button-primary" href="/login">Ir para o login</Link>
    </section>
  </>;
}
