import { motion } from 'motion/react'
import Navbar from '@/components/layout/Navbar'
import PublicFooter from '@/components/layout/PublicFooter'

const SECTIONS = [
  {
    title: '1. Uso do serviço',
    body: [
      'O Report Flow é um software como serviço para importar planilhas CSV/XLSX, estruturar dados, gerar KPIs, gráficos e relatórios exportáveis em HTML.',
      'Ao utilizar a plataforma, você concorda em usar o sistema apenas para fins legítimos, empresariais ou profissionais, respeitando a legislação aplicável e estes Termos de Uso.',
    ],
  },
  {
    title: '2. Cadastro, login e acesso',
    body: [
      'Parte dos recursos exige criação de conta, autenticação e manutenção de credenciais válidas.',
      'Você é responsável por manter a confidencialidade de seu login, por controlar o acesso à sua conta e por informar uso não autorizado quando identificado.',
    ],
  },
  {
    title: '3. Upload e processamento de planilhas',
    body: [
      'O sistema permite o envio e processamento de arquivos CSV e XLSX para análise e geração de relatórios.',
      'Você declara possuir autorização para utilizar os dados carregados na plataforma e é responsável pela legalidade, qualidade e integridade do conteúdo enviado.',
    ],
  },
  {
    title: '4. Planos, limites e cobrança',
    body: [
      'O uso do serviço pode estar sujeito a limites de relatórios, funcionalidades e volume conforme o plano contratado.',
      'Pagamentos, cobranças recorrentes, upgrades e demais operações financeiras podem ser processados por meio da Stripe, sujeitando-se também aos termos e políticas dessa provedora.',
    ],
  },
  {
    title: '5. Responsabilidades do usuário',
    body: [
      'Você não deve utilizar a plataforma para atividades ilícitas, envio de conteúdo indevido, violação de direitos de terceiros ou tentativa de comprometer a disponibilidade do serviço.',
      'Também é sua responsabilidade revisar os relatórios gerados antes de compartilhá-los ou utilizá-los em decisões operacionais, comerciais ou financeiras.',
    ],
  },
  {
    title: '6. Limitação de responsabilidade',
    body: [
      'O Report Flow é fornecido com esforços razoáveis de disponibilidade e funcionamento, mas não promete operação ininterrupta, ausência total de falhas ou segurança absoluta.',
      'Na máxima extensão permitida pela lei, não nos responsabilizamos por perdas indiretas, decisões tomadas exclusivamente com base no conteúdo gerado ou uso inadequado do sistema por usuários.',
    ],
  },
  {
    title: '7. Suporte e contato',
    body: [
      'Dúvidas comerciais, pedidos de suporte e solicitações operacionais podem ser enviados pelos canais públicos disponibilizados na plataforma.',
      'Os prazos e níveis de atendimento podem variar conforme o plano contratado.',
    ],
  },
  {
    title: '8. Exclusão de dados e encerramento',
    body: [
      'Você pode solicitar exclusão de conta ou dados associados pelos canais de contato do produto, sujeito a eventuais retenções mínimas exigidas por lei ou por obrigações contratuais.',
      'Podemos suspender ou encerrar contas em caso de violação destes termos, uso abusivo ou risco relevante à operação do serviço.',
    ],
  },
  {
    title: '9. Alterações destes termos',
    body: [
      'Estes Termos de Uso podem ser atualizados periodicamente para refletir mudanças operacionais, comerciais, regulatórias ou técnicas.',
      'A versão vigente publicada nas páginas públicas do produto prevalece a partir de sua atualização.',
    ],
  },
]

export default function TermsPage() {
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
          <h1 className="text-4xl md:text-5xl font-bold text-[color:var(--tp)] mb-4">Termos de Uso</h1>
          <p className="text-[color:var(--ts)] text-base md:text-lg max-w-3xl">
            Estes termos descrevem as regras básicas de utilização do Report Flow, incluindo uso da plataforma, upload de planilhas, conta de acesso, cobrança e responsabilidades do usuário.
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
