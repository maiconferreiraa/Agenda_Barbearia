import logo from '../assets/logo.jpg'

/** Faixa com a logo no topo do cartão de cada plano (mesmo fundo escuro da logo). */
export function PlanBanner() {
  return (
    <div className="-mx-4 -mt-4 mb-3 flex justify-center rounded-t-xl bg-[#1e1c1d] py-2">
      <img src={logo} alt="Barbearia Prime" className="h-20 w-auto" width={720} height={344} loading="lazy" />
    </div>
  )
}
