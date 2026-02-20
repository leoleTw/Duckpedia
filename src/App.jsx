import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  onSnapshot,
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { Search, Database, Loader2, ArrowLeft, Shield, X, Info, Sun, Moon, ChevronRight } from 'lucide-react';

// --- CONFIGURAÇÃO FIREBASE ---
// Importante: No seu PC, você deve substituir esse objeto pelas suas chaves do Firebase Console
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "AIzaSyA1LqIQaK7wc2DnBHA4OlATy-4oH-43IOc",
      authDomain: "duckpedia-859e7.firebaseapp.com",
      projectId: "duckpedia-859e7",
      storageBucket: "duckpedia-859e7.firebasestorage.app",
      messagingSenderId: "23526461400",
      appId: "1:23526461400:web:4cbdb2fb2c153bda14acad"
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'duckpedia-app';

// --- CONFIGURAÇÃO GEMINI ---
const API_KEY = "gen-lang-client-0306088095"; // A chave é injetada pelo ambiente ou você coloca a sua aqui
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";

export default function App() {
  const [user, setUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [allArticles, setAllArticles] = useState([]); 
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState(null);
  const [showTerms, setShowTerms] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  const searchRef = useRef(null);

  // Estilo Serif Clássico (Tipo New York Times / Wikipedia)
  const fontStyle = { fontFamily: "'Times New Roman', Times, serif" };

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Erro auth:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const articlesRef = collection(db, 'artifacts', appId, 'public', 'data', 'articles');
    
    const unsubscribe = onSnapshot(articlesRef, (snapshot) => {
      setTotalCount(snapshot.size);
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAllArticles(docs);
    }, (err) => {
      console.error("Erro snapshot:", err);
    });

    return () => unsubscribe();
  }, [user]);

  // Auto-completar baseado no que já tem no banco
  useEffect(() => {
    if (searchTerm.trim().length > 1) {
      const filtered = allArticles
        .filter(art => art.title.toLowerCase().includes(searchTerm.toLowerCase()))
        .slice(0, 5);
      setSuggestions(filtered);
    } else {
      setSuggestions([]);
    }
  }, [searchTerm, allArticles]);

  const fetchWithRetry = async (prompt, retries = 5, delay = 1000) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`;
    const systemPrompt = `Você é a Duckpédia. Escreva artigos sérios, profundos e enciclopédicos. Use Markdown clássico. Comece com um resumo e use subtítulos (##).`;
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] }
    };
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!response.ok) throw new Error();
        const data = await response.json();
        return data.candidates?.[0]?.content?.parts?.[0]?.text;
      } catch (err) {
        if (i === retries - 1) throw err;
        await new Promise(res => setTimeout(res, delay * Math.pow(2, i)));
      }
    }
  };

  const handleSearch = async (e, overrideTerm = null) => {
    if (e) e.preventDefault();
    const termToSearch = overrideTerm || searchTerm;
    if (!termToSearch.trim() || !user) return;
    
    setLoading(true);
    setSuggestions([]);
    setError(null);
    
    const slug = termToSearch.trim().toLowerCase().replace(/\s+/g, '-');
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'articles', slug);
    
    try {
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setArticle(docSnap.data());
      } else {
        const content = await fetchWithRetry(`Escreva um artigo enciclopédico magistral sobre: ${termToSearch}`);
        const newArt = { 
          title: termToSearch, 
          content, 
          author: user.uid, 
          createdAt: new Date().toISOString() 
        };
        await setDoc(docRef, newArt);
        setArticle(newArt);
      }
    } catch (err) {
      setError("Falha na conexão com a Duckpédia.");
    } finally {
      setLoading(false);
    }
  };

  const renderMarkdown = (content) => {
    return content.split('\n').map((line, i) => {
      if (line.startsWith('# ')) return <h1 key={i} className={`text-5xl font-bold mb-8 border-b pb-4 ${isDarkMode ? 'border-zinc-800 text-white' : 'border-zinc-300 text-black'}`}>{line.replace('# ', '')}</h1>;
      if (line.startsWith('## ')) return <h2 key={i} className={`text-2xl font-bold mt-10 mb-5 ${isDarkMode ? 'text-zinc-100' : 'text-zinc-800'}`}>{line.replace('## ', '')}</h2>;
      if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className={`ml-8 mb-3 text-lg ${isDarkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>{line.substring(2)}</li>;
      if (line.trim() === "") return <div key={i} className="h-4" />;
      return <p key={i} className={`mb-6 leading-relaxed text-xl text-justify ${isDarkMode ? 'text-zinc-400' : 'text-zinc-800'}`}>{line}</p>;
    });
  };

  return (
    <div style={fontStyle} className={`min-h-screen transition-colors duration-500 flex flex-col ${isDarkMode ? 'bg-black text-white' : 'bg-zinc-50 text-black'}`}>
      
      {/* Header Fino e Minimalista */}
      <nav className={`border-b sticky top-0 z-50 backdrop-blur-md ${isDarkMode ? 'bg-black/90 border-zinc-900' : 'bg-white/90 border-zinc-200'}`}>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => { setArticle(null); setSearchTerm(""); }}>
            <span className="text-xl font-black tracking-widest font-sans uppercase">Duckpédia</span>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className={`p-2 rounded-full transition-all ${isDarkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'}`}
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-grow max-w-4xl mx-auto w-full px-6 py-16">
        {!article ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh] animate-in fade-in duration-1000">
            <div className="mb-12 text-center">
              <h1 className="text-7xl md:text-9xl font-bold mb-4 tracking-tighter italic">Duckpédia</h1>
              <p className={`text-xs tracking-[0.5em] uppercase font-bold font-sans ${isDarkMode ? 'text-zinc-700' : 'text-zinc-400'}`}>The Universal Archive — 2026</p>
            </div>
            
            <div className="w-full max-w-2xl relative" ref={searchRef}>
              <form onSubmit={handleSearch} className="relative z-20">
                <input 
                  type="text"
                  placeholder="Pesquisar ou criar conhecimento..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full border-2 rounded-full px-8 py-5 text-xl outline-none transition-all shadow-2xl font-sans ${
                    isDarkMode 
                      ? 'bg-zinc-900 border-zinc-800 focus:border-white text-white' 
                      : 'bg-white border-zinc-200 focus:border-black text-black'
                  }`}
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                  {loading && <Loader2 className="animate-spin text-zinc-500" size={20} />}
                  <button 
                    type="submit" 
                    disabled={loading} 
                    className={`p-3 rounded-full transition-all ${isDarkMode ? 'bg-white text-black hover:scale-105' : 'bg-black text-white hover:scale-105'}`}
                  >
                    <Search size={22} strokeWidth={3} />
                  </button>
                </div>
              </form>

              {/* Sugestões de Auto-completar */}
              {suggestions.length > 0 && (
                <div className={`absolute top-full left-0 right-0 mt-2 rounded-3xl overflow-hidden border z-10 shadow-2xl animate-in slide-in-from-top-2 duration-200 font-sans ${
                  isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
                }`}>
                  {suggestions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setSearchTerm(s.title); handleSearch(null, s.title); }}
                      className={`w-full text-left px-8 py-4 flex items-center justify-between group transition-colors border-b ${
                        isDarkMode ? 'hover:bg-zinc-800 border-zinc-800 text-white' : 'hover:bg-zinc-50 border-zinc-100 text-black'
                      }`}
                    >
                      <span className="text-lg font-medium">{s.title}</span>
                      <ChevronRight size={16} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                </div>
              )}

              {loading && (
                <div className="mt-4 text-center animate-pulse text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-black font-sans">
                  Redigindo novos fatos para a biblioteca...
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700">
            <button 
              onClick={() => { setArticle(null); setSearchTerm(""); }} 
              className="flex items-center gap-2 text-zinc-500 hover:text-zinc-800 mb-12 font-bold text-xs uppercase transition-all tracking-widest font-sans"
            >
              <ArrowLeft size={14} /> Voltar ao Index
            </button>
            <article className="prose prose-zinc max-w-none">
              {renderMarkdown(article.content)}
            </article>
          </div>
        )}
      </main>

      {/* Footer "Parrudo" */}
      <footer className={`border-t py-16 mt-auto transition-colors ${isDarkMode ? 'bg-black border-zinc-900 text-zinc-600' : 'bg-white border-zinc-200 text-zinc-400'}`}>
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12 items-center font-sans">
          
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <span className={`text-4xl font-bold ${isDarkMode ? 'text-white' : 'text-black'}`}>{totalCount}</span>
              <span className="text-[10px] uppercase tracking-widest font-black">Artigos no Acervo</span>
            </div>
            <p className="text-[10px] max-w-xs leading-relaxed opacity-50 uppercase font-bold tracking-tighter">
              A Duckpédia é um esforço coletivo de catalogação infinita via IA sob supervisão de Leandro Marethi.
            </p>
          </div>

          <div className="text-[10px] uppercase tracking-[0.2em] text-center font-black">
            © 2026 Leandro Marethi <br/> Todos os direitos reservados.
          </div>
          
          <div className="flex justify-end gap-8">
            <button onClick={() => setShowTerms(true)} className="text-[10px] uppercase font-black hover:text-white transition-colors border-b border-transparent hover:border-current">Termos Legais</button>
            <div className={`px-3 py-1 border text-[10px] font-mono rounded ${isDarkMode ? 'border-zinc-800' : 'border-zinc-200'}`}>
              BUILD_02192026_STABLE
            </div>
          </div>
        </div>
      </footer>

      {/* Modal de Termos */}
      {showTerms && (
        <div className="fixed inset-0 bg-black/95 z-[200] flex items-center justify-center p-6 backdrop-blur-md animate-in fade-in duration-300">
          <div className={`${isDarkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'} border max-w-lg w-full p-10 rounded-3xl relative shadow-2xl`}>
            <button onClick={() => setShowTerms(false)} className="absolute top-6 right-6 hover:rotate-90 transition-transform"><X size={24} /></button>
            <h2 className="text-2xl font-bold mb-8 italic">Termos da Duckpédia</h2>
            <div className="text-sm space-y-6 opacity-80 leading-relaxed font-serif">
              <p>• Todo conteúdo é gerado por algoritmos de IA sob supervisão da arquitetura de Leandro Marethi.</p>
              <p>• A Duckpédia é um experimento de memória coletiva; o uso das informações é por conta e risco do usuário.</p>
              <p>• Proibido o uso de patos reais para fins de mineração de dados ou piadas sem graça.</p>
            </div>
            <button 
              onClick={() => setShowTerms(false)} 
              className={`mt-10 w-full py-4 rounded-xl font-bold uppercase tracking-widest transition-all font-sans ${
                isDarkMode ? 'bg-white text-black hover:bg-zinc-200' : 'bg-black text-white hover:bg-zinc-800'
              }`}
            >
              Aceitar e Continuar
            </button>
          </div>
        </div>
      )}

      {/* Erro Toast */}
      {error && (
        <div className="fixed bottom-8 right-8 bg-red-600 text-white px-6 py-4 rounded-xl flex items-center gap-4 shadow-2xl z-[300] font-bold text-sm uppercase font-sans">
          <Info size={18} />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-4 hover:opacity-50"><X size={18}/></button>
        </div>
      )}
    </div>
  );
}