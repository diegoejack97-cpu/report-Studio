import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Download, ArrowLeft, Eye, Sun, Moon, BarChart3, Palette, TrendingUp, Table2 } from 'lucide-react'
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
import { normalizeReportColumns, normalizeSavingConfig } from '@/lib/saving'

const TABS = [
  { id: 'data',    label: 'Dados', icon: BarChart3 },
  { id: 'layout',  label: 'Layout', icon: Palette },
  { id: 'charts',  label: 'Gráficos', icon: TrendingUp },
  { id: 'columns', label: 'Colunas', icon: Table2 },
]

const DEFAULT_STATE = {
  title: 'Novo Relatório', subtitle: '', period: '', company: '',
  cols: [], rows: [], kpis: [],
  insights: [],
  reportSchemaVersion: 0,
  usesAutomaticMetrics: false,
  legacyReportMode: false,
  colors: { primary: '#1a3a5c', secondary: '#2e5c8a', accent: '#4ade80', bg: '#eef1f5', text: '#1e293b' },
  sections: { saving: true, kpi: true, charts: true, summary: true, table: true, filters: true, footer: true },
  saving: {
    metricType: 'ECONOMIA',
    type: 'ECONOMIA',
    label: 'Economia',
    color: '#16A34A',
    valueCol: '',
    percentCol: '',
    baseCol: '',
    initialCol: '',
    finalCol: '',
    categoryCol: '',
    entityCol: '',
    dateCol: '',
  },
  charts: {
    g1: { on: true, source: 'distribution', title: 'Distribuição', type: 'doughnut', col: '', h: 240 },
    g2: { on: true, source: 'by_category', title: 'Por Categoria', type: 'bar', col: '', h: 240 },
    g3: { on: true, source: 'by_date', title: 'Evolução Mensal', type: 'line', dateCol: '', v1Col: '', v2Col: '', h: 300 },
    g4: { on: true, source: 'top_items', title: 'Top 10 por Valor', type: 'hbar', labelCol: '', valCol: '', n: 10, h: 360 },
  },
  groupCol: '',
  footer: 'Relatório gerado pelo Report Flow · Uso interno',
  exportOptions: { strictParity: true, themeMode: 'follow' },
}

function getReportSchemaVersion(reportData) {
  const schemaVersion = Number(reportData?.schemaVersion ?? 0)
  return Number.isFinite(schemaVersion) ? schemaVersion : 0
}

// LEGACY FLOW — manter apenas para compatibilidade
function getLegacySavingConfig(saving = {}, totalColumns = 0) {
  return normalizeSavingConfig(saving, totalColumns)
}

// LEGACY FLOW — manter apenas para compatibilidade
function resolveLegacyColumns(columns = [], reportConfig = {}) {
  return normalizeReportColumns(columns, reportConfig)
}

function buildAutomaticSavingConfig(baseConfig = {}) {
  const metricType = baseConfig?.saving?.metricType || baseConfig?.metricType || 'ECONOMIA'
  const override = baseConfig?.saving?.override || null
  const label = baseConfig?.saving?.label || ''

  return {
    metricType,
    type: metricType,
    ...(label ? { label } : {}),
    ...(override ? { override } : {}),
  }
}

function buildPreviewConfig(baseConfig = {}, rows = [], cols = []) {
  const metricType = baseConfig?.saving?.metricType || baseConfig?.metricType || 'ECONOMIA'
  const schemaVersion = Number(baseConfig?.reportSchemaVersion ?? 0)
  const usesAutomaticMetrics = schemaVersion >= 1
  const saving = usesAutomaticMetrics
    ? buildAutomaticSavingConfig(baseConfig)
    : getLegacySavingConfig(baseConfig?.saving || {}, cols.length)
  const override = saving?.override || null

  return {
    ...baseConfig,
    rows,
    cols,
    metricType,
    saving,
    ...(override ? { override } : {}),
  }
}

function getApiErrorMessage(err, fallback = 'Erro ao salvar') {
  const detail = err?.response?.data?.detail
  if (!detail) return fallback
  if (typeof detail === 'string') return detail
  if (typeof detail === 'object') return detail.message || detail.error || fallback
  return fallback
}

function getPreviewErrorMessage(err) {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map(item => (typeof item === 'string' ? item : item?.message || item?.msg || '')).filter(Boolean).join(' | ') || 'Erro ao validar a configuração no backend.'
  if (detail && typeof detail === 'object') return detail.message || detail.error || detail.msg || 'Erro ao validar a configuração no backend.'
  return err?.message || 'Erro ao validar a configuração no backend.'
}

function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < breakpoint
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const media = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const onChange = (event) => setIsMobile(event.matches)
    setIsMobile(media.matches)
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    }
    media.addListener(onChange)
    return () => media.removeListener(onChange)
  }, [breakpoint])

  return isMobile
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
  const [pendingWorkbook, setPendingWorkbook] = useState(null)
  const [wizardDraft, setWizardDraft] = useState(null)
  const [previewData, setPreviewData] = useState(null)
  const [previewError, setPreviewError] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [reportId, setReportId] = useState(id ? parseInt(id) : null)
  const debounceRef = useRef(null)
  const previewDebounceRef = useRef(null)
  const previewRequestRef = useRef(0)
  const stateRef = useRef(DEFAULT_STATE)
  const isMobile = useIsMobile()

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    if (!isMobile) return
    // Mobile keeps preview as primary surface and uses drawer for edition.
    setShowPreview(true)
    if (!showSidebar) return
    const onEsc = (event) => {
      if (event.key === 'Escape') setShowSidebar(false)
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [isMobile, showSidebar])

  const syncStateWithReport = useCallback((report) => {
    if (!report?.config || Object.keys(report.config).length === 0) {
      return null
    }

    const reportData = report.report_data || report.reportData || {}
    const schemaVersion = getReportSchemaVersion(reportData)
    const usesAutomaticMetrics = schemaVersion >= 1
    const syncedInsights = Array.isArray(reportData?.insights)
      ? reportData.insights
      : (Array.isArray(stateRef.current.insights) ? stateRef.current.insights : [])
    const syncedSaving = usesAutomaticMetrics
      ? buildAutomaticSavingConfig({
          ...report.config,
          saving: report.config?.saving || {},
        })
      : getLegacySavingConfig(report.config.saving || {}, (report.config.cols || []).length)
    const syncedState = {
      ...DEFAULT_STATE,
      ...report.config,
      insights: syncedInsights,
      reportData,
      saving: syncedSaving,
      reportSchemaVersion: schemaVersion,
      usesAutomaticMetrics,
      legacyReportMode: !usesAutomaticMetrics,
    }
    stateRef.current = syncedState
    setState(syncedState)
    setHasData((report.config.rows || []).length > 0)
    if (reportData) {
      setPreviewData(reportData)
      setPreviewError('')
    }
    return syncedState
  }, [])

  // Load existing report
  const { data: existingReport } = useQuery({
    queryKey: ['report', id],
    queryFn: () => api.get(`/reports/${id}`).then(r => r.data),
    enabled: !!id,
  })

  useEffect(() => {
    if (existingReport) {
      syncStateWithReport(existingReport)
    }
  }, [existingReport, syncStateWithReport])

  useEffect(() => {
    if (!showWizard || !wizardDraft?.rows || !wizardDraft?.cols) {
      setPreviewLoading(false)
      return
    }

    window.clearTimeout(previewDebounceRef.current)
    previewDebounceRef.current = window.setTimeout(async () => {
      const requestId = Date.now()
      previewRequestRef.current = requestId
      setPreviewLoading(true)
      console.info('[wizard-preview] start', { requestId, endpoint: '/reports/preview' })
      try {
        const previewRows = wizardDraft.rows.map(cells => ({ cells: cells.map(cell => String(cell ?? '')) }))
        const previewCols = (wizardDraft.analyzed || []).map((col, index) => ({
          name: col.name || wizardDraft.cols?.[index] || `col_${index}`,
          type: col.type || 'text',
          vis: true,
        }))
        const wizardMetricType = wizardDraft.metricType || wizardDraft.type || 'ECONOMIA'
        const previewConfig = buildPreviewConfig(
          {
            ...wizardDraft,
            reportSchemaVersion: 1,
            usesAutomaticMetrics: true,
            saving: {
              metricType: wizardMetricType,
              type: wizardMetricType,
              ...(wizardDraft.label ? { label: wizardDraft.label } : {}),
              override: null,
            },
          },
          previewRows,
          previewCols,
        )
        const payload = {
          data: { rows: previewRows, cols: previewCols },
          config: previewConfig,
        }
        const { data } = await api.post('/reports/preview', payload)
        if (previewRequestRef.current !== requestId) return
        console.info('[wizard-preview] success', { requestId })
        setPreviewData(data)
        setPreviewError('')
        setState(prev => ({
          ...prev,
          reportData: data,
          insights: data?.insights || prev.insights,
          reportSchemaVersion: getReportSchemaVersion(data),
          usesAutomaticMetrics: getReportSchemaVersion(data) >= 1,
          legacyReportMode: getReportSchemaVersion(data) < 1,
        }))
      } catch (err) {
        if (previewRequestRef.current !== requestId) return
        const message = getPreviewErrorMessage(err)
        console.error('[wizard-preview] error', { requestId, error: message })
        setPreviewError(message)
        setPreviewData(null)
        setState(prev => ({
          ...prev,
          reportData: { error: message },
        }))
      } finally {
        if (previewRequestRef.current === requestId) {
          setPreviewLoading(false)
          console.info('[wizard-preview] finish', { requestId })
        }
      }
    }, 350)

    return () => {
      window.clearTimeout(previewDebounceRef.current)
    }
  }, [showWizard, wizardDraft])

  const update = useCallback((patch) => {
    setState(prev => {
      const next = typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }
      // Debounced auto-save
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        void autoSave(next).catch(() => {})
      }, 2000)
      return next
    })
  }, [reportId])

  const autoSave = async (currentState) => {
    if (!currentState.rows?.length) return
    try {
      const schemaVersion = Number(currentState?.reportSchemaVersion ?? 0)
      const usesAutomaticMetrics = schemaVersion >= 1
      const normalizedSaving = usesAutomaticMetrics
        ? buildAutomaticSavingConfig(currentState)
        : getLegacySavingConfig(currentState.saving || {}, currentState.cols?.length || 0)
      const normalizedCols = usesAutomaticMetrics
        ? (currentState.cols || [])
        : resolveLegacyColumns(currentState.cols || [], currentState)
      const { reportData: _reportData, ...editorConfig } = currentState
      const config = buildPreviewConfig(
        {
          ...editorConfig,
          saving: normalizedSaving,
        },
        currentState.rows || [],
        normalizedCols,
      )
      const payload = {
        title: currentState.title || 'Relatório',
        config,
        row_count: currentState.rows?.length || 0,
        col_count: normalizedCols.length,
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
        return null
      }
      const message = getApiErrorMessage(err, 'Erro ao salvar')
      toast.error(message, { duration: 6000 })
      throw err
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const result = await autoSave(state)
      if (!result) return
      toast.success('Salvo!')
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Erro ao salvar'))
    }
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
      if (!saveResult) return
      const activeReportId = saveResult?.reportId || reportId

      if (!activeReportId) {
        toast.error('Salve o relatório antes de exportar.')
        return
      }

      const { data: exportResponse } = await api.post(`/reports/${activeReportId}/export`)
      const exportState =
        syncStateWithReport(exportResponse) ||
        saveResult?.syncedState ||
        state

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
      toast.error(getApiErrorMessage(err, 'Erro ao exportar HTML'), { duration: 6000 })
    } finally {
      setSaving(false)
    }
  }

  const handleFileLoad = (rows, cols, workbook = null) => {
    // Guarda os dados brutos e abre o wizard
    setPendingRows(rows)
    setPendingCols(cols)
    setPendingWorkbook(workbook)
    setWizardDraft(null)
    setPreviewData(null)
    setPreviewError('')
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
    const nextState = {
      ...state,
      ...wizardState,
      cols: detectedCols,
      rows: detectedRows,
      ...(pendingWorkbook ? {
        workbookMeta: pendingWorkbook.workbookMeta,
        sheets: pendingWorkbook.sheets || [],
        selectedSheetName: pendingWorkbook.selectedSheetName,
        selectedSheetIndex: pendingWorkbook.selectedSheetIndex,
      } : {
        workbookMeta: null,
        sheets: [],
        selectedSheetName: null,
        selectedSheetIndex: null,
      }),
      reportData: previewData || (previewError ? { error: previewError } : {}),
      reportSchemaVersion: getReportSchemaVersion(previewData),
      usesAutomaticMetrics: getReportSchemaVersion(previewData) >= 1,
      legacyReportMode: getReportSchemaVersion(previewData) < 1,
    }

    setState(nextState)
    setHasData(true)
    setShowWizard(false)
    setWizardDraft(null)
    setPendingWorkbook(null)
    setTab('layout')
    void autoSave(nextState)
    toast.success('Relatório configurado! ✨')
  }

  if (!hasData && !existingReport) {
    return (
      <div className="min-h-screen bg-[var(--s0)] flex flex-col">
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
          showSidebar={showSidebar}
          isMobile={isMobile}
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
              previewData={previewData}
              previewError={previewError}
              previewLoading={previewLoading}
              onDraftChange={setWizardDraft}
            />
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div className="rf-page-surface h-screen flex flex-col overflow-hidden">
      <TopBar
        title={state.title}
        saving={saving}
        onBack={() => navigate('/dashboard')}
        onSave={handleSave}
        onExport={handleExport}
        canExport={hasData}
        onToggleSidebar={() => {
          if (isMobile) {
            setShowSidebar(true)
            return
          }
          setShowSidebar(p => !p)
        }}
        onTogglePreview={() => {
          if (isMobile) {
            setShowSidebar(false)
            setShowPreview(true)
            return
          }
          setShowPreview(p => !p)
        }}
        showPreview={showPreview}
        showSidebar={showSidebar}
        isMobile={isMobile}
      />

      <div className="flex flex-1 overflow-hidden min-w-0">
        {/* Sidebar */}
        {!isMobile && (
          <AnimatePresence initial={false}>
            {showSidebar && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 380, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="rf-panel-glass flex-shrink-0 flex flex-col overflow-hidden rounded-none border-y-0 border-l-0" style={{ width: 380 }}
              >
                {/* Tabs */}
                <div className="flex overflow-x-auto flex-shrink-0 px-2 pt-2 gap-1" style={{ borderBottom: '1px solid var(--bd)' }}>
                  {TABS.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className="tab-button px-3 py-2.5 text-xs font-semibold whitespace-nowrap rounded-t-lg"
                      data-active={tab === t.id}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {t.icon ? <t.icon className="w-3.5 h-3.5" /> : null}
                        <span>{t.label}</span>
                      </span>
                    </button>
                  ))}
                </div>

                {/* Panel content */}
                <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                  {tab === 'data' && <DataTable state={state} update={update} />}
                  {tab === 'layout' && <LayoutPanel state={state} update={update} />}
                  {tab === 'charts' && <ChartsPanel state={state} update={update} />}
                  {tab === 'columns' && <ColumnsPanel state={state} update={update} />}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* Preview */}
        <AnimatePresence initial={false}>
          {showPreview && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rf-page-surface flex-1 overflow-auto min-w-0"
            >
              <ReportPreview state={{ ...state, update }} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile editor drawer */}
        {isMobile && (
          <AnimatePresence initial={false}>
            {showSidebar && (
              <>
                <motion.button
                  type="button"
                  aria-label="Fechar painel de edição"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowSidebar(false)}
                  className="absolute inset-0 z-30 bg-black/45"
                />
                <motion.div
                  initial={{ x: '-100%', opacity: 0.9 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: '-100%', opacity: 0.9 }}
                  transition={{ duration: 0.22 }}
                  className="rf-panel-glass absolute left-0 top-0 bottom-0 z-40 w-[92vw] max-w-[420px] flex flex-col overflow-hidden rounded-none border-y-0 border-l-0"
                >
                  <div className="h-12 px-3 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid var(--bd)' }}>
                    <div className="text-xs font-bold uppercase tracking-wider text-ink-400">Edição</div>
                    <button onClick={() => setShowSidebar(false)} className="btn-ghost px-3 py-2 text-xs min-h-[40px]">Fechar</button>
                  </div>
                  <div className="flex overflow-x-auto flex-shrink-0 px-2 pt-2 gap-1" style={{ borderBottom: '1px solid var(--bd)' }}>
                    {TABS.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        className="tab-button px-3 py-3 text-xs font-semibold whitespace-nowrap min-h-[44px] rounded-t-lg"
                        data-active={tab === t.id}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {t.icon ? <t.icon className="w-4 h-4" /> : null}
                          <span>{t.label}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 overflow-hidden flex flex-col min-h-0">
                    {tab === 'data' && <DataTable state={state} update={update} />}
                    {tab === 'layout' && <LayoutPanel state={state} update={update} />}
                    {tab === 'charts' && <ChartsPanel state={state} update={update} />}
                    {tab === 'columns' && <ColumnsPanel state={state} update={update} />}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}

function TopBar({ title, saving, onBack, onSave, onExport, canExport, onToggleSidebar, onTogglePreview, showPreview, showSidebar, isMobile = false }) {
  const { dark, toggle } = useThemeStore()
  if (isMobile) {
    return (
      <div className="rf-panel-glass rounded-none border-x-0 border-t-0 px-2 py-2 flex flex-col gap-1.5 flex-shrink-0 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <button onClick={onBack} className="btn-ghost p-2 min-h-[40px] min-w-[40px]">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold truncate min-w-0" style={{ color: 'var(--tp)' }}>{title || 'Relatório'}</span>
          <span className="rf-badge hidden sm:inline-flex text-[10px]">Preview executivo</span>
          <button onClick={toggle} className="btn-ghost p-2 min-h-[40px] min-w-[40px] ml-auto" title={dark ? 'Modo claro' : 'Modo escuro'}>
            {dark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-brand-400" />}
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1">
        <button onClick={onToggleSidebar} className={`btn-ghost px-2 py-2 min-h-[40px] text-[11px] ${showSidebar ? 'text-[color:var(--tp)] border-[color:var(--bd)] bg-[rgba(127,127,127,0.08)]' : 'text-[color:var(--ts)]'}`}>
            Editar
          </button>
          <button onClick={onTogglePreview} className={`btn-ghost px-2 py-2 min-h-[40px] text-[11px] ${showPreview ? 'text-[color:var(--tp)] border-[color:var(--bd)] bg-[rgba(127,127,127,0.08)]' : 'text-[color:var(--ts)]'}`}>
            <Eye className="w-3.5 h-3.5 inline mr-1" /> Ver
          </button>
          <button onClick={onSave} disabled={saving} className="btn-ghost px-2 py-2 min-h-[40px] text-[11px] text-[color:var(--ts)] disabled:opacity-50">
            <Save className="w-3.5 h-3.5 inline mr-1" />{saving ? '...' : 'Salvar'}
          </button>
          <button onClick={onExport} disabled={!canExport} className="btn-primary px-2 py-2 min-h-[40px] text-[11px] flex items-center justify-center gap-1 disabled:opacity-40">
            <Download className="w-3.5 h-3.5" />Exportar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rf-panel-glass h-14 px-3 gap-2 flex items-center flex-shrink-0 min-w-0 rounded-none border-x-0 border-t-0">
      <button onClick={onBack} className="btn-ghost p-2 min-h-[40px] min-w-[40px]">
        <ArrowLeft className="w-4 h-4" />
      </button>
      <div className="h-4 w-px" style={{background:"var(--bd)"}} />
      <div className="min-w-0">
        <div className="text-sm max-w-[240px] font-semibold truncate" style={{color:"var(--tp)"}}>{title || 'Relatório'}</div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--tm)]">Área executiva de relatório</div>
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <button onClick={onToggleSidebar} className={`btn-ghost p-2 text-xs ${showSidebar ? 'text-[color:var(--tp)] border-[color:var(--bd)] bg-[rgba(127,127,127,0.08)]' : 'text-[color:var(--ts)]'}`}>
          ◀ Edição
        </button>
        <button onClick={onTogglePreview} className={`btn-ghost p-2 text-xs ${showPreview ? 'text-[color:var(--tp)] border-[color:var(--bd)] bg-[rgba(127,127,127,0.08)]' : 'text-[color:var(--ts)]'}`}>
          <Eye className="w-4 h-4 inline mr-1" />Preview
        </button>
        <div className="h-4 w-px" style={{background:"var(--bd)"}} />
        <button onClick={toggle} className="btn-ghost p-2" title={dark?"Modo claro":"Modo escuro"}>
          {dark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-brand-400" />}
        </button>
        <button onClick={onSave} disabled={saving} className="btn-ghost text-xs text-[color:var(--ts)] disabled:opacity-50">
          <Save className="w-3.5 h-3.5 inline mr-1" />{saving ? 'Salvando...' : 'Salvar'}
        </button>
        <button onClick={onExport} disabled={!canExport} className="btn-primary py-1.5 text-xs flex items-center gap-1.5 disabled:opacity-40">
          <Download className="w-3.5 h-3.5" /> Exportar HTML
        </button>
      </div>
    </div>
  )
}
