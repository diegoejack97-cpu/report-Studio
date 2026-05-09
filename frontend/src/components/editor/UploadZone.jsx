import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion } from 'motion/react'
import { Upload, FileSpreadsheet, Sparkles } from 'lucide-react'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'

const SAMPLE_ROW_LIMIT = 5

function isCellFilled(value) {
  return value !== '' && value != null
}

function normalizeSheetMatrix(ws) {
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' })
  return matrix.filter(row => Array.isArray(row) && row.some(isCellFilled))
}

function parseSheet(ws, sheetName, sheetIndex) {
  const matrix = normalizeSheetMatrix(ws)
  if (matrix.length < 2) {
    return {
      sheetName,
      sheetIndex,
      rowCount: 0,
      colCount: 0,
      cols: [],
      sampleRows: [],
      useful: false,
      isEmpty: matrix.length === 0,
    }
  }

  const headers = matrix[0].map(h => String(h || '').trim())
  const colCount = headers.length
  const rows = matrix.slice(1)
    .filter(row => row.some(isCellFilled))
    .map(row => headers.map((_, index) => String(row[index] ?? '')))
  const useful = colCount > 0 && rows.length > 0

  return {
    sheetName,
    sheetIndex,
    rowCount: rows.length,
    colCount,
    cols: headers,
    rows,
    sampleRows: rows.slice(0, SAMPLE_ROW_LIMIT),
    useful,
    isEmpty: !useful,
  }
}

function buildWorkbookPayload(file, wb) {
  const parsedSheets = wb.SheetNames.map((sheetName, sheetIndex) => (
    parseSheet(wb.Sheets[sheetName], sheetName, sheetIndex)
  ))
  const usefulSheets = parsedSheets.filter(sheet => sheet.useful)
  const activeSheet = usefulSheets[0]

  if (!activeSheet) {
    throw new Error('Planilha vazia')
  }

  const sheets = usefulSheets.map(({ rows, ...sheet }) => sheet)
  const workbookMeta = {
    fileName: file.name,
    sheetCount: wb.SheetNames.length,
    usefulSheetCount: usefulSheets.length,
    selectedSheetName: activeSheet.sheetName,
    selectedSheetIndex: activeSheet.sheetIndex,
  }

  return {
    rows: activeSheet.rows,
    cols: activeSheet.cols,
    workbook: {
      workbookMeta,
      sheets,
      selectedSheetName: activeSheet.sheetName,
      selectedSheetIndex: activeSheet.sheetIndex,
    },
  }
}

export default function UploadZone({ onLoad }) {
  const [loading, setLoading] = useState(false)

  const processFile = async (file) => {
    setLoading(true)
    try {
      const ext = file.name.split('.').pop().toLowerCase()
      if (['xlsx', 'xls'].includes(ext)) {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array', cellDates: true })
        const workbookPayload = buildWorkbookPayload(file, wb)
        onLoad(workbookPayload.rows, workbookPayload.cols, workbookPayload.workbook)
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
    <div className="w-full max-w-xl px-2 sm:px-0">
      <div className="text-center mb-6 sm:mb-8">
        <div className="flex justify-center mb-3"><Sparkles className="w-9 h-9 text-brand-400 drop-shadow-[0_10px_18px_rgba(59,130,246,0.28)]" /></div>
        <h2 className="text-xl sm:text-2xl font-bold text-[color:var(--tp)] mb-2">Importar dados</h2>
        <p className="text-ink-500 text-sm">Carregue seu arquivo para começar a criar o relatório</p>
      </div>

      <motion.div
        {...getRootProps()}
        whileHover={{ scale: 1.01, y: -4 }}
        whileTap={{ scale: 0.99 }}
        className={`surface-3d tilt-card promo-3d relative border-2 border-dashed rounded-2xl p-6 sm:p-12 text-center cursor-pointer transition-all duration-200 ${
          isDragActive
            ? 'border-brand-500 bg-brand-900/20 shadow-[0_24px_44px_rgba(37,99,235,0.24)]'
            : 'border-theme bg-[var(--s1)] hover:border-[color:var(--bdh)] hover:bg-[var(--s2)]'
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
            <Upload className={`w-10 h-10 mx-auto mb-4 drop-shadow-[0_10px_18px_rgba(37,99,235,0.18)] ${isDragActive ? 'text-brand-400' : 'text-ink-500'}`} />
            <p className="text-[color:var(--tp)] font-semibold mb-1">
              {isDragActive ? 'Solte aqui!' : 'Arraste ou clique para importar'}
            </p>
            <p className="text-ink-500 text-sm mb-4">XLSX, XLS, CSV, TXT</p>
            <div className="flex gap-2 justify-center flex-wrap">
              {['XLSX', 'XLS', 'CSV', 'TXT'].map(f => (
                <span key={f} className="px-2 py-0.5 rounded-full bg-[var(--s3)] border border-theme text-xs text-ink-400 font-mono">{f}</span>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px border-t border-theme" />
        <span className="text-ink-600 text-xs">ou</span>
        <div className="flex-1 h-px border-t border-theme" />
      </div>

      <button
        onClick={loadDemo}
        className="surface-3d tilt-card w-full py-3 rounded-xl border border-theme text-[color:var(--ts)] hover:text-[color:var(--tp)] hover:bg-[var(--s2)] text-sm font-medium transition-all flex items-center justify-center gap-2"
      >
        <FileSpreadsheet className="w-4 h-4" />
        Carregar dados de exemplo (60 contratos)
      </button>
    </div>
  )
}
