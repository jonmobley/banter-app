import { Users, Zap, Shield, Clock, Globe, ChevronRight, Calendar, Headphones, Mail, X } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export default function Home() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const { toast } = useToast();

  const openModal = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    
    setIsSubmitting(true);
    
    try {
      const res = await fetch("/api/beta-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      
      if (res.ok) {
        setIsSubmitted(true);
        setEmail("");
        toast({ title: "You're on the list!", description: "We'll be in touch soon." });
      } else {
        toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Something went wrong", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <span className="text-emerald-400 font-bold text-lg">B</span>
            </div>
            <span className="text-xl font-bold">Banter</span>
          </div>
          <button
            onClick={openModal}
            className="bg-emerald-500 hover:bg-emerald-400 text-white font-medium px-4 py-2 rounded-full text-sm transition-colors"
            data-testid="link-request-access"
          >
            Request Access
          </button>
        </div>
      </header>

      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-2 mb-8">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
            <span className="text-emerald-400 text-sm font-medium">Now in Beta</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight" data-testid="text-title">
            The modern
            <br />
            <span className="text-emerald-400">walkie talkie</span>
          </h1>
          
          <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            Push-to-talk voice communication for teams. 
            Just open your browser and start talking.
          </p>
          
          <button
            onClick={openModal}
            className="inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold px-8 py-4 rounded-full text-lg transition-colors mb-16"
            data-testid="button-request-access-hero"
          >
            Request Beta Access
            <ChevronRight className="w-5 h-5" />
          </button>

          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8 text-slate-500 text-sm">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              <span>Secure & Private</span>
            </div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4" />
              <span>Instant Connect</span>
            </div>
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              <span>Works Anywhere</span>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Built for Teams</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              Everything you need for seamless team communication
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8">
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <Users className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold mb-2">Role-Based Access</h3>
                <p className="text-slate-400">
                  Assign hosts, participants, and listeners. Control who can speak and who can listen.
                </p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <Clock className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold mb-2">Always Available</h3>
                <p className="text-slate-400">
                  Your channel is always on. Drop in whenever you need to connect with your team.
                </p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <Headphones className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold mb-2">Crystal Clear Audio</h3>
                <p className="text-slate-400">
                  Enterprise-grade voice infrastructure for reliable, high-quality audio every time.
                </p>
              </div>
            </div>
            
            <div className="flex gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                <Zap className="w-6 h-6 text-orange-400" />
              </div>
              <div>
                <h3 className="text-lg font-bold mb-2">Instant Notifications</h3>
                <p className="text-slate-400">
                  Get reminders before scheduled banters. Never miss an important team conversation.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-6 bg-gradient-to-b from-slate-900/50 to-slate-950">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to simplify team communication?
          </h2>
          <p className="text-slate-400 text-lg mb-10 max-w-2xl mx-auto">
            Be among the first to experience a new way to connect with your team.
          </p>
          
          <button
            onClick={openModal}
            className="inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold px-8 py-4 rounded-full text-lg transition-colors"
            data-testid="button-request-access-bottom"
          >
            Request Beta Access
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </section>

      <footer className="py-12 px-6 border-t border-slate-800">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <span className="text-emerald-400 font-bold text-lg">B</span>
              </div>
              <span className="text-xl font-bold">Banter</span>
            </div>
            
            <p className="text-slate-500 text-sm">
              The modern walkie talkie for teams
            </p>
          </div>
        </div>
      </footer>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-6">
          <div className="bg-slate-900 rounded-2xl p-8 w-full max-w-md relative">
            <button
              onClick={closeModal}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-slate-800 transition-colors"
              data-testid="button-close-modal"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>
            
            {isSubmitted ? (
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold mb-2">You're on the list!</h3>
                <p className="text-slate-400 mb-6">We'll reach out when it's your turn to join.</p>
                <button
                  onClick={closeModal}
                  className="bg-slate-700 hover:bg-slate-600 text-white font-medium px-6 py-3 rounded-full transition-colors"
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-bold mb-2">Request Beta Access</h2>
                <p className="text-slate-400 mb-6">Enter your email to join the waitlist.</p>
                
                <form onSubmit={handleSubmit} className="space-y-4">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                    autoFocus
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    style={{ fontSize: '16px' }}
                    data-testid="input-email"
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400 text-white font-semibold px-6 py-3.5 rounded-full text-lg transition-colors"
                    data-testid="button-request-access"
                  >
                    {isSubmitting ? "Submitting..." : "Request Access"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
