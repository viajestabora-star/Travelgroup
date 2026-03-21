import React, { useState, useEffect } from 'react';
import { 
  Wand2, Plus, Trash2, Save, Sparkles, Loader2, 
  CheckCircle2, AlertCircle, FileText
} from 'lucide-react';

/**
 * RECONSTRUCCIÓN DE COMPATIBILIDAD - SISTEMA TABORA
 * Se cambia la importación de Supabase a una URL de CDN para evitar errores de resolución.
 * Se mantiene la lógica de inyección de API interna para Gemini.
 */

const GeneradorProgramas = ({ user }) => {
  const [titulo, setTitulo] = useState('');
  const [notasGemini, setNotasGemini] = useState('');
  const [dias, setDias] = useState([{ id: Date.now(), titulo: 'Día 1', contenido: '' }]);
  const [cargandoIA, setCargandoIA] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [notificacion, setNotificacion] = useState(null);
  
  const [supabase, setSupabase] = useState(null);

  // Inicialización de servicios
  useEffect(() => {
    const initServices = async () => {
      try {
        // Obtenemos las variables de entorno de forma segura
        const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || "";
        const supabaseKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || "";

        // IMPORTACIÓN VIA CDN para evitar el error "Failed to resolve module"
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
        
        if (supabaseUrl && supabaseKey) {
          setSupabase(createClient(supabaseUrl, supabaseKey));
        } else {
          console.warn("Faltan credenciales de Supabase en el archivo .env");
        }
      } catch (err) {
        console.error("Error crítico de inicialización:", err);
      }
    };

    initServices();
  }, []);

  const mostrarNotificacion = (tipo, texto) => {
    setNotificacion({ tipo, texto });
    setTimeout(() => setNotificacion(null), 5000);
  };

  const optimizarItinerario = async () => {
    if (!notasGemini.trim()) {
      mostrarNotificacion('error', 'Por favor, introduce el texto para optimizar.');
      return;
    }

    setCargandoIA(true);
    try {
      const apiKey = ""; // El entorno inyectará la clave automáticamente
      const systemPrompt = "Eres un redactor experto de viajes de lujo para Tabora. Devuelve SIEMPRE un JSON puro con el formato: [{\"titulo\": \"...\", \"contenido\": \"...\"}]";
      const userQuery = `Optimiza este itinerario: ${notasGemini}`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userQuery }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (text) {
        const datos = JSON.parse(text);
        setDias(datos.map((d, i) => ({ 
          id: Date.now() + i, 
          titulo: d.titulo || `Día ${i + 1}`, 
          contenido: d.contenido || '' 
        })));
        mostrarNotificacion('ok', '✨ Itinerario optimizado por la IA de Tabora.');
      }
    } catch (error) {
      console.error("Error IA:", error);
      mostrarNotificacion('error', 'La IA no respondió correctamente.');
    } finally {
      setCargandoIA(false);
    }
  };

  const handleGuardar = async () => {
    if (!titulo.trim()) {
      mostrarNotificacion('error', 'El título es obligatorio.');
      return;
    }
    
    if (!supabase) {
      mostrarNotificacion('error', 'Sin conexión a base de datos. Verifica VITE_SUPABASE_URL.');
      return;
    }
    
    setGuardando(true);
    try {
      const { error } = await supabase
        .from('programas_viaje')
        .upsert({
          nombre_grupo: titulo,
          notas_ia: notasGemini,
          itinerario_json: dias, 
          user_email: user?.email || 'admin@tabora.com',
          updated_at: new Date().toISOString()
        }, { onConflict: 'nombre_grupo' });

      if (error) throw error;
      mostrarNotificacion('ok', 'Programa guardado en el ERP con éxito.');
    } catch (error) {
      console.error("Error Guardar:", error);
      mostrarNotificacion('error', `Error: ${error.message}`);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#F1F5F9]">
      {notificacion && (
        <div className={`fixed top-8 right-8 z-[100] flex items-center gap-4 px-6 py-4 rounded-2xl shadow-2xl border-2 transition-all animate-in slide-in-from-right-10 ${
          notificacion.tipo === 'ok' ? 'bg-white border-indigo-500 text-indigo-900' : 'bg-white border-red-500 text-red-900'
        }`}>
          {notificacion.tipo === 'ok' ? <CheckCircle2 className="text-indigo-600" /> : <AlertCircle className="text-red-600" />}
          <p className="font-bold text-sm tracking-tight">{notificacion.texto}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-10">
        <div className="max-w-6xl mx-auto">
          <header className="flex flex-col md:flex-row justify-between items-center mb-12 gap-6 bg-white p-8 rounded-[40px] shadow-sm border border-slate-100">
            <div className="flex items-center gap-5">
              <div className="bg-indigo-600 p-4 rounded-3xl text-white shadow-indigo-200 shadow-lg">
                <FileText size={32} />
              </div>
              <div>
                <h1 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Diseñador Profesional</h1>
                <p className="text-slate-400 text-xs font-black uppercase tracking-[0.2em]">Viajes Tabora · ERP v2.0</p>
              </div>
            </div>

            <button
              onClick={handleGuardar}
              disabled={guardando}
              className="bg-slate-900 text-white px-10 py-5 rounded-3xl font-black text-sm tracking-widest flex items-center gap-3 hover:bg-indigo-600 transition-all shadow-xl disabled:opacity-50"
            >
              {guardando ? <Loader2 className="animate-spin" /> : <Save size={20} />}
              GUARDAR PROGRAMA
            </button>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <aside className="lg:col-span-4 space-y-8">
              <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-sm space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Título del viaje</label>
                  <input
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-4 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Ej: Safari Kenia 2025"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest px-1">Notas para Gemini</label>
                  <textarea
                    value={notasGemini}
                    onChange={(e) => setNotasGemini(e.target.value)}
                    className="w-full bg-slate-50 border-none rounded-2xl px-6 py-5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none h-80 resize-none leading-relaxed"
                    placeholder="Pega aquí el texto sucio..."
                  />
                </div>

                <button
                  onClick={optimizarItinerario}
                  disabled={cargandoIA}
                  className="w-full bg-indigo-600 text-white py-5 rounded-3xl font-black flex items-center justify-center gap-3 hover:bg-indigo-700 transition-all shadow-indigo-100 shadow-xl disabled:opacity-50"
                >
                  {cargandoIA ? <Loader2 className="animate-spin" /> : <Sparkles size={22} />}
                  OPTIMIZAR CON IA
                </button>
              </div>
            </aside>

            <main className="lg:col-span-8 space-y-6">
              {dias.map((dia, index) => (
                <div key={dia.id} className="bg-white rounded-[40px] border border-slate-100 shadow-sm overflow-hidden group transition-all hover:shadow-md">
                  <div className="bg-slate-50/50 px-10 py-5 flex items-center justify-between border-b border-slate-50">
                    <div className="flex items-center gap-5 flex-1">
                      <span className="bg-white text-indigo-600 w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-sm border border-slate-100">
                        {index + 1}
                      </span>
                      <input
                        value={dia.titulo}
                        onChange={(e) => {
                          const nd = [...dias];
                          nd[index].titulo = e.target.value;
                          setDias(nd);
                        }}
                        className="bg-transparent font-black text-slate-800 outline-none text-lg w-full tracking-tight"
                      />
                    </div>
                    <button 
                      onClick={() => setDias(dias.filter(d => d.id !== dia.id))}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all p-2"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                  <div className="p-10">
                    <textarea
                      value={dia.contenido}
                      onChange={(e) => {
                        const nd = [...dias];
                        nd[index].contenido = e.target.value;
                        setDias(nd);
                      }}
                      className="w-full text-slate-600 text-sm leading-8 outline-none min-h-[150px] resize-none bg-transparent font-medium"
                      placeholder="Describe las actividades, alojamiento y experiencias..."
                    />
                  </div>
                </div>
              ))}

              <button
                onClick={() => setDias([...dias, { id: Date.now(), titulo: `Día ${dias.length + 1}`, contenido: '' }])}
                className="w-full py-6 border-4 border-dashed border-slate-200 rounded-[40px] text-slate-400 font-black text-xs tracking-widest hover:border-indigo-300 hover:text-indigo-600 transition-all flex items-center justify-center gap-3 uppercase"
              >
                <Plus size={24} /> AÑADIR DÍA AL ITINERARIO
              </button>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GeneradorProgramas;