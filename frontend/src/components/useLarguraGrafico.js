import { useEffect, useRef, useState } from "react";
export default function useLarguraGrafico(temDados) {
  const ref = useRef(null);
  const [largura, setLargura] = useState(720);
  useEffect(() => {
    const element = ref.current;
    const observer = new ResizeObserver(([entry]) =>
      setLargura(
        Math.max(240, Math.min(760, Math.round(entry.contentRect.width))),
      ),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [temDados]);
  return [ref, largura];
}
