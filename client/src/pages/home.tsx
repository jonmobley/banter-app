import { Phone, Users, Zap, Shield, Clock, Globe, ChevronRight, PhoneCall, Calendar, Headphones } from "lucide-react";
import { Link } from "wouter";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-lg border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Phone className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-xl font-bold">Banter</span>
          </div>
          <Link
            href="/mobley"
            className="bg-emerald-500 hover:bg-emerald-400 text-white font-medium px-4 py-2 rounded-full text-sm transition-colors"
            data-testid="link-join-call"
          >
            Join Call
          </Link>
        </div>
      </header>

      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-2 mb-8">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
            <span className="text-emerald-400 text-sm font-medium">Now in Beta</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight" data-testid="text-title">
            Instant group calls,
            <br />
            <span className="text-emerald-400">no apps required</span>
          </h1>
          
          <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto leading-relaxed">
            Banter is the modern walkie-talkie for teams. Call in from any phone or join from your browser. 
            No downloads, no signups, just instant voice connection.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link
              href="/mobley"
              className="inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold px-8 py-4 rounded-full text-lg transition-colors"
              data-testid="button-get-started"
            >
              <PhoneCall className="w-5 h-5" />
              Get Started Free
            </Link>
            <a
              href="tel:+12202423245"
              className="inline-flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold px-8 py-4 rounded-full text-lg transition-colors"
              data-testid="button-call-now"
            >
              <Phone className="w-5 h-5" />
              Call (220) 242-3245
            </a>
          </div>

          <div className="flex items-center justify-center gap-8 text-slate-500 text-sm">
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

      <section className="py-20 px-6 bg-slate-900/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How It Works</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              Three simple ways to join the conversation
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700/50">
              <div className="w-14 h-14 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-6">
                <Phone className="w-7 h-7 text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold mb-3">Call In</h3>
              <p className="text-slate-400 leading-relaxed">
                Dial our number from any phone and you're instantly connected. No app downloads, no account creation.
              </p>
            </div>
            
            <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700/50">
              <div className="w-14 h-14 rounded-xl bg-blue-500/20 flex items-center justify-center mb-6">
                <Globe className="w-7 h-7 text-blue-400" />
              </div>
              <h3 className="text-xl font-bold mb-3">Join from Browser</h3>
              <p className="text-slate-400 leading-relaxed">
                Click to join directly from your web browser. Perfect for desktop users who prefer not to use their phone.
              </p>
            </div>
            
            <div className="bg-slate-800/50 rounded-2xl p-8 border border-slate-700/50">
              <div className="w-14 h-14 rounded-xl bg-purple-500/20 flex items-center justify-center mb-6">
                <Calendar className="w-7 h-7 text-purple-400" />
              </div>
              <h3 className="text-xl font-bold mb-3">Schedule Calls</h3>
              <p className="text-slate-400 leading-relaxed">
                Plan your banters in advance. Set reminders and auto-dial participants when it's time to connect.
              </p>
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
                  Your conference room is always on. Drop in whenever you need to connect with your team.
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
                  Powered by Twilio's enterprise-grade voice infrastructure for reliable, high-quality calls.
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
                  Get SMS reminders before scheduled calls. Never miss an important team banter.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-20 px-6 bg-gradient-to-b from-slate-900/50 to-slate-950">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to start your first banter?
          </h2>
          <p className="text-slate-400 text-lg mb-10 max-w-2xl mx-auto">
            Join thousands of teams who've simplified their voice communication. 
            No credit card required.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/mobley"
              className="inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-semibold px-8 py-4 rounded-full text-lg transition-colors"
              data-testid="button-start-banter"
            >
              Start a Banter
              <ChevronRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="py-12 px-6 border-t border-slate-800">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Phone className="w-4 h-4 text-emerald-400" />
              </div>
              <span className="text-xl font-bold">Banter</span>
            </div>
            
            <div className="flex items-center gap-6 text-slate-400 text-sm">
              <a href="tel:+12202423245" className="hover:text-white transition-colors">
                (220) 242-3245
              </a>
              <Link href="/mobley" className="hover:text-white transition-colors">
                Join Call
              </Link>
              <Link href="/schedule" className="hover:text-white transition-colors">
                Schedule
              </Link>
            </div>
            
            <p className="text-slate-500 text-sm">
              Powered by Twilio
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
