import { motion } from 'motion/react'
import Navbar from '@/components/layout/Navbar'
import PublicFooter from '@/components/layout/PublicFooter'

const SECTIONS = [
  {
    title: '1. Dados que podemos tratar',
    body: [
      'Podemos tratar dados de cadastro e autenticação, como nome, email e informações necessárias para acesso à conta.',
      'Também podemos tratar dados contidos em planilhas CSV/XLSX enviadas para processamento, além de metadados de uso da plataforma, limites de plano e históricos relacionados a relatórios gerados.',
    ],
  },
  {
    title: '2. Finalidades do tratamento',
    body: [
      'Utilizamos os dados para permitir login, operação da conta, processamento de planilhas, geração de relatórios, suporte, faturamento e evolução do produto.',
      'Também podemos usar informações operacionais para prevenção de abuso, diagnóstico técnico, atendimento ao cliente e cumprimento de obrigações legais.',
    ],
  },
  {
    title: '3. Upload e processamento de planilhas',
    body: [
      'Ao enviar planilhas para o Report Flow, os dados podem ser processados para classificar colunas, calcular métricas, gerar gráficos, insights e exportações.',
      'Você permanece responsável pelo conteúdo carregado e por garantir que possui base legal e autorização para tratar esses dados dentro do contexto de uso do sistema.',
    ],
  },
  {
    title: '4. Cobrança e pagamentos',
    body: [
      'Cobranças e operações de pagamento podem ser processadas por provedores terceirizados, incluindo a Stripe.',
      'Informações de faturamento, assinatura e status de pagamento podem ser tratadas para ativação de plano, gestão de limites e atendimento financeiro.',
    ],
  },
  {
    title: '5. Compartilhamento com terceiros',
    body: [
      'Compartilhamos dados apenas quando necessário para operação do serviço, atendimento, cobrança, infraestrutura tecnológica ou cumprimento de dever legal.',
      'Isso pode incluir provedores de pagamento, envio de email, hospedagem e observabilidade, sempre dentro do necessário para prestação do serviço.',
    ],
  },
  {
    title: '6. Segurança e retenção',
    body: [
      'Adotamos medidas razoáveis de segurança técnicas e organizacionais compatíveis com o porte e a natureza do produto, mas não prometemos segurança absoluta.',
      'Os dados podem ser mantidos pelo tempo necessário para prestação do serviço, suporte, auditoria operacional, prevenção a fraudes ou atendimento de exigências legais.',
    ],
  },
  {
    title: '7. Direitos e exclusão de dados',
    body: [
      'Você pode solicitar atualização, correção ou exclusão de dados pessoais associados à conta pelos canais de contato públicos do produto.',
      'Pedidos de exclusão poderão observar retenções mínimas exigidas por lei, por obrigações contratuais ou por necessidade legítima de segurança e registro operacional.',
    ],
  },
  {
    title: '8. Contato e suporte',
    body: [
      'Pedidos relacionados à privacidade, suporte ou operação do serviço podem ser enviados pelos canais públicos indicados no site.',
      'Ao entrar em contato conosco, poderemos tratar os dados fornecidos para responder sua solicitação e registrar o atendimento.',
    ],
  },
  {
    title: '9. Atualizações desta política',
    body: [
      'Esta Política de Privacidade pode ser revisada periodicamente para refletir mudanças legais, operacionais ou tecnológicas.',
      'A versão publicada nas rotas públicas do produto é a referência vigente para uso da plataforma.',
    ],
  },
]

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface-0 overflow-x-hidden">
      <Navbar />

      <section className="relative px-4 pt-24 pb-16">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-1/2 top-10 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-brand-900/20 blur-[120px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative max-w-4xl mx-auto"
        >
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-700/30 bg-brand-900/30 px-3 py-1 text-xs font-semibold text-brand-300">
            Documento público
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-[color:var(--tp)] mb-4">Política de Privacidade</h1>
          <p className="text-[color:var(--ts)] text-base md:text-lg max-w-3xl">
            Esta política resume como o Report Flow trata dados de cadastro, upload de planilhas, relatórios, suporte e cobrança para operar o produto de forma responsável.
          </p>

          <div className="mt-10 card surface-3d rounded-3xl p-6 md:p-8 space-y-8">
            {SECTIONS.map(section => (
              <section key={section.title}>
                <h2 className="text-xl font-semibold text-[color:var(--tp)] mb-3">{section.title}</h2>
                <div className="space-y-3">
                  {section.body.map(paragraph => (
                    <p key={paragraph} className="text-sm md:text-[15px] leading-7 text-[color:var(--ts)]">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </motion.div>
      </section>

      <PublicFooter />
    </div>
  )
}
