import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Download, ArrowLeft, Eye, Sun, Moon } from 'lucide-react'
import { useThemeStore } from '@/store/themeStore'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import api from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import UploadZone from '@/components/editor/UploadZone'
import DataTable from '@/components/editor/DataTable'
import LayoutPanel from '@/components/editor/LayoutPanel'
import ChartsPanel from '@/components/editor/ChartsPanel'
import ColumnsPanel from '@/components/editor/ColumnsPanel'
import ReportPreview from '@/components/editor/ReportPreview'
import SetupWizard from '@/components/editor/SetupWizard'
import { buildReportHTML } from '@/lib/reportExport'

const TABS = [
  { id: 'data',    label: '📊 Dados' },
  { id: 'layout',  label: '🎨 Layout' },
  { id: 'charts',  label: '📈 Gráficos' },
  { id: 'columns', label: '🗂 Colunas' },
]

const DEFAULT_STATE = {
  title: 'Novo Relatório', subtitle: '', period: '', company: '',
  cols: [], rows: [], kpis: [],
  colors: { primary: '#1a3a5c', secondary: '#2e5c8a', accent: '#4ade80', bg: '#eef1f5', text: '#1e293b' },
  sections: { saving: true, kpi: true, charts: true, summary: true, table: true, filters: true, footer: true },
  saving: { label: 'Saving Total', savingCol: '', v1Col: '', v1Label: 'Valor Original', v2Col: '', v2Label: 'Valor Negociado' },
  charts: {
    g1: { on: true, title: 'Distribuição', type: 'doughnut', col: '', h: 240 },
    g2: { on: true, title: 'Por Categoria', type: 'bar', col: '', h: 240 },
    g3: { on: true, title: 'Evolução Mensal', type: 'line', dateCol: '', v1Col: '', v2Col: '', h: 300 },
    g4: { on: true, title: 'Top 10 por Valor', type: 'hbar', labelCol: '', valCol: '', n: 10, h: 360 },
  },
  groupCol: '',
  footer: 'Relatório gerado pelo Report Flow · Uso interno',
  exportOptions: { strictParity: true, themeMode: 'follow' },
}

export default function EditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { user, refreshUser } = useAuthStore()

  const [tab, setTab] = useState('data')
  const [state, setState] = useState(DEFAULT_STATE)
  const [showPreview, setShowPreview] = useState(true)
  const [showSidebar, setShowSidebar] = useState(true)
  const [hasData, setHasData] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [pendingRows, setPendingRows] = useState(null)
  const [pendingCols, setPendingCols] = useState(null)
  const [saving, setSaving] = useState(false)
  const [reportId, setReportId] = useState(id ? parseInt(id) : null)
  const debounceRef = useRef(null)

  const syncStateWithReport = useCallback((report) => {
    if (!report?.config || Object.keys(report.config).length === 0) {
      return null
    }

    const syncedState = { ...DEFAULT_STATE, ...report.config }
    setState(syncedState)
    setHasData((report.config.rows || []).length > 0)
    return syncedState
  }, [])

  // Load existing report
  const { data: existingReport } = useQuery({
    queryKey: ['report', id],
    queryFn: () => api.get(`/reports/${id}`).then(r => r.data),
    enabled: !!id,
    onSuccess: data => {
      syncStateWithReport(data)
    },
  })

  const update = useCallback((patch) => {
    setState(prev => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }
      // Debounced auto-save
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => autoSave(next), 2000)
      return next
    })
  }, [reportId])

  const autoSave = async (currentState) => {
    if (!currentState.rows?.length) return
    try {
      const payload = {
        title: currentState.title || 'Relatório',
        config: currentState,
        row_count: currentState.rows?.length || 0,
        col_count: currentState.cols?.length || 0,
      }
      if (reportId) {
        const { data } = await api.put(`/reports/${reportId}`, payload)
        const syncedState = syncStateWithReport(data) || currentState
        return { reportId, syncedState, report: data }
      } else {
        const { data } = await api.post('/reports/', payload)
        setReportId(data.id)
        navigate(`/editor/${data.id}`, { replace: true })
        const syncedState = syncStateWithReport(data) || currentState
        await refreshUser()
        return { reportId: data.id, syncedState, report: data }
      }
    } catch (err) {
      if (err.response?.status === 402) {
        toast.error(err.response.data.detail, { duration: 6000 })
        navigate('/pricing')
      }
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try { await autoSave(state); toast.success('Salvo!') }
    catch { toast.error('Erro ao salvar') }
    finally { setSaving(false) }
  }

  const handleExport = async () => {
    const themeMode = state.exportOptions?.themeMode || 'follow'
    const currentDark = !!useThemeStore.getState().dark
    let isDark = currentDark

    if (themeMode === 'dark') isDark = true
    if (themeMode === 'light') isDark = false
    if (themeMode === 'ask') {
      const answer = window.prompt(
        'Exportar em qual tema? Digite: escuro ou claro',
        currentDark ? 'escuro' : 'claro'
      )
      if (answer == null) return
      const normalized = String(answer).trim().toLowerCase()
      if (['escuro', 'dark', 'e'].includes(normalized)) isDark = true
      else if (['claro', 'light', 'c'].includes(normalized)) isDark = false
      else {
        toast.error('Tema inválido. Use "escuro" ou "claro".')
        return
      }
    }

    try {
      setSaving(true)
      const saveResult = await autoSave(state)
      const activeReportId = saveResult?.reportId || reportId
      const exportState = saveResult?.syncedState || state

      if (!activeReportId) {
        toast.error('Salve o relatório antes de exportar.')
        return
      }

      await api.post(`/reports/${activeReportId}/export`)

      console.log('INSIGHTS NO EXPORT:', exportState.insights)
      if (!exportState.insights?.length) {
        console.warn('INSIGHTS VAZIOS NO EXPORT: backend nao retornou insights ou o frontend nao sincronizou o state.')
      }

      const html = buildReportHTML(exportState, {
        isDark,
        strictParity: exportState.exportOptions?.strictParity !== false,
      })
      const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `${(exportState.title || 'relatorio').replace(/[^a-z0-9]/gi, '_')}.html`
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)

      await refreshUser()
      await qc.invalidateQueries({ queryKey: ['reports'] })
      toast.success('HTML exportado!')
      window.setTimeout(() => navigate('/dashboard?exported=true'), 150)
    } catch (err) {
      if (err?.response?.status === 402) {
        toast.error(err.response.data.detail, { duration: 6000 })
        navigate('/pricing')
        return
      }
      toast.error(err?.response?.data?.detail || 'Erro ao exportar HTML')
    } finally {
      setSaving(false)
    }
  }

  const handleFileLoad = (rows, cols) => {
    // Guarda os dados brutos e abre o wizard
    setPendingRows(rows)
    setPendingCols(cols)
    setShowWizard(true)
    toast.success(`${rows.length.toLocaleString('pt-BR')} linhas carregadas! Configure o relatório.`)
  }

  const handleWizardComplete = (wizardState) => {
    // Monta colunas com tipo detectado
    const detectedCols = pendingCols.map((name, i) => {
      const vals = pendingRows.map(r => r[i]).filter(Boolean)
      const numOk = vals.filter(v => !isNaN(parseFloat(String(v).replace(/[R$.\s]/g, '').replace(',', '.')))).length
      const dateOk = vals.filter(v => /\d{1,4}[\/\-]\d{1,2}/.test(String(v))).length
      const type = dateOk > vals.length * .5 ? 'date' : numOk > vals.length * .6 ? 'number' : 'text'
      return { name, type, vis: true, w: type === 'number' ? 110 : name.length > 18 ? 160 : 130 }
    })
    const detectedRows = pendingRows.map(r => ({ cells: pendingCols.map((_, i) => String(r[i] ?? '')) }))

    setState(prev => ({
      ...prev,
      ...wizardState,
      cols: detectedCols,
      rows: detectedRows,
    }))
    setHasData(true)
    setShowWizard(false)
    setTab('layout')
    toast.success('Relatório configurado! ✨')
  }

  if (!hasData && !existingReport) {
    return (
      <div className="min-h-screen bg-surface-0 flex flex-col">
        <TopBar
          title={state.title}
          saving={saving}
          onBack={() => navigate('/dashboard')}
          onSave={handleSave}
          onExport={handleExport}
          canExport={false}
          onToggleSidebar={() => setShowSidebar(p => !p)}
          onTogglePreview={() => setShowPreview(p => !p)}
          showPreview={showPreview}
        />
        <div className="flex-1 flex items-center justify-center p-6">
          <UploadZone onLoad={handleFileLoad} />
        </div>
        <AnimatePresence>
          {showWizard && pendingRows && (
            <SetupWizard
              rows={pendingRows}
              cols={pendingCols}
              onComplete={handleWizardComplete}
              onDismiss={() => setShowWizard(false)}
            />
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div className="h-screen bg-surface-0 flex flex-col overflow-hidden">
      <TopBar
        title={state.title}
        saving={saving}
        onBack={() => navigate('/dashboard')}
        onSave={handleSave}
        onExport={handleExport}
        canExport={hasData}
        onToggleSidebar={() => setShowSidebar(p => !p)}
        onTogglePreview={() => setShowPreview(p => !p)}
        showPreview={showPreview}
        showSidebar={showSidebar}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <AnimatePresence initial={false}>
          {showSidebar && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 380, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex-shrink-0 flex flex-col overflow-hidden" style={{background:"var(--s1)",borderRight:"1px solid var(--bd)",width:380}}
            >
              {/* Tabs */}
              <div className="flex overflow-x-auto flex-shrink-0" style={{background:"var(--s0)",borderBottom:"1px solid var(--bd)"}}>
                {TABS.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`px-3 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-all ${
                      tab === t.id
                        ? 'text-brand-400 border-brand-500 bg-surface-1'
                        : 'text-ink-500 border-transparent hover:text-ink-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Panel content */}
              <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                {tab === 'data'    && <DataTable    state={state} update={update} />}
                {tab === 'layout'  && <LayoutPanel  state={state} update={update} />}
                {tab === 'charts'  && <ChartsPanel  state={state} update={update} />}
                {tab === 'columns' && <ColumnsPanel state={state} update={update} />}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Preview */}
        <AnimatePresence initial={false}>
          {showPreview && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 overflow-auto min-w-0" style={{background:"var(--s0)"}}
            >
              <ReportPreview state={state} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function TopBar({ title, saving, onBack, onSave, onExport, canExport, onToggleSidebar, onTogglePreview, showPreview, showSidebar }) {
  const { dark, toggle } = useThemeStore()
  return (
    <div className="h-12 flex items-center px-3 gap-2 flex-shrink-0" style={{background:"var(--s1)",borderBottom:"1px solid var(--bd)"}}>
      <button onClick={onBack} className="btn-ghost p-2">
        <ArrowLeft className="w-4 h-4" />
      </button>
      <div className="h-4 w-px" style={{background:"var(--bd)"}} />
      <span className="text-sm font-semibold truncate max-w-[200px]" style={{color:"var(--tp)"}}>{title || 'Relatório'}</span>
      <div className="ml-auto flex items-center gap-1.5">
        <button onClick={onToggleSidebar} className={`btn-ghost p-2 text-xs ${!showSidebar ? 'text-brand-400' : 'text-ink-400'}`}>
          ◀ Edição
        </button>
        <button onClick={onTogglePreview} className={`btn-ghost p-2 text-xs ${!showPreview ? 'text-brand-400' : 'text-ink-400'}`}>
          <Eye className="w-4 h-4 inline mr-1" /> Preview
        </button>
        <div className="h-4 w-px" style={{background:"var(--bd)"}} />
        <button onClick={toggle} className="btn-ghost p-2" title={dark?"Modo claro":"Modo escuro"}>
          {dark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-brand-400" />}
        </button>
        <button onClick={onSave} disabled={saving} className="btn-ghost text-xs text-ink-400 disabled:opacity-50">
          <Save className="w-3.5 h-3.5 inline mr-1" />{saving ? 'Salvando...' : 'Salvar'}
        </button>
        <button onClick={onExport} disabled={!canExport} className="btn-primary py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-40">
          <Download className="w-3.5 h-3.5" /> Exportar HTML
        </button>
      </div>
    </div>
  )
}
