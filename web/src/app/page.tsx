"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check for auth cookie
    setIsAuthenticated(document.cookie.includes("strava_token"));
  }, []);

  return (
    <main className="flex min-h-screen flex-col items-center">
      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-5xl font-light tracking-tight text-gray-900 sm:text-6xl">
          Velo<span className="text-accent font-normal">print</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-gray-600 font-light">
          Create beautiful, print-quality travel posters from your Strava
          activities. Map your journeys and turn them into art.
        </p>
        <div className="mt-10 flex items-center gap-x-6">
          {isAuthenticated ? (
            <a
              href="/create"
              className="rounded-md bg-accent px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-red-700 transition-colors"
            >
              Create a Poster
            </a>
          ) : (
            <a
              href="/api/auth/strava"
              className="rounded-md bg-[#FC4C02] px-6 py-3 text-sm font-medium text-white shadow-sm hover:bg-[#e04400] transition-colors"
            >
              Connect with Strava
            </a>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="w-full max-w-5xl px-6 py-16">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-red-50">
              <svg className="h-6 w-6 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-medium text-gray-900">Beautiful Maps</h3>
            <p className="mt-2 text-sm text-gray-600">
              Your route rendered on a muted, print-optimized map with
              dashed route lines and labeled waypoints.
            </p>
          </div>
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-red-50">
              <svg className="h-6 w-6 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-medium text-gray-900">Elevation Profiles</h3>
            <p className="mt-2 text-sm text-gray-600">
              Detailed elevation profiles with gradient fills, prominent
              peak labels, and stage markers.
            </p>
          </div>
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-red-50">
              <svg className="h-6 w-6 text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-medium text-gray-900">Print Quality</h3>
            <p className="mt-2 text-sm text-gray-600">
              Export as high-resolution PNG or PDF, ready for
              professional printing at any size.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="w-full max-w-3xl px-6 py-16 border-t border-gray-100">
        <h2 className="text-2xl font-light text-center text-gray-900 mb-12">How it works</h2>
        <div className="space-y-8">
          {[
            { step: "1", title: "Connect Strava", desc: "Authorize access to your activity data." },
            { step: "2", title: "Select Activities", desc: "Choose one or more activities for your poster." },
            { step: "3", title: "Customize", desc: "Edit titles, labels, colors, and toggle sections." },
            { step: "4", title: "Download", desc: "Export as high-res PNG or print-ready PDF." },
          ].map((item) => (
            <div key={item.step} className="flex items-start gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-medium text-white">
                {item.step}
              </span>
              <div>
                <h3 className="font-medium text-gray-900">{item.title}</h3>
                <p className="text-sm text-gray-600">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="w-full border-t border-gray-100 py-8 text-center text-xs text-gray-400">
        Veloprint
      </footer>
    </main>
  );
}
