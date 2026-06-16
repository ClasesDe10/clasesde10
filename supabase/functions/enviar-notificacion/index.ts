/**
 * ClasesDe10 - Edge Function: enviar-notificacion.
 *
 * POST /functions/v1/enviar-notificacion
 * Body: { usuario_id, titulo, mensaje, tipo?, url_accion?, email? }
 *
 * Seguridad:
 * - Requiere x-internal-secret = NOTIFICATION_SECRET o JWT de usuario admin.
 * - Inserta con service role solo despues de autorizar al llamante.
 * - Escapa el HTML del email y limita URLs de accion al dominio canonico.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-secret',
};

const TIPO_MAP: Record<string, string> = {
  info: 'info',
  exito: 'exito',
  success: 'exito',
  advertencia: 'advertencia',
  warning: 'advertencia',
  error: 'error',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function clean(value: unknown, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeActionUrl(value: unknown) {
  const raw = clean(value, 500);
  if (!raw) return null;

  try {
    const url = new URL(raw, 'https://clasesde10.com');
    if (url.origin !== 'https://clasesde10.com') return null;
    return url.toString();
  } catch (_) {
    return null;
  }
}

async function isAuthorized(req: Request, db: ReturnType<typeof createClient>) {
  const expectedSecret = Deno.env.get('NOTIFICATION_SECRET');
  const providedSecret = req.headers.get('x-internal-secret');
  if (expectedSecret && providedSecret && providedSecret === expectedSecret) return true;

  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;

  const { data: userData, error: userError } = await db.auth.getUser(token);
  if (userError || !userData.user) return false;

  const { data: usuario } = await db
    .from('usuarios')
    .select('rol, activo')
    .eq('auth_id', userData.user.id)
    .single();

  return usuario?.activo === true && usuario?.rol === 'admin';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Metodo no permitido.' }, 405);

  try {
    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      (Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_KEY'))!,
    );

    if (!(await isAuthorized(req, db))) {
      return json({ error: 'No autorizado.' }, 401);
    }

    const body = await req.json();
    const usuario_id = clean(body.usuario_id, 80);
    const titulo = clean(body.titulo, 160);
    const mensaje = clean(body.mensaje, 3000);
    const tipoRaw = clean(body.tipo, 30).toLowerCase();
    const tipo = TIPO_MAP[tipoRaw] || 'info';
    const url_accion = normalizeActionUrl(body.url_accion);
    const email = clean(body.email, 254).toLowerCase();

    if (!usuario_id || !titulo || !mensaje) {
      return json({ error: 'Faltan parametros.' }, 400);
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Email no valido.' }, 400);
    }

    const { error } = await db.from('notificaciones').insert({
      usuario_id,
      titulo,
      mensaje,
      tipo,
      url_accion,
    });

    if (error) throw error;

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (email && resendKey) {
      const safeTitulo = escapeHtml(titulo);
      const safeMensaje = escapeHtml(mensaje).replace(/\n/g, '<br>');
      const safeUrl = url_accion ? escapeHtml(url_accion) : null;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'ClasesDe10 <noreply@clasesde10.com>',
          to: [email],
          reply_to: 'contacto.clasesde10@gmail.com',
          subject: titulo,
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px">
              <div style="text-align:center;margin-bottom:28px">
                <img src="https://clasesde10.com/assets/img/logo-192.png"
                     width="60" style="border-radius:12px" alt="ClasesDe10">
                <h2 style="font-family:Georgia,serif;color:#0f1f3d;margin-top:12px">ClasesDe10</h2>
              </div>
              <h3 style="color:#0f1f3d">${safeTitulo}</h3>
              <p style="color:#3d3830;line-height:1.7">${safeMensaje}</p>
              ${safeUrl ? `<a href="${safeUrl}" style="display:inline-block;margin-top:20px;background:#e8a030;color:#0f1f3d;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none">Ver en la plataforma</a>` : ''}
              <hr style="margin:32px 0;border:none;border-top:1px solid #e5e0d8">
              <p style="font-size:.75rem;color:#8a8478;text-align:center">
                ClasesDe10 - Madrid - <a href="https://clasesde10.com" style="color:#8a8478">clasesde10.com</a>
              </p>
            </div>`,
        }),
      });
    }

    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error interno.';
    return json({ error: message }, 500);
  }
});
