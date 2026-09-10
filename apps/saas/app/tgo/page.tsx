import TgoNav from '@/components/tgo/TgoNav'
import TgoHero from '@/components/tgo/TgoHero'
import Partners from '@/components/tgo/Partners'
import Testimonios from '@/components/tgo/Testimonios'
import Ciudad15 from '@/components/tgo/Ciudad15'
import Faces from '@/components/tgo/Faces'
import Confianza from '@/components/tgo/Confianza'
import TickerStats from '@/components/tgo/TickerStats'
import ClubTgo from '@/components/tgo/ClubTgo'
import Restaurantes from '@/components/tgo/Restaurantes'
import FinalCta from '@/components/tgo/FinalCta'
import TgoFooter from '@/components/tgo/TgoFooter'

export default function TgoLanding() {
  return (
    <>
      <TgoNav />
      <TgoHero />
      <Partners />
      <Testimonios />
      <Ciudad15 />
      <Faces />
      <Confianza />
      <TickerStats />
      <ClubTgo />
      <Restaurantes />
      <FinalCta />
      <TgoFooter />
    </>
  )
}
