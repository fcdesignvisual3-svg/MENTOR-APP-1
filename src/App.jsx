import React, { useState, useEffect } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signOut, signInAnonymously 
} from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { 
  Shield, Zap, Loader2, History, ArrowLeft, Mail, Lock, LogOut, 
  Sun, Moon, CheckCircle2, AlertTriangle, FileText, List, PenTool, X, 
  TrendingUp, TrendingDown, BookOpen, Target, Award, Sparkles, BarChart3, Clock, AlertCircle, Smartphone
} from 'lucide-react';

// --- 1. CONFIGURAÇÃO DE AMBIENTE ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;
const appId = "mentor-prf-elite";

let app, auth, db, googleProvider;
try {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  auth = getAuth(app);
  db = getFirestore(app);
  googleProvider = new GoogleAuthProvider();
} catch (e) {
  console.error("Erro Firebase Config:", e);
}

// --- 2. MOTORES DE ANÁLISE ---

class CebraspeScorer {
  static extrairNotaFinal(relatorio) {
    const patterns = [
      /\|\s*\*\*?NOTA FINAL.*?\*\*?\s*\|\s*\*\*?(\d{1,2}[,.]\d{1,2})\*\*?/i,
      /NOTA FINAL.*?(\d{1,2}[,.]\d{1,2})/i,
      /TOTAL.*?(\d{1,2}[,.]\d{1,2})/i
    ];
    for (const pattern of patterns) {
      const match = relatorio.match(pattern);
      if (match) {
        const val = parseFloat(match[1].replace(',', '.'));
        if (!isNaN(val) && val <= 20.00) return val;
      }
    }
    return 0.00;
  }
}

class EliminatorioValidator {
  static validar(texto, tema = '') {
    const erros = [];
    const linhasReais = texto.split('\n').filter(l => l.trim().length > 0).length;
    const linhasVisuais = Math.ceil(texto.length / 65);
    const totalLinhas = Math.max(linhasReais, linhasVisuais);

    if (totalLinhas < 7) erros.push(`Texto insuficiente (${totalLinhas} linhas). Mínimo exigido: 7.`);
    if (/(?:\d{3}\.\d{3}\.\d{3}-\d{2}|meu nome é|assinado:|candidato:)/i.test(texto)) erros.push("Marca de identificação detetada (Nota Zero).");
    
    return { valido: erros.length === 0, erros, linhas: totalLinhas };
  }
}

class LegislacaoValidator {
  static validarCitacoes(texto) {
    const citacoes = [];
    const regex = /(?:art(?:igo)?\.?\s*(\d+)|Lei\s*n|Constituição|CF\/?88|CTB|Resolução|CONTRAN|Decreto|Código\s*Penal|CP)/gi;
    let match;
    while ((match = regex.exec(texto)) !== null) {
      citacoes.push({ texto: match[0], posicao: match.index });
    }
    return citacoes;
  }
}

class VocabularioAnalyzer {
  static CLICHES = ['nos dias de hoje', 'desde os primórdios', 'chama a atenção', 'com certeza', 'na minha opinião', 'atualmente'];
  static TERMOS_PRF = ['ostensividade', 'poder de polícia', 'patrulhamento', 'fiscalização', 'segurança viária', 'ordem pública', 'flagrante', 'interdição', 'sinistro', 'etilômetro', 'rodovias federais', 'contran', 'resolução'];

  static analisar(texto) {
    const txtLower = texto.toLowerCase();
    const cliches = this.CLICHES.filter(c => txtLower.includes(c));
    const termos = this.TERMOS_PRF.filter(t => txtLower.includes(t));
    return { cliches, termos };
  }
}

class CoesaoAnalyzer {
  static CONECTIVOS = ['além disso', 'ademais', 'outrossim', 'entretanto', 'todavia', 'contudo', 'portanto', 'dessa forma', 'assim', 'visto que', 'pois'];
  static analisar(texto) {
    const txtLower = texto.toLowerCase();
    const encontrados = this.CONECTIVOS.filter(c => txtLower.includes(c));
    return { total: encontrados.length, lista: encontrados };
  }
}

const SYSTEM_PROMPT = `
ATUE COMO: Banca Examinadora Oficial do Cebraspe (Concurso PRF).
POSTURA: Rigorosa, Técnica, Impessoal e Punitiva.

MATRIZ DE AVALIAÇÃO (TOTAL: 20,00 PONTOS):
1. APRESENTAÇÃO E ESTRUTURA (2,00 pts)
2. DESENVOLVIMENTO DO TEMA (12,00 pts):
   - Abordagem completa dos tópicos.
   - Uso de terminologia técnica PRF.
   - Fundamentação Legal (Citação de Leis é OBRIGATÓRIA).
3. GRAMÁTICA E MICROESTRUTURA (6,00 pts)

SAÍDA OBRIGATÓRIA (MARKDOWN):
# 🚨 RELATÓRIO TÁTICO CEBRASPE
## 📊 QUADRO DE NOTAS
| Quesito | Nota Atribuída | Nota Máxima |
| :--- | :---: | :---: |
| 1. Apresentação | [X,XX] | 2,00 |
| 2. Conteúdo | [X,XX] | 12,00 |
| 3. Gramática | [X,XX] | 6,00 |
| **NOTA FINAL** | **[XX,XX]** | **20,00** |

## ⚖️ CLASSIFICAÇÃO
**[ELIMINADO / RISCO / COMPETITIVO / ELITE]**

## 🛑 ANÁLISE MICROESTRUTURAL
* Liste erros gramaticais linha a linha.

## 🧠 ANÁLISE MACROESTRUTURAL
* **Legislação:** Avalie citações.
* **Argumentação:** Avalie profundidade técnica.

## 🚀 PLANO DE INTERVENÇÃO
* Dê 3 ordens diretas para o aluno estudar.
`;

// --- 4. COMPONENTES VISUAIS ---

const Toast = ({ msg, type, onClose }) => {
  useEffect(() => { const timer = setTimeout(onClose, 4000); return () => clearTimeout(timer); }, [onClose]);
  return (
    <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl shadow-2xl flex items-center gap-2 animate-bounce ${type === 'error' ? 'bg-red-600' : 'bg-green-600'} text-white font-bold w-[90%] text-xs`}>
      {type === 'error' ? <AlertTriangle size={16} className="shrink-0"/> : <CheckCircle2 size={16} className="shrink-0"/>}
      <span className="flex-1 text-center">{msg}</span>
      <button onClick={onClose}><X size={14}/></button>
    </div>
  );
};

const LoginPage = ({ onLogin, loading, isDark }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isReg, setIsReg] = useState(false);

  const handleAuth = (e) => {
    e.preventDefault();
    onLogin(async () => {
      if (isReg) await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
    });
  };

  const bgClass = isDark ? 'bg-[#111827] border-gray-800' : 'bg-white border-gray-200';
  const textClass = isDark ? 'text-white' : 'text-gray-900';
  const inputClass = `w-full h-12 pl-10 rounded-xl border outline-none transition-all text-sm ${isDark ? 'bg-[#0b0f14] border-gray-700 text-white focus:border-yellow-500' : 'bg-gray-50 border-gray-300 text-gray-900 focus:border-yellow-500'}`;

  return (
    <div className={`flex-1 flex items-center justify-center p-6 ${isDark ? 'bg-[#0b0f14]' : 'bg-gray-100'}`}>
      <div className={`w-full p-8 rounded-3xl border shadow-xl ${bgClass}`}>
        <div className="text-center mb-8">
          <Shield className="mx-auto text-yellow-500 mb-2" size={48} />
          <h1 className={`text-xl font-black uppercase tracking-tighter ${textClass}`}>MENTOR <span className="text-yellow-500">PRF</span></h1>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Acesso Elite</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-3 top-3.5 text-gray-500" size={18} />
            <input type="email" placeholder="Email Operacional" required value={email} onChange={e=>setEmail(e.target.value)} className={inputClass} />
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-3.5 text-gray-500" size={18} />
            <input type="password" placeholder="Senha de Acesso" required value={password} onChange={e=>setPassword(e.target.value)} className={inputClass} />
          </div>
          
          <button type="submit" disabled={loading} className="w-full h-12 bg-yellow-500 hover:bg-yellow-400 text-black font-black uppercase rounded-xl flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all text-xs tracking-wider">
            {loading ? <Loader2 className="animate-spin" size={18}/> : (isReg ? "CADASTRAR" : "ENTRAR")}
          </button>
        </form>

        <div className="my-6 flex items-center gap-3 text-[10px] text-gray-500 font-bold uppercase">
          <div className="flex-1 h-px bg-gray-700"></div> OU <div className="flex-1 h-px bg-gray-700"></div>
        </div>

        <button onClick={() => onLogin(() => signInWithPopup(auth, googleProvider))} className={`w-full h-12 border font-bold text-sm rounded-xl flex items-center justify-center gap-2 ${isDark ? 'bg-white text-black hover:bg-gray-100' : 'bg-black text-white hover:bg-gray-800'}`}>
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18" alt="G"/> Google
        </button>

        <p onClick={()=>setIsReg(!isReg)} className="text-center mt-6 text-xs text-yellow-600 font-bold cursor-pointer hover:underline">
          {isReg ? 'Voltar ao Login' : 'Criar nova conta'}
        </p>
      </div>
    </div>
  );
};

// --- APP PRINCIPAL ---
export default function App() {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [toast, setToast] = useState(null);
  
  const [tema, setTema] = useState("");
  const [aspectos, setAspectos] = useState("");
  const [redacao, setRedacao] = useState("");
  const [view, setView] = useState('editor');
  const [tab, setTab] = useState('texto'); 
  
  const [loadingIA, setLoadingIA] = useState(false);
  const [avaliacao, setAvaliacao] = useState("");
  const [historico, setHistorico] = useState([]);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) setIsDark(savedTheme === 'true');
    return onAuthStateChanged(auth, u => { setUser(u); setLoadingUser(false); });
  }, []);

  const toggleTheme = () => {
    setIsDark(!isDark);
    localStorage.setItem('theme', (!isDark).toString());
  };

  useEffect(() => {
    if (!user || !db) return;
    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'history'), orderBy('timestamp', 'desc'), limit(10));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({id:d.id, ...d.data()}));
      setHistorico(docs);
    });
    return () => unsub();
  }, [user]);

  const handleLogin = async (loginPromise) => {
    setAuthLoading(true);
    try { await loginPromise(); } 
    catch (e) { setToast({msg: "Erro de Autenticação.", type: 'error'}); } 
    finally { setAuthLoading(false); }
  };

  const analisar = async () => {
    if (!redacao.trim()) return setToast({msg: "Escreva algo antes de corrigir.", type: 'error'});
    if (!geminiApiKey) return setToast({msg: "Chave API não configurada.", type: 'error'});

    const val = EliminatorioValidator.validar(redacao, tema);
    if (!val.aprovado) {
      const msgErro = `## ⛔ REDAÇÃO ANULADA\n\n**Motivos:**\n${val.erros.map(e => `- ${e}`).join('\n')}\n\n**Nota:** 0.00`;
      setAvaliacao(msgErro);
      try { await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'history'), { tema, texto: redacao, relatorio: msgErro, nota: 0, timestamp: Date.now() }); } catch (e) {}
      setView('relatorio');
      return;
    }

    setLoadingIA(true);
    try {
      const leis = LegislacaoValidator.validarCitacoes(redacao);
      const vocab = VocabularioAnalyzer.analisar(redacao);
      const coesao = CoesaoAnalyzer.analisar(redacao);

      const dadosTecnicos = `
      [DADOS REAIS DO SISTEMA]:
      - Citações Legais: ${leis.map(l => l.texto).join(', ') || "Nenhuma (Penalizar em Conteúdo)"}
      - Termos PRF: ${vocab.pontosFortes.map(p => p.termo).join(', ')}
      - Score Vocabular: ${vocab.scoreVocabular}/10
      - Conectivos: ${coesao.conectivosUsados.total}
      - Clichês: ${vocab.problemas.map(p => p.termo).join(', ')}
      `;

      const promptFinal = `${SYSTEM_PROMPT}\n\n${dadosTecnicos}\n\nENTRADA:\nTEMA: ${tema}\nASPECTOS: ${aspectos}\nREDAÇÃO:\n${redacao}`;

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${geminiApiKey}`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ contents: [{ parts: [{ text: promptFinal }] }] })
      });
      
      const data = await res.json();
      const feedback = data.candidates?.[0]?.content?.parts?.[0]?.text || "Erro na IA";
      const nota = CebraspeScorer.extrairNotaFinal(feedback);

      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'history'), {
        tema: tema||"Sem Tema", texto: redacao, relatorio: feedback, nota, timestamp: Date.now()
      });

      setAvaliacao(feedback);
      setView('relatorio');
    } catch (e) { setToast({msg: "Erro de conexão IA.", type: 'error'}); } 
    finally { setLoadingIA(false); }
  };

  const renderMarkdown = (text) => {
    if (!text) return null;
    return text.split('\n').map((line, i) => {
      if (line.includes('|')) return <div key={i} className="overflow-x-auto"><code className="block whitespace-pre font-mono text-xs bg-black/20 p-2 mb-1 rounded border border-white/5">{line}</code></div>;
      if (line.startsWith('# ')) return <h1 key={i} className="text-xl font-black text-yellow-500 mt-4 mb-2">{line.replace('# ', '')}</h1>;
      if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-bold text-white mt-4 mb-2 flex items-center gap-2"><div className="w-1 h-4 bg-yellow-500 rounded-full"></div>{line.replace('## ', '')}</h2>;
      return <p key={i} className="mb-2 leading-relaxed text-sm text-gray-300">{line.replace(/\*\*/g,'')}</p>;
    });
  };

  if (loadingUser) return <div className="h-screen bg-black flex items-center justify-center text-yellow-500 font-bold"><Loader2 className="animate-spin" size={48}/></div>;

  // --- LAYOUT HÍBRIDO (CONTAINER) ---
  // Este layout centra o app no PC e expande no Mobile
  const bg = isDark ? 'bg-[#0b0f14]' : 'bg-gray-100';
  const txt = isDark ? 'text-gray-200' : 'text-gray-900';
  const card = isDark ? 'bg-[#111827] border-gray-800' : 'bg-white border-gray-300';
  const activeBtn = 'bg-yellow-500 text-black shadow-lg font-black';
  const inactiveBtn = isDark ? 'text-gray-500 hover:text-white' : 'text-gray-500 hover:text-black';

  // Fundo externo (apenas visível no PC)
  const outerBg = isDark ? 'bg-[#050505]' : 'bg-gray-200';

  return (
    <div className={`min-h-screen w-full flex items-center justify-center ${outerBg}`}>
      {/* Container Principal que simula App */}
      <div className={`w-full md:max-w-[480px] h-[100dvh] md:h-[95vh] md:max-h-[900px] md:rounded-[32px] md:border-[8px] md:border-[#1f2937] md:shadow-2xl overflow-hidden flex flex-col relative transition-colors duration-300 ${bg} ${txt}`}>
        
        {toast && <Toast {...toast} onClose={() => setToast(null)} />}
        
        {/* HEADER */}
        {user && (
          <header className={`px-4 py-3 border-b flex justify-between items-center z-20 sticky top-0 backdrop-blur-md ${isDark ? 'bg-[#0b0f14]/90 border-gray-800' : 'bg-white/90 border-gray-300'}`}>
            <div className="flex items-center gap-2.5">
              <Shield className="text-yellow-500" size={24}/>
              <div className="flex flex-col">
                <h1 className="text-xs font-black uppercase tracking-tighter leading-none">MENTOR <span className="text-yellow-500">PRF</span></h1>
                <p className="text-[7px] font-bold text-gray-500 uppercase tracking-[0.2em] mt-0.5">Versão Unificada</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={toggleTheme} className={`p-2 rounded-full ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-200'}`}>{isDark ? <Sun size={18}/> : <Moon size={18}/>}</button>
              <button onClick={()=>setView('historico')} className={`p-2 rounded-full ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-200'}`}><History size={18}/></button>
              <button onClick={()=>signOut(auth)} className={`p-2 rounded-full hover:bg-red-500/10 text-red-500`}><LogOut size={18}/></button>
            </div>
          </header>
        )}

        {/* CONTEÚDO */}
        {!user ? (
          <LoginPage onLogin={handleLogin} loading={authLoading} isDark={isDark} />
        ) : (
          <main className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
            
            {view === 'editor' && (
              <>
                <div className={`flex p-1.5 rounded-xl border ${card} shrink-0 shadow-sm`}>
                  {['tema', 'aspectos', 'texto'].map(t => (
                    <button key={t} onClick={()=>setTab(t)} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${tab === t ? activeBtn : inactiveBtn}`}>
                      {t === 'texto' ? 'REDAÇÃO' : t}
                    </button>
                  ))}
                </div>

                <div className="flex-1 relative flex flex-col min-h-0">
                  <textarea 
                    value={tab === 'texto' ? redacao : tab === 'tema' ? tema : aspectos}
                    onChange={e => {
                      const val = e.target.value;
                      if(tab === 'texto') setRedacao(val);
                      else if(tab === 'tema') setTema(val);
                      else setAspectos(val);
                    }}
                    className={`w-full h-full p-6 rounded-2xl border resize-none outline-none text-base leading-8 font-serif transition-colors ${card} ${isDark ? 'placeholder-gray-700' : 'placeholder-gray-400'}`}
                    placeholder={tab === 'texto' ? "Escreva aqui (Mín 7 linhas). O rigor será máximo." : tab === 'tema' ? "Cole aqui o TEMA..." : "Cole aqui os TÓPICOS..."}
                    style={tab === 'texto' ? {backgroundImage: `linear-gradient(${isDark?'#1f2937':'#e5e7eb'} 1px, transparent 1px)`, backgroundSize: '100% 2rem', lineHeight: '2rem'} : {}}
                  />
                  {tab === 'texto' && (
                    <div className="absolute bottom-4 right-4 bg-black/80 text-white text-[10px] px-3 py-1.5 rounded-lg font-bold backdrop-blur-md border border-white/10 shadow-xl pointer-events-none flex items-center gap-2">
                      <span className={Math.ceil(redacao.length/65) < 7 ? "text-red-400" : "text-green-400"}>{Math.ceil(redacao.length/65)} Linhas</span>
                      <div className="w-px h-3 bg-white/20"></div>
                      <span className="text-gray-400">{LegislacaoValidator.validarCitacoes(redacao).length} Leis Citadas</span>
                    </div>
                  )}
                </div>

                <button onClick={analisar} disabled={loadingIA} className={`h-14 rounded-xl font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 shrink-0 text-sm transition-all ${loadingIA ? 'bg-gray-800 cursor-not-allowed text-gray-500' : 'bg-yellow-500 text-black active:scale-95 hover:bg-yellow-400'}`}>
                  {loadingIA ? <><Loader2 className="animate-spin" size={18}/> CORRIGINDO...</> : <><Zap size={18} fill="currentColor"/> ENVIAR REDAÇÃO</>}
                </button>
              </>
            )}

            {view === 'relatorio' && (
              <div className="flex-1 flex flex-col gap-3 overflow-hidden animate-in slide-in-from-right duration-300">
                <div className={`flex-1 p-6 rounded-2xl border overflow-y-auto custom-scrollbar ${card}`}>
                  {renderMarkdown(avaliacao)}
                </div>
                <button onClick={()=>setView('editor')} className={`h-12 border font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-2 shrink-0 transition-all ${card} hover:bg-opacity-50`}><ArrowLeft size={16}/> Voltar para Edição</button>
              </div>
            )}

            {view === 'historico' && (
              <div className="flex-1 flex flex-col gap-3 overflow-hidden animate-in slide-in-from-right duration-300">
                <div className="flex-1 overflow-y-auto space-y-3 p-1 custom-scrollbar">
                  {historico.length === 0 ? <div className="text-center py-20 text-gray-500 text-xs font-bold uppercase tracking-widest">Nenhuma redação encontrada</div> : 
                  historico.map(h => (
                    <div key={h.id} onClick={()=>{setAvaliacao(h.relatorio); setTema(h.tema); setRedacao(h.texto); setView('relatorio'); setTab('correcao')}} className={`p-5 rounded-xl border flex justify-between items-center cursor-pointer active:scale-95 transition-all group ${card} hover:border-yellow-500/30`}>
                      <div className="flex-1 min-w-0 pr-4">
                        <span className="text-[9px] font-black text-gray-500 uppercase tracking-wide bg-gray-800/50 px-2 py-1 rounded">{new Date(h.timestamp).toLocaleDateString()}</span>
                        <p className="font-bold text-sm truncate mt-2 group-hover:text-yellow-500 transition-colors">{h.tema || 'Sem Título'}</p>
                      </div>
                      <div className={`text-2xl font-black ${h.nota >= 15 ? 'text-green-500' : h.nota >= 10 ? 'text-yellow-500' : 'text-red-500'}`}>{h.nota?.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
                <button onClick={()=>setView('editor')} className={`h-12 border font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-2 shrink-0 transition-all ${card} hover:bg-opacity-50`}><ArrowLeft size={16}/> Voltar</button>
              </div>
            )}
          </main>
        )}
      </div>

      {/* AVISO PC */}
      <div className="hidden md:flex fixed bottom-4 right-4 text-gray-600 text-xs font-mono items-center gap-2 opacity-50">
        <Smartphone size={14} /> Modo App Ativo
      </div>
      
      <style>{`.custom-scrollbar::-webkit-scrollbar{width:5px}.custom-scrollbar::-webkit-scrollbar-thumb{background:#374151;border-radius:10px}`}</style>
    </div>
  );
}
