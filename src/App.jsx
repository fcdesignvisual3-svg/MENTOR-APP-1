import React, { useState, useEffect } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signOut, signInAnonymously 
} from 'firebase/auth';
import { 
  getFirestore, collection, addDoc, query, orderBy, onSnapshot, limit 
} from 'firebase/firestore';
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

// --- 2. MOTORES DE ANÁLISE AVANÇADOS (O DIFERENCIAL PEDAGÓGICO) ---

class CebraspeScorer {
  static extrairNotaFinal(relatorio) {
    // Busca nota na tabela ou no texto
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
    const linhasVisuais = Math.max(1, Math.ceil(texto.length / 65)); // Ajuste fino para mobile
    const linhasEfetivas = Math.max(linhasFisicas, linhasVisuais);
    
    if (linhasEfetivas < 7) { 
      erros.push({
        tipo: 'EXTENSÃO INSUFICIENTE',
        gravidade: 'ELIMINATÓRIO',
        mensagem: `Texto com ${linhasEfetivas} linhas. O edital exige mínimo de 7 linhas.`,
        notaFinal: 0,
        dica: 'Desenvolva melhor cada argumento. Aprofunde os tópicos.'
      });
    }

    // Validação de Fuga ao Tema
    if (tema && tema.length > 5) {
      const palavrasTema = tema.toLowerCase().split(/\s+/).filter(p => p.length > 3);
      const textoLower = texto.toLowerCase();
      const encontradas = palavrasTema.filter(p => textoLower.includes(p));
      if (encontradas.length === 0 && palavrasTema.length > 0) {
        erros.push({
          tipo: 'FUGA AO TEMA',
          gravidade: 'ELIMINATÓRIO',
          mensagem: 'Nenhuma palavra-chave do tema identificada no texto.',
          notaFinal: 0,
          dica: `Palavras esperadas: ${palavrasTema.slice(0,3).join(', ')}`
        });
      }
    }

    if (/(?:\d{3}\.\d{3}\.\d{3}-\d{2}|meu nome é|assinado:|candidato:)/i.test(texto)) {
      erros.push({
        tipo: 'IDENTIFICAÇÃO',
        gravidade: 'ELIMINATÓRIO',
        mensagem: 'Marca identificadora encontrada (CPF, Nome).',
        notaFinal: 0,
        dica: 'A prova deve ser impessoal. Nunca assine.'
      });
    }

    return { aprovado: erros.length === 0, erros };
  }
}

class EstruturaValidator {
  static validarEstrutura(texto) {
    const erros = [];
    const paragrafos = texto.split(/\n\n+/).filter(p => p.trim().length > 30);
    
    if (paragrafos.length < 3) {
      erros.push({
        tipo: 'ESTRUTURA INCOMPLETA',
        gravidade: 'GRAVE',
        mensagem: `Apenas ${paragrafos.length} parágrafos. Dissertação exige Intro, Desenvolvimento e Conclusão.`,
        penalidade: -3.0
      });
    }
    
    if (paragrafos.length > 0) {
      const intro = paragrafos[0].toLowerCase();
      // Verifica se a introdução tem palavras de apresentação
      if (!/(?:tema|questão|discussão|importante|analisar|contexto)/i.test(intro)) {
        erros.push({ tipo: 'INTRODUÇÃO FRACA', gravidade: 'MODERADA', mensagem: 'Introdução sem tese ou contexto claro.', penalidade: -1.0 });
      }
    }
    
    return { aprovado: erros.length === 0, erros, paragrafos: paragrafos.length };
  }
}

class LegislacaoValidator {
  static validarCitacoes(texto) {
    const citacoes = [];
    const regex = /(?:art(?:igo)?\.?\s*(\d+)|Lei\s*n|Constituição|CF\/?88|CTB|Resolução|CONTRAN|Código\s*Penal|CP)/gi;
    let match;
    while ((match = regex.exec(texto)) !== null) {
      citacoes.push({ texto: match[0], posicao: match.index });
    }
    return citacoes;
  }
}

class VocabularioAnalyzer {
  static CLICHES = [{termo:'nos dias de hoje'}, {termo:'atualmente'}, {termo:'na minha opinião'}, {termo:'com certeza'}, {termo:'coisa'}];
  static TECNICOS = ['ostensividade', 'patrulhamento', 'fiscalização', 'sinistro', 'etilômetro', 'segurança viária', 'ordem pública', 'flagrante', 'interdição', 'rodovias federais', 'contran', 'resolução'];

  static analisar(texto) {
    const txt = texto.toLowerCase();
    const problemas = this.CLICHES.filter(c => txt.includes(c.termo));
    const fortes = this.TECNICOS.filter(t => txt.includes(t));
    
    let score = 5 + (Math.min(5, fortes.length * 0.8)) - (Math.min(5, problemas.length * 0.5));
    return { problemas, pontosFortes: fortes, scoreVocabular: Math.max(0, Math.min(10, score)).toFixed(1) };
  }
}

class CoesaoAnalyzer {
  static CONECTIVOS = ['além disso', 'ademais', 'entretanto', 'todavia', 'portanto', 'assim', 'visto que', 'destarte', 'outrossim'];
  static analisar(texto) {
    const encontrados = this.CONECTIVOS.filter(c => texto.toLowerCase().includes(c));
    const diversidade = new Set(encontrados).size;
    const nota = Math.min(10, 4 + (encontrados.length * 0.5) + (diversidade * 0.5));
    return { conectivosUsados: { total: encontrados.length, diversidade }, scoreCoesao: { nota: nota.toFixed(1) } };
  }
}

class GramaticaValidator {
  static ERROS = [
    {regex: /\bmenas\b/gi, tipo: 'MORFOLOGIA', msg: 'Use "menos"'},
    {regex: /\ba nível de\b/gi, tipo: 'REGÊNCIA', msg: 'Use "em nível de"'},
    {regex: /\bhaviam\s+(?:pessoas|carros|casos)/gi, tipo: 'CONCORDÂNCIA', msg: 'Verbo haver no sentido de existir é impessoal (Use "Havia")'}
  ];
  static detectar(texto) {
    const erros = [];
    this.ERROS.forEach(e => {
      if (texto.match(e.regex)) erros.push({tipo: e.tipo, msg: e.msg});
    });
    return erros;
  }
}

class FeedbackGenerator {
  static gerarFeedbackCompleto(historico) {
    if (historico.length < 2) return null;
    const notas = historico.map(h => parseFloat(String(h.nota).replace(',', '.')));
    const atual = notas[0];
    const anterior = notas[1];
    
    return {
      resumoEvolucao: {
        notaAtual: atual.toFixed(2),
        tendencia: atual >= anterior ? 'CRESCENTE' : 'DECRESCENTE',
        mensagem: atual >= 15 ? "✅ Zona Competitiva! Mantenha o ritmo." : atual >= 10 ? "⚠️ Zona de Risco. Foco na técnica." : "🚨 Crítico. Priorize a estrutura básica.",
        grafico: historico.slice(0, 5).reverse().map((h, i) => ({ redacao: `#${i+1}`, nota: parseFloat(String(h.nota).replace(',', '.')) }))
      },
      proximosPassos: [
        {ordem: 1, titulo: 'Correção de Vícios', descricao: 'Revise os erros gramaticais apontados.', prazo: 'Hoje'},
        {ordem: 2, titulo: 'Legislação', descricao: 'Estude o Art. 144 da CF/88 e Arts. 20-21 do CTB.', prazo: 'Amanhã'}
      ]
    };
  }
}

// --- 3. PROMPTS DE ELITE ---
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

## 🧠 ANÁLISE TÉCNICA
* Avalie o uso de leis e termos técnicos.

## 🚀 PLANO DE INTERVENÇÃO
* Dê 3 ordens diretas de estudo.
`;

const REWRITE_PROMPT = `
ATUE COMO: Mentor PRF Elite.
TAREFA: Reescreva o texto para NOTA MÁXIMA (20,00).
REQUISITOS: Estrutura perfeita, termos técnicos (ostensividade, sinistro, fiscalização), leis citadas (CTB, CF/88) e zero erros.
`;

// --- 4. COMPONENTES VISUAIS ---
const Toast = ({ msg, type, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-bounce ${type==='error'?'bg-red-600':'bg-green-600'} text-white font-bold max-w-[90%] border border-white/10`}>
      {type==='error'?<AlertTriangle size={18}/>:<CheckCircle2 size={18}/>}<span className="text-xs">{msg}</span><button onClick={onClose}><X size={16}/></button>
    </div>
  );
};

const SimpleLineChart = ({ data, isDark }) => {
  if (!data || data.length < 2) return <div className="text-xs text-gray-500 text-center italic border border-dashed border-gray-700 rounded p-4">Gráfico indisponível (min 2 redações)</div>;
  const h=100, w=100, pad=10;
  const points = data.map((d, i) => `${pad + (i/(data.length-1))*(w-2*pad)},${h-pad-((d.nota/20)*(h-2*pad))}`).join(' ');
  return (
    <div className={`w-full h-[120px] rounded-lg p-2 ${isDark?'bg-black/20':'bg-gray-200'}`}>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full overflow-visible">
        <polyline points={points} fill="none" stroke="#EAB308" strokeWidth="2"/>
        {data.map((d,i)=><circle key={i} cx={pad + (i/(data.length-1))*(w-2*pad)} cy={h-pad-((d.nota/20)*(h-2*pad))} r="3" fill="#EAB308"/>)}
      </svg>
    </div>
  );
};

const ScoreBadge = ({ score }) => {
  const n = parseFloat(String(score).replace(',', '.'));
  const color = n>=17?'text-green-500 border-green-500':n>=15?'text-yellow-500 border-yellow-500':'text-red-500 border-red-500';
  return (
    <div className={`w-14 h-14 rounded-full border-2 flex flex-col items-center justify-center bg-black/50 ${color}`}>
      <span className="text-[7px] font-black uppercase">Nota</span>
      <span className="text-lg font-black">{n.toFixed(1)}</span>
    </div>
  );
};

const LoadingSteps = () => {
  const [s, setS] = useState(0);
  const steps = ["Validando estrutura...", "Confrontando leis...", "Avaliando coesão...", "Calculando nota...", "Gerando Gabarito..."];
  useEffect(() => { const i = setInterval(() => setS(p=>(p<4?p+1:0)), 1200); return () => clearInterval(i); }, []);
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-yellow-500 p-8">
      <div className="p-4 bg-black rounded-full border border-yellow-500/30 animate-pulse"><Shield size={40}/></div>
      <p className="text-xs font-bold uppercase tracking-widest">{steps[s]}</p>
    </div>
  );
};

// --- 5. APP PRINCIPAL ---
export default function App() {
  const [user, setUser] = useState(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [toast, setToast] = useState(null);
  
  // Login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isReg, setIsReg] = useState(false);

  // Editor
  const [tema, setTema] = useState("");
  const [aspectos, setAspectos] = useState("");
  const [redacao, setRedacao] = useState("");
  const [view, setView] = useState('editor');
  const [tab, setTab] = useState('texto'); 
  
  // Sistema
  const [loadingIA, setLoadingIA] = useState(false);
  const [loadingElite, setLoadingElite] = useState(false);
  const [avaliacao, setAvaliacao] = useState("");
  const [textoElite, setTextoElite] = useState("");
  const [historico, setHistorico] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [analises, setAnalises] = useState(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) setIsDark(savedTheme === 'true');
    return onAuthStateChanged(auth, u => { setUser(u); setLoadingUser(false); });
  }, []);

  useEffect(() => {
    if (!user || !db) return;
    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'history'), orderBy('timestamp', 'desc'), limit(10));
    return onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({id:d.id, ...d.data()}));
      setHistorico(docs);
      if(docs.length >= 2) setFeedback(FeedbackGenerator.gerarFeedbackCompleto(docs));
    });
  }, [user]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    try { 
      if(isReg) await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
      setToast({msg:"Sucesso!", type:'success'}); 
    } 
    catch (e) { setToast({msg:"Erro Login: "+e.code, type:'error'}); } 
    finally { setAuthLoading(false); }
  };

  const analisar = async () => {
    if (!redacao.trim()) return setToast({msg:"Escreva a redação.", type:'error'});
    if (!geminiApiKey) return setToast({msg:"Chave API faltando.", type:'error'});

    // 1. Validações Eliminatórias (Local)
    const valElim = EliminatorioValidator.validar(redacao, tema);
    if (!valElim.aprovado) {
      setAvaliacao(`# ❌ REDAÇÃO ELIMINADA\n\n${valElim.erros.map(e=>`### ${e.tipo}\n${e.mensagem}\n💡 Dica: ${e.dica}`).join('\n\n')}`);
      try { await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'history'), { tema: tema||"Sem Tema", texto: redacao, relatorio: "Eliminada", nota: 0, timestamp: Date.now() }); } catch(e){}
      setView('relatorio');
      return;
    }

    setLoadingIA(true);
    try {
      // 2. Análise Técnica Local (Para injetar no prompt)
      const est = EstruturaValidator.validarEstrutura(redacao);
      const lei = LegislacaoValidator.validarCitacoes(redacao);
      const voc = VocabularioAnalyzer.analisar(redacao);
      const coe = CoesaoAnalyzer.analisar(redacao);
      const gra = GramaticaValidator.detectar(redacao);

      setAnalises({est, lei, voc, coe, gra});

      const dados = `
      [ANÁLISE TÉCNICA PRÉVIA - USE ISTO]:
      - Estrutura: ${est.paragrafos} parágrafos. ${est.erros.map(e=>e.tipo).join(', ') || "OK"}.
      - Leis Citadas: ${lei.length}. (Se 0 em tema policial, penalize conteúdo).
      - Vocabulário PRF: ${voc.pontosFortes.map(p=>p.termo).join(', ') || "Nenhum"}. (Score: ${voc.scoreVocabular}).
      - Clichês: ${voc.problemas.map(p=>p.termo).join(', ')}.
      - Coesão: ${coe.conectivosUsados.total} conectivos. Score: ${coe.scoreCoesao.nota}.
      - Erros Gramaticais Óbvios: ${gra.length}.
      `;

      const prompt = `${SYSTEM_PROMPT}\n\n${dados}\n\nENTRADA ALUNO:\nTEMA: ${tema}\nASPECTOS: ${aspectos}\nTEXTO: ${redacao}`;
      
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${geminiApiKey}`, {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const json = await res.json();
      const result = json.candidates?.[0]?.content?.parts?.[0]?.text || "Erro IA";
      const nota = CebraspeScorer.extrairNotaFinal(result);

      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'history'), {
        tema: tema||"Sem Tema", texto: redacao, relatorio: result, nota, analises: {vocab: voc.scoreVocabular, coesao: coe.scoreCoesao.nota}, timestamp: Date.now()
      });

      setAvaliacao(result);
      setView('relatorio');
    } catch (e) { setToast({msg:"Erro IA", type:'error'}); }
    finally { setLoadingIA(false); }
  };

  const gerarElite = async () => {
    setLoadingElite(true);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${geminiApiKey}`, {
        method: "POST", headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ contents: [{ parts: [{ text: `${REWRITE_PROMPT}\n\nTEMA: ${tema}\nTEXTO: ${redacao}` }] }] })
      });
      const json = await res.json();
      setTextoElite(json.candidates?.[0]?.content?.parts?.[0]?.text || "Erro");
      setTab('elite');
    } catch (e) { setToast({msg:"Erro ao gerar elite", type:'error'}); }
    finally { setLoadingElite(false); }
  };

  const renderMd = (txt) => {
    if (!txt) return null;
    return txt.split('\n').map((l, i) => {
      if (l.includes('|')) return <div key={i} className="overflow-x-auto"><code className="block whitespace-pre font-mono text-xs bg-black/20 p-2 mb-1 rounded border border-white/5">{l}</code></div>;
      if (l.startsWith('# ')) return <h1 key={i} className="text-xl font-black text-yellow-500 mt-4 mb-2">{l.replace('# ','')}</h1>;
      if (l.startsWith('## ')) return <h2 key={i} className="text-lg font-bold mt-3 mb-1 border-b border-gray-700 pb-1">{l.replace('## ','')}</h2>;
      return <p key={i} className="mb-1 text-sm text-gray-300 leading-relaxed">{l.replace(/\*\*/g,'')}</p>;
    });
  };

  // --- UI DO LOGIN ---
  if (loadingUser) return <div className="h-screen bg-black flex items-center justify-center text-yellow-500"><Loader2 className="animate-spin" size={40}/></div>;
  if (!user) {
    const bgClass = isDark ? 'bg-[#111827] border-gray-800' : 'bg-white border-gray-200';
    const inputClass = `w-full h-12 pl-10 rounded-xl border outline-none text-sm ${isDark ? 'bg-[#0b0f14] border-gray-700 text-white focus:border-yellow-500' : 'bg-gray-50 border-gray-300 text-gray-900 focus:border-yellow-500'}`;
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 font-sans ${isDark ? 'bg-[#0b0f14]' : 'bg-gray-100'}`}>
        {toast && <Toast {...toast} onClose={()=>setToast(null)}/>}
        <div className={`w-full max-w-sm p-8 rounded-3xl border shadow-2xl ${bgClass}`}>
          <div className="text-center mb-8">
            <Shield className="mx-auto text-yellow-500 mb-2" size={48} />
            <h1 className={`text-xl font-black ${isDark?'text-white':'text-black'}`}>MENTOR <span className="text-yellow-500">PRF</span></h1>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Acesso Elite</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative"><Mail className="absolute left-3 top-3.5 text-gray-500" size={18}/><input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} className={inputClass} required/></div>
            <div className="relative"><Lock className="absolute left-3 top-3.5 text-gray-500" size={18}/><input type="password" placeholder="Senha" value={password} onChange={e=>setPassword(e.target.value)} className={inputClass} required/></div>
            <button disabled={authLoading} className="w-full h-12 bg-yellow-500 hover:bg-yellow-400 text-black font-black uppercase rounded-xl flex items-center justify-center gap-2 shadow-lg">{authLoading?<Loader2 className="animate-spin"/>:(isReg?"CADASTRAR":"ENTRAR")}</button>
          </form>
          <div className="my-6 flex items-center gap-2 text-[10px] text-gray-500 font-bold uppercase"><div className="flex-1 h-px bg-gray-700"></div>OU<div className="flex-1 h-px bg-gray-700"></div></div>
          <button onClick={() => {setAuthLoading(true); signInWithPopup(auth, googleProvider).catch(()=>setToast({msg:"Erro Google",type:'error'})).finally(()=>setAuthLoading(false));}} className={`w-full h-12 border font-bold text-sm rounded-xl flex items-center justify-center gap-2 ${isDark?'text-white hover:bg-gray-800':'text-black hover:bg-gray-100'}`}><img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width="18"/> Google</button>
          <p onClick={()=>setIsReg(!isReg)} className="text-center mt-6 text-xs text-yellow-600 font-bold cursor-pointer hover:underline">{isReg?'Voltar ao Login':'Criar Conta'}</p>
        </div>
      </div>
    );
  }

  // --- UI DO DASHBOARD ---
  const bg = isDark ? 'bg-[#0b0f14]' : 'bg-gray-100';
  const txt = isDark ? 'text-gray-200' : 'text-gray-900';
  const card = isDark ? 'bg-[#111827] border-gray-800' : 'bg-white border-gray-300';
  const activeBtn = 'bg-yellow-500 text-black shadow-lg';
  const inactiveBtn = isDark ? 'text-gray-500 hover:text-white' : 'text-gray-500 hover:text-black';

  return (
    <div className={`min-h-screen flex flex-col font-sans ${bg} ${txt} transition-colors duration-300`}>
      {toast && <Toast {...toast} onClose={()=>setToast(null)}/>}
      
      <header className={`px-4 py-3 border-b flex justify-between items-center z-20 sticky top-0 backdrop-blur-md ${isDark?'border-gray-800 bg-[#0b0f14]/90':'border-gray-300 bg-white/90'}`}>
        <div className="flex items-center gap-2">
          <Shield className="text-yellow-500" size={24}/>
          <div><h1 className="text-xs font-black uppercase">MENTOR <span className="text-yellow-500">PRF</span></h1><p className="text-[7px] font-bold uppercase tracking-widest text-gray-500">Versão Mestre</p></div>
        </div>
        <div className="flex gap-3">
          <button onClick={()=>{setIsDark(!isDark); localStorage.setItem('theme', (!isDark).toString())}}>{isDark?<Sun size={20}/>:<Moon size={20}/>}</button>
          <button onClick={()=>setView('historico')}><History size={20}/></button>
          <button onClick={()=>signOut(auth)} className="text-red-500"><LogOut size={20}/></button>
        </div>
      </header>

      <main className="flex-1 flex flex-col p-4 gap-4 w-full max-w-5xl mx-auto h-[calc(100vh-65px)] overflow-hidden">
        {view === 'editor' && (
          <>
            <div className={`flex p-1 rounded-xl border ${card} shrink-0`}>
              {['tema', 'aspectos', 'texto'].map(t => (
                <button key={t} onClick={()=>setTab(t)} className={`flex-1 py-3 rounded-lg text-[10px] font-black uppercase ${tab===t?activeBtn:inactiveBtn}`}>{t}</button>
              ))}
            </div>
            <div className="flex-1 relative flex flex-col min-h-0">
              <textarea 
                value={tab==='texto'?redacao:tab==='tema'?tema:aspectos}
                onChange={e=>{const v=e.target.value; if(tab==='texto')setRedacao(v); else if(tab==='tema')setTema(v); else setAspectos(v);}}
                className={`w-full h-full p-6 rounded-2xl border resize-none outline-none text-base leading-8 font-serif ${card} ${isDark?'placeholder-gray-700':'placeholder-gray-400'}`}
                placeholder={tab==='texto'?"Redação...":tab==='tema'?"Tema...":"Aspectos..."}
                style={tab==='texto'?{backgroundImage: `linear-gradient(${isDark?'#1f2937':'#e5e7eb'} 1px, transparent 1px)`, backgroundSize: '100% 2rem', lineHeight: '2rem'}:{}}
              />
              {tab==='texto' && <div className="absolute bottom-4 right-4 bg-black/80 text-white text-[10px] px-3 py-1 rounded-lg font-bold border border-white/10">{Math.ceil(redacao.length/65)} Linhas | {LegislacaoValidator.validarCitacoes(redacao).length} Leis</div>}
            </div>
            <button onClick={analisar} disabled={loadingIA} className="h-14 bg-yellow-500 text-black font-black uppercase rounded-xl flex items-center justify-center gap-2 shadow-lg shrink-0">{loadingIA?<Loader2 className="animate-spin"/>:<><Zap size={18}/> CORRIGIR</>}</button>
          </>
        )}

        {view === 'relatorio' && (
          <div className="flex-1 flex flex-col gap-3 overflow-hidden animate-in slide-in-from-right">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {['correcao', 'elite', 'evolucao'].map(t=>(<button key={t} onClick={()=>setTab(t)} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase ${tab===t?'bg-yellow-500 text-black':'bg-gray-800 text-gray-400'}`}>{t}</button>))}
            </div>
            <div className={`flex-1 p-6 rounded-2xl border overflow-y-auto custom-scrollbar ${card}`}>
              {tab==='correcao' && renderMd(avaliacao)}
              {tab==='elite' && (loadingElite?<LoadingSteps/>:(textoElite?<div className="whitespace-pre-wrap font-serif leading-loose">{textoElite}</div>:<div className="text-center py-10"><button onClick={gerarElite} className="px-6 py-3 bg-yellow-500 text-black font-bold rounded-xl">GERAR GABARITO NOTA 20</button></div>))}
              {tab==='evolucao' && feedback && (
                <div className="space-y-6">
                  <div className="p-4 bg-blue-500/10 rounded-xl text-sm border border-blue-500/20 text-blue-300">{feedback.resumoEvolucao.mensagem}</div>
                  <SimpleLineChart data={feedback.resumoEvolucao.grafico} isDark={isDark}/>
                  <div className="space-y-2">{feedback.proximosPassos.map((p,i)=><div key={i} className="p-3 bg-gray-800 rounded border border-gray-700"><p className="font-bold text-yellow-500 text-xs">{p.titulo}</p><p className="text-xs text-gray-400">{p.descricao}</p></div>)}</div>
                </div>
              )}
            </div>
            <button onClick={()=>setView('editor')} className={`h-12 border font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-2 shrink-0 ${card}`}><ArrowLeft size={16}/> Voltar</button>
          </div>
        )}

        {view === 'historico' && (
          <div className="flex-1 flex flex-col gap-3 overflow-hidden animate-in slide-in-from-right duration-300">
            <div className="flex-1 overflow-y-auto space-y-3 p-1 custom-scrollbar">
              {historico.length===0?<div className="text-center py-20 text-xs font-bold uppercase text-gray-500">Vazio</div>:
              historico.map(h=>(<div key={h.id} onClick={()=>{setAvaliacao(h.relatorio); setTema(h.tema); setRedacao(h.texto); setView('relatorio'); setTab('correcao')}} className={`p-4 rounded-xl border flex justify-between items-center cursor-pointer ${card} hover:border-yellow-500`}><div><span className="text-[9px] font-black text-gray-500 uppercase">{new Date(h.timestamp).toLocaleDateString()}</span><p className="font-bold text-sm truncate w-40">{h.tema||'Sem Título'}</p></div><ScoreBadge score={h.nota||0}/></div>))}
            </div>
            <button onClick={()=>setView('editor')} className={`h-12 border font-bold text-xs uppercase rounded-xl flex items-center justify-center gap-2 shrink-0 ${card}`}><ArrowLeft size={16}/> Voltar</button>
          </div>
        )}
      </main>
      <style>{`.custom-scrollbar::-webkit-scrollbar{width:5px}.custom-scrollbar::-webkit-scrollbar-thumb{background:#374151;border-radius:10px}`}</style>
    </div>
  );
}
