import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import WhyCurls from "@/components/landing/WhyCurls";
import HowItWorks from "@/components/landing/HowItWorks";
import ProfitSimulator from "@/components/landing/ProfitSimulator";
import Products from "@/components/landing/Products";
import SocialProof from "@/components/landing/SocialProof";
import WholesaleConditions from "@/components/landing/WholesaleConditions";
import FAQ from "@/components/landing/FAQ";
import LeadForm from "@/components/landing/LeadForm";
import Footer from "@/components/landing/Footer";
import MobileFloatingCTA from "@/components/landing/MobileFloatingCTA";

const Index = () => {
  return (
    <div className="min-h-screen font-sans" style={{ background: "#faf8f3" }}>
      <title>Rei dos Cachos Pro — Atacado para Salões e Revendedores</title>

      <Header />

      {/* 1. Hero */}
      <div className="pt-14 sm:pt-16">
        <Hero />
      </div>

      {/* 2. Por que apostar */}
      <WhyCurls />

      {/* 3. Como funciona */}
      <HowItWorks />

      {/* 4. Simulador */}
      <ProfitSimulator />

      {/* 5. Produtos */}
      <Products />

      {/* 6. Depoimentos */}
      <SocialProof />

      {/* 7. Condições do Atacado */}
      <WholesaleConditions />

      {/* 8. FAQ */}
      <FAQ />

      {/* 9. Cadastro */}
      <LeadForm />

      {/* Footer */}
      <Footer />

      {/* Mobile Floating CTA */}
      <MobileFloatingCTA />

      {/* Safe area padding for mobile floating CTA */}
      <div className="h-16 md:hidden" />
    </div>
  );
};

export default Index;
