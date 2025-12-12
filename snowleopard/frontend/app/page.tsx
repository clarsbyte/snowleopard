'use client';

import Link from "next/link";
import { useEffect, useRef } from 'react';

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl');
    if (!gl) return;

    let animationId: number;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };

    resize();
    window.addEventListener('resize', resize);

    // Vertex shader
    const vertexShaderSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    // Fragment shader with large, clear blob gradients
    const fragmentShaderSource = `
      precision mediump float;
      uniform float time;
      uniform vec2 resolution;

      // Blob function - creates soft circular gradients that move
      float blob(vec2 uv, vec2 center, float radius, float speed, float offsetAngle) {
        vec2 offset = vec2(
          sin(time * speed + offsetAngle) * 0.4,
          cos(time * speed * 0.7 + offsetAngle) * 0.4
        );
        float dist = length(uv - center - offset);
        return 1.0 - smoothstep(0.0, radius, dist);
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / resolution;
        uv = (uv - 0.5) * 2.5;
        uv.x *= resolution.x / resolution.y;

        // Dark green base background
        vec3 color = vec3(0.03, 0.12, 0.08);

        // Emerald green blob (top left corner)
        float blob1 = blob(uv, vec2(-1.2, 0.9), 1.5, 0.25, 0.0);
        vec3 color1 = vec3(0.15, 0.75, 0.4);

        // Lime/neon yellow blob (top right corner)
        float blob2 = blob(uv, vec2(1.3, 0.8), 1.4, 0.3, 2.0);
        vec3 color2 = vec3(0.7, 0.9, 0.2);

        // Teal blob (bottom left corner)
        float blob3 = blob(uv, vec2(-1.1, -1.0), 1.6, 0.2, 4.0);
        vec3 color3 = vec3(0.2, 0.7, 0.6);

        // Yellow-green blob (bottom right corner)
        float blob4 = blob(uv, vec2(1.2, -0.9), 1.3, 0.28, 1.5);
        vec3 color4 = vec3(0.6, 0.85, 0.3);

        // Mix blobs with additive blending for vibrant overlaps
        color += color1 * blob1 * 0.5;
        color += color2 * blob2 * 0.5;
        color += color3 * blob3 * 0.45;
        color += color4 * blob4 * 0.45;

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const createShader = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      return shader;
    };

    const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);

    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      1, 1,
    ]), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const timeLocation = gl.getUniformLocation(program, 'time');
    const resolutionLocation = gl.getUniformLocation(program, 'resolution');

    const render = () => {
      time += 0.016; // Slightly faster for visible movement
      gl.uniform1f(timeLocation, time);
      gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationId);
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* WebGL Background */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 w-full h-full -z-10"
      />

      {/* Content */}
      <div className="relative z-10">
        {/* Top Nav */}
        <header className="px-6 py-5">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-lime-400 to-emerald-400" />
              <span className="text-white/90 font-semibold">Ollie</span>
            </div>
            <nav className="flex items-center gap-2">
              <Link href="/combined" className="btn btn-sm btn-primary">Try Demo</Link>
            </nav>
          </div>
        </header>
        {/* Hero Section */}
        <section className="px-6 py-20 md:py-32 lg:py-40">
          <div className="max-w-5xl mx-auto text-center">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-medium tracking-tight text-white mb-6 leading-tight">
              Donation management{' '}
              <span className="bg-gradient-to-r from-green-400 via-lime-400 to-yellow-300 bg-clip-text text-transparent">
                made effortless
              </span>
            </h1>
            <p className="text-lg md:text-xl lg:text-2xl text-gray-300 mb-12 max-w-3xl mx-auto leading-relaxed">
              Track, categorize, and distribute donations automatically. Empower your charity to help more people with AI-powered inventory management.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link href="/combined" className="btn btn-lg btn-primary shadow-lg hover:shadow-xl">
                🚀 Get Started
              </Link>
              <a href="#features" className="btn btn-lg btn-secondary">
                Learn more →
              </a>
            </div>
          </div>
        </section>

        {/* Trusted By Section */}
        <section className="px-6 py-12 border-y border-white/10">
          <div className="max-w-6xl mx-auto">
            <p className="text-center text-gray-400 text-sm mb-8">
              Trusted by charities and nonprofits making a difference
            </p>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="px-6 py-20 md:py-32">
          <div className="max-w-6xl mx-auto">
            <div className="mb-16 text-center">
              <p className="text-sm font-medium text-lime-400 mb-4 tracking-wider uppercase">
                The Advantage
              </p>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-white mb-6 max-w-4xl mx-auto leading-tight">
                Know exactly what you have and where it needs to go
              </h2>
              <p className="text-lg md:text-xl text-gray-300 max-w-3xl mx-auto">
                AI-powered tracking helps you manage donations from intake to distribution, ensuring nothing goes to waste and everyone gets what they need.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 lg:gap-8 mt-16">
              <Link href="/combined" className="p-8 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-all hover:scale-[1.02]">
                <div className="text-4xl mb-4">📷</div>
                <h3 className="text-xl font-medium text-white mb-3">
                  Instant item recognition
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  Simply scan donated items with your camera. AI instantly identifies and categorizes them into your inventory.
                </p>
              </Link>

              <Link href="/voice" className="p-8 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10 transition-all hover:scale-[1.02]">
                <div className="text-4xl mb-4">💬</div>
                <h3 className="text-xl font-medium text-white mb-3">
                  Ask about availability
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  "Do we have winter coats?" "How many diapers are left?" Get instant answers about what's in stock.
                </p>
              </Link>

              <Link href="/combined" className="p-8 rounded-2xl bg-gradient-to-br from-lime-500/10 to-emerald-500/10 border-2 border-lime-500/30 hover:border-lime-500/50 transition-all hover:scale-[1.02]">
                <div className="text-4xl mb-4">🎯</div>
                <h3 className="text-xl font-medium text-white mb-3">
                  Camera + Voice Assistant
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  Say "Ollie" and ask about items you're seeing. Combines camera and voice for hands-free queries.
                </p>
              </Link>
            </div>
          </div>
        </section>

        {/* Use Cases Section */}
        <section className="px-6 py-20 md:py-32">
          <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-medium text-white text-center mb-16">
              Built for nonprofits of all sizes
            </h2>
            <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
              <div className="p-10 rounded-2xl bg-gradient-to-br from-green-500/10 to-lime-500/10 border border-green-500/20 backdrop-blur-sm hover:scale-105 transition-transform">
                <div className="text-4xl mb-4">🏠</div>
                <h3 className="text-2xl font-medium text-white mb-3">
                  Food banks
                </h3>
                <p className="text-gray-300 leading-relaxed">
                  Track perishables, monitor expiration dates, and ensure families get the food they need before it expires.
                </p>
              </div>

              <div className="p-10 rounded-2xl bg-gradient-to-br from-lime-500/10 to-yellow-500/10 border border-lime-500/20 backdrop-blur-sm hover:scale-105 transition-transform">
                <div className="text-4xl mb-4">📦</div>
                <h3 className="text-2xl font-medium text-white mb-3">
                  Donation centers
                </h3>
                <p className="text-gray-300 leading-relaxed">
                  Organize clothing, furniture, and household items. Know exactly what's available for those in need.
                </p>
              </div>

              <div className="p-10 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 backdrop-blur-sm hover:scale-105 transition-transform">
                <div className="text-4xl mb-4">🏥</div>
                <h3 className="text-2xl font-medium text-white mb-3">
                  Relief organizations
                </h3>
                <p className="text-gray-300 leading-relaxed">
                  Manage emergency supplies, medical items, and essential goods during disaster response efforts.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="px-6 py-20 md:py-32">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium text-white mb-6">
              Help more people. Waste less. Track smarter.
            </h2>
            <Link href="/combined" className="btn btn-lg btn-primary shadow-lg hover:shadow-xl">
              Try the Demo →
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="px-6 py-16 border-t border-white/10">
          <div className="max-w-6xl mx-auto text-center">
            <p className="text-lg text-gray-400">
              Built with AI-powered automation
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
