import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'

export default function PublicFooter() {
  return (
    <footer className="py-10 px-4 border-t border-white/[0.06] text-center text-ink-600 text-sm">
      <div className="flex items-center justify-center gap-1 mb-3">
        <Sparkles className="w-4 h-4 text-brand-400" />
        <span className="font-semibold text-ink-300">Report Flow</span>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mb-3">
        <Link to="/pricing" className="text-ink-500 hover:text-[color:var(--tp)] transition-colors">Preços</Link>
        <Link to="/contato" className="text-ink-500 hover:text-[color:var(--tp)] transition-colors">Contato</Link>
        <Link to="/termos" className="text-ink-500 hover:text-[color:var(--tp)] transition-colors">Termos de Uso</Link>
        <Link to="/privacidade" className="text-ink-500 hover:text-[color:var(--tp)] transition-colors">Política de Privacidade</Link>
      </div>
      <p>© {new Date().getFullYear()} · Relatórios profissionais para equipes de procurement</p>
    </footer>
  )
}
