# Llamadas WebRTC nitidas con coturn (TURN/STUN)

Sin TURN propio, muchas llamadas caen por rutas relay malas y el audio
suena "robot" con ruido de fondo. Estos pasos montan coturn en el VPS.

## 1. Requisitos

- Un VPS con IP publica fija (ej: `203.0.113.10`).
- Docker + Docker Compose instalados.
- Puertos abiertos en el firewall del proveedor y del sistema:

| Puerto            | Protocolo | Uso                    |
|-------------------|-----------|------------------------|
| 3478              | UDP/TCP   | STUN/TURN              |
| 49160-49200       | UDP       | Rango de media (relay) |

## 2. Instalar coturn

```bash
cd deploy
cp .env.example .env
# Edita deploy/.env con tu IP publica y una clave larga
nano .env
docker compose up -d
docker compose logs -f   # verifica que arranca sin errores
```

## 3. Configurar el backend

En `backend/.env` del VPS:

```env
STUN_URL=stun:TU_IP_PUBLICA:3478
TURN_URL=turn:TU_IP_PUBLICA:3478
TURN_USERNAME=pikantepe
TURN_CREDENTIAL=la_misma_clave_de_deploy_env
TURN_PUBLIC_FALLBACK=0
```

Reinicia el backend. Verifica que el endpoint devuelva el TURN:

```bash
curl http://localhost:3001/api/calls/ice
```

Debe incluir `turn:TU_IP_PUBLICA:3478`.

## 4. Verificar en el navegador

1. Abre la consola y ejecuta:
   `localStorage.setItem('pkpDebugCalls','1')`, recarga.
2. Haz una llamada y revisa en `chrome://webrtc-internals`:
   - ICE connection state = `connected`/`completed`.
   - Que exista un par tipo `relay` (usa TURN) o `srflx`/`host` (directo).
   - `packetsLost` bajo y `jitter` bajo.

Si ves paquetes perdidos altos o `failed`, revisa puertos del firewall.

## 5. Notas

- `TURN_PUBLIC_FALLBACK=1` (openrelay) es solo para pruebas; no lo uses en
  produccion porque se satura y degrada el audio.
- El rango `49160-49200` son ~40 puertos; ajustalo si esperas muchas
  llamadas simultaneas (cada llamada consume 2 puertos por relay).
- Las credenciales de coturn son estaticas. Para produccion seria ideal
  usar credenciales temporales (TURN REST API), pero esto ya es estable.
