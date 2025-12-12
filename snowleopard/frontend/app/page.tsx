import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Hero Section */}
      <section className="px-6 py-20 md:py-32">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-light tracking-tight text-slate-900 mb-6">
            Your inventory, handled automatically.
          </h1>
          <p className="text-xl md:text-2xl text-slate-600 mb-12 font-light max-w-2xl mx-auto">
            See what you have, ask where things are, and restock before you run out.
          </p>
          <Link
            href="/camera"
            className="inline-flex items-center justify-center px-8 py-4 text-lg font-medium text-white bg-slate-900 rounded-full hover:bg-slate-800 transition-colors shadow-lg hover:shadow-xl"
          >
            Try the Demo
          </Link>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="px-6 py-20 bg-white/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-light text-slate-900 text-center mb-16">
            How It Works
          </h2>
          <div className="grid md:grid-cols-3 gap-12 md:gap-8">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-purple-100 flex items-center justify-center text-4xl">
                📷
              </div>
              <h3 className="text-xl font-medium text-slate-900 mb-3">
                Scan items with a camera
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Point your camera at any item and instantly identify it in your inventory.
              </p>
            </div>
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-blue-100 flex items-center justify-center text-4xl">
                🎤
              </div>
              <h3 className="text-xl font-medium text-slate-900 mb-3">
                Ask questions with your voice
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Speak naturally to find items, check stock levels, and get instant answers.
              </p>
            </div>
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-green-100 flex items-center justify-center text-4xl">
                🔮
              </div>
              <h3 className="text-xl font-medium text-slate-900 mb-3">
                Get smart restock predictions
              </h3>
              <p className="text-slate-600 leading-relaxed">
                AI learns your usage patterns and alerts you before supplies run low.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Key Features Section */}
      <section className="px-6 py-20">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-light text-slate-900 text-center mb-16">
            Key Features
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-2xl bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-100">
              <div className="text-3xl mb-4">✨</div>
              <h3 className="text-xl font-medium text-slate-900 mb-3">
                AI item recognition from images
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Advanced computer vision powered by Gemini AI recognizes items instantly from photos.
              </p>
            </div>
            <div className="p-8 rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100">
              <div className="text-3xl mb-4">🗣️</div>
              <h3 className="text-xl font-medium text-slate-900 mb-3">
                Voice assistant to find and check items
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Natural language queries let you search inventory like talking to a friend.
              </p>
            </div>
            <div className="p-8 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100">
              <div className="text-3xl mb-4">📊</div>
              <h3 className="text-xl font-medium text-slate-900 mb-3">
                Predictive alerts based on usage patterns
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Machine learning analyzes historical data to forecast when you'll need to restock.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="px-6 py-20 bg-slate-50/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-light text-slate-900 text-center mb-16">
            Use Cases
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-10 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">🏠</div>
              <h3 className="text-2xl font-light text-slate-900 mb-3">
                Smart pantry
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Never wonder what's in your pantry again. Scan items as you add them and get alerts before you run out of essentials.
              </p>
            </div>
            <div className="p-10 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">📦</div>
              <h3 className="text-2xl font-light text-slate-900 mb-3">
                Small warehouse
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Track inventory across multiple locations. Ask "where are the diapers?" and get instant location and stock info.
              </p>
            </div>
            <div className="p-10 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="text-4xl mb-4">🏢</div>
              <h3 className="text-2xl font-light text-slate-900 mb-3">
                Shared office or storage space
              </h3>
              <p className="text-slate-600 leading-relaxed">
                Keep track of shared supplies. Know what's available, where it is, and when to reorder.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-16 border-t border-slate-200">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-xl font-light text-slate-600">
            Smarter inventory, less guessing.
          </p>
        </div>
      </footer>
    </div>
  );
}
