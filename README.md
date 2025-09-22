# Tsoft WA Backend

Micro-servicio para enviar confirmaciones y recordatorios de reservas por WhatsApp Cloud API.

## Requisitos
- Node 18+
- Cuenta de Meta for Developers con WhatsApp Cloud API
- Variables de entorno en `.env` (copiar de `.env.example`)

## Instalación
```bash
npm i
cp .env.example .env
# editar .env con tus credenciales
npm run dev
```

## Endpoints
### Health
GET `/health` → `{ ok:true }`

### Enviar ahora
POST `/wa/send-now`
```json
{
  "toE164": "54911XXXXXXXX",
  "text": "Hola, tu reserva fue recibida."
}
```

### Programar recordatorios
POST `/wa/schedule`
```json
{
  "toE164": "54911XXXXXXXX",
  "fechaISO": "2025-09-21",
  "horaHM": "18:00",
  "nombre": "Juan Perez",
  "notas": "Evento corporativo",
  "offsetsMin": [1440, 120]
}
```

## Despliegue
- Render, Railway, Fly.io o VPS propio. Exponer puerto definido en `PORT`.
- Asegurar zona horaria del host para que los recordatorios disparen en el horario local esperado.
