// HTML de tabelas e CSS inline: sem JavaScript, imagens remotas ou dados do usuário.
function templateVerificacaoEmail(codigo, validadeMinutos) {
  if (!/^\d{6}$/.test(codigo)) throw new Error('Formato de código inválido');
  const destacado = `${codigo.slice(0, 3)} ${codigo.slice(3)}`;
  const text = `BoviTrack\n\nVerifique seu e-mail\n\nSeu código: ${destacado}\n\nEste código expira em ${validadeMinutos} minutos.\nUse-o somente na tela de verificação do BoviTrack. Nunca compartilhe este código.\n\nSe você não criou uma conta ou não solicitou esta verificação no BoviTrack, ignore esta mensagem.\nEste é um e-mail transacional de segurança.`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Verifique seu e-mail — BoviTrack</title></head>
<body style="margin:0;padding:0;background:#f3f6f4;font-family:Arial,Helvetica,sans-serif;color:#183c2c">
<div style="display:none;max-height:0;overflow:hidden">Seu código de verificação do BoviTrack expira em ${validadeMinutos} minutos.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="480" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:480px;background:#ffffff;border-radius:16px"><tr><td style="padding:32px">
<p style="margin:0 0 28px;font-size:24px;font-weight:bold;color:#206b43">BoviTrack</p>
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3">Verifique seu e-mail</h1>
<p style="font-size:16px;line-height:1.6">Para confirmar que este endereço pertence a você, informe o código abaixo na tela de verificação do BoviTrack.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:24px 8px;background:#eef7f0;border-radius:8px;font-size:32px;letter-spacing:4px;font-weight:bold">${destacado}</td></tr></table>
<p style="font-size:16px;line-height:1.6">Este código expira em <strong>${validadeMinutos} minutos</strong>. Nunca compartilhe este código.</p>
<p style="font-size:14px;line-height:1.6;color:#53675c">Se você não criou uma conta ou não solicitou esta verificação no BoviTrack, ignore esta mensagem.</p>
<p style="margin:24px 0 0;font-size:12px;color:#53675c">E-mail transacional de segurança · BoviTrack</p>
</td></tr></table></td></tr></table></body></html>`;
  return { html, text };
}

module.exports = { templateVerificacaoEmail };
