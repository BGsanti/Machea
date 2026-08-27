import { Credibility } from "./components/Credibility";
import { Demos } from "./components/Demos";
import { FAQ } from "./components/FAQ";
import { Footer } from "./components/Footer";
import { GrainOverlay } from "./components/GrainOverlay";
import { Hero } from "./components/Hero";
import { LiveDemo } from "./components/LiveDemo";
import { Marquee } from "./components/Marquee";
import { Navbar } from "./components/Navbar";
import { Offer } from "./components/Offer";
import { ScrollProgress } from "./components/ScrollProgress";

function App() {
  return (
    <div className="min-h-screen bg-beige text-navy">
      <GrainOverlay />
      <ScrollProgress />
      <Navbar />
      <main>
        <Hero />
        <Marquee />
        <Demos />
        <LiveDemo />
        <Credibility />
        <FAQ />
        <Offer />
      </main>
      <Footer />
    </div>
  );
}

export default App;
