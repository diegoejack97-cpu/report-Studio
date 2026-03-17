import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion } from 'motion/react'
import { Upload, FileSpreadsheet } from 'lucide-react'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'

export default function UploadZone({ onLoad }) {
  const [loading, setLoading] = useState(false)

  const processFile = async (file) => {
    setLoading(true)
    try {
      const ext = file.name.split('.').pop().toLowerCase()
      if (['xlsx', 'xls'].includes(ext)) {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const mx = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
        if (mx.length < 2) throw new Error('Planilha vazia')
        const headers = mx[0].map(h => String(h || '').trim())
        const rows = mx.slice(1)
          .filter(r => r.some(c => c !== '' && c != null))
          .map(r => headers.map((_, i) => String(r[i] ?? '')))
        onLoad(rows, headers)
      } else {
        const text = await file.text()
        const sep = text.includes('\t') ? '\t' : ','
        const lines = text.split(/\r?\n/).filter(l => l.trim())
        const headers = lines[0].split(sep).map(c => c.trim().replace(/^"|"$/g, ''))
        const rows = lines.slice(1)
          .filter(l => l.trim())
          .map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, '')))
        onLoad(rows, headers)
      }
    } catch (err) {
      toast.error('Erro ao processar arquivo: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const onDrop = useCallback(files => { if (files[0]) processFile(files[0]) }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, accept: { 'application/vnd.ms-excel': ['.xls'], 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'], 'text/csv': ['.csv'], 'text/plain': ['.txt'] },
    maxFiles: 1, multiple: false
  })

  const loadDemo = () => {
    const tipos = ['Consultoria','TI','Limpeza','Segurança','Manutenção','RH','Logística','Facilities']
    const status = ['Finalizado','Finalizado','Finalizado','Finalizado','Refinado']
    const forns = ['Alpha Corp','Beta Serviços','Gamma Tech','Delta Soluções','Epsilon Tec','Zeta Group']
    const base = [28078.85,45230.10,12500,67890.50,33100,89450.75,22300,55000,41200,18750.25]
    const rows = []
    for (let i = 0; i < 60; i++) {
      const vc = base[i % base.length] * (1 + (i * 0.07) % 1.2)
      const vn = vc * (0.88 + (i % 5) * 0.02)
      const m = String((i % 12) + 1).padStart(2, '0')
      rows.push([`CTR-2025-${String(i+1).padStart(4,'0')}`, tipos[i%tipos.length], forns[i%forns.length], status[i%status.length], `${m}/2025`, vc.toFixed(2).replace('.',','), vn.toFixed(2).replace('.',','), (vc-vn).toFixed(2).replace('.',',')])
    }
    onLoad(rows, ['Contrato','Tipo','Fornecedor','Status','Data','Valor Corrigido','Valor Negociado','Saving'])
  }

  return (
    <div className="w-full max-w-xl">
      <div className="text-center mb-8">
        <div className="text-4xl mb-3">✦</div>
        <h2 className="text-2xl font-bold text-white mb-2">Importar dados</h2>
        <p className="text-ink-500 text-sm">Carregue seu arquivo para começar a criar o relatório</p>
      </div>

      <motion.div
        {...getRootProps()}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className={`relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200 ${
          isDragActive
            ? 'border-brand-500 bg-brand-900/20'
            : 'border-white/[0.15] bg-surface-1 hover:border-white/[0.25] hover:bg-surface-2'
        }`}
      >
        <input {...getInputProps()} />
        {loading ? (
          <div className="text-ink-400">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">Processando...</p>
          </div>
        ) : (
          <div>
            <Upload className={`w-10 h-10 mx-auto mb-4 ${isDragActive ? 'text-brand-400' : 'text-ink-500'}`} />
            <p className="text-white font-semibold mb-1">
              {isDragActive ? 'Solte aqui!' : 'Arraste ou clique para importar'}
            </p>
            <p className="text-ink-500 text-sm mb-4">XLSX, XLS, CSV, TXT</p>
            <div className="flex gap-2 justify-center">
              {['XLSX', 'XLS', 'CSV', 'TXT'].map(f => (
                <span key={f} className="px-2 py-0.5 rounded-full bg-surface-3 border border-white/10 text-xs text-ink-400 font-mono">{f}</span>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-white/[0.07]" />
        <span className="text-ink-600 text-xs">ou</span>
        <div className="flex-1 h-px bg-white/[0.07]" />
      </div>

      <button
        onClick={loadDemo}
        className="w-full py-3 rounded-xl border border-white/[0.1] text-ink-300 hover:text-white hover:bg-surface-2 text-sm font-medium transition-all flex items-center justify-center gap-2"
      >
        <FileSpreadsheet className="w-4 h-4" />
        Carregar dados de exemplo (60 contratos)
      </button>
    </div>
  )
}
