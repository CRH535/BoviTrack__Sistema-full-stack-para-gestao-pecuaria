import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import api from '../services/api';
import Marca from '../components/Marca';
import Button from '../components/ui/Button';

function mensagemInicial(envio) {
  if (envio === 'FALHA_TEMPORARIA') return 'Não foi possível enviar agora. Aguarde para solicitar um novo código.';
  if (envio === 'RATE_LIMIT') return 'Limite de envios atingido. Aguarde antes de tentar novamente.';
  if (envio === 'SOLICITADO') return 'Solicitação recebida. Se existir uma conta pendente para este endereço, enviaremos um código. Se não chegar, volte ao login ou tente reenviar.';
  if (envio === 'COOLDOWN') return 'Um código já foi solicitado. Confira sua caixa de entrada e o spam.';
  return 'Código enviado. Confira também a pasta de spam.';
}

export default function VerificarEmail() {
  const { verificacaoPendente, carregando, autenticado, concluirVerificacao, logout } = useAuth();
  const navigate = useNavigate();
  const [codigo, setCodigo] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [mensagem, setMensagem] = useState(() => mensagemInicial(verificacaoPendente?.envio));
  const [sucesso, setSucesso] = useState(false);
  const [erroMensagem, setErroMensagem] = useState(['FALHA_TEMPORARIA', 'RATE_LIMIT'].includes(verificacaoPendente?.envio));
  const [reenviarEm, setReenviarEm] = useState(verificacaoPendente?.reenviarEm || 0);
  const [agora, setAgora] = useState(() => Date.now());
  const restante = Math.max(0, Math.ceil((reenviarEm - agora) / 1000));

  useEffect(() => {
    const timer = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (carregando) return <p className="session-loading">Verificando sessão...</p>;
  if (autenticado) return <Navigate to="/" replace />;
  if (!verificacaoPendente && !sucesso) return <Navigate to="/login" replace state={{ mensagem: 'Entre para continuar a verificação do e-mail.' }} />;

  const opcoes = { headers: { 'X-Email-Verification': verificacaoPendente?.ticket }, ignorarRenovacao: true };

  async function verificar(evento) {
    evento.preventDefault();
    if (ocupado || !/^\d{6}$/.test(codigo)) return;
    setOcupado('verificando');
    setErroMensagem(false);
    setMensagem('Verificando código...');
    try {
      const resposta = await api.post('/auth/email/verificar', { email: verificacaoPendente.email, codigo }, opcoes);
      setMensagem(resposta.data.mensagem);
      setSucesso(true);
      concluirVerificacao();
    } catch (erro) {
      tratarFalha(erro);
    } finally { setOcupado(''); }
  }

  function tratarFalha(erro) {
    setErroMensagem(true);
    const retryAfter = Number(erro.response?.headers?.['retry-after'] || erro.response?.data?.retryAfter);
    if (Number.isFinite(retryAfter) && retryAfter > 0) setReenviarEm(Date.now() + retryAfter * 1000);
    if (erro.response?.data?.codigo === 'VERIFICATION_CONTEXT_EXPIRED') {
      concluirVerificacao();
      navigate('/login', { replace: true, state: { mensagem: 'Entre novamente para continuar a verificação.' } });
      return;
    }
    setMensagem(erro.response?.data?.mensagem || 'Falha temporária. Tente novamente mais tarde.');
  }

  async function reenviar() {
    if (ocupado || restante) return;
    setOcupado('enviando');
    setErroMensagem(false);
    setMensagem('Preparando envio...');
    try {
      const resposta = await api.post('/auth/email/reenviar', { email: verificacaoPendente.email }, opcoes);
      setCodigo('');
      setReenviarEm(Date.now() + resposta.data.retryAfter * 1000);
      setMensagem(resposta.data.envio === 'ENVIADO' ? 'Código reenviado. Use apenas o código mais recente.' : resposta.data.mensagem);
    } catch (erro) { tratarFalha(erro); }
    finally { setOcupado(''); }
  }

  async function voltar() {
    if (sucesso) { navigate('/login', { replace: true, state: { mensagem: 'E-mail verificado com sucesso. Entre para continuar.' } }); return; }
    setOcupado('saindo');
    await logout();
    navigate('/login', { replace: true });
  }

  return <main className="login-page">
    <section className="auth-visual" aria-hidden="true"><div className="auth-visual-content">
      <Marca className="auth-brand" /><div><span className="auth-kicker">Sua conta protegida</span>
      <h1>Um passo para cuidar da sua produção.</h1><p>Confirme seu e-mail para acessar o BoviTrack com segurança.</p></div>
    </div></section>
    <section className="auth-panel"><div className="login-card email-verification-card">
      <Marca className="auth-mobile-brand" /><span className="auth-kicker">Segurança da conta</span>
      <h1>{sucesso ? 'E-mail verificado' : 'Verifique seu e-mail'}</h1>
      {!sucesso && <><p>Enviamos um código de 6 dígitos para seu endereço de e-mail.</p>
        <p><strong>{verificacaoPendente?.emailMascarado}</strong> · O código expira em {verificacaoPendente?.validadeMinutos} minutos.</p></>}
      <p className={`form-message${erroMensagem ? '' : ' success-message'}`} role={erroMensagem ? 'alert' : 'status'} aria-live="polite">{mensagem}</p>
      {!sucesso && <><form onSubmit={verificar}>
        <label htmlFor="verificacao-codigo">Código de 6 dígitos</label>
        <input id="verificacao-codigo" type="text" inputMode="numeric" autoComplete="one-time-code"
          pattern="[0-9]{6}" maxLength={6} required value={codigo} disabled={Boolean(ocupado)}
          onChange={(evento) => setCodigo(evento.target.value.replace(/\D/g, '').slice(0, 6))}
          aria-describedby="verificacao-ajuda" />
        <p id="verificacao-ajuda">Use o código mais recente. Nunca compartilhe seu código.</p>
        <Button type="submit" loading={ocupado === 'verificando'} disabled={Boolean(ocupado) || codigo.length !== 6}>
          {ocupado === 'verificando' ? 'Verificando...' : 'Verificar e-mail'}</Button>
      </form><Button type="button" className="button-secondary" onClick={reenviar} loading={ocupado === 'enviando'} disabled={Boolean(ocupado) || restante > 0}>
        {ocupado === 'enviando' ? 'Preparando envio...' : restante > 0 ? `Reenviar código em ${restante}s` : 'Reenviar código'}
      </Button></>}
      <p className="auth-switch"><Button type="button" className="button-secondary" onClick={voltar} disabled={Boolean(ocupado)}>
        {sucesso ? 'Ir para o login' : 'Voltar ao login'}</Button></p>
    </div></section>
  </main>;
}
