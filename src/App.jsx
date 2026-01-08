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
  TrendingUp, TrendingDown, BookOpen, Target, Award, Sparkles, BarChart3, Clock, AlertCircle
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
  if (!getApps().length) app = initializeApp(firebaseConfig);
  else app = getApp();
  auth = getAuth(app);
  db = getFirestore(app);
  googleProvider = new GoogleAuthProvider();
} catch (e) { console.error("Erro Firebase:", e); }

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
    const linhasFisicas = texto.split('\n').filter(l => l.trim().length > 0).length;
    const linhasVisuais = Math.max(1, Math.ceil(texto.length / 75)); // Ajuste para tela larga
    const linhasEfetivas = Math.max(linhasFisicas, linhasVisuais);
    
    if (linhasEfetivas < 7) { 
      erros.push({
        tipo: 'EXTENSÃO INSUFICIENTE',
        gravidade: 'ELIMINATÓRIO',
        mensagem: `Texto com ${linhasEfetivas} linhas. O edital exige mínimo de 7 linhas.`,
        notaFinal: 0,
        dica: 'Desenvolva melhor cada argumento.'
      });
    }

    if (/(?:\d{3}\.\d{3}\.\d{3}-\d{2}|meu nome é|assinado:|candidato:)/i.test(texto)) {
      erros.push({
        tipo: 'IDENTIFICAÇÃO',
        gravidade: 'ELIMINATÓRIO',
        mensagem: 'Marca identificadora encontrada.',
        notaFinal: 0,
        dica: 'A prova deve ser impessoal.'
      });
    }

    return { aprovado: erros.length === 0, erros };
  }
}

// --- 3. PROMPTS ---
const SYSTEM_PROMPT = `
ATUE COMO: Banca Examinadora Oficial do Cebraspe (Concurso PRF).
POSTURA: Rigorosa, Técnica, Impessoal e Punitiva.

MATRIZ DE AVALIAÇÃO (TOTAL: 20,00 PONTOS):
1. APRESENTAÇÃO E ESTRUTURA (2,00 pts): Legibilidade e estrutura dissertativa.
2. DESENVOLVIMENTO DO TEMA (12,00 pts):
   - Abordagem completa dos tópicos.
   - Uso de terminologia técnica PRF.
   - Fundamentação Legal (Sem lei = nota baixa em conteúdo).
3. GRAMÁTICA E MICROESTRUTURA (6,00 pts): Grafia, morfossintaxe, pontuação.

SAÍDA OBRIGATÓRIA (MARKDOWN):
# 🚨 RELATÓRIO OFICIAL CEBRASPE
## 📊 QUADRO DE NOTAS
| Critério | Nota | Máx |
| :--- | :---: | :---: |
| 1. Apresentação | [X,XX] | 2,00 |
| 2. Conteúdo | [X,XX] | 12,00 |
| 3. Gramática | [X,XX] | 6,00 |
| **NOTA FINAL** | **[XX,XX]** | **20,00** |

## ⚖️ CLASSIFICAÇÃO
**[ELIMINADO / RISCO / COMPETITIVO / ELITE]**

## 🛑 ANÁLISE MICROESTRUTURAL
* Liste erros gramaticais linha a linha.

## 🚀 PLANO DE INTERVENÇÃO
* Dê 3 ordens diretas de estudo.
`;

// --- 4. COMPONENTES VISUAIS ---
const Toast = ({ msg, type, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 animate-bounce ${type==='error'?'bg-red-600':'bg-green-600'} text-white font-bold min-w-[300px] justify-center`}>
      {type==='error'?<AlertTriangle size={20}/>:<CheckCircle2 size={20}/>}
      <span className="text-sm">{msg}</span>
      <button onClick={onClose}><X size={18}/></button>
    </div>
  );
};

const ScoreBadge = ({ score }) => {
  const n = parseFloat(String(score).replace(',', '.'));
  const color = n>=17?'text-green-500 border-green-500':n>=15?'text-yellow-500 border-yellow-500':'text-red-500 border-red-500';
  return (
    <div className={`w-16 h-16 rounded-full border-4 flex flex-col items-center justify-center bg-black/50 ${color}`}>
      <span className="text-[8px] font-black uppercase">Nota</span>
      <span className="text-xl font-black">{n.toFixed(1)}</span>
    </div>
  );
};

// --- 5. TELA DE LOGIN (CORRIGIDA PARA PC) ---
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
  const inputClass = `w-full h-14 pl-12 rounded-xl border outline-none text-base transition-all ${isDark ? 'bg-[#0b0f14] border-gray-700 text-white focus:border-yellow-500' : 'bg-gray-50 border-gray-300 text-gray-900 focus:border-yellow-500'}`;

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 font-sans ${isDark ? 'bg-[#0b0f14]' : 'bg-gray-100'}`}>
      <div className={`w-full max-w-md p-10 rounded-3xl border shadow-2xl ${bgClass} transition-all duration-300`}>
        
        <div className="text-center mb-10">
          <div className="inline-block p-4 rounded-2xl bg-yellow-500/10 mb-4 border border-yellow-500/20">
            <Shield className="text-yellow-500" size={56} />
          </div>
          <h1 className={`text-2xl font-black uppercase tracking-tighter ${textClass}`}>MENTOR <span className="text-yellow-500">PRF</span></h1>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-2">Acesso ao Sistema Elite</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-5">
          <div className="relative group">
            <Mail className="absolute left-4 top-4 text-gray-500 group-focus-within:text-yellow-500 transition-colors" size={20} />
            <input 
              type="email" 
              placeholder="Email Operacional" 
              required 
              value={email} 
              onChange={e=>setEmail(e.target.value)} 
              className={inputClass} 
            />
          </div>
          <div className="relative group">
            <Lock className="absolute left-4 top-4 text-gray-500 group-focus-within:text-yellow-500 transition-colors" size={20} />
            <input 
              type="password" 
              placeholder="Senha de Acesso" 
              required 
              value={password} 
              onChange={e=>setPassword(e.target.value)} 
              className={inputClass} 
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading} 
            className="w-full h-14 bg-yellow-500 hover:bg-yellow-400 text-black font-black uppercase rounded-xl flex items-center justify-center gap-3 shadow-lg shadow-yellow-500/20 active:scale-95 transition-all text-sm tracking-wider mt-2"
          >
            {loading ? <Loader2 className="animate-spin" size={24}/> : (isReg ? "REGISTRAR AGENTE" : "ACESSAR SISTEMA")}
          </button>
        </form>

        <div className="my-8 flex items-center gap-4 text-xs text-gray-500 font-bold uppercase">
          <div className="flex-1 h-px bg-gray-700"></div> OU <div className="flex-1 h-px bg-gray-700"></div>
        </div>

        <button 
          onClick={() => onLogin(() => signInWithPopup(auth, googleProvider))} 
          className={`w-full h-14 border-2 font-bold text-sm rounded-xl flex items-center justify-center gap-3 transition-all hover:scale-[1.02] ${isDark ? 'bg-transparent border-gray-700 text-white hover:bg-gray-800' : 'bg-transparent border-gray-300 text-black hover:bg-gray-100'}`}
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="20" alt="G"/> 
          Continuar com Google
        </button>

        <p 
          onClick={()=>setIsReg(!isReg)} 
          className="text-center mt-8 text-sm text-yellow-600 font-bold cursor-pointer hover:underline transition-colors"
        >
          {isReg ? 'Já possuo credenciais' : 'Solicitar novo acesso'}
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
  
  // Editor
  const [tema, setTema] = useState("");
  const [aspectos, setAspectos] = useState("");
  const [redacao, setRedacao] = useState("");
  const [view, setView] = useState('editor');
  const [tab, setTab] = useState('texto'); 
  
  // Sistema
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
    return onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({id:d.id, ...d.data()}));
      setHistorico(docs);
    });
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

    const val = EliminatorioValidator.validar(redacao);
    if (!val.aprovado) {
      const msgErro = `## ⛔ REDAÇÃO ANULADA\n\n**Motivos:**\n${val.erros.map(e => `- ${e.mensagem}`).join('\n')}\n\n**Nota:** 0.00`;
      setAvaliacao(msgErro);
      try { await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'history'), { tema, texto: redacao, relatorio: msgErro, nota: 0, timestamp: Date.now() }); } catch (e) {}
      setView('relatorio');
      return;
    }

    setLoadingIA(true);
    try {
      const prompt = `${SYSTEM_PROMPT}\n\nENTRADA ALUNO:\nTEMA: ${tema}\nASPECTOS: ${aspectos}\nTEXTO: ${redacao}`;
      
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${geminiApiKey}`, {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const json = await res.json();
      const result = json.candidates?.[0]?.content?.parts?.[0]?.text || "Erro IA";
      const nota = CebraspeScorer.extrairNotaFinal(result);

      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'history'), {
        tema: tema||"Sem Tema", texto: redacao, relatorio: result, nota, timestamp: Date.now()
      });

      setAvaliacao(result);
      setView('relatorio');
    } catch (e) { setToast({msg:"Erro IA", type:'error'}); }
    finally { setLoadingIA(false); }
  };

  const renderMd = (txt) => {
    if (!txt) return null;
    return txt.split('\n').map((l, i) => {
      if (l.includes('|')) return <div key={i} className="overflow-x-auto my-4"><code className="block whitespace-pre font-mono text-sm bg-black/20 p-4 rounded-lg border border-white/10">{l}</code></div>;
      if (l.startsWith('# ')) return <h1 key={i} className="text-2xl font-black text-yellow-500 mt-8 mb-4 border-b border-yellow-500/20 pb-2">{l.replace('# ','')}</h1>;
      if (l.startsWith('## ')) return <h2 key={i} className="text-lg font-bold mt-6 mb-3 flex items-center gap-2"><div className="w-1.5 h-5 bg-yellow-500 rounded-full"></div>{l.replace('## ','')}</h2>;
      return <p key={i} className="mb-3 text-base leading-7 text-gray-300">{l.replace(/\*\*/g,'')}</p>;
    });
  };

  if (loadingUser) return <div className="h-screen bg-black flex items-center justify-center text-yellow-500 font-bold"><Loader2 className="animate-spin" size={48}/></div>;
  if (!user) return <><Toast {...(toast||{})} onClose={()=>setToast(null)}/><LoginPage onLogin={handleLogin} loading={authLoading} isDark={isDark}/></>;

  const bg = isDark ? 'bg-[#0b0f14]' : 'bg-gray-100';
  const txt = isDark ? 'text-gray-200' : 'text-gray-900';
  const card = isDark ? 'bg-[#111827] border-gray-800' : 'bg-white border-gray-300';
  const activeBtn = 'bg-yellow-500 text-black shadow-lg';
  const inactiveBtn = isDark ? 'text-gray-500 hover:text-white' : 'text-gray-500 hover:text-black';

  return (
    <div className={`min-h-screen flex flex-col font-sans ${bg} ${txt} transition-colors duration-300`}>
      {toast && <Toast {...toast} onClose={()=>setToast(null)}/>}
      
      <header className={`px-6 py-4 border-b flex justify-between items-center z-20 sticky top-0 backdrop-blur-md ${isDark?'border-gray-800 bg-[#0b0f14]/90':'border-gray-300 bg-white/90'}`}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
            <Shield className="text-yellow-500" size={28}/>
          </div>
          <div><h1 className="text-sm font-black uppercase tracking-widest">MENTOR <span className="text-yellow-500">PRF</span></h1><p className="text-[9px] font-bold uppercase text-gray-500 tracking-[0.2em]">Versão PC/Mobile</p></div>
        </div>
        <div className="flex gap-4">
          <button onClick={toggleTheme} className={`p-2.5 rounded-full transition-all ${isDark?'hover:bg-gray-800':'hover:bg-gray-200'}`}>{isDark?<Sun size={20}/>:<Moon size={20}/>}</button>
          <button onClick={()=>setView('historico')} className={`p-2.5 rounded-full transition-all ${isDark?'hover:bg-gray-800':'hover:bg-gray-200'}`}><History size={20}/></button>
          <button onClick={()=>signOut(auth)} className="p-2.5 rounded-full hover:bg-red-500/10 text-red-500"><LogOut size={20}/></button>
        </div>
      </header>

      <main className="flex-1 flex flex-col p-6 gap-6 w-full max-w-6xl mx-auto h-[calc(100vh-80px)] overflow-hidden">
        {view === 'editor' && (
          <>
            <div className={`flex p-1.5 rounded-xl border ${card} shrink-0 shadow-sm`}>
              {['tema', 'aspectos', 'texto'].map(t => (
                <button key={t} onClick={()=>setTab(t)} className={`flex-1 py-3 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${tab===t?activeBtn:inactiveBtn}`}>{t==='texto'?'REDAÇÃO':t}</button>
              ))}
            </div>
            <div className="flex-1 relative flex flex-col min-h-0">
              <textarea 
                value={tab==='texto'?redacao:tab==='tema'?tema:aspectos}
                onChange={e=>{const v=e.target.value; if(tab==='texto')setRedacao(v); else if(tab==='tema')setTema(v); else setAspectos(v);}}
                className={`w-full h-full p-8 rounded-2xl border resize-none outline-none text-lg leading-9 font-serif transition-colors ${card} ${isDark?'placeholder-gray-700':'placeholder-gray-400'}`}
                placeholder={tab==='texto'?"Escreva aqui (Mín 7 linhas). O rigor será máximo." : tab==='tema'?"Cole aqui o TEMA..." : "Cole aqui os TÓPICOS..."}
                style={tab==='texto'?{backgroundImage: `linear-gradient(${isDark?'#1f2937':'#e5e7eb'} 1px, transparent 1px)`, backgroundSize: '100% 2.25rem', lineHeight: '2.25rem'}:{}}
              />
            </div>
            <button onClick={analisar} disabled={loadingIA} className="h-16 bg-yellow-500 text-black font-black uppercase rounded-xl flex items-center justify-center gap-3 shadow-xl hover:scale-[1.02] active:scale-95 transition-all shrink-0 text-sm tracking-widest">{loadingIA?<><Loader2 className="animate-spin" size={20}/> ANALISANDO...</>:<><Zap size={20} fill="currentColor"/> CORRIGIR AGORA</>}</button>
          </>
        )}

        {view === 'relatorio' && (
          <div className="flex-1 flex flex-col gap-4 overflow-hidden animate-in slide-in-from-right">
            <div className={`flex-1 p-8 rounded-2xl border overflow-y-auto custom-scrollbar ${card}`}>
              {renderMd(avaliacao)}
            </div>
            <button onClick={()=>setView('editor')} className={`h-14 border-2 font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-2 shrink-0 transition-all hover:bg-opacity-50 ${isDark?'border-gray-700 bg-gray-900 text-white':'border-gray-300 bg-white text-black'}`}><ArrowLeft size={18}/> Voltar</button>
          </div>
        )}

        {view === 'historico' && (
          <div className="flex-1 flex flex-col gap-4 overflow-hidden animate-in slide-in-from-right">
            <div className="flex-1 overflow-y-auto space-y-3 p-1 custom-scrollbar">
              {historico.length===0?<div className="text-center py-20 text-sm font-bold uppercase text-gray-500 tracking-widest">Nenhuma redação encontrada</div>:
              historico.map(h=>(<div key={h.id} onClick={()=>{setAvaliacao(h.relatorio); setTema(h.tema); setRedacao(h.texto); setView('relatorio'); setTab('correcao')}} className={`p-6 rounded-xl border flex justify-between items-center cursor-pointer transition-all hover:scale-[1.01] ${card} hover:border-yellow-500/50`}><div><span className="text-[10px] font-black text-gray-500 uppercase tracking-wider">{new Date(h.timestamp).toLocaleDateString()}</span><p className="font-bold text-base truncate w-64 mt-1">{h.tema||'Sem Título'}</p></div><ScoreBadge score={h.nota||0}/></div>))}
            </div>
            <button onClick={()=>setView('editor')} className={`h-14 border-2 font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-2 shrink-0 transition-all hover:bg-opacity-50 ${isDark?'border-gray-700 bg-gray-900 text-white':'border-gray-300 bg-white text-black'}`}><ArrowLeft size={18}/> Voltar</button>
          </div>
        )}
      </main>
      <style>{`.custom-scrollbar::-webkit-scrollbar{width:8px}.custom-scrollbar::-webkit-scrollbar-thumb{background:#374151;border-radius:10px}`}</style>
    </div>
  );
}
