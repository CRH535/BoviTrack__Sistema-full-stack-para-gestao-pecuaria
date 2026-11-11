// Deployment temporario sem acesso ao banco, para a janela de corte autorizada.
module.exports = function maintenance(req, res) {
  res.statusCode = 503;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Retry-After', '60');
  if (req.headers.origin === 'https://bovitrack-xi.vercel.app') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  res.end(JSON.stringify({ codigo: 'MANUTENCAO', mensagem: 'Manutencao programada. Tente novamente em instantes.' }));
};
