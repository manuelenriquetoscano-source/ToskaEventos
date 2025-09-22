// server.js
import 'dotenv/config';
import express from 'express';
import fetch from 'node-fetch';
import schedule from 'node-schedule';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

if(!PHONE_NUMBER_ID || !WHATSAPP_TOKEN){
  console.error("Faltan variables de entorno PHONE_NUMBER_ID o WHATSAPP_TOKEN.");
  process.exit(1);
}

const GRAPH = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
const HEADERS = {
  'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
  'Content-Type': 'application/json'
};

app.get('/health', (_req, res) => res.json({ ok:true, service:'tsoft-wa-backend' }));

// Enviar ahora (confirmación o recordatorio inmediato)
app.post('/wa/send-now', async (req, res) => {
  const { toE164, text } = req.body;
  if(!toE164 || !text) return res.status(400).json({ ok:false, error:"toE164 y text son requeridos" });
  try{
    const r = await fetch(GRAPH, {
      method: 'POST', headers: HEADERS,
      body: JSON.stringify({ messaging_product: "whatsapp", to: toE164, type: "text", text: { body: text } })
    });
    const j = await r.json();
    if(!r.ok) throw new Error(JSON.stringify(j));
    res.json({ ok:true, id:j.messages?.[0]?.id || null, response:j });
  }catch(e){ res.status(500).json({ ok:false, error:String(e) }); }
});

// Programar recordatorios en servidor (offsets en minutos)
app.post('/wa/schedule', async (req, res) => {
  const { toE164, fechaISO, horaHM, nombre = "", notas = "", offsetsMin = [1440, 120] } = req.body;
  if(!toE164 || !fechaISO || !horaHM) return res.status(400).json({ ok:false, error:"toE164, fechaISO y horaHM son requeridos" });
  try{
    const [H,M] = String(horaHM).split(':').map(Number);
    const d = new Date(`${fechaISO}T00:00:00`); d.setHours(H||0, M||0, 0, 0);

    const jobs = [];
    for(const min of offsetsMin){
      const when = new Date(d.getTime() - Number(min)*60000);
      if(isNaN(when.getTime())) continue;
      if(when < new Date()) continue; // no programar en pasado

      const text = `Recordatorio: ${nombre || "cliente"}, tu reserva es el ${fechaISO} a las ${horaHM}.` + (notas ? ` Notas: ${notas}.` : '');
      const job = schedule.scheduleJob(when, async () => {
        try{
          await fetch(GRAPH, {
            method:'POST', headers:HEADERS,
            body: JSON.stringify({ messaging_product:"whatsapp", to: toE164, type:"text", text:{ body:text } })
          });
        }catch(e){ console.error("Error enviando recordatorio:", e); }
      });
      jobs.push({ when: when.toISOString(), name: job.name });
    }

    res.json({ ok:true, jobs });
  }catch(e){ res.status(500).json({ ok:false, error:String(e) }); }
});

app.listen(PORT, () => console.log(`WA backend listo en :${PORT}`));
