with open('frontend/src/components/editor/ReportPreview.jsx', 'r') as f:
    c = f.read()

old = '        {/* Header */}\n        <div className="mb-6" style={{borderBottom:`1px solid ${bdColor}`}}>'
new_header = """        {/* Header */}
        <div className="mb-6" style={{position:'relative',paddingBottom:'1.25rem'}}>
          <div style={{position:'absolute',top:0,left:0,width:48,height:3,borderRadius:2,background:dark?'linear-gradient(90deg,#2563eb,#06b6d4)':'linear-gradient(90deg,#2563eb,#0ea5e9)'}}/>
          <div style={{paddingTop:'1rem',display:'flex',alignItems:'flex-end',justifyContent:'space-between',flexWrap:'wrap',gap:'0.5rem'}}>
            <div>
              <h1 style={{fontSize:'1.6rem',fontWeight:700,letterSpacing:'-0.03em',color:textColor,lineHeight:1.15,marginBottom:state.subtitle?'0.2rem':0}}>
                {state.title||'Relatorio'}
              </h1>
              {state.subtitle&&<p style={{fontSize:'0.8rem',fontWeight:400,color:subText,margin:0}}>{state.subtitle}</p>}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'0.5rem',flexWrap:'wrap'}}>
              {state.period&&<span style={{fontSize:'0.7rem',fontWeight:500,color:dark?'#64748b':'#94a3b8',background:dark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)',border:`1px solid ${bdColor}`,borderRadius:6,padding:'0.2rem 0.6rem'}}>{state.period}</span>}
              {state.company&&<span style={{fontSize:'0.7rem',fontWeight:500,color:dark?'#64748b':'#94a3b8',background:dark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.05)',border:`1px solid ${bdColor}`,borderRadius:6,padding:'0.2rem 0.6rem'}}>{state.company}</span>}
              <span style={{fontSize:'0.7rem',fontWeight:600,color:dark?'#3b82f6':'#2563eb',background:dark?'rgba(37,99,235,0.12)':'rgba(37,99,235,0.08)',border:`1px solid ${dark?'rgba(37,99,235,0.3)':'rgba(37,99,235,0.2)'}`,borderRadius:6,padding:'0.2rem 0.6rem'}}>{rows.length.toLocaleString('pt-BR')} registros</span>
            </div>
          </div>
          <div style={{position:'absolute',bottom:0,left:0,right:0,height:1,background:dark?'linear-gradient(90deg,rgba(37,99,235,0.4),rgba(255,255,255,0.05) 60%,transparent)':'linear-gradient(90deg,rgba(37,99,235,0.3),rgba(0,0,0,0.04) 60%,transparent)'}}/>
        </div>"""

# Remove bloco antigo do header até o próximo bloco
import re
pattern = r"\s+\{/\* Header \*/\}.*?</div>\n"
# Encontrar e substituir manualmente
start = c.find("        {/* Header */}")
if start == -1:
    print("Header nao encontrado - verificando arquivo...")
    for i, line in enumerate(c.split('\n')):
        if 'Header' in line or 'mb-6' in line:
            print(f"linha {i}: {line[:80]}")
else:
    # Verifica se já foi atualizado
    snippet = c[start:start+100]
    if 'paddingBottom' in snippet:
        print("Header ja atualizado!")
    else:
        # Encontra o fim do bloco antigo (após as tags de info)
        end_marker = "        {/* Saving Banner */}"
        end = c.find(end_marker)
        if end == -1:
            print("Nao encontrou fim do header")
        else:
            c = c[:start] + new_header + "\n\n" + c[end:]
            with open('frontend/src/components/editor/ReportPreview.jsx', 'w') as f:
                f.write(c)
            print("Header OK")
