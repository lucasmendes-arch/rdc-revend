import Header from "@/components/landing/Header";
import TrustBar from "@/components/landing/TrustBar";
import Hero from "@/components/landing/Hero";
import WhyCurls from "@/components/landing/WhyCurls";
import Products from "@/components/landing/Products";
import ProfitSimulator from "@/components/landing/ProfitSimulator";
import SocialProof from "@/components/landing/SocialProof";
import FAQ from "@/components/landing/FAQ";
import LeadForm from "@/components/landing/LeadForm";
import Footer from "@/components/landing/Footer";
import MobileFloatingCTA from "@/components/landing/MobileFloatingCTA";

const Index = () => {
  return (
    <div className="min-h-screen font-sans" style={{ background: "#faf8f3" }}>
      {/* SEO */}
      <title>Rei dos Cachos Pro — Atacado para Salões e Revendedores</title>

      {/* 1. Sticky Header */}
      <Header />

      {/* 2. Trust Bar */}
      <div className="pt-16">
        <TrustBar />
      </div>

      {/* 3. Hero */}
      <Hero />

      {/* 4. Why Curls */}
      <WhyCurls />

      {/* 5. Products */}
      <Products />

      {/* 6. Profit Simulator */}
      <ProfitSimulator />

      {/* 7. Social Proof */}
      <SocialProof />

      {/* 8. FAQ */}
      <FAQ />

      {/* 9. Lead Form */}
      <LeadForm />

      {/* Footer */}
      <Footer />

      {/* Mobile Floating CTA */}
      <MobileFloatingCTA />
    </div>
  );
};

export default Index;
