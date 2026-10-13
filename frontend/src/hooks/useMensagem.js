import { useCallback, useState } from "react";

export default function useMensagem() {
  const [feedback, setFeedback] = useState({ texto: "", erro: false });
  const setMensagem = useCallback(
    (texto, erro = false) => setFeedback({ texto, erro }),
    [],
  );
  const limparErro = useCallback(
    () =>
      setFeedback((atual) => (atual.erro ? { texto: "", erro: false } : atual)),
    [],
  );
  return [feedback.texto, setMensagem, feedback.erro, limparErro];
}
