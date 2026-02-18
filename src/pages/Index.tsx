import Header from "@/components/landing/Header";
import Hero from "@/components/landing/Hero";
import WhyCurls from "@/components/landing/WhyCurls";
import Products from "@/components/landing/Products";
import ProfitSimulator from "@/components/landing/ProfitSimulator";
import LeadForm from "@/components/landing/LeadForm";
import SocialProof from "@/components/landing/SocialProof";
import Footer from "@/components/landing/Footer";

const Index = () => {
  return (
    <div className="min-h-screen bg-background font-sans">
      {/* SEO */}
      <title>Rei dos Cachos Pro — Atacado para Salões e Revendedores</title>
      
      {/* A: Sticky Header */}
      <Header />

      {/* B: Hero Section */}
      <Hero />

      {/* C: Why Curls */}
      <WhyCurls />

      {/* D: Products Showcase */}
      <Products />

      {/* E: Profit Simulator */}
      <ProfitSimulator />

      {/* F: Lead Capture Form */}
      <LeadForm />

      {/* G: Social Proof */}
      <SocialProof />

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default Index;
