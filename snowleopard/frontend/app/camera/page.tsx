'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

export default function CameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string>('');
  const [stockInfo, setStockInfo] = useState<string>('');
  const [identifiedItem, setIdentifiedItem] = useState<string>('');
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationName, setLocationName] = useState<string>('');

  useEffect(() => {
    startCamera();
    getUserLocation();

    return () => {
      stopCamera();
    };
  }, []);

  const getUserLocation = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          console.log('User location obtained:', position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          console.error('Error getting location:', error);
          // Continue without location - it's optional
        }
      );
    } else {
      console.log('Geolocation not supported');
    }
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        setStream(mediaStream);
        setIsCameraActive(true);
        setError('');
      }
    } catch (err) {
      setError('Failed to access camera. Please grant camera permissions.');
      console.error('Error accessing camera:', err);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
      setIsCameraActive(false);
    }
  };

  const takeSnapshot = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    setIsProcessing(true);
    setError('');
    setAnalysisResult('');
    setStockInfo('');
    setIdentifiedItem('');

    try {
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw the current video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert canvas to blob
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/png');
      });

      if (!blob) {
        throw new Error('Failed to capture image');
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      // Send to API for processing
      const formData = new FormData();
      formData.append('image', blob, `snapshot-${timestamp}.png`);

      // Add location data if available
      if (userLocation) {
        formData.append('latitude', userLocation.latitude.toString());
        formData.append('longitude', userLocation.longitude.toString());
      }

      const response = await fetch('/api/preprocess', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process image');
      }

      const itemName = data.analysis;
      setAnalysisResult(itemName);
      setIdentifiedItem(itemName);

      // Store location name if provided
      if (data.location && data.location.name) {
        setLocationName(data.location.name);
      }

      // Query stock information if item was identified
      if (itemName && itemName !== 'No matching items found') {
        console.log('Querying stock for item:', itemName);
        console.log('Location data:', data.location);

        const queryResponse = await fetch('/api/query', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            item: itemName,
            location: data.location || userLocation
          }),
        });

        const queryData = await queryResponse.json();
        console.log('Query response:', queryData);

        if (queryResponse.ok) {
          if (queryData.stockInfo) {
            setStockInfo(queryData.stockInfo);
            console.log('Stock info set:', queryData.stockInfo);
          } else {
            setStockInfo('No stock information available');
          }
        } else {
          console.error('Stock query failed:', queryData.error);
          setStockInfo(`Error: ${queryData.error || 'Failed to retrieve stock information'}`);
        }
      } else {
        console.log('No valid item to query:', itemName);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process snapshot');
      console.error('Error taking snapshot:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-900 to-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-50 backdrop-blur-lg bg-slate-900/50 border-b border-lime-500/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-white">Donation Scanner</h1>
            <Link
              href="/"
              className="text-lime-300 hover:text-lime-200 transition-colors"
            >
              ← Back Home
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Camera Section */}
          <div className="space-y-6">
            <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-white/10">
                <h2 className="text-xl font-semibold text-white mb-2">
                  Scan Donated Item
                </h2>
                <p className="text-gray-400 text-sm">
                  Point your camera at the donation to identify and track it
                </p>
              </div>

              {error && (
                <div className="mx-6 mt-6 bg-red-500/10 border border-red-500/20 text-red-300 p-4 rounded-xl">
                  <p className="text-sm font-medium">{error}</p>
                </div>
              )}

              <div className="relative bg-black aspect-video">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
                {!isCameraActive && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
                    <div className="text-center">
                      <div className="text-6xl mb-4">📷</div>
                      <p className="text-gray-400">Camera not active</p>
                    </div>
                  </div>
                )}
                {isProcessing && (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm">
                    <div className="text-center">
                      <div className="animate-spin text-6xl mb-4">⚙️</div>
                      <p className="text-white font-medium">Analyzing item...</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 space-y-3">
                <button
                  onClick={takeSnapshot}
                  disabled={!isCameraActive || isProcessing}
                  className="w-full bg-gradient-to-r from-green-500 via-lime-500 to-yellow-400 hover:from-green-600 hover:via-lime-600 hover:to-yellow-500 disabled:from-gray-700 disabled:to-gray-700 disabled:cursor-not-allowed text-slate-900 font-bold py-4 px-8 rounded-xl transition-all shadow-lg hover:shadow-xl transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  {isProcessing ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="animate-pulse">⚙️</span> Processing...
                    </span>
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      📸 Scan Item
                    </span>
                  )}
                </button>

                <button
                  onClick={isCameraActive ? stopCamera : startCamera}
                  disabled={isProcessing}
                  className="w-full bg-white/5 hover:bg-white/10 disabled:bg-gray-800 disabled:cursor-not-allowed text-white font-medium py-3 px-6 rounded-xl transition-all border border-white/10"
                >
                  {isCameraActive ? '⏹ Stop Camera' : '▶ Start Camera'}
                </button>
              </div>
            </div>
          </div>

          {/* Results Section */}
          <div className="space-y-6">
            {analysisResult ? (
              <>
                <div className="bg-gradient-to-br from-green-500/10 to-lime-500/10 backdrop-blur-xl rounded-3xl border border-green-500/20 overflow-hidden shadow-2xl">
                  <div className="p-6 border-b border-green-500/20">
                    <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                      <span>✓</span> Item Identified
                    </h2>
                  </div>
                  <div className="p-8">
                    <div className="text-center">
                      <div className="inline-block px-6 py-3 bg-gradient-to-r from-green-400/20 to-lime-400/20 border border-lime-400/30 rounded-full mb-4">
                        <p className="text-3xl font-bold text-lime-300">
                          {analysisResult}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-br from-lime-500/10 to-yellow-500/10 backdrop-blur-xl rounded-3xl border border-lime-500/20 overflow-hidden shadow-2xl">
                  <div className="p-6 border-b border-lime-500/20">
                    <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                      <span>📊</span> Inventory Status
                    </h2>
                    {locationName && (
                      <p className="text-sm text-lime-300 mt-1">
                        📍 Near {locationName}
                      </p>
                    )}
                  </div>
                  <div className="p-8">
                    {isProcessing ? (
                      <div className="text-center py-8">
                        <div className="animate-pulse text-4xl mb-3">⏳</div>
                        <p className="text-gray-300 italic">Checking inventory...</p>
                      </div>
                    ) : stockInfo ? (
                      <div className="prose prose-invert max-w-none">
                        <p className="text-gray-100 leading-relaxed whitespace-pre-wrap">
                          {stockInfo}
                        </p>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <div className="text-4xl mb-3">🔍</div>
                        <p className="text-gray-300 italic">Querying database...</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
                <div className="p-12 text-center">
                  <div className="text-6xl mb-6">📦</div>
                  <h3 className="text-2xl font-semibold text-white mb-3">
                    Ready to Scan
                  </h3>
                  <p className="text-gray-400 max-w-md mx-auto">
                    Point your camera at a donated item and click "Scan Item" to identify it and check inventory levels.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hidden canvas for snapshot processing */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
