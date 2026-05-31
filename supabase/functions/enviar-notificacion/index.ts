/**
 * ClasesDe10 — Edge Function: enviar-notificacion
 * Crea una notificación en BD y opcionalmente envía email via Resend.
 *
 * POST /functions/v1/enviar-notificacion
 * Body: { usuario_id, titulo, mensaje, tipo, url_accion?, email? }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const { usuario_id, titulo, mensaje, tipo = 'info', url_accion, email } = await req.json();

    if (!usuario_id || !titulo || !mensaje) {
      return new Response(JSON.stringify({ error: 'Faltan parámetros.' }), {
        status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const db = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Insertar notificación en BD
    const { error } = await db.from('notificaciones').insert({
      usuario_id, titulo, mensaje, tipo, url_accion,
    });

    if (error) throw error;

    // Enviar email si se proporciona dirección y RESEND_API_KEY configurada
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (email && resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'ClasesDe10 <noreply@clasesde10.es>',
          to: [email],
          reply_to: 'hola@clasesde10.es',
          subject: titulo,
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px">
              <div style="text-align:center;margin-bottom:28px">
                <img src="https://clasesde10.wordpress.com/wp-content/uploads/2025/07/cropped-chatgpt-image-17-jul-2025-20_00_31.png"
                     width="60" style="border-radius:12px">
                <h2 style="font-family:Georgia,serif;color:#0f1f3d;margin-top:12px">ClasesDe10</h2>
              </div>
              <h3 style="color:#0f1f3d">${titulo}</h3>
              <p style="color:#3d3830;line-height:1.7">${mensaje}</p>
              ${url_accion ? `<a href="${url_accion}" style="display:inline-block;margin-top:20px;background:#e8a030;color:#0f1f3d;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none">Ver en la plataforma</a>` : ''}
              <hr style="margin:32px 0;border:none;border-top:1px solid #e5e0d8">
              <p style="font-size:.75rem;color:#8a8478;text-align:center">
                ClasesDe10 · Madrid · <a href="https://www.clasesde10.es" style="color:#8a8478">clasesde10.es</a>
              </p>
            </div>`,
        }),
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
